import { Point } from "./point";
import { RangeType } from "./enums/rangetype";

/**
 * Calculate the distance between two board positions.
 * For foot movement, uses Chebyshev distance (max of
 * dx, dy). For flying/ranged, uses a modified metric
 * where diagonal steps cost 1.5×.
 *
 * @param start The start position
 * @param end The end position
 * @param rangeType The movement type
 * @returns The calculated distance
 */
export function distance(start: Point, end: Point, rangeType: RangeType = RangeType.Fly): number {
    if (Point.equals(start, end)) {
        return 0;
    }
    const dx: number = Math.abs(start.x - end.x);
    const dy: number = Math.abs(start.y - end.y);

    if (rangeType === RangeType.Foot) {
        return Math.max(dx, dy);
    }

    return Math.max(dx, dy) - Math.min(dx, dy) + Math.min(dx, dy) * 1.5;
}

/**
 * Convert an angle between two points to an octant
 * direction index (0–7). 0 = right, proceeding
 * clockwise (1 = down-right, 2 = down, etc.).
 *
 * @param fromPt The origin point
 * @param toPt The destination point
 * @returns An integer 0–7 representing the octant
 */
export function getAngle(fromPt: Point, toPt: Point): number {
    let a: number = Math.floor(Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x) * (180 / Math.PI));
    a += 22.5;
    a = a < 0 ? a + 360 : a;
    return Math.floor(a / 45);
}

/**
 * Diagonal-shortcut heuristic for A* pathfinding.
 * Cardinal steps cost `cost`, diagonal steps cost
 * `diagonalCost`, and warning/terminal nodes add
 * `terminalCost` to discourage landing on them.
 *
 * @param node The current node
 * @param destinationNode The target node
 * @param cost Cardinal step cost
 * @param diagonalCost Diagonal step cost
 * @param terminalCost Penalty for warning/terminal
 * @returns Estimated movement cost
 */
export function diagonalHeuristic(
    node: Node,
    destinationNode: Node,
    cost: number = 1,
    diagonalCost: number = 1.5,
    terminalCost: number = 100,
): number {
    const dx: number = Math.abs(node.x - destinationNode.x);
    const dy: number = Math.abs(node.y - destinationNode.y);

    const diag: number = Math.min(dx, dy);
    const straight: number = dx + dy;

    if (node.warning || node.terminal) {
        return diagonalCost * diag + cost * (straight - 2 * diag) + terminalCost;
    }

    return diagonalCost * diag + cost * (straight - 2 * diag);
}

/**
 * Reconstruct a Path by walking the parentNode
 * chain from destination back to start. Also marks
 * nodes after any blocking (non-traversable/terminal)
 * node as non-traversable.
 *
 * @param destinationNode The end node
 * @param startNode The start node
 * @returns A new Path with nodes, angles, and cost
 */
export function buildPath(destinationNode: Node, startNode: Node): Path {
    const angles: number[] = [];
    const path: Node[] = [];
    let node: Node = destinationNode;
    let cost: number = 0;
    path.push(node);
    while (node != startNode) {
        cost += distance(node.pos, node.parentNode.pos);
        angles.unshift(getAngle(node.parentNode.pos, node.pos));
        node = node.parentNode;
        path.unshift(node);
    }
    angles.unshift(getAngle(startNode.pos, destinationNode.pos));

    // Mark nodes after a blocking node as
    // non-traversable
    let foundBlockingNode: boolean = false;
    for (const pathNode of path) {
        if (foundBlockingNode) {
            pathNode.traversable = false;
        } else if (!pathNode.traversable || pathNode.terminal) {
            foundBlockingNode = true;
        }
    }

    return new Path(path, angles, cost);
}

/**
 * Check whether a node exists in the open set.
 *
 * @param node The node to search for
 * @param openNodes The current open set
 * @returns True if the node is in the open set
 */
export function isOpen(node: Node, openNodes: Node[]): boolean {
    const l: number = openNodes.length;
    for (let i: number = 0; i < l; ++i) {
        if (openNodes[i] == node) return true;
    }
    return false;
}

/**
 * Check whether a node exists in the closed set.
 *
 * @param node The node to search for
 * @param closedNodes The current closed set
 * @returns True if the node is in the closed set
 */
export function isClosed(node: Node, closedNodes: Node[]): boolean {
    const l: number = closedNodes.length;
    for (let i: number = 0; i < l; ++i) {
        if (closedNodes[i] == node) return true;
    }
    return false;
}

/**
 * A node in the movement range graph. Represents a
 * single board tile with pathfinding metadata
 * (g/h/f costs, parent link) and movement flags
 * (traversable, terminal, warning).
 */
export class Node {
    private readonly _pos: Point = new Point(-1, -1);
    public g: number;
    public f: number;
    public h: number;
    public parentNode: Node;

    /**
     * Whether this node can be traversed
     */
    public traversable: boolean = true;

    /**
     * Whether this node is a warning node
     * (e.g., adjacent to an enemy)
     */
    public warning: boolean = false;

    /**
     * Whether this node is a terminal node
     * (e.g., occupied by an attackable enemy
     * or mountable ally)
     */
    public terminal: boolean = false;

    /**
     * The path to this node
     */
    public path: Path;

    /**
     * Whether this node is being traversed by
     * flying movement
     */
    public flying: boolean = false;

    /**
     * @param x Board x coordinate
     * @param y Board y coordinate
     */
    constructor(x: number, y: number) {
        this._pos.setTo(x, y);
    }

    /** Board x coordinate */
    get x(): number {
        return this._pos.x;
    }

    /** Board y coordinate */
    get y(): number {
        return this._pos.y;
    }

    /** The board position as a Point */
    get pos(): Point {
        return this._pos;
    }

    /**
     * A node is valid if it is traversable and
     * either has a computed path or is being
     * reached via flying movement.
     */
    isValid(): boolean {
        if ((this.path !== null || this.flying) && this.traversable) {
            return true;
        }
        return false;
    }
}

/**
 * An ordered sequence of {@link Node}s forming a
 * movement path, along with the direction angles
 * between each step and the total movement cost.
 */
export class Path {
    private readonly _nodes: Node[];
    private readonly _angles: number[];
    private readonly _cost: number;

    /**
     * @param nodes Ordered list of nodes
     * @param angles Direction angle indices (0–7)
     * @param cost Total movement cost
     */
    constructor(nodes: Node[], angles: number[], cost: number) {
        if (nodes?.length && cost > 0) {
            this._nodes = nodes;
            this._angles = angles;
            this._cost = cost;
        }
    }

    /**
     * Convert the path's nodes into an array of
     * cloned Points.
     */
    public toPoints(): Point[] {
        return this._nodes.map((node: Node) => Point.clone(node.pos));
    }

    /** Total movement cost of the path */
    get cost(): number {
        return this._cost;
    }

    /** Ordered array of nodes */
    get nodes(): Node[] {
        return this._nodes;
    }

    /** Direction angle indices (0–7) */
    get angles(): number[] {
        return this._angles;
    }

    /** True if the last node is a warning node */
    get warning(): boolean {
        return this._nodes.at(-1).warning;
    }

    /** True if any node is a terminal node */
    get terminal(): boolean {
        return this._nodes.some((n: Node) => n.terminal);
    }
}
