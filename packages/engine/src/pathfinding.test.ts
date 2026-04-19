import { describe, it, expect } from "vitest";
import { Node, Path, diagonalHeuristic, isOpen, isClosed, buildPath, distance, getAngle } from "./pathfinding";
import { Point } from "./point";
import { RangeType } from "./enums/rangetype";

// ─── Helper ─────────────────────────────────────

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

// ─── distance ───────────────────────────────────

describe("distance", () => {
    it("returns 0 for identical points", () => {
        const p = new Point(3, 3);
        expect(distance(p, p)).toBe(0);
    });

    it("uses Chebyshev for Foot range", () => {
        const a = new Point(0, 0);
        const b = new Point(3, 1);
        expect(distance(a, b, RangeType.Foot)).toBe(3);
    });

    it("uses modified metric for Fly range", () => {
        const a = new Point(0, 0);
        const b = new Point(3, 1);
        // max=3, min=1 → (3-1) + 1*1.5 = 3.5
        expect(distance(a, b, RangeType.Fly)).toBe(3.5);
    });

    it("defaults to Fly range type", () => {
        const a = new Point(0, 0);
        const b = new Point(2, 2);
        // max=2, min=2 → 0 + 2*1.5 = 3
        expect(distance(a, b)).toBe(3);
    });
});

// ─── getAngle ───────────────────────────────────

describe("getAngle", () => {
    it("returns 0 for due right", () => {
        expect(getAngle(new Point(0, 0), new Point(1, 0))).toBe(0);
    });

    it("returns 2 for due down", () => {
        expect(getAngle(new Point(0, 0), new Point(0, 1))).toBe(2);
    });

    it("returns 4 for due left", () => {
        expect(getAngle(new Point(1, 0), new Point(0, 0))).toBe(4);
    });

    it("returns 6 for due up", () => {
        expect(getAngle(new Point(0, 1), new Point(0, 0))).toBe(6);
    });
});

// ─── Node ───────────────────────────────────────

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
        it("returns true when path is undefined", () => {
            const node = new Node(0, 0);
            expect(node.isValid()).toBe(true);
        });

        it("returns false when path is null", () => {
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

// ─── Path ───────────────────────────────────────

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
        expect(points[0]).not.toBe(n1.pos);
    });

    it("warning returns the warning flag of the last node", () => {
        const n1 = makeNode(0, 0);
        const n2 = makeNode(1, 0, {
            warning: true,
        });
        const path = new Path([n1, n2], [0, 0], 1);
        expect(path.warning).toBe(true);

        const n3 = makeNode(2, 0, {
            warning: false,
        });
        const path2 = new Path([n1, n3], [0, 0], 1);
        expect(path2.warning).toBe(false);
    });

    it("terminal returns true if any node is terminal", () => {
        const n1 = makeNode(0, 0);
        const n2 = makeNode(1, 0, {
            terminal: true,
        });
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

// ─── diagonalHeuristic ──────────────────────────

describe("diagonalHeuristic", () => {
    it("returns 0 for identical nodes", () => {
        const node = makeNode(5, 5);
        expect(diagonalHeuristic(node, node)).toBe(0);
    });

    it("returns cost for adjacent cardinal step", () => {
        const a = makeNode(0, 0);
        const b = makeNode(1, 0);
        expect(diagonalHeuristic(a, b)).toBe(1);
    });

    it("returns diagonalCost for adjacent diagonal step", () => {
        const a = makeNode(0, 0);
        const b = makeNode(1, 1);
        expect(diagonalHeuristic(a, b)).toBe(1.5);
    });

    it("returns correct cost for multi-step path", () => {
        const a = makeNode(0, 0);
        const b = makeNode(3, 1);
        expect(diagonalHeuristic(a, b)).toBe(3.5);
    });

    it("adds terminalCost when node is terminal", () => {
        const a = makeNode(0, 0, {
            terminal: true,
        });
        const b = makeNode(1, 0);
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
        expect(diagonalHeuristic(a, b, 3, 2, 50)).toBe(2);
    });

    it("uses custom terminalCost for warning nodes", () => {
        const a = makeNode(0, 0, { warning: true });
        const b = makeNode(1, 1);
        expect(diagonalHeuristic(a, b, 3, 2, 50)).toBe(52);
    });
});

// ─── isOpen / isClosed ──────────────────────────

describe("isOpen", () => {
    it("returns true when node is in the set", () => {
        const a = makeNode(0, 0);
        const b = makeNode(1, 1);
        expect(isOpen(a, [a, b])).toBe(true);
    });

    it("returns false when node is not in the set", () => {
        const a = makeNode(0, 0);
        const b = makeNode(1, 1);
        expect(isOpen(a, [b])).toBe(false);
    });

    it("returns false for empty set", () => {
        expect(isOpen(makeNode(0, 0), [])).toBe(false);
    });
});

describe("isClosed", () => {
    it("returns true when node is in the set", () => {
        const a = makeNode(0, 0);
        expect(isClosed(a, [a])).toBe(true);
    });

    it("returns false when node is not in the set", () => {
        const a = makeNode(0, 0);
        const b = makeNode(1, 1);
        expect(isClosed(a, [b])).toBe(false);
    });

    it("returns false for empty set", () => {
        expect(isClosed(makeNode(0, 0), [])).toBe(false);
    });
});

// ─── buildPath ──────────────────────────────────

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
        const b = makeNode(1, 0, {
            terminal: true,
        });
        const c = makeNode(2, 0);
        b.parentNode = a;
        c.parentNode = b;

        buildPath(c, a);
        expect(c.traversable).toBe(false);
        expect(b.terminal).toBe(true);
    });

    it("marks nodes after a non-traversable node as non-traversable", () => {
        const a = makeNode(0, 0);
        const b = makeNode(1, 0, {
            traversable: false,
        });
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
