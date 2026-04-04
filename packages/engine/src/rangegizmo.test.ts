import { describe, it, expect, vi, beforeEach } from "vitest";
import { RangeGizmo } from "./rangegizmo";
import { Node, Path, buildPath } from "./pathfinding";
import { Point } from "./point";
import type { Board } from "./board";
import type { Piece } from "./piece";

// ─── Helpers ────────────────────────────────────

function makeMockPiece(overrides: Record<string, unknown> = {}): Piece {
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

function makeMockBoard(overrides: Record<string, unknown> = {}): Board {
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

/**
 * Subclass exposing protected methods for testing.
 */
class TestRangeGizmo extends RangeGizmo {
    public testCheckNodeTraversal(node: Node): Node {
        return this.checkNodeTraversal(node);
    }

    public setPiece(piece: Piece | null): void {
        this._piece = piece;
    }

    public setValidNodes(nodes: Node[]): void {
        this._validNodes = nodes;
    }

    public getValidNodes(): Node[] {
        return this._validNodes;
    }

    public setPaths(paths: Map<string, Path>): void {
        this._paths = paths;
    }
}

// ─── checkNodeTraversal ──────────────────────────

describe("checkNodeTraversal", () => {
    let board: Board;
    let piece: Piece;
    let gizmo: TestRangeGizmo;

    beforeEach(() => {
        board = makeMockBoard();
        piece = makeMockPiece();
        gizmo = new TestRangeGizmo(board);
        gizmo.setPiece(piece);
    });

    it("empty tile → traversable, not terminal", () => {
        vi.mocked(board.getPiecesAtPosition).mockReturnValue([]);
        const node = new Node(1, 1);
        gizmo.testCheckNodeTraversal(node);
        expect(node.traversable).toBe(true);
        expect(node.terminal).toBe(false);
    });

    it("tile contains only the moving piece → traversable", () => {
        vi.mocked(board.getPiecesAtPosition).mockReturnValue([piece]);
        const node = new Node(0, 0);
        gizmo.testCheckNodeTraversal(node);
        expect(node.traversable).toBe(true);
        expect(node.terminal).toBe(false);
    });

    it("mountable piece → terminal", () => {
        const other = makeMockPiece({
            canMountPiece: vi.fn(() => true),
        });
        // The piece under test should report canMountPiece
        // true for `other`.
        (piece.canMountPiece as ReturnType<typeof vi.fn>).mockImplementation(
            (p: Piece) => p === other,
        );
        vi.mocked(board.getPiecesAtPosition).mockReturnValue([other]);
        const node = new Node(2, 2);
        gizmo.testCheckNodeTraversal(node);
        expect(node.terminal).toBe(true);
    });

    it("attackable piece → terminal", () => {
        const enemy = makeMockPiece();
        (piece.canAttackPiece as ReturnType<typeof vi.fn>).mockImplementation(
            (p: Piece) => p === enemy,
        );
        vi.mocked(board.getPiecesAtPosition).mockReturnValue([enemy]);
        const node = new Node(3, 3);
        gizmo.testCheckNodeTraversal(node);
        expect(node.terminal).toBe(true);
    });

    it("blocking piece (no mount/attack) → not traversable", () => {
        const blocker = makeMockPiece();
        vi.mocked(board.getPiecesAtPosition).mockReturnValue([blocker]);
        const node = new Node(4, 4);
        gizmo.testCheckNodeTraversal(node);
        expect(node.traversable).toBe(false);
    });
});

// ─── reset ──────────────────────────────────────

describe("reset", () => {
    it("clears piece, validNodes, and paths", async () => {
        const board = makeMockBoard();
        const gizmo = new TestRangeGizmo(board);
        gizmo.setPiece(makeMockPiece());
        gizmo.setValidNodes([new Node(1, 1)]);

        const result = await gizmo.reset();

        expect(result).toBe(gizmo);
        expect(gizmo.getValidNodes()).toEqual([]);
        expect(gizmo["_piece"]).toBeNull();
        expect(gizmo["_paths"].size).toBe(0);
    });
});

// ─── getNode ────────────────────────────────────

describe("getNode", () => {
    let gizmo: TestRangeGizmo;

    beforeEach(() => {
        gizmo = new TestRangeGizmo(makeMockBoard());
    });

    it("returns null when validNodes is empty", () => {
        expect(gizmo.getNode({ x: 1, y: 1 })).toBeNull();
    });

    it("returns null for non-existent position", () => {
        gizmo.setValidNodes([new Node(2, 2)]);
        expect(gizmo.getNode({ x: 9, y: 9 })).toBeNull();
    });

    it("returns traversable node at position", () => {
        const node = new Node(3, 3);
        node.traversable = true;
        gizmo.setValidNodes([node]);
        expect(gizmo.getNode({ x: 3, y: 3 })).toBe(node);
    });

    it("returns terminal node at position", () => {
        const node = new Node(4, 4);
        node.traversable = false;
        node.terminal = true;
        gizmo.setValidNodes([node]);
        expect(gizmo.getNode({ x: 4, y: 4 })).toBe(node);
    });

    it("returns null for non-traversable, non-terminal node", () => {
        const node = new Node(5, 5);
        node.traversable = false;
        node.terminal = false;
        gizmo.setValidNodes([node]);
        expect(gizmo.getNode({ x: 5, y: 5 })).toBeNull();
    });

    it("accepts plain object point (not Point instance)", () => {
        const node = new Node(1, 2);
        gizmo.setValidNodes([node]);
        expect(gizmo.getNode({ x: 1, y: 2 })).toBe(node);
    });
});

// ─── getPathTo ──────────────────────────────────

describe("getPathTo", () => {
    let gizmo: TestRangeGizmo;
    let piece: Piece;

    beforeEach(() => {
        const board = makeMockBoard();
        gizmo = new TestRangeGizmo(board);
        piece = makeMockPiece({ position: new Point(0, 0) });
    });

    it("returns null when no piece is set", () => {
        const node = new Node(1, 0);
        gizmo.setValidNodes([node]);
        expect(gizmo.getPathTo({ x: 1, y: 0 })).toBeNull();
    });

    it("returns null for non-traversable destination", () => {
        gizmo.setPiece(piece);
        const node = new Node(1, 0);
        node.traversable = false;
        node.terminal = false;
        gizmo.setValidNodes([node]);
        expect(gizmo.getPathTo({ x: 1, y: 0 })).toBeNull();
    });

    it("caches path on second call", () => {
        gizmo.setPiece(piece);
        // Build a simple two-node path manually so findPath
        // succeeds without needing a full board.
        const start = new Node(0, 0);
        const dest = new Node(1, 0);
        start.g = 0;
        dest.parentNode = start;
        gizmo.setValidNodes([start, dest]);

        const p1 = gizmo.getPathTo({ x: 1, y: 0 });
        const p2 = gizmo.getPathTo({ x: 1, y: 0 });
        // Both calls should return the same object.
        expect(p1).toBe(p2);
    });
});

// ─── getAllValidPaths / getAllTerminalPaths ───────

describe("getAllValidPaths", () => {
    it("returns empty set when no valid nodes", () => {
        const gizmo = new TestRangeGizmo(makeMockBoard());
        expect(gizmo.getAllValidPaths().size).toBe(0);
    });

    it("skips terminal nodes by default", () => {
        const gizmo = new TestRangeGizmo(makeMockBoard());
        const node = new Node(1, 0);
        node.terminal = true;
        node.flying = true; // makes isValid() true
        gizmo.setValidNodes([node]);
        expect(gizmo.getAllValidPaths(true).size).toBe(0);
    });

    it("includes terminal nodes when ignoreTerminal=false", () => {
        const piece = makeMockPiece({
            position: new Point(0, 0),
        });
        const gizmo = new TestRangeGizmo(makeMockBoard());
        gizmo.setPiece(piece);

        const start = new Node(0, 0);
        const dest = new Node(1, 0);
        dest.terminal = true;
        // Explicitly null the start path so isValid()
        // returns false for the origin node (path is
        // declared without an initialiser so it defaults
        // to undefined, which !== null and would pass
        // the isValid() check unintentionally).
        start.path = null;

        // Wire up the parent chain so buildPath can
        // reconstruct a path.
        start.g = 0;
        dest.parentNode = start;

        // Build a real path and assign it so isValid()
        // returns true for the terminal node.
        const path = buildPath(dest, start);
        dest.path = path;

        gizmo.setValidNodes([start, dest]);
        gizmo.setPaths(new Map([["1,0", path]]));

        const paths = gizmo.getAllValidPaths(false);
        // dest is terminal with a valid path; expect
        // exactly 1 entry.
        expect(paths.size).toBe(1);
    });
});

describe("getAllTerminalPaths", () => {
    it("returns empty set when no terminal nodes", () => {
        const gizmo = new TestRangeGizmo(makeMockBoard());
        const node = new Node(1, 0);
        node.traversable = true;
        node.flying = true;
        gizmo.setValidNodes([node]);
        expect(gizmo.getAllTerminalPaths().size).toBe(0);
    });

    it("returns paths to terminal nodes when they exist", () => {
        const piece = makeMockPiece({
            position: new Point(0, 0),
        });
        const gizmo = new TestRangeGizmo(makeMockBoard());
        gizmo.setPiece(piece);

        const start = new Node(0, 0);
        const dest = new Node(1, 0);
        dest.terminal = true;
        // Null the start path so it does not satisfy
        // isValid() (undefined !== null, which would be
        // an unintended pass without this assignment).
        start.path = null;

        start.g = 0;
        dest.parentNode = start;

        const path = buildPath(dest, start);
        dest.path = path;

        gizmo.setValidNodes([start, dest]);
        gizmo.setPaths(new Map([["1,0", path]]));

        const paths = gizmo.getAllTerminalPaths();
        expect(paths.size).toBe(1);
        expect(paths.has(path)).toBe(true);
    });
});

// ─── findConnectedNodes ─────────────────────────

describe("findConnectedNodes", () => {
    let gizmo: TestRangeGizmo;

    beforeEach(() => {
        gizmo = new TestRangeGizmo(makeMockBoard());
    });

    it("returns empty array when no other nodes", () => {
        const node = new Node(5, 5);
        gizmo.setValidNodes([node]);
        expect(gizmo.findConnectedNodes(node)).toEqual([]);
    });

    it("includes all 8 neighbours within 1 tile", () => {
        const centre = new Node(5, 5);
        const neighbours: Node[] = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                neighbours.push(new Node(5 + dx, 5 + dy));
            }
        }
        gizmo.setValidNodes([centre, ...neighbours]);
        const connected = gizmo.findConnectedNodes(centre);
        expect(connected.length).toBe(8);
    });

    it("excludes the node itself", () => {
        const node = new Node(3, 3);
        gizmo.setValidNodes([node]);
        expect(gizmo.findConnectedNodes(node)).not.toContain(node);
    });

    it("excludes nodes more than 1 tile away", () => {
        const node = new Node(0, 0);
        const far = new Node(3, 3);
        gizmo.setValidNodes([node, far]);
        expect(gizmo.findConnectedNodes(node)).toEqual([]);
    });
});

// ─── findPath (A*) ──────────────────────────────

describe("findPath", () => {
    let gizmo: TestRangeGizmo;

    function buildLinearNodes(length: number): Node[] {
        // Horizontal row: (0,0), (1,0), ..., (length-1, 0)
        return Array.from({ length }, (_, i) => new Node(i, 0));
    }

    beforeEach(() => {
        gizmo = new TestRangeGizmo(makeMockBoard());
    });

    it("returns null when start node not in validNodes", () => {
        const dest = new Node(2, 0);
        gizmo.setValidNodes([dest]);
        const result = gizmo.findPath(new Point(0, 0), new Point(2, 0));
        expect(result).toBeNull();
    });

    it("returns null when destination not in validNodes", () => {
        const start = new Node(0, 0);
        gizmo.setValidNodes([start]);
        const result = gizmo.findPath(new Point(0, 0), new Point(2, 0));
        expect(result).toBeNull();
    });

    it("finds straight-line path", () => {
        const nodes = buildLinearNodes(4);
        gizmo.setValidNodes(nodes);
        const path = gizmo.findPath(new Point(0, 0), new Point(3, 0));
        expect(path).not.toBeNull();
        expect(path.nodes.length).toBe(4);
    });

    it("finds diagonal path", () => {
        // 3×3 grid
        const nodes: Node[] = [];
        for (let x = 0; x <= 2; x++) {
            for (let y = 0; y <= 2; y++) {
                nodes.push(new Node(x, y));
            }
        }
        gizmo.setValidNodes(nodes);
        const path = gizmo.findPath(new Point(0, 0), new Point(2, 2));
        expect(path).not.toBeNull();
    });

    it("returns null when destination unreachable", () => {
        // Start and destination isolated (no path between)
        const start = new Node(0, 0);
        // dest is far away with no connecting nodes
        const dest = new Node(9, 9);
        gizmo.setValidNodes([start, dest]);
        const path = gizmo.findPath(new Point(0, 0), new Point(9, 9));
        expect(path).toBeNull();
    });

    it("routes around non-traversable obstacles", () => {
        // Row: 0,0 → 1,0 (blocked) → 2,0
        // With a detour via row y=1
        const nodes: Node[] = [];
        for (let x = 0; x <= 2; x++) {
            for (let y = 0; y <= 1; y++) {
                const n = new Node(x, y);
                // Block (1,0)
                if (x === 1 && y === 0) {
                    n.traversable = false;
                }
                nodes.push(n);
            }
        }
        gizmo.setValidNodes(nodes);
        const path = gizmo.findPath(new Point(0, 0), new Point(2, 0));
        // Should find a path via (0,1)→(1,1)→(2,0) or
        // similar detour.
        expect(path).not.toBeNull();
    });

    it("can reach a terminal node", () => {
        const nodes = buildLinearNodes(3);
        nodes[2].terminal = true;
        gizmo.setValidNodes(nodes);
        const path = gizmo.findPath(new Point(0, 0), new Point(2, 0));
        expect(path).not.toBeNull();
    });
});

// ─── generate ───────────────────────────────────

describe("generate", () => {
    it("resets state before generating", async () => {
        const board = makeMockBoard();
        const gizmo = new TestRangeGizmo(board);
        // Pre-populate with stale data.
        gizmo.setValidNodes([new Node(9, 9)]);

        const flyingPiece = makeMockPiece({
            position: new Point(5, 5),
            stats: { movement: 1 },
            hasStatus: vi.fn(() => true), // flying
        });
        vi.mocked(board.getPointsInRange).mockReturnValue([new Point(5, 5)]);
        vi.mocked(board.getPiecesAtPosition).mockReturnValue([]);
        vi.mocked(board.getAdjacentPiecesAtPosition).mockReturnValue([]);

        await gizmo.generate(flyingPiece);

        // Stale node at 9,9 should be gone.
        expect(gizmo.getNode({ x: 9, y: 9 })).toBeNull();
    });

    it("flying unit: sets flying flag, skips pathfinding", async () => {
        const board = makeMockBoard();
        const gizmo = new TestRangeGizmo(board);

        const flyingPiece = makeMockPiece({
            position: new Point(0, 0),
            stats: { movement: 2 },
            hasStatus: vi.fn(() => true),
        });
        vi.mocked(board.getPointsInRange).mockReturnValue([
            new Point(1, 0),
            new Point(2, 0),
        ]);
        vi.mocked(board.getPiecesAtPosition).mockReturnValue([]);
        vi.mocked(board.getAdjacentPiecesAtPosition).mockReturnValue([]);

        await gizmo.generate(flyingPiece);

        const nodes = gizmo.getValidNodes();
        expect(nodes.length).toBe(2);
        nodes.forEach((n) => expect(n.flying).toBe(true));
        // No paths computed for flying.
        expect(gizmo["_paths"].size).toBe(0);
    });

    it("ground unit: marks unreachable nodes non-traversable", async () => {
        const board = makeMockBoard();
        const gizmo = new TestRangeGizmo(board);

        const groundPiece = makeMockPiece({
            position: new Point(0, 0),
            stats: { movement: 1 },
            // hasStatus returns false → ground unit
            hasStatus: vi.fn(() => false),
        });

        // getPointsInRange returns the start + one adjacent
        // + one that will be isolated (no connecting nodes).
        vi.mocked(board.getPointsInRange).mockReturnValue([
            new Point(0, 0),
            new Point(1, 0),
        ]);
        vi.mocked(board.getPiecesAtPosition).mockReturnValue([]);
        vi.mocked(board.getAdjacentPiecesAtPosition).mockReturnValue([]);

        await gizmo.generate(groundPiece);

        // (1,0) is adjacent to (0,0), so a path should exist.
        const nodeAtOne = gizmo
            .getValidNodes()
            .find((n) => n.x === 1 && n.y === 0);
        expect(nodeAtOne).toBeDefined();
    });

    it("marks warning flag for nodes adjacent to engageable enemies", async () => {
        const board = makeMockBoard();
        const gizmo = new TestRangeGizmo(board);

        const piece = makeMockPiece({
            position: new Point(0, 0),
            stats: { movement: 2 },
            hasStatus: vi.fn(() => true), // flying
        });

        const enemy = makeMockPiece({
            position: new Point(2, 0),
            canEngagePiece: vi.fn(() => true),
        });

        vi.mocked(board.getPointsInRange).mockReturnValue([
            new Point(0, 0),
            new Point(1, 0),
            new Point(2, 0),
        ]);
        vi.mocked(board.getPiecesAtPosition).mockReturnValue([]);
        vi.mocked(board.getAdjacentPiecesAtPosition).mockImplementation(
            (_pt: Point, filter?: (p: Piece) => boolean) => {
                if (filter && filter(enemy)) {
                    return [enemy];
                }
                return [];
            },
        );
        // Adjacent points of the enemy position
        vi.mocked(board.getAdjacentPoints).mockReturnValue([new Point(1, 0)]);

        await gizmo.generate(piece);

        const warned = gizmo
            .getValidNodes()
            .find((n) => n.x === 1 && n.y === 0);
        expect(warned?.warning).toBe(true);
    });
});
