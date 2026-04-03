import { describe, it, expect, vi, beforeEach } from "vitest";
import { Geom } from "phaser";
import { RangeGizmo } from "./rangegizmo";
import {
    Node,
    Path,
    diagonalHeuristic,
    isOpen,
    isClosed,
    buildPath,
} from "@archaos/engine";
import type { Board } from "./board";
import type { Piece } from "./piece";

// ─── Mock helpers ────────────────────────────────────────────────────────────

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
    if (opts.traversable !== undefined) node.traversable = opts.traversable;
    if (opts.terminal !== undefined) node.terminal = opts.terminal;
    if (opts.warning !== undefined) node.warning = opts.warning;
    if (opts.flying !== undefined) node.flying = opts.flying;
    if (opts.path !== undefined) node.path = opts.path;
    return node;
}

function makeMockLayer() {
    const children: any[] = [];
    return {
        add: vi.fn((child: any) => children.push(child)),
        removeAll: vi.fn(() => {
            children.length = 0;
        }),
        getChildren: vi.fn(() => children),
        sort: vi.fn(),
        get length() {
            return children.length;
        },
    };
}

function makeMockImage() {
    return {
        setOrigin: vi.fn().mockReturnThis(),
        setFrame: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        setVisible: vi.fn().mockReturnThis(),
        x: 0,
        y: 0,
    };
}

function makeMockBoard(overrides: Record<string, any> = {}): Board {
    const rangeLayer = makeMockLayer();
    const pathLayer = makeMockLayer();

    return {
        width: 10,
        height: 10,
        scene: {
            add: {
                image: vi.fn(() => makeMockImage()),
            },
            tweens: {
                add: vi.fn((config: any) => {
                    // Immediately fire onComplete if provided
                    config.onComplete?.();
                    return {};
                }),
                stagger: vi.fn(() => 0),
            },
        },
        getLayer: vi.fn((layer: number) => {
            // BoardLayer.FloorCursors = 4, PathCursors = 5
            if (layer === 4) return rangeLayer;
            if (layer === 5) return pathLayer;
            return rangeLayer;
        }),
        getIsoPosition: vi.fn((pt: any) => new Geom.Point(pt.x * 2, pt.y * 2)),
        getPiecesAtPosition: vi.fn(() => []),
        getAdjacentPiecesAtPosition: vi.fn(() => []),
        getAdjacentPoints: vi.fn(() => []),
        getPointsInRange: vi.fn(() => []),
        hasLineOfSight: vi.fn(() => true),
        ...overrides,
    } as unknown as Board;
}

function makeMockPiece(overrides: Record<string, any> = {}): Piece {
    return {
        position: new Geom.Point(0, 0),
        dead: false,
        stats: { movement: 3 },
        hasStatus: vi.fn(() => false),
        canMountPiece: vi.fn(() => false),
        canAttackPiece: vi.fn(() => false),
        canEngagePiece: vi.fn(() => false),
        ...overrides,
    } as unknown as Piece;
}

// ─── Node ────────────────────────────────────────────────────────────────────

describe("Node", () => {
    it("stores coordinates from constructor", () => {
        const node = new Node(3, 7);
        expect(node.x).toBe(3);
        expect(node.y).toBe(7);
        expect(node.pos.x).toBe(3);
        expect(node.pos.y).toBe(7);
    });

    it("defaults to traversable, not terminal, not warning, not flying", () => {
        const node = new Node(0, 0);
        expect(node.traversable).toBe(true);
        expect(node.terminal).toBe(false);
        expect(node.warning).toBe(false);
        expect(node.flying).toBe(false);
    });

    describe("isValid", () => {
        it("returns true when path is undefined (undefined !== null)", () => {
            const node = new Node(0, 0);
            // path is undefined by default; undefined !== null → true
            expect(node.isValid()).toBe(true);
        });

        it("returns false when path is explicitly null", () => {
            const node = new Node(0, 0);
            node.path = null;
            expect(node.isValid()).toBe(false);
        });

        it("returns true when traversable and has a path", () => {
            const n1 = makeNode(0, 0);
            const n2 = makeNode(1, 0);
            n2.parentNode = n1;
            const path = new Path([n1, n2], [0, 0], 1);

            const node = new Node(1, 0);
            node.path = path;
            expect(node.isValid()).toBe(true);
        });

        it("returns true when traversable and flying", () => {
            const node = new Node(0, 0);
            node.flying = true;
            expect(node.isValid()).toBe(true);
        });

        it("returns false when not traversable even with path", () => {
            const n1 = makeNode(0, 0);
            const n2 = makeNode(1, 0);
            n2.parentNode = n1;
            const path = new Path([n1, n2], [0, 0], 1);

            const node = new Node(1, 0);
            node.traversable = false;
            node.path = path;
            expect(node.isValid()).toBe(false);
        });
    });
});

// ─── Path ────────────────────────────────────────────────────────────────────

describe("Path", () => {
    it("stores nodes, angles, and cost", () => {
        const n1 = makeNode(0, 0);
        const n2 = makeNode(1, 0);
        const path = new Path([n1, n2], [0, 1], 1.5);

        expect(path.nodes).toHaveLength(2);
        expect(path.angles).toEqual([0, 1]);
        expect(path.cost).toBe(1.5);
    });

    it("does not store data when cost is 0", () => {
        const n1 = makeNode(0, 0);
        const path = new Path([n1], [0], 0);
        expect(path.nodes).toBeUndefined();
        expect(path.angles).toBeUndefined();
        expect(path.cost).toBeUndefined();
    });

    it("does not store data when nodes is empty", () => {
        const path = new Path([], [], 5);
        expect(path.nodes).toBeUndefined();
    });

    it("does not store data when nodes is null", () => {
        const path = new Path(null, null, 5);
        expect(path.nodes).toBeUndefined();
    });

    it("toPoints clones node positions", () => {
        const n1 = makeNode(2, 3);
        const n2 = makeNode(4, 5);
        const path = new Path([n1, n2], [0, 1], 1);
        const points = path.toPoints();

        expect(points).toHaveLength(2);
        expect(points[0].x).toBe(2);
        expect(points[0].y).toBe(3);
        expect(points[1].x).toBe(4);
        expect(points[1].y).toBe(5);
        // Points are clones, not the same references
        expect(points[0]).not.toBe(n1.pos);
    });

    it("warning returns the warning flag of the last node", () => {
        const n1 = makeNode(0, 0);
        const n2 = makeNode(1, 0, { warning: true });
        const path = new Path([n1, n2], [0, 0], 1);
        expect(path.warning).toBe(true);

        const n3 = makeNode(2, 0, { warning: false });
        const path2 = new Path([n1, n3], [0, 0], 1);
        expect(path2.warning).toBe(false);
    });

    it("terminal returns true if any node is terminal", () => {
        const n1 = makeNode(0, 0);
        const n2 = makeNode(1, 0, { terminal: true });
        const n3 = makeNode(2, 0);
        const path = new Path([n1, n2, n3], [0, 0, 0], 2);
        expect(path.terminal).toBe(true);
    });

    it("terminal returns false if no node is terminal", () => {
        const n1 = makeNode(0, 0);
        const n2 = makeNode(1, 0);
        const path = new Path([n1, n2], [0, 0], 1);
        expect(path.terminal).toBe(false);
    });
});

// ─── RangeGizmo static methods ──────────────────────────────────────────────

describe("RangeGizmo", () => {
    describe("diagonalHeuristic", () => {
        it("returns 0 for identical nodes", () => {
            const node = makeNode(5, 5);
            expect(diagonalHeuristic(node, node)).toBe(0);
        });

        it("returns cost for adjacent cardinal step", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 0);
            // dx=1, dy=0 → diag=0, straight=1 → 1.5*0 + 1*1 = 1
            expect(diagonalHeuristic(a, b)).toBe(1);
        });

        it("returns diagonalCost for adjacent diagonal step", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 1);
            // dx=1, dy=1 → diag=1, straight=2 → 1.5*1 + 1*(2-2) = 1.5
            expect(diagonalHeuristic(a, b)).toBe(1.5);
        });

        it("returns correct cost for multi-step path", () => {
            const a = makeNode(0, 0);
            const b = makeNode(3, 1);
            // dx=3, dy=1 → diag=1, straight=4 → 1.5*1 + 1*(4-2) = 3.5
            expect(diagonalHeuristic(a, b)).toBe(3.5);
        });

        it("adds terminalCost when node is terminal", () => {
            const a = makeNode(0, 0, { terminal: true });
            const b = makeNode(1, 0);
            // 1 + 100 = 101
            expect(diagonalHeuristic(a, b)).toBe(101);
        });

        it("adds terminalCost when node is warning", () => {
            const a = makeNode(0, 0, { warning: true });
            const b = makeNode(1, 0);
            expect(diagonalHeuristic(a, b)).toBe(101);
        });

        it("does not add terminalCost for normal nodes", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 0);
            expect(diagonalHeuristic(a, b)).toBe(1);
        });

        it("uses custom cost parameters", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 1);
            // diag=1, straight=2 → 2*1 + 3*(2-2) = 2
            expect(diagonalHeuristic(a, b, 3, 2, 50)).toBe(2);
        });

        it("uses custom terminalCost for warning nodes", () => {
            const a = makeNode(0, 0, { warning: true });
            const b = makeNode(1, 1);
            // 2*1 + 3*(2-2) + 50 = 52
            expect(diagonalHeuristic(a, b, 3, 2, 50)).toBe(52);
        });
    });

    describe("isOpen", () => {
        it("returns true when node is in the open set", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 1);
            expect(isOpen(a, [a, b])).toBe(true);
        });

        it("returns false when node is not in the open set", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 1);
            expect(isOpen(a, [b])).toBe(false);
        });

        it("returns false for empty set", () => {
            expect(isOpen(makeNode(0, 0), [])).toBe(false);
        });
    });

    describe("isClosed", () => {
        it("returns true when node is in the closed set", () => {
            const a = makeNode(0, 0);
            expect(isClosed(a, [a])).toBe(true);
        });

        it("returns false when node is not in the closed set", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 1);
            expect(isClosed(a, [b])).toBe(false);
        });

        it("returns false for empty set", () => {
            expect(isClosed(makeNode(0, 0), [])).toBe(false);
        });
    });

    describe("buildPath", () => {
        it("builds a single-step path", () => {
            const start = makeNode(0, 0);
            const end = makeNode(1, 0);
            end.parentNode = start;

            const path = buildPath(end, start);
            expect(path.nodes).toHaveLength(2);
            expect(path.nodes[0]).toBe(start);
            expect(path.nodes[1]).toBe(end);
            expect(path.cost).toBeGreaterThan(0);
        });

        it("builds a multi-step path in correct order", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 0);
            const c = makeNode(2, 0);
            b.parentNode = a;
            c.parentNode = b;

            const path = buildPath(c, a);
            expect(path.nodes).toHaveLength(3);
            expect(path.nodes[0]).toBe(a);
            expect(path.nodes[1]).toBe(b);
            expect(path.nodes[2]).toBe(c);
        });

        it("marks nodes after a terminal node as non-traversable", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 0, { terminal: true });
            const c = makeNode(2, 0);
            b.parentNode = a;
            c.parentNode = b;

            buildPath(c, a);
            // c should be marked non-traversable because b is terminal
            expect(c.traversable).toBe(false);
            // b itself remains as-is (traversable by default, terminal true)
            expect(b.terminal).toBe(true);
        });

        it("marks nodes after a non-traversable node as non-traversable", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 0, { traversable: false });
            const c = makeNode(2, 0);
            b.parentNode = a;
            c.parentNode = b;

            buildPath(c, a);
            expect(c.traversable).toBe(false);
        });

        it("generates angles array", () => {
            const a = makeNode(0, 0);
            const b = makeNode(1, 0);
            b.parentNode = a;

            const path = buildPath(b, a);
            expect(path.angles).toBeDefined();
            expect(path.angles.length).toBeGreaterThan(0);
        });
    });

    // ─── Instance methods ────────────────────────────────────────────────────

    describe("constructor", () => {
        it("creates a RangeGizmo and fetches the correct layers", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);
            expect(board.getLayer).toHaveBeenCalledTimes(2);
            expect(gizmo).toBeDefined();
        });
    });

    describe("getNode", () => {
        it("returns null when no valid nodes exist", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);
            expect(gizmo.getNode(new Geom.Point(0, 0))).toBeNull();
        });
    });

    describe("getPathTo", () => {
        it("returns null when no piece is set", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);
            expect(gizmo.getPathTo(new Geom.Point(0, 0))).toBeNull();
        });
    });

    describe("getAllValidPaths", () => {
        it("returns an empty set when no valid nodes exist", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);
            const paths = gizmo.getAllValidPaths();
            expect(paths.size).toBe(0);
        });
    });

    describe("getAllTerminalPaths", () => {
        it("returns an empty set when no valid nodes exist", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);
            const paths = gizmo.getAllTerminalPaths();
            expect(paths.size).toBe(0);
        });
    });

    describe("findConnectedNodes", () => {
        it("returns empty when no valid nodes exist", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);
            const node = makeNode(5, 5);
            expect(gizmo.findConnectedNodes(node)).toEqual([]);
        });
    });

    describe("findPath", () => {
        it("returns null when start node is not in valid nodes", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);
            const result = gizmo.findPath(
                new Geom.Point(0, 0),
                new Geom.Point(1, 0),
            );
            expect(result).toBeNull();
        });
    });

    describe("checkNodeTraversal", () => {
        let board: Board;
        let gizmo: any; // Use any to access protected method

        beforeEach(() => {
            board = makeMockBoard();
            gizmo = new RangeGizmo(board);
        });

        it("marks empty tile as traversable and not terminal", () => {
            gizmo._piece = makeMockPiece();
            (board.getPiecesAtPosition as any).mockReturnValue([]);

            const node = makeNode(1, 1);
            const result = gizmo.checkNodeTraversal(node);
            expect(result.traversable).toBe(true);
            expect(result.terminal).toBe(false);
        });

        it("marks tile containing the piece itself as traversable", () => {
            const piece = makeMockPiece();
            gizmo._piece = piece;
            (board.getPiecesAtPosition as any).mockReturnValue([piece]);

            const node = makeNode(0, 0);
            const result = gizmo.checkNodeTraversal(node);
            expect(result.traversable).toBe(true);
            expect(result.terminal).toBe(false);
        });

        it("marks tile with a mountable piece as terminal", () => {
            const piece = makeMockPiece({
                canMountPiece: vi.fn(() => true),
            });
            const otherPiece = makeMockPiece();
            gizmo._piece = piece;
            (board.getPiecesAtPosition as any).mockReturnValue([otherPiece]);

            const node = makeNode(1, 1);
            const result = gizmo.checkNodeTraversal(node);
            expect(result.terminal).toBe(true);
        });

        it("marks tile with an attackable piece as terminal", () => {
            const piece = makeMockPiece({
                canAttackPiece: vi.fn(() => true),
            });
            const enemy = makeMockPiece();
            gizmo._piece = piece;
            (board.getPiecesAtPosition as any).mockReturnValue([enemy]);

            const node = makeNode(1, 1);
            const result = gizmo.checkNodeTraversal(node);
            expect(result.terminal).toBe(true);
        });

        it("marks tile with an unmountable/unattackable piece as not traversable", () => {
            const piece = makeMockPiece({
                canMountPiece: vi.fn(() => false),
                canAttackPiece: vi.fn(() => false),
            });
            const blocker = makeMockPiece();
            gizmo._piece = piece;
            (board.getPiecesAtPosition as any).mockReturnValue([blocker]);

            const node = makeNode(1, 1);
            const result = gizmo.checkNodeTraversal(node);
            expect(result.traversable).toBe(false);
        });
    });

    describe("reset", () => {
        it("returns immediately when both layers are empty", async () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);
            const result = await gizmo.reset();
            expect(result).toBe(gizmo);
        });

        it("force reset removes all layer children immediately", async () => {
            const rangeLayer = makeMockLayer();
            const pathLayer = makeMockLayer();
            // Simulate non-empty layers
            rangeLayer.add({});

            const board = makeMockBoard({
                getLayer: vi.fn((layer: number) => {
                    if (layer === 4) return rangeLayer;
                    if (layer === 5) return pathLayer;
                    return rangeLayer;
                }),
            });
            const gizmo = new RangeGizmo(board);
            await gizmo.reset(true);

            expect(rangeLayer.removeAll).toHaveBeenCalled();
            expect(pathLayer.removeAll).toHaveBeenCalled();
        });
    });

    describe("showDebugGrid (static, via console.log)", () => {
        it("logs a grid string", () => {
            const spy = vi.spyOn(console, "log").mockImplementation(() => {});
            const board = { width: 3, height: 2 } as unknown as Board;
            const nodes = [
                makeNode(0, 0),
                makeNode(1, 0, { terminal: true }),
                makeNode(2, 0, { warning: true }),
                makeNode(0, 1),
            ];

            // Access the private static method
            (RangeGizmo as any).showDebugGrid(board, nodes);

            expect(spy).toHaveBeenCalledOnce();
            const output = spy.mock.calls[0][0] as string;
            expect(output).toContain("Debug grid:");
            // First row: . X ! (normal, terminal, warning)
            expect(output).toContain(". X ! ");
            // Second row: . # # (normal, empty, empty)
            expect(output).toContain(". # # ");

            spy.mockRestore();
        });
    });

    describe("A* pathfinding integration", () => {
        it("finds a straight-line path on a clear grid", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

            // Manually populate _validNodes with a 1x4 corridor
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
                new Geom.Point(0, 0),
                new Geom.Point(3, 0),
            );

            expect(path).not.toBeNull();
            expect(path.nodes).toHaveLength(4);
            expect(path.nodes[0].x).toBe(0);
            expect(path.nodes[3].x).toBe(3);
        });

        it("finds a diagonal path", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

            const nodes = [makeNode(0, 0), makeNode(1, 1), makeNode(2, 2)];
            (gizmo as any)._validNodes = nodes;
            (gizmo as any)._piece = makeMockPiece();
            (gizmo as any)._paths = new Map();

            const path = gizmo.findPath(
                new Geom.Point(0, 0),
                new Geom.Point(2, 2),
            );

            expect(path).not.toBeNull();
            expect(path.nodes[0].x).toBe(0);
            expect(path.nodes[path.nodes.length - 1].x).toBe(2);
        });

        it("returns null when destination is unreachable", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

            // Two isolated nodes with a gap
            const nodes = [makeNode(0, 0), makeNode(5, 5)];
            (gizmo as any)._validNodes = nodes;
            (gizmo as any)._piece = makeMockPiece();
            (gizmo as any)._paths = new Map();

            const path = gizmo.findPath(
                new Geom.Point(0, 0),
                new Geom.Point(5, 5),
            );
            expect(path).toBeNull();
        });

        it("routes around a non-traversable node", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

            // 3x1 grid but middle is blocked → need to go around via (1,1)
            const nodes = [
                makeNode(0, 0),
                makeNode(1, 0, { traversable: false }),
                makeNode(2, 0),
                makeNode(0, 1),
                makeNode(1, 1),
                makeNode(2, 1),
            ];
            (gizmo as any)._validNodes = nodes;
            (gizmo as any)._piece = makeMockPiece();
            (gizmo as any)._paths = new Map();

            const path = gizmo.findPath(
                new Geom.Point(0, 0),
                new Geom.Point(2, 0),
            );

            expect(path).not.toBeNull();
            // Path should not include the blocked node (1,0)
            const pathCoords = path.nodes.map((n: Node) => `${n.x},${n.y}`);
            expect(pathCoords).not.toContain("1,0");
        });

        it("can pathfind to a terminal node", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

            const nodes = [
                makeNode(0, 0),
                makeNode(1, 0),
                makeNode(2, 0, { terminal: true }),
            ];
            (gizmo as any)._validNodes = nodes;
            (gizmo as any)._piece = makeMockPiece();
            (gizmo as any)._paths = new Map();

            const path = gizmo.findPath(
                new Geom.Point(0, 0),
                new Geom.Point(2, 0),
            );

            expect(path).not.toBeNull();
            expect(path.nodes[path.nodes.length - 1].x).toBe(2);
        });
    });

    describe("findConnectedNodes (with populated valid nodes)", () => {
        it("returns only adjacent nodes", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

            const center = makeNode(5, 5);
            const adjacent = makeNode(6, 5);
            const diagonal = makeNode(6, 6);
            const farAway = makeNode(8, 8);

            (gizmo as any)._validNodes = [center, adjacent, diagonal, farAway];

            const connected = gizmo.findConnectedNodes(center);
            expect(connected).toContain(adjacent);
            expect(connected).toContain(diagonal);
            expect(connected).not.toContain(farAway);
            expect(connected).not.toContain(center);
        });

        it("includes all 8 neighbours when fully surrounded", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

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
            (gizmo as any)._validNodes = [center, ...neighbours];

            const connected = gizmo.findConnectedNodes(center);
            expect(connected).toHaveLength(8);
        });
    });

    describe("getPathTo (with populated state)", () => {
        it("caches paths for repeated lookups", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

            const nodes = [makeNode(0, 0), makeNode(1, 0)];
            (gizmo as any)._validNodes = nodes;
            (gizmo as any)._piece = makeMockPiece();
            (gizmo as any)._paths = new Map();

            const path1 = gizmo.getPathTo(new Geom.Point(1, 0));
            const path2 = gizmo.getPathTo(new Geom.Point(1, 0));

            // Should return the same cached object
            expect(path1).toBe(path2);
        });

        it("returns null for non-traversable, non-terminal node", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

            const blocked = makeNode(1, 0, { traversable: false });
            (gizmo as any)._validNodes = [makeNode(0, 0), blocked];
            (gizmo as any)._piece = makeMockPiece();
            (gizmo as any)._paths = new Map();

            const result = gizmo.getPathTo(new Geom.Point(1, 0));
            expect(result).toBeNull();
        });
    });

    describe("showPath", () => {
        it("clears the path layer and does nothing with no piece", () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);

            gizmo.showPath(new Geom.Point(1, 1));

            // Path layer's removeAll is called, but no images are added
            // since there is no piece set
            const pathLayer = (board.getLayer as any).mock.results[1].value;
            expect(pathLayer.removeAll).toHaveBeenCalled();
            expect(board.scene.add.image).not.toHaveBeenCalled();
        });
    });

    describe("hideSimpleRange", () => {
        it("returns immediately when range layer is empty", async () => {
            const board = makeMockBoard();
            const gizmo = new RangeGizmo(board);
            // Should not throw or add tweens
            await gizmo.hideSimpleRange();
            expect(board.scene.tweens.add).not.toHaveBeenCalled();
        });
    });
});
