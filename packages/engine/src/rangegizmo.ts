import { Point } from "./point";
import { RangeType } from "./enums/rangetype";
import { UnitStatus } from "./enums/unitstatus";
import {
    Node,
    Path,
    diagonalHeuristic,
    buildPath,
    isOpen,
    isClosed,
} from "./pathfinding";
import type { Board } from "./board";
import type { Piece } from "./piece";

/**
 * Engine-level range and pathfinding gizmo. Contains all
 * pure range calculation, node traversal, and A* logic.
 * No Phaser imports.
 *
 * The client RangeGizmo extends this class and adds visual
 * rendering concerns (cursors, tweens, layers).
 */
export class RangeGizmo {
    /**
     * Reference to the board.
     */
    protected readonly _board: Board;

    /**
     * The piece whose range is currently computed.
     */
    protected _piece: Piece | null = null;

    /**
     * The set of valid (traversable or terminal) nodes
     * within range.
     */
    protected _validNodes: Node[] = [];

    /**
     * Cached paths keyed by "x,y".
     */
    protected _paths: Map<string, Path> = new Map();

    /**
     * Create a new RangeGizmo for the given board.
     *
     * @param board The engine board instance
     */
    constructor(board: Board) {
        this._board = board;
    }

    /**
     * First pass — determine whether a node is traversable
     * or terminal based on the pieces occupying it.
     *
     * Rules:
     * - Empty tile → traversable, not terminal
     * - Tile contains only the moving piece → traversable
     * - Contains a piece that can be mounted or attacked
     *   → terminal
     * - Contains a piece that cannot be interacted with
     *   → not traversable
     *
     * @param node The node to evaluate
     * @returns The updated node
     */
    protected checkNodeTraversal(node: Node): Node {
        const livePieces = this._board.getPiecesAtPosition(
            new Point(node.x, node.y),
            (piece: Piece) => !piece.dead,
        );

        if (!livePieces.length) {
            node.traversable = true;
            node.terminal = false;
            return node;
        }

        // The rider of the moving piece occupies the same tile
        // but moves with it — treat it as part of the moving
        // piece for traversal purposes.
        const rider = this._piece.currentRider;

        // If the only pieces here are the moving piece (and
        // possibly its rider), the tile is traversable.
        const otherPieces = livePieces.filter(
            (p) => p !== this._piece && p !== rider,
        );
        if (otherPieces.length === 0) {
            node.traversable = true;
            node.terminal = false;
            return node;
        }

        // Evaluate each piece at this position.
        for (const livePiece of otherPieces) {
            if (
                this._piece.canMountPiece(livePiece) ||
                this._piece.canAttackPiece(livePiece)
            ) {
                node.terminal = true;
            } else {
                node.traversable = false;
            }
        }

        return node;
    }

    /**
     * Generate valid nodes and paths for the given unit.
     * Resets existing state first.
     *
     * For flying units, all reachable traversable nodes are
     * valid without pathfinding. For ground units, A* is run
     * to verify each node is actually reachable within the
     * movement budget.
     *
     * @param unit The unit to generate range for
     */
    public async generate(unit: Piece): Promise<void> {
        await this.reset();

        this._validNodes = [];
        this._paths = new Map<string, Path>();
        this._piece = unit;

        const potentiallyValidNodes: Map<string, Node> = new Map();

        // Determine range type based on flying status.
        const rangeType: RangeType = unit.hasStatus(UnitStatus.Flying)
            ? RangeType.Fly
            : RangeType.Foot;

        // Get all points in movement range and build nodes.
        this._board
            .getPointsInRange(
                unit.position,
                unit.stats.movement,
                true,
                rangeType,
            )
            .map((pt: Point) => new Node(pt.x, pt.y))
            .filter((node: Node) => {
                node = this.checkNodeTraversal(node);
                return node.traversable || node.terminal;
            })
            .forEach((node: Node) => {
                potentiallyValidNodes.set(node.x + "," + node.y, node);
            });

        // Apply warning flags: a node is a warning node if
        // there is an engageable enemy adjacent to it.
        potentiallyValidNodes.forEach((node: Node) => {
            const enemies = this._board.getAdjacentPiecesAtPosition(
                node.pos,
                (piece: Piece) => piece.canEngagePiece(this._piece),
            );
            if (!enemies.length) {
                return;
            }
            enemies.forEach((enemy: Piece) => {
                this._board
                    .getAdjacentPoints(enemy.position, false)
                    .forEach((adjPt: Point) => {
                        const key = adjPt.x + "," + adjPt.y;
                        if (potentiallyValidNodes.has(key)) {
                            potentiallyValidNodes.get(key).warning = true;
                        }
                    });
            });
        });

        this._validNodes = Array.from(potentiallyValidNodes.values());

        // Flying units can reach all valid nodes directly.
        if (unit.hasStatus(UnitStatus.Flying)) {
            this._validNodes.forEach((node: Node) => (node.flying = true));
            return;
        }

        // Ground units: run pathfinding and discard nodes
        // that are unreachable within the movement budget.
        for (const node of this._validNodes) {
            const path: Path = this.getPathTo(node.pos);
            node.path = path;
            if (!path || path.cost > unit.stats.movement + 1) {
                node.traversable = false;
            }
        }
    }

    /**
     * Reset the gizmo, clearing all computed state.
     *
     * @returns A promise resolving to this RangeGizmo
     */
    public async reset(): Promise<RangeGizmo> {
        this._piece = null;
        this._validNodes = [];
        this._paths = new Map();
        return this;
    }

    /**
     * Look up a valid (traversable or terminal) node at the
     * given board position.
     *
     * @param pt The board position to look up
     * @returns The matching Node, or null if none found
     */
    public getNode(pt: { x: number; y: number }): Node | null {
        return (
            this._validNodes.find(
                (node: Node) =>
                    node.x === pt.x &&
                    node.y === pt.y &&
                    (node.traversable || node.terminal),
            ) ?? null
        );
    }

    /**
     * Get (or compute and cache) the shortest path from the
     * current piece's position to the given board position.
     *
     * Returns null if no piece is set, or if the destination
     * is not a valid node.
     *
     * @param pt The destination board position
     * @returns The computed Path, or null
     */
    public getPathTo(pt: { x: number; y: number }): Path | null {
        if (!this._piece) {
            return null;
        }
        const node = this.getNode(pt);
        if (!node || (!node.traversable && !node.terminal)) {
            return null;
        }
        const key = pt.x + "," + pt.y;
        if (this._paths.has(key)) {
            return this._paths.get(key);
        }
        const path = this.findPath(this._piece.position, new Point(pt.x, pt.y));
        this._paths.set(key, path);
        return path ?? null;
    }

    /**
     * Get all valid paths to traversable (non-terminal)
     * nodes, or all nodes if ignoreTerminal is false.
     *
     * Used for AI movement calculations.
     *
     * @param ignoreTerminal Whether to skip terminal nodes
     * @returns Set of reachable paths
     */
    public getAllValidPaths(ignoreTerminal: boolean = true): Set<Path> {
        const output: Set<Path> = new Set();
        for (const node of this._validNodes) {
            if (node.isValid() && (!ignoreTerminal || !node.terminal)) {
                const path = this.getPathTo(node.pos);
                if (path) {
                    output.add(path);
                }
            }
        }
        return output;
    }

    /**
     * Get all valid paths to terminal nodes.
     *
     * Used for AI attack/mount movement calculations.
     *
     * @returns Set of paths to terminal nodes
     */
    public getAllTerminalPaths(): Set<Path> {
        const output: Set<Path> = new Set();
        for (const node of this._validNodes) {
            if (node.isValid() && node.terminal) {
                const path = this.getPathTo(node.pos);
                if (path) {
                    output.add(path);
                }
            }
        }
        return output;
    }

    /**
     * Run A* pathfinding between two board positions using
     * the current set of valid nodes. Returns null if no
     * path exists.
     *
     * @param fromPt The start position
     * @param toPt The destination position
     * @returns The shortest Path, or null if unreachable
     */
    public findPath(fromPt: Point, toPt: Point): Path | null {
        let firstNode: Node | undefined;
        let destinationNode: Node | undefined;

        for (const node of this._validNodes) {
            if (node.x === fromPt.x && node.y === fromPt.y) {
                firstNode = node;
            }
            if (node.x === toPt.x && node.y === toPt.y) {
                destinationNode = node;
            }
        }

        if (!firstNode || !destinationNode) {
            return null;
        }

        const openNodes: Node[] = [];
        const closedNodes: Node[] = [];
        const travelCost: number = 1;

        let currentNode: Node = firstNode;

        currentNode.g = 0;
        currentNode.h = diagonalHeuristic(
            currentNode,
            destinationNode,
            travelCost,
        );
        currentNode.f = currentNode.g + currentNode.h;

        while (currentNode !== destinationNode) {
            const connectedNodes = this.findConnectedNodes(currentNode);
            const l: number = connectedNodes.length;

            for (let i: number = 0; i < l; ++i) {
                const testNode: Node = connectedNodes[i];

                if (
                    testNode === currentNode ||
                    (!testNode.traversable && !testNode.terminal)
                ) {
                    continue;
                }

                const g: number =
                    currentNode.g +
                    diagonalHeuristic(currentNode, testNode, travelCost);
                const h: number = diagonalHeuristic(
                    testNode,
                    destinationNode,
                    travelCost,
                );
                const f: number = g + h;

                if (
                    isOpen(testNode, openNodes) ||
                    isClosed(testNode, closedNodes)
                ) {
                    if (testNode.f > f) {
                        testNode.f = f;
                        testNode.g = g;
                        testNode.h = h;
                        testNode.parentNode = currentNode;
                    }
                } else {
                    testNode.f = f;
                    testNode.g = g;
                    testNode.h = h;
                    testNode.parentNode = currentNode;
                    openNodes.push(testNode);
                }
            }

            closedNodes.push(currentNode);

            if (openNodes.length === 0) {
                return null;
            }

            openNodes.sort((n1: Node, n2: Node): number =>
                n1.f < n2.f ? -1 : 1,
            );
            currentNode = openNodes.shift();
        }

        return buildPath(destinationNode, firstNode);
    }

    /**
     * Find all valid nodes adjacent to the given node
     * (within 1 tile in any direction — 8-connected
     * neighbourhood).
     *
     * @param node The node to find neighbours for
     * @returns Adjacent valid nodes (excludes the node
     * itself)
     */
    public findConnectedNodes(node: Node): Node[] {
        const output: Node[] = [];
        for (const validNode of this._validNodes) {
            if (node.x < validNode.x - 1 || node.x > validNode.x + 1) {
                continue;
            }
            if (node.y < validNode.y - 1 || node.y > validNode.y + 1) {
                continue;
            }
            if (node === validNode) {
                continue;
            }
            output.push(validNode);
        }
        return output;
    }
}
