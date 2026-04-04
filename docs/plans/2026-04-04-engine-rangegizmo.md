# Engine RangeGizmo Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract pure pathfinding and range logic from the
client `RangeGizmo` into an engine class, so the same logic
works headless for AI and future server use.

**Architecture:** New engine `RangeGizmo` class owns all
data/logic (node traversal, A* pathfinding, range generation).
Client `RangeGizmo` extends it, adding Phaser-dependent visuals.
Engine `Board` creates the engine version; client `Board`
overrides with the client version. Engine `Piece` range methods
upgraded from distance-only to path-aware.

**Tech Stack:** TypeScript, Vitest, `@archaos/engine`

**Spec:** `docs/specs/2026-04-04-engine-rangegizmo-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/engine/src/rangegizmo.ts` | Engine RangeGizmo — pure data/logic |
| Create | `packages/engine/src/rangegizmo.test.ts` | Engine RangeGizmo tests |
| Modify | `packages/engine/src/board.ts` | Remove `RangeGizmoLike`, create engine RangeGizmo in constructor, update getter |
| Modify | `packages/engine/src/piece.ts:1410-1471` | Upgrade `inMovementRange`, `inAttackRange` to use `board.rangeGizmo` |
| Modify | `packages/engine/src/piece.ts:1351-1384` | Upgrade `findThreatPieces` to use `inAttackRange` |
| Modify | `packages/engine/src/index.ts` | Export `RangeGizmo`, remove `RangeGizmoLike` |
| Modify | `src/gameobjects/rangegizmo.ts` | Extend engine RangeGizmo, keep only visuals |
| Modify | `src/gameobjects/piece.ts:416-481` | Remove `inMovementRange`, `inAttackRange`, `findThreatPieces` overrides |
| Modify | `src/gameobjects/board.ts:136,423-425` | Update `rangeGizmo` getter return type |

---

### Task 1: Create Engine RangeGizmo Class

**Files:**
- Create: `packages/engine/src/rangegizmo.ts`
- Create: `packages/engine/src/rangegizmo.test.ts`

This task creates the engine `RangeGizmo` with all pure logic
methods. The tests use mock boards (same pattern as other
engine tests) and cover every public/protected method.

- [ ] **Step 1: Write failing tests for `checkNodeTraversal`**

Create `packages/engine/src/rangegizmo.test.ts`:

```typescript
import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
} from "vitest";
import { RangeGizmo } from "./rangegizmo";
import { Node, Path } from "./pathfinding";
import { Point } from "./point";
import { RangeType } from "./enums/rangetype";
import { UnitStatus } from "./enums/unitstatus";
import type { Board } from "./board";
import type { Piece } from "./piece";

function makeNode(
    x: number,
    y: number,
    opts: Partial<{
        traversable: boolean;
        terminal: boolean;
        warning: boolean;
        flying: boolean;
        path: Path;
    }> = {},
): Node {
    const node = new Node(x, y);
    if (opts.traversable !== undefined)
        node.traversable = opts.traversable;
    if (opts.terminal !== undefined)
        node.terminal = opts.terminal;
    if (opts.warning !== undefined)
        node.warning = opts.warning;
    if (opts.flying !== undefined)
        node.flying = opts.flying;
    if (opts.path !== undefined) node.path = opts.path;
    return node;
}

function makeMockPiece(
    overrides: Record<string, any> = {},
): Piece {
    return {
        position: new Point(0, 0),
        dead: false,
        stats: { movement: 3 },
        hasStatus: vi.fn(() => false),
        canMountPiece: vi.fn(() => false),
        canAttackPiece: vi.fn(() => false),
        canEngagePiece: vi.fn(() => false),
        ...overrides,
    } as unknown as Piece;
}

function makeMockBoard(
    overrides: Record<string, any> = {},
): Board {
    return {
        width: 10,
        height: 10,
        getPiecesAtPosition: vi.fn(() => []),
        getAdjacentPiecesAtPosition: vi.fn(() => []),
        getAdjacentPoints: vi.fn(() => []),
        getPointsInRange: vi.fn(() => []),
        ...overrides,
    } as unknown as Board;
}

describe("RangeGizmo", () => {
    describe("checkNodeTraversal", () => {
        let board: Board;
        let gizmo: RangeGizmo;

        beforeEach(() => {
            board = makeMockBoard();
            gizmo = new RangeGizmo(board);
        });

        it("marks empty tile as traversable", () => {
            (gizmo as any)._piece = makeMockPiece();
            const node = makeNode(1, 1);
            const result = (
                gizmo as any
            ).checkNodeTraversal(node);
            expect(result.traversable).toBe(true);
            expect(result.terminal).toBe(false);
        });

        it("marks tile containing the piece itself as traversable", () => {
            const piece = makeMockPiece();
            (gizmo as any)._piece = piece;
            (
                board.getPiecesAtPosition as any
            ).mockReturnValue([piece]);

            const node = makeNode(0, 0);
            const result = (
                gizmo as any
            ).checkNodeTraversal(node);
            expect(result.traversable).toBe(true);
            expect(result.terminal).toBe(false);
        });

        it("marks tile with mountable piece as terminal", () => {
            const piece = makeMockPiece({
                canMountPiece: vi.fn(() => true),
            });
            const other = makeMockPiece();
            (gizmo as any)._piece = piece;
            (
                board.getPiecesAtPosition as any
            ).mockReturnValue([other]);

            const node = makeNode(1, 1);
            const result = (
                gizmo as any
            ).checkNodeTraversal(node);
            expect(result.terminal).toBe(true);
        });

        it("marks tile with attackable piece as terminal", () => {
            const piece = makeMockPiece({
                canAttackPiece: vi.fn(() => true),
            });
            const enemy = makeMockPiece();
            (gizmo as any)._piece = piece;
            (
                board.getPiecesAtPosition as any
            ).mockReturnValue([enemy]);

            const node = makeNode(1, 1);
            const result = (
                gizmo as any
            ).checkNodeTraversal(node);
            expect(result.terminal).toBe(true);
        });

        it("marks tile with blocking piece as not traversable", () => {
            const piece = makeMockPiece({
                canMountPiece: vi.fn(() => false),
                canAttackPiece: vi.fn(() => false),
            });
            const blocker = makeMockPiece();
            (gizmo as any)._piece = piece;
            (
                board.getPiecesAtPosition as any
            ).mockReturnValue([blocker]);

            const node = makeNode(1, 1);
            const result = (
                gizmo as any
            ).checkNodeTraversal(node);
            expect(result.traversable).toBe(false);
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/engine && npx vitest run src/rangegizmo.test.ts`
Expected: FAIL — `./rangegizmo` module not found

- [ ] **Step 3: Write the engine RangeGizmo class**

Create `packages/engine/src/rangegizmo.ts`:

```typescript
import { Point } from "./point";
import {
    Node,
    Path,
    distance,
    diagonalHeuristic,
    buildPath,
    isOpen,
    isClosed,
} from "./pathfinding";
import { RangeType } from "./enums/rangetype";
import { UnitStatus } from "./enums/unitstatus";
import type { Board } from "./board";
import type { Piece } from "./piece";

/**
 * Engine RangeGizmo: pure data/logic for computing
 * movement ranges, valid nodes, and A* pathfinding.
 *
 * The client RangeGizmo extends this class to add
 * Phaser-dependent visual rendering (layers, tweens,
 * cursor images).
 */
export class RangeGizmo {
    /**
     * Reference to the board.
     */
    protected readonly _board: Board;

    /**
     * The piece we're generating the range for.
     */
    protected _piece: Piece | null = null;

    /**
     * The valid nodes in the range.
     */
    protected _validNodes: Node[] = [];

    /**
     * Cached paths to valid nodes, keyed by "x,y".
     */
    protected _paths: Map<string, Path> =
        new Map();

    /**
     * @param board The board to compute ranges on
     */
    constructor(board: Board) {
        this._board = board;
    }

    /**
     * First pass — determine if a node is traversable
     * or terminal based on pieces at its position.
     *
     * @param node The node to check
     * @returns The updated node
     */
    protected checkNodeTraversal(node: Node): Node {
        const livePiecesAtPosition: Piece[] =
            this._board.getPiecesAtPosition(
                new Point(node.x, node.y),
                (piece: Piece) => !piece.dead,
            );
        if (livePiecesAtPosition.length) {
            if (
                livePiecesAtPosition.includes(
                    this._piece,
                )
            ) {
                node.traversable = true;
                node.terminal = false;
                return node;
            }
            for (const livePiece of livePiecesAtPosition) {
                if (
                    this._piece.canMountPiece(
                        livePiece,
                    ) ||
                    this._piece.canAttackPiece(
                        livePiece,
                    )
                ) {
                    node.terminal = true;
                } else {
                    node.traversable = false;
                }
            }
        } else {
            node.traversable = true;
            node.terminal = false;
        }
        return node;
    }

    /**
     * Generate the range for the given unit — computes
     * valid nodes and paths. Async so the client can
     * override to add visual rendering after
     * `await super.generate(unit)`.
     *
     * @param unit The piece to generate range for
     */
    public async generate(unit: Piece): Promise<void> {
        await this.reset();

        this._validNodes = [];
        this._paths = new Map<string, Path>();
        this._piece = unit;

        const potentiallyValidNodes: Map<string, Node> =
            new Map();

        this._board
            .getPointsInRange(
                unit.position,
                unit.stats.movement,
                true,
                unit.hasStatus(UnitStatus.Flying)
                    ? RangeType.Fly
                    : RangeType.Foot,
            )
            .map(
                (pt: Point) => new Node(pt.x, pt.y),
            )
            .filter((node: Node) => {
                node = this.checkNodeTraversal(node);
                return node.traversable;
            })
            .forEach((node: Node) => {
                potentiallyValidNodes.set(
                    node.x + "," + node.y,
                    node,
                );
            });

        // Check warning status — adjacent to
        // engageable enemies
        potentiallyValidNodes.forEach((node: Node) => {
            const potentialEnemies: Set<Piece> =
                new Set(
                    this._board.getAdjacentPiecesAtPosition(
                        node.pos,
                        (piece: Piece) => {
                            return piece.canEngagePiece(
                                this._piece,
                            );
                        },
                    ),
                );
            if (!potentialEnemies.size) {
                return;
            }
            potentialEnemies.forEach(
                (enemy: Piece) => {
                    this._board
                        .getAdjacentPoints(
                            enemy.position,
                            false,
                        )
                        .forEach((adjPt: Point) => {
                            const adjNodeKey =
                                adjPt.x +
                                "," +
                                adjPt.y;
                            if (
                                potentiallyValidNodes.has(
                                    adjNodeKey,
                                )
                            ) {
                                potentiallyValidNodes.get(
                                    adjNodeKey,
                                ).warning = true;
                            }
                        });
                },
            );
        });

        this._validNodes = Array.from(
            potentiallyValidNodes.values(),
        );

        // Flying units skip pathfinding — all valid
        // nodes are reachable
        if (
            this._piece.hasStatus(UnitStatus.Flying)
        ) {
            return;
        }

        // Ground units need A* to determine actual
        // reachable nodes
        for (const node of this._validNodes) {
            const path: Path = this.getPathTo(
                node.pos,
            );
            node.path = path;
            if (
                !path ||
                path.cost >
                    this._piece.stats.movement + 1
            ) {
                node.traversable = false;
            }
        }
    }

    /**
     * Reset the range state, clearing piece, nodes
     * and path cache. Async so the client can override
     * to animate layer removal before calling
     * `await super.reset()`.
     */
    public async reset(): Promise<RangeGizmo> {
        this._piece = null;
        this._validNodes = [];
        this._paths = new Map();
        return this;
    }

    /**
     * Look up a valid (traversable or terminal) node
     * at the given board position.
     *
     * @param pt The board position to look up
     * @returns The matching Node, or null if none
     */
    public getNode(
        pt: { x: number; y: number },
    ): Node | null {
        return (
            this._validNodes.find(
                (node: Node) =>
                    node.x === pt.x &&
                    node.y === pt.y &&
                    (node.traversable ||
                        node.terminal),
            ) || null
        );
    }

    /**
     * Get (or compute and cache) the shortest path
     * from the current piece's position to the given
     * position.
     *
     * @param pt The destination position
     * @returns The computed Path, or null
     */
    public getPathTo(
        pt: { x: number; y: number },
    ): Path | null {
        if (!this._piece) {
            return null;
        }
        const node = this.getNode(pt);
        if (
            !node ||
            (!node.traversable && !node.terminal)
        ) {
            return null;
        }
        const key = pt.x + "," + pt.y;
        if (this._paths.has(key)) {
            return this._paths.get(key);
        }
        const path = this.findPath(
            this._piece.position,
            new Point(pt.x, pt.y),
        );
        this._paths.set(key, path);
        return path || null;
    }

    /**
     * Get all valid paths from the piece's current
     * position to valid nodes.
     *
     * @param ignoreTerminal Skip terminal nodes
     * @returns Set of reachable Paths
     */
    public getAllValidPaths(
        ignoreTerminal: boolean = true,
    ): Set<Path> {
        const output: Set<Path> = new Set();
        for (const node of this._validNodes) {
            if (
                node.isValid() &&
                (!ignoreTerminal || !node.terminal)
            ) {
                const path: Path = this.getPathTo(
                    node.pos,
                );
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
     * @returns Set of terminal Paths
     */
    public getAllTerminalPaths(): Set<Path> {
        const output: Set<Path> = new Set();
        for (const node of this._validNodes) {
            if (node.isValid() && node.terminal) {
                const path: Path = this.getPathTo(
                    node.pos,
                );
                if (path) {
                    output.add(path);
                }
            }
        }
        return output;
    }

    /**
     * A* pathfinding between two board positions
     * using the current valid nodes.
     *
     * @param fromPt Start position
     * @param toPt Destination position
     * @returns Shortest Path, or null
     */
    public findPath(
        fromPt: Point,
        toPt: Point,
    ): Path | null {
        let firstNode: Node;
        let destinationNode: Node;
        for (const node of this._validNodes) {
            if (Point.equals(node.pos, fromPt)) {
                firstNode = node;
            }
            if (Point.equals(node.pos, toPt)) {
                destinationNode = node;
            }
        }

        if (
            firstNode === null ||
            destinationNode === null
        ) {
            return null;
        }

        const openNodes: Node[] = [];
        const closedNodes: Node[] = [];

        let currentNode: Node = firstNode;
        let testNode: Node;

        let l: number;
        let i: number;

        let connectedNodes: Node[];
        const travelCost: number = 1;

        let g: number;
        let h: number;
        let f: number;

        if (!currentNode) {
            return null;
        }

        currentNode.g = 0;
        currentNode.h = diagonalHeuristic(
            currentNode,
            destinationNode,
            travelCost,
        );
        currentNode.f =
            currentNode.g + currentNode.h;

        while (currentNode != destinationNode) {
            connectedNodes =
                this.findConnectedNodes(currentNode);

            l = connectedNodes.length;

            for (i = 0; i < l; ++i) {
                testNode = connectedNodes[i];
                if (
                    testNode === currentNode ||
                    (!testNode.traversable &&
                        !testNode.terminal)
                ) {
                    continue;
                }
                g =
                    currentNode.g +
                    diagonalHeuristic(
                        currentNode,
                        testNode,
                        travelCost,
                    );
                h = diagonalHeuristic(
                    testNode,
                    destinationNode,
                    travelCost,
                );
                f = g + h;

                if (
                    isOpen(testNode, openNodes) ||
                    isClosed(testNode, closedNodes)
                ) {
                    if (testNode.f > f) {
                        testNode.f = f;
                        testNode.g = g;
                        testNode.h = h;
                        testNode.parentNode =
                            currentNode;
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

            if (openNodes.length == 0) {
                return null;
            }
            openNodes.sort(
                (n1: Node, n2: Node): number => {
                    return n1.f < n2.f ? -1 : 1;
                },
            );
            currentNode = openNodes.shift();
        }

        return buildPath(destinationNode, firstNode);
    }

    /**
     * Find all valid nodes adjacent to the given
     * node (8-connected neighbourhood).
     *
     * @param node The node to find neighbours for
     * @returns Adjacent valid nodes
     */
    public findConnectedNodes(node: Node): Node[] {
        const output: Node[] = [];

        for (const validNode of this._validNodes) {
            if (
                node.x < validNode.x - 1 ||
                node.x > validNode.x + 1
            ) {
                continue;
            }
            if (
                node.y < validNode.y - 1 ||
                node.y > validNode.y + 1
            ) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run src/rangegizmo.test.ts`
Expected: All 5 `checkNodeTraversal` tests PASS

- [ ] **Step 5: Add tests for `generate` (flying and ground)**

Append to the `describe("RangeGizmo")` block in
`packages/engine/src/rangegizmo.test.ts`:

```typescript
describe("generate", () => {
    it("generates valid nodes for flying unit", async () => {
        const piece = makeMockPiece({
            position: new Point(5, 5),
            hasStatus: vi
                .fn()
                .mockImplementation(
                    (s: UnitStatus) =>
                        s === UnitStatus.Flying,
                ),
        });
        const points = [
            new Point(4, 5),
            new Point(5, 4),
            new Point(6, 5),
        ];
        const board = makeMockBoard({
            getPointsInRange: vi
                .fn()
                .mockReturnValue(points),
        });
        const gizmo = new RangeGizmo(board);

        await gizmo.generate(piece);

        // Flying units skip pathfinding, all
        // traversable nodes are valid
        expect(
            (gizmo as any)._validNodes.length,
        ).toBe(3);
        expect(
            board.getPointsInRange,
        ).toHaveBeenCalledWith(
            piece.position,
            3,
            true,
            RangeType.Fly,
        );
    });

    it("generates valid nodes for ground unit with pathfinding", async () => {
        const piece = makeMockPiece({
            position: new Point(0, 0),
        });
        const points = [
            new Point(0, 0),
            new Point(1, 0),
            new Point(2, 0),
        ];
        const board = makeMockBoard({
            getPointsInRange: vi
                .fn()
                .mockReturnValue(points),
        });
        const gizmo = new RangeGizmo(board);

        await gizmo.generate(piece);

        // Ground units run pathfinding
        expect(
            board.getPointsInRange,
        ).toHaveBeenCalledWith(
            piece.position,
            3,
            true,
            RangeType.Foot,
        );
    });

    it("marks warning nodes adjacent to engageable enemies", async () => {
        const piece = makeMockPiece({
            position: new Point(0, 0),
            hasStatus: vi
                .fn()
                .mockImplementation(
                    (s: UnitStatus) =>
                        s === UnitStatus.Flying,
                ),
        });
        const enemy = makeMockPiece({
            position: new Point(3, 0),
            canEngagePiece: vi
                .fn()
                .mockReturnValue(true),
        });
        const points = [
            new Point(1, 0),
            new Point(2, 0),
        ];
        const board = makeMockBoard({
            getPointsInRange: vi
                .fn()
                .mockReturnValue(points),
            getAdjacentPiecesAtPosition: vi
                .fn()
                .mockImplementation(
                    (
                        pt: Point,
                        filter?: Function,
                    ) => {
                        // (2,0) is adjacent to enemy
                        // at (3,0)
                        if (
                            pt.x === 2 &&
                            filter?.(enemy)
                        ) {
                            return [enemy];
                        }
                        return [];
                    },
                ),
            getAdjacentPoints: vi
                .fn()
                .mockImplementation(
                    (pt: Point) => {
                        // Return adjacent points
                        // around enemy at (3,0)
                        return [
                            new Point(2, 0),
                            new Point(3, 1),
                        ];
                    },
                ),
        });
        const gizmo = new RangeGizmo(board);

        await gizmo.generate(piece);

        const warningNode = (
            gizmo as any
        )._validNodes.find(
            (n: Node) => n.x === 2 && n.y === 0,
        );
        expect(warningNode.warning).toBe(true);
    });

    it("resets state before generating", async () => {
        const piece = makeMockPiece({
            position: new Point(0, 0),
            hasStatus: vi
                .fn()
                .mockImplementation(
                    (s: UnitStatus) =>
                        s === UnitStatus.Flying,
                ),
        });
        const board = makeMockBoard({
            getPointsInRange: vi
                .fn()
                .mockReturnValue([
                    new Point(1, 0),
                ]),
        });
        const gizmo = new RangeGizmo(board);

        await gizmo.generate(piece);
        expect(
            (gizmo as any)._validNodes.length,
        ).toBe(1);

        // Generate again with empty range
        (
            board.getPointsInRange as any
        ).mockReturnValue([]);
        await gizmo.generate(piece);
        expect(
            (gizmo as any)._validNodes.length,
        ).toBe(0);
    });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run src/rangegizmo.test.ts`
Expected: All `generate` tests PASS

- [ ] **Step 7: Add tests for `reset`, `getNode`, `getPathTo`, `getAllValidPaths`, `getAllTerminalPaths`, A* integration, and `findConnectedNodes`**

Append to the `describe("RangeGizmo")` block in
`packages/engine/src/rangegizmo.test.ts`:

```typescript
describe("reset", () => {
    it("clears piece, valid nodes and paths", async () => {
        const board = makeMockBoard();
        const gizmo = new RangeGizmo(board);
        (gizmo as any)._piece = makeMockPiece();
        (gizmo as any)._validNodes = [
            makeNode(0, 0),
        ];
        (gizmo as any)._paths.set(
            "0,0",
            {} as Path,
        );

        const result = await gizmo.reset();

        expect(result).toBe(gizmo);
        expect((gizmo as any)._piece).toBeNull();
        expect(
            (gizmo as any)._validNodes,
        ).toHaveLength(0);
        expect(
            (gizmo as any)._paths.size,
        ).toBe(0);
    });
});

describe("getNode", () => {
    it("returns null when no valid nodes exist", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        expect(
            gizmo.getNode(new Point(0, 0)),
        ).toBeNull();
    });

    it("returns a traversable node at position", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const node = makeNode(1, 2);
        (gizmo as any)._validNodes = [node];

        expect(
            gizmo.getNode(new Point(1, 2)),
        ).toBe(node);
    });

    it("returns a terminal node at position", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const node = makeNode(1, 2, {
            traversable: false,
            terminal: true,
        });
        (gizmo as any)._validNodes = [node];

        expect(
            gizmo.getNode(new Point(1, 2)),
        ).toBe(node);
    });

    it("returns null for non-traversable non-terminal node", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const node = makeNode(1, 2, {
            traversable: false,
        });
        (gizmo as any)._validNodes = [node];

        expect(
            gizmo.getNode(new Point(1, 2)),
        ).toBeNull();
    });
});

describe("getPathTo", () => {
    it("returns null when no piece is set", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        expect(
            gizmo.getPathTo(new Point(0, 0)),
        ).toBeNull();
    });

    it("caches paths for repeated lookups", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const nodes = [
            makeNode(0, 0),
            makeNode(1, 0),
        ];
        (gizmo as any)._validNodes = nodes;
        (gizmo as any)._piece = makeMockPiece();
        (gizmo as any)._paths = new Map();

        const path1 = gizmo.getPathTo(
            new Point(1, 0),
        );
        const path2 = gizmo.getPathTo(
            new Point(1, 0),
        );
        expect(path1).toBe(path2);
    });

    it("returns null for non-traversable, non-terminal node", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const blocked = makeNode(1, 0, {
            traversable: false,
        });
        (gizmo as any)._validNodes = [
            makeNode(0, 0),
            blocked,
        ];
        (gizmo as any)._piece = makeMockPiece();
        (gizmo as any)._paths = new Map();

        expect(
            gizmo.getPathTo(new Point(1, 0)),
        ).toBeNull();
    });
});

describe("getAllValidPaths", () => {
    it("returns empty set when no valid nodes", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        expect(gizmo.getAllValidPaths().size).toBe(
            0,
        );
    });
});

describe("getAllTerminalPaths", () => {
    it("returns empty set when no valid nodes", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        expect(
            gizmo.getAllTerminalPaths().size,
        ).toBe(0);
    });
});

describe("findConnectedNodes", () => {
    it("returns only adjacent nodes", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const center = makeNode(5, 5);
        const adjacent = makeNode(6, 5);
        const diagonal = makeNode(6, 6);
        const farAway = makeNode(8, 8);
        (gizmo as any)._validNodes = [
            center,
            adjacent,
            diagonal,
            farAway,
        ];

        const connected =
            gizmo.findConnectedNodes(center);
        expect(connected).toContain(adjacent);
        expect(connected).toContain(diagonal);
        expect(connected).not.toContain(farAway);
        expect(connected).not.toContain(center);
    });

    it("includes all 8 neighbours when fully surrounded", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const center = makeNode(5, 5);
        const neighbours = [
            makeNode(4, 4),
            makeNode(5, 4),
            makeNode(6, 4),
            makeNode(4, 5),
            makeNode(6, 5),
            makeNode(4, 6),
            makeNode(5, 6),
            makeNode(6, 6),
        ];
        (gizmo as any)._validNodes = [
            center,
            ...neighbours,
        ];

        const connected =
            gizmo.findConnectedNodes(center);
        expect(connected).toHaveLength(8);
    });
});

describe("A* pathfinding integration", () => {
    it("finds a straight-line path on a clear grid", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const nodes = [
            makeNode(0, 0),
            makeNode(1, 0),
            makeNode(2, 0),
            makeNode(3, 0),
        ];
        (gizmo as any)._validNodes = nodes;
        (gizmo as any)._piece = makeMockPiece();
        (gizmo as any)._paths = new Map();

        const path = gizmo.findPath(
            new Point(0, 0),
            new Point(3, 0),
        );
        expect(path).not.toBeNull();
        expect(path.nodes).toHaveLength(4);
        expect(path.nodes[0].x).toBe(0);
        expect(path.nodes[3].x).toBe(3);
    });

    it("finds a diagonal path", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const nodes = [
            makeNode(0, 0),
            makeNode(1, 1),
            makeNode(2, 2),
        ];
        (gizmo as any)._validNodes = nodes;
        (gizmo as any)._piece = makeMockPiece();
        (gizmo as any)._paths = new Map();

        const path = gizmo.findPath(
            new Point(0, 0),
            new Point(2, 2),
        );
        expect(path).not.toBeNull();
        expect(path.nodes[0].x).toBe(0);
        expect(
            path.nodes[path.nodes.length - 1].x,
        ).toBe(2);
    });

    it("returns null when destination is unreachable", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const nodes = [
            makeNode(0, 0),
            makeNode(5, 5),
        ];
        (gizmo as any)._validNodes = nodes;
        (gizmo as any)._piece = makeMockPiece();
        (gizmo as any)._paths = new Map();

        const path = gizmo.findPath(
            new Point(0, 0),
            new Point(5, 5),
        );
        expect(path).toBeNull();
    });

    it("routes around a non-traversable node", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const nodes = [
            makeNode(0, 0),
            makeNode(1, 0, {
                traversable: false,
            }),
            makeNode(2, 0),
            makeNode(0, 1),
            makeNode(1, 1),
            makeNode(2, 1),
        ];
        (gizmo as any)._validNodes = nodes;
        (gizmo as any)._piece = makeMockPiece();
        (gizmo as any)._paths = new Map();

        const path = gizmo.findPath(
            new Point(0, 0),
            new Point(2, 0),
        );
        expect(path).not.toBeNull();
        const pathCoords = path.nodes.map(
            (n: Node) => `${n.x},${n.y}`,
        );
        expect(pathCoords).not.toContain("1,0");
    });

    it("can pathfind to a terminal node", () => {
        const gizmo = new RangeGizmo(
            makeMockBoard(),
        );
        const nodes = [
            makeNode(0, 0),
            makeNode(1, 0),
            makeNode(2, 0, { terminal: true }),
        ];
        (gizmo as any)._validNodes = nodes;
        (gizmo as any)._piece = makeMockPiece();
        (gizmo as any)._paths = new Map();

        const path = gizmo.findPath(
            new Point(0, 0),
            new Point(2, 0),
        );
        expect(path).not.toBeNull();
        expect(
            path.nodes[path.nodes.length - 1].x,
        ).toBe(2);
    });
});
```

- [ ] **Step 8: Run all rangegizmo tests**

Run: `cd packages/engine && npx vitest run src/rangegizmo.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/rangegizmo.ts packages/engine/src/rangegizmo.test.ts
git commit -m "feat(engine): add RangeGizmo with pure pathfinding logic"
```

---

### Task 2: Integrate Engine RangeGizmo into Board

**Files:**
- Modify: `packages/engine/src/board.ts:44-57,184,598-600`
- Modify: `packages/engine/src/index.ts:141`

- [ ] **Step 1: Update engine Board to import and create RangeGizmo**

In `packages/engine/src/board.ts`:

1. Add import at the top:
```typescript
import { RangeGizmo } from "./rangegizmo";
```

2. Remove the `RangeGizmoLike` interface (lines 43–57):
```typescript
// DELETE the entire RangeGizmoLike interface
```

3. Change the field type (line 184):
```typescript
// Before:
protected _rangeGizmo: RangeGizmoLike | null = null;
// After:
protected _rangeGizmo: RangeGizmo;
```

4. Create RangeGizmo in constructor, after
`this._rules = Rules.getInstance();` (around line 224):
```typescript
this._rangeGizmo = new RangeGizmo(this);
```

5. Update the getter (lines 598–600):
```typescript
// Before:
get rangeGizmo(): RangeGizmoLike | null {
    return this._rangeGizmo;
}
// After:
get rangeGizmo(): RangeGizmo {
    return this._rangeGizmo;
}
```

- [ ] **Step 2: Update engine index.ts exports**

In `packages/engine/src/index.ts`, change line 141:

```typescript
// Before:
export { Board, type RangeGizmoLike } from "./board";
// After:
export { Board } from "./board";
export { RangeGizmo } from "./rangegizmo";
```

- [ ] **Step 3: Run engine tests**

Run: `cd packages/engine && npx vitest run`
Expected: All tests PASS (existing tests that mocked
`rangeGizmo` as null or `RangeGizmoLike` may need the mock
adjusted — the `Board` constructor now creates a real
`RangeGizmo`, but mock boards in tests use `as unknown as
Board` casts so they should still work).

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/board.ts packages/engine/src/index.ts
git commit -m "feat(engine): integrate RangeGizmo into Board"
```

---

### Task 3: Refactor Client RangeGizmo to Extend Engine

**Files:**
- Modify: `src/gameobjects/rangegizmo.ts`
- Modify: `src/gameobjects/board.ts:136,423-425`

- [ ] **Step 1: Refactor client RangeGizmo to extend engine**

Rewrite `src/gameobjects/rangegizmo.ts`. The class now extends
the engine `RangeGizmo` and keeps only Phaser-dependent code.

Key changes:
- Import engine `RangeGizmo` as `EngineRangeGizmo`
- Remove all data fields (`_piece`, `_validNodes`, `_paths`)
  — inherited from engine
- Remove all pure logic methods (`checkNodeTraversal`,
  `findPath`, `findConnectedNodes`, `getNode`, `getPathTo`,
  `getAllValidPaths`, `getAllTerminalPaths`) — inherited
- Keep `_rangeLayer`, `_pathLayer` and all visual methods
- Override `generate()` to call `await super.generate(unit)`
  then render visuals
- Override `reset()` to animate layers then call
  `await super.reset()`

```typescript
import {
    BoardLayer,
    CursorType,
    UnitStatus,
    Node,
    Path,
    distance as gridDistance,
    RangeGizmo as EngineRangeGizmo,
} from "@archaos/engine";
import { Board } from "./board";
import { Cursor } from "./cursor";
import { Piece } from "./piece";

import { Geom, GameObjects } from "phaser";

export class RangeGizmo extends EngineRangeGizmo {
    /**
     * Duration of gizmo reveal animation in
     * milliseconds
     */
    private static readonly GIZMO_REVEAL_DURATION:
        number = 50;

    /**
     * Stagger delay between gizmo reveal animations
     * in milliseconds
     */
    private static readonly GIZMO_REVEAL_STAGGER_DELAY:
        number = 5;

    /**
     * Reference to the client board (typed narrowly
     * for Phaser access)
     */
    private readonly _clientBoard: Board;

    /**
     * Layer for range gizmo graphics
     */
    private readonly _rangeLayer: GameObjects.Layer;

    /**
     * Layer for path gizmo graphics
     */
    private readonly _pathLayer: GameObjects.Layer;

    constructor(board: Board) {
        super(board);
        this._clientBoard = board;
        this._rangeLayer = board.getLayer(
            BoardLayer.FloorCursors,
        );
        this._pathLayer = board.getLayer(
            BoardLayer.PathCursors,
        );
    }

    /**
     * Generate range for the given unit — computes
     * valid nodes via the engine, then renders
     * visual range/paths.
     */
    public override async generate(
        unit: Piece,
    ): Promise<void> {
        await super.generate(unit);

        if (
            this._piece?.hasStatus(UnitStatus.Flying)
        ) {
            await this.generateVisualRange();
        } else {
            await this.generateVisualPaths();
        }
    }

    /**
     * Reset the range gizmo. Animates layer fade-out
     * (or force-clears), then clears engine state.
     */
    public override async reset(
        force?: boolean,
    ): Promise<RangeGizmo> {
        if (
            this._rangeLayer.length === 0 &&
            this._pathLayer.length === 0
        ) {
            await super.reset();
            return this;
        }

        if (force) {
            this._rangeLayer.removeAll();
            this._pathLayer.removeAll();
            await super.reset();
            return this;
        }

        return new Promise(
            (resolve: Function) => {
                this._clientBoard.scene.tweens.add({
                    targets:
                        this._rangeLayer.getChildren(),
                    duration:
                        RangeGizmo.GIZMO_REVEAL_DURATION,
                    alpha: 0,
                    delay: this._clientBoard.scene.tweens.stagger(
                        RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                        { from: "last" },
                    ),
                    onComplete: async () => {
                        this._rangeLayer.removeAll();
                        this._pathLayer.removeAll();
                        await super.reset();
                        setTimeout(() => {
                            resolve(this);
                        }, 50);
                    },
                });
            },
        );
    }

    // ── Visual methods (client-only) ────────────

    /**
     * Generate visual path indicators for valid and
     * terminal nodes.
     */
    private async generateVisualPaths(): Promise<void> {
        this._rangeLayer.removeAll();

        return new Promise(
            (resolve: Function) => {
                this._validNodes
                    .filter(Boolean)
                    .filter(
                        (node: Node) =>
                            node.traversable ||
                            node.terminal,
                    )
                    .forEach((node: Node) => {
                        const path: Path =
                            this.getPathTo(node.pos);
                        if (!path?.nodes?.length) {
                            return;
                        }
                        if (
                            path?.cost >
                            this._piece.stats
                                .movement +
                                1
                        ) {
                            node.traversable = false;
                        } else {
                            node.path = path;
                            const isoPosition: Geom.Point =
                                this._clientBoard.getIsoPosition(
                                    node.pos,
                                );
                            let cursorImage: GameObjects.Image;

                            if (node.warning) {
                                cursorImage =
                                    this._clientBoard.scene.add.image(
                                        isoPosition.x,
                                        isoPosition.y,
                                        "cursors",
                                        CursorType.RangeMoveWarning,
                                    );
                            } else {
                                cursorImage =
                                    this._clientBoard.scene.add.image(
                                        isoPosition.x,
                                        isoPosition.y,
                                        "cursors",
                                        CursorType.RangeMove,
                                    );
                            }
                            cursorImage.setOrigin(
                                0.5,
                                0.5,
                            );
                            cursorImage.setAlpha(0);
                            this._rangeLayer.add(
                                cursorImage,
                            );
                        }
                    });

                this._clientBoard.scene.tweens.add({
                    targets:
                        this._rangeLayer.getChildren(),
                    alpha: 1,
                    duration:
                        RangeGizmo.GIZMO_REVEAL_DURATION,
                    delay: this._clientBoard.scene.tweens.stagger(
                        RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                        { from: "first" },
                    ),
                    onComplete: () => {
                        resolve();
                    },
                });
            },
        );
    }

    private lastSimplePosition: Geom.Point =
        new Geom.Point(-1, -1);
    private lastDistance: number = -1;
    private lastCursor: CursorType;
    private lastLoS: boolean;

    /**
     * Generate a simple circular range overlay.
     */
    public async generateSimpleRange(
        position: Geom.Point,
        distance: number,
        cursor: CursorType = CursorType.RangeCast,
        lineOfSight?: boolean,
        force?: boolean,
    ): Promise<void> {
        if (
            !force &&
            Geom.Point.Equals(
                position,
                this.lastSimplePosition,
            ) &&
            distance === this.lastDistance &&
            cursor === this.lastCursor &&
            lineOfSight === this.lastLoS
        ) {
            return;
        }
        await this.reset(force);

        this.lastSimplePosition =
            Geom.Point.Clone(position);
        this.lastDistance = distance;
        this.lastCursor = cursor;
        this.lastLoS = lineOfSight;

        const startPosition =
            Geom.Point.Clone(position);
        this._rangeLayer.removeAll();

        return new Promise(
            (resolve: Function) => {
                for (
                    let yy: number = 0;
                    yy < this._clientBoard.height;
                    yy++
                ) {
                    for (
                        let xx: number = 0;
                        xx <
                        this._clientBoard.width;
                        xx++
                    ) {
                        const currentDistance: number =
                            gridDistance(
                                startPosition,
                                new Geom.Point(
                                    xx,
                                    yy,
                                ),
                            );
                        if (
                            currentDistance > distance
                        ) {
                            continue;
                        }
                        if (
                            lineOfSight &&
                            !this._clientBoard.hasLineOfSight(
                                startPosition,
                                new Geom.Point(
                                    xx,
                                    yy,
                                ),
                            )
                        ) {
                            continue;
                        }
                        const isoPosition: Geom.Point =
                            this._clientBoard.getIsoPosition(
                                new Geom.Point(
                                    xx,
                                    yy,
                                ),
                            );
                        const cursorImage: GameObjects.Image =
                            this._clientBoard.scene.add.image(
                                isoPosition.x,
                                isoPosition.y,
                                "cursors",
                                cursor,
                            );
                        cursorImage.setOrigin(
                            0.5,
                            0.5,
                        );
                        if (!force) {
                            cursorImage.setAlpha(0);
                        }
                        cursorImage.setDepth(
                            currentDistance,
                        );
                        this._rangeLayer.add(
                            cursorImage,
                        );
                    }
                }

                this._rangeLayer.sort("depth");

                if (force) {
                    resolve();
                    return;
                }
                this._clientBoard.scene.tweens.add({
                    targets:
                        this._rangeLayer.getChildren(),
                    alpha: 1,
                    duration:
                        RangeGizmo.GIZMO_REVEAL_DURATION,
                    delay: this._clientBoard.scene.tweens.stagger(
                        RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                        { from: "first" },
                    ),
                    onComplete: () => {
                        resolve();
                    },
                });
            },
        );
    }

    /**
     * Show a simple range overlay with a reveal
     * animation.
     */
    public async showSimpleRange(
        position: Geom.Point,
        distance: number,
        cursor: CursorType = CursorType.RangeCast,
        lineOfSight?: boolean,
    ): Promise<void> {
        await this.generateSimpleRange(
            position,
            distance,
            cursor,
            lineOfSight,
            true,
        );

        this._rangeLayer
            .getChildren()
            .forEach(
                (child: GameObjects.Image) => {
                    child.setAlpha(0);
                },
            );

        this._clientBoard.scene.tweens.add({
            targets:
                this._rangeLayer.getChildren(),
            alpha: 1,
            duration:
                RangeGizmo.GIZMO_REVEAL_DURATION,
            delay: this._clientBoard.scene.tweens.stagger(
                RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                { from: "first" },
            ),
        });
    }

    /**
     * Hide the currently displayed simple range
     * overlay.
     */
    public async hideSimpleRange(): Promise<void> {
        if (this._rangeLayer.length === 0) {
            return;
        }

        this._clientBoard.scene.tweens.add({
            targets:
                this._rangeLayer.getChildren(),
            duration:
                RangeGizmo.GIZMO_REVEAL_DURATION,
            alpha: 0,
            delay: this._clientBoard.scene.tweens.stagger(
                RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                { from: "last" },
            ),
        });
    }

    /**
     * Generate visual range indicators for flying
     * units.
     */
    private async generateVisualRange(): Promise<void> {
        this._rangeLayer.removeAll();

        return new Promise(
            (resolve: Function) => {
                this._validNodes
                    .filter(
                        (node: Node) =>
                            node?.isValid(),
                    )
                    .forEach((node: Node) => {
                        const isoPosition: Geom.Point =
                            this._clientBoard.getIsoPosition(
                                node.pos,
                            );
                        let cursorImage: GameObjects.Image;

                        if (node.warning) {
                            cursorImage =
                                this._clientBoard.scene.add.image(
                                    isoPosition.x,
                                    isoPosition.y,
                                    "cursors",
                                    CursorType.RangeMoveWarning,
                                );
                        } else {
                            cursorImage =
                                this._clientBoard.scene.add.image(
                                    isoPosition.x,
                                    isoPosition.y,
                                    "cursors",
                                    CursorType.RangeMove,
                                );
                        }
                        cursorImage.setOrigin(
                            0.5,
                            0.5,
                        );
                        cursorImage.setAlpha(0);
                        this._rangeLayer.add(
                            cursorImage,
                        );
                    });

                this._clientBoard.scene.tweens.add({
                    targets:
                        this._rangeLayer.getChildren(),
                    alpha: 1,
                    duration:
                        RangeGizmo.GIZMO_REVEAL_DURATION,
                    delay: this._clientBoard.scene.tweens.stagger(
                        RangeGizmo.GIZMO_REVEAL_STAGGER_DELAY,
                        { from: "first" },
                    ),
                    onComplete: () => {
                        resolve();
                    },
                });
            },
        );
    }

    /**
     * Display directional arrow cursors along the
     * path to the given destination.
     */
    public showPath(toPt: Geom.Point): void {
        this._pathLayer.removeAll();
        if (
            !this._piece ||
            this._piece.hasStatus(
                UnitStatus.Flying,
            ) ||
            Geom.Point.Equals(
                toPt,
                this._piece.position,
            )
        ) {
            return;
        }
        const path: Path = this.getPathTo(toPt);

        if (!path?.nodes?.length) {
            return;
        }

        const destinationNode = this.getNode(toPt);
        const endIndex = destinationNode?.terminal
            ? path.nodes.length
            : path.nodes.length - 1;

        for (
            let n: number = 1;
            n < endIndex;
            n++
        ) {
            const isoPosition: Geom.Point =
                this._clientBoard.getIsoPosition(
                    path.nodes[n].pos,
                );

            const cursorImage: GameObjects.Image =
                this._clientBoard.scene.add.image(
                    isoPosition.x,
                    isoPosition.y,
                    "cursors",
                    Cursor.getCursorAngle(
                        path.angles[n],
                    ),
                );
            cursorImage.setOrigin(0.5, 0.5);
            this._pathLayer.add(cursorImage);
        }
    }

    /**
     * Render a debug grid to the console.
     */
    private static showDebugGrid(
        board: Board,
        nodes: Node[],
    ): void {
        let debugGrid: string = "";
        for (
            let yy: number = 0;
            yy < board.height;
            yy++
        ) {
            let row: string = "";
            for (
                let xx: number = 0;
                xx < board.width;
                xx++
            ) {
                const node = nodes.find(
                    (n: Node) =>
                        n.x === xx && n.y === yy,
                );
                if (node) {
                    if (node.terminal) {
                        row += "X ";
                    } else if (node.warning) {
                        row += "! ";
                    } else {
                        row += ". ";
                    }
                } else {
                    row += "# ";
                }
            }
            debugGrid += row + "\n";
        }
        console.log(`Debug grid:\n${debugGrid}`);
    }
}
```

Note: The client class accesses `this._piece` and
`this._validNodes` which are `protected` on the engine class,
so this works via inheritance.

- [ ] **Step 2: Update client Board**

In `src/gameobjects/board.ts`:

The import already exists (line 45):
```typescript
import { RangeGizmo } from "./rangegizmo";
```

Line 136 already creates the client RangeGizmo:
```typescript
this._rangeGizmo = new RangeGizmo(this);
```

The getter override at line 423 casts to client `RangeGizmo`:
```typescript
override get rangeGizmo(): RangeGizmo {
    return this._rangeGizmo as RangeGizmo;
}
```

These should all still work since the client `RangeGizmo` now
extends the engine one. No changes needed unless there's a type
mismatch — verify by running `npm run build`.

- [ ] **Step 3: Run build to verify types**

Run: `npm run build` from project root.
Expected: 0 type errors.

- [ ] **Step 4: Run all engine tests**

Run: `cd packages/engine && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gameobjects/rangegizmo.ts src/gameobjects/board.ts
git commit -m "refactor: client RangeGizmo extends engine RangeGizmo"
```

---

### Task 4: Upgrade Engine Piece Range Methods

**Files:**
- Modify: `packages/engine/src/piece.ts:1410-1471`
- Modify: `packages/engine/src/piece.ts:1351-1384`
- Modify: `src/gameobjects/piece.ts:416-481`

- [ ] **Step 1: Update engine `inMovementRange`**

In `packages/engine/src/piece.ts`, replace the
`inMovementRange` method (lines 1410–1449) with:

```typescript
    /**
     * Check if a point is within this piece's
     * movement range. Uses RangeGizmo pathfinding
     * for ground units.
     */
    inMovementRange(
        point: { x: number; y: number },
    ): boolean {
        if (Point.equals(
            this.position,
            new Point(point.x, point.y),
        )) {
            return false;
        }
        if (this.currentMount) {
            if (
                distance(
                    this.position,
                    new Point(point.x, point.y),
                ) > 1.5
            ) {
                return false;
            }
        }
        if (this.hasStatus(UnitStatus.Flying)) {
            return (
                distance(
                    this.position,
                    new Point(point.x, point.y),
                    RangeType.Fly,
                ) <= this.stats.movement
            );
        }
        if (
            !this.board.rangeGizmo.getPathTo(point)
        ) {
            return false;
        }
        return true;
    }
```

- [ ] **Step 2: Update engine `inAttackRange`**

In `packages/engine/src/piece.ts`, replace the
`inAttackRange` method (lines 1456–1471) with:

```typescript
    /**
     * Check if a point is within this piece's attack
     * range (melee). A piece can attack into squares
     * it could move to, or any adjacent square.
     */
    inAttackRange(
        point: { x: number; y: number },
    ): boolean {
        if (
            !this.moved &&
            this.inMovementRange(point) &&
            (this.hasStatus(UnitStatus.Flying) ||
                this.board.rangeGizmo.getPathTo(
                    point,
                ))
        ) {
            return true;
        }
        if (
            distance(
                this.position,
                new Point(point.x, point.y),
            ) > 1.5
        ) {
            return false;
        }
        return true;
    }
```

- [ ] **Step 3: Update engine `findThreatPieces`**

In `packages/engine/src/piece.ts`, replace the
`findThreatPieces` method (lines 1351–1384) with:

```typescript
    /**
     * Find all pieces that pose a threat to this
     * piece. Uses path-aware range checks via
     * RangeGizmo.
     */
    findThreatPieces(): Set<Piece> {
        const threats = new Set<Piece>();
        for (const piece of this.board.pieces) {
            if (
                piece.owner === this.owner ||
                piece.dead ||
                piece.currentRider ||
                piece.engulfed
            ) {
                continue;
            }
            const melee =
                piece.canAttackPiece(this) &&
                this.inAttackRange(piece.position);
            const ranged =
                piece.canRangedAttackPiece(this) &&
                this.inRangedAttackRange(
                    piece.position,
                );
            const spreads =
                piece.hasStatus(
                    UnitStatus.Spreads,
                ) &&
                distance(
                    piece.position,
                    this.position,
                ) <= 3;
            if (melee || ranged || spreads) {
                threats.add(piece);
            }
        }
        return threats;
    }
```

- [ ] **Step 4: Remove client Piece overrides**

In `src/gameobjects/piece.ts`, remove the `inMovementRange`,
`inAttackRange`, and `findThreatPieces` methods (lines
416–481). These are now handled by the engine class.

Also remove any imports that were only used by those methods
(e.g., `RangeType` if no longer needed — check before
removing).

- [ ] **Step 5: Run build to verify types**

Run: `npm run build` from project root.
Expected: 0 type errors.

- [ ] **Step 6: Run all tests**

Run: `cd packages/engine && npx vitest run`
Then: `npm test` from project root.

Expected: All tests PASS. Some engine `Piece` tests may need
their mock boards updated to include a `rangeGizmo` property
with `getPathTo: vi.fn().mockReturnValue(null)`. If so, add
this to the mock boards in the failing test files.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/piece.ts src/gameobjects/piece.ts
git commit -m "feat(engine): upgrade Piece range methods to use RangeGizmo pathfinding"
```

---

### Task 5: Update Client RangeGizmo Tests

**Files:**
- Modify: `src/gameobjects/rangegizmo.test.ts`

The client test file currently tests both pure logic (now in
engine) and visual methods. Remove the tests that now belong
in the engine test file, keeping only client-specific tests.

- [ ] **Step 1: Remove engine-logic tests from client test file**

In `src/gameobjects/rangegizmo.test.ts`, remove these
`describe` blocks that are now covered by the engine test:

- `checkNodeTraversal` (lines 477–546)
- `A* pathfinding integration` (lines 603–715)
- `findConnectedNodes (with populated valid nodes)`
  (lines 717–756)
- `getPathTo (with populated state)` (lines 758–787)

Keep these client-specific test blocks:
- `Node` (lines 115–174) — tests engine `Node` but via
  import; keep for now since they test the re-export
- `Path` (lines 176–247) — same
- `RangeGizmo static methods` (diagonalHeuristic, isOpen,
  isClosed, buildPath — lines 249–409) — test engine
  pathfinding helpers; keep since they use engine re-exports
- `constructor` (lines 413–420)
- `getNode` (lines 422–428)
- `getPathTo` (lines 430–436)
- `getAllValidPaths` (lines 438–445)
- `getAllTerminalPaths` (lines 447–454)
- `findConnectedNodes` (empty) (lines 456–463)
- `findPath` (empty) (lines 465–475)
- `reset` (lines 548–575)
- `showDebugGrid` (lines 577–601)
- `showPath` (lines 789–802)
- `hideSimpleRange` (lines 804–812)

- [ ] **Step 2: Run client tests**

Run: `npx vitest run src/gameobjects/rangegizmo.test.ts`
Expected: All remaining tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/gameobjects/rangegizmo.test.ts
git commit -m "test: move engine-logic RangeGizmo tests to engine package"
```

---

### Task 6: Update Memory and Clean Up

**Files:**
- Modify: `packages/engine/src/board.ts` (remove TODO comment)

- [ ] **Step 1: Remove the TODO comment from engine Board**

In `packages/engine/src/board.ts`, the comment block at
lines 43–48 references the now-completed TODO:

```typescript
// DELETE these lines:
/**
 * Minimal interface for range/pathfinding queries.
 * The client Board provides the full RangeGizmo
 * implementation; the engine Board leaves this null.
 * TODO: extract pure pathfinding from RangeGizmo into
 * the engine so this works headless.
 */
```

These were removed along with `RangeGizmoLike` in Task 2.
Verify they're gone.

- [ ] **Step 2: Run full test suite**

Run: `cd packages/engine && npx vitest run`
Then: `npm test`
Expected: All tests PASS.

- [ ] **Step 3: Verify no Phaser imports in engine**

Run from project root:
```bash
grep -r "from.*phaser" packages/engine/src/ \
    --include="*.ts" \
    --exclude="*.test.ts" \
    --exclude="*.testhelpers.ts"
```
Expected: No matches.

- [ ] **Step 4: Commit any remaining cleanup**

```bash
git add -A
git commit -m "chore: clean up after RangeGizmo extraction"
```
