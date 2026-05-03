import { describe, it, expect, vi } from "vitest";
import { Point } from "./point";
import {
    DIAGONAL_STEP_COST,
    ORTHOGONAL_STEP_COST,
    TERMINAL_STEP_BUMP,
    engageableEnemiesAt,
    flyingPathCost,
    isStepTraversable,
    movementBudget,
    stepCost,
} from "./pathrules";
import type { Board } from "./board";
import type { Piece } from "./piece";

// --- Mock helpers --------------------------------------------------

/**
 * Build a minimal mock Piece with sensible defaults. Override
 * fields via `overrides`.
 */
function makeMockPiece(overrides: Record<string, unknown> = {}): Piece {
    return {
        position: new Point(0, 0),
        dead: false,
        engulfed: false,
        attacked: false,
        moved: false,
        currentRider: null,
        currentMount: null,
        owner: null,
        stats: {
            movement: 3,
            combat: 3,
            rangedCombat: 0,
            range: 0,
            defence: 3,
            manoeuvrability: 3,
            magicResistance: 0,
        },
        hasStatus: vi.fn(() => false),
        canMountPiece: vi.fn(() => false),
        canAttackPiece: vi.fn(() => false),
        canEngagePiece: vi.fn(() => false),
        ...overrides,
    } as unknown as Piece;
}

/**
 * Build a mock Board whose geometry queries respect the
 * provided pieces. Pieces are looked up by their `position`.
 */
function makeMockBoard(pieces: Piece[] = [], overrides: Record<string, unknown> = {}): Board {
    return {
        width: 10,
        height: 10,
        getPiecesAtPosition: vi.fn((pt: Point, filter?: (p: Piece) => boolean) => {
            const result = pieces.filter((p) => p.position.x === pt.x && p.position.y === pt.y);
            return filter ? result.filter(filter) : result;
        }),
        getAdjacentPiecesAtPosition: vi.fn((pt: Point, filter?: (p: Piece) => boolean) => {
            const result = pieces.filter((p) => {
                const dx = Math.abs(p.position.x - pt.x);
                const dy = Math.abs(p.position.y - pt.y);
                return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
            });
            return filter ? result.filter(filter) : result;
        }),
        getAdjacentPoints: vi.fn(() => []),
        getPointsInRange: vi.fn(() => []),
        ...overrides,
    } as unknown as Board;
}

// --- stepCost ------------------------------------------------------

describe("stepCost", () => {
    it("returns ORTHOGONAL_STEP_COST for an orthogonal step", () => {
        expect(stepCost(new Point(2, 2), new Point(3, 2))).toBe(ORTHOGONAL_STEP_COST);
        expect(stepCost(new Point(2, 2), new Point(1, 2))).toBe(ORTHOGONAL_STEP_COST);
        expect(stepCost(new Point(2, 2), new Point(2, 3))).toBe(ORTHOGONAL_STEP_COST);
        expect(stepCost(new Point(2, 2), new Point(2, 1))).toBe(ORTHOGONAL_STEP_COST);
    });

    it("returns DIAGONAL_STEP_COST for a diagonal step", () => {
        expect(stepCost(new Point(2, 2), new Point(3, 3))).toBe(DIAGONAL_STEP_COST);
        expect(stepCost(new Point(2, 2), new Point(1, 1))).toBe(DIAGONAL_STEP_COST);
        expect(stepCost(new Point(2, 2), new Point(3, 1))).toBe(DIAGONAL_STEP_COST);
        expect(stepCost(new Point(2, 2), new Point(1, 3))).toBe(DIAGONAL_STEP_COST);
    });

    it("is symmetric: stepCost(a, b) === stepCost(b, a)", () => {
        const a = new Point(1, 1);
        const b = new Point(2, 2);
        expect(stepCost(a, b)).toBe(stepCost(b, a));
        const c = new Point(3, 4);
        const d = new Point(2, 4);
        expect(stepCost(c, d)).toBe(stepCost(d, c));
    });

    it("is deterministic: same inputs yield same output", () => {
        const a = new Point(0, 0);
        const b = new Point(1, 1);
        const first = stepCost(a, b);
        const second = stepCost(a, b);
        expect(first).toBe(second);
    });

    it("uses the documented constants", () => {
        expect(ORTHOGONAL_STEP_COST).toBe(1);
        expect(DIAGONAL_STEP_COST).toBe(1.5);
    });
});

// --- flyingPathCost ------------------------------------------------

describe("flyingPathCost", () => {
    it("returns 0 for an empty path", () => {
        expect(flyingPathCost(new Point(0, 0), [])).toBe(0);
    });

    it("returns the fly-distance from origin to the terminal step", () => {
        // Three diagonal steps from (0,0) to (3,3): 3 * 1.5 = 4.5
        const path: Point[] = [new Point(1, 1), new Point(2, 2), new Point(3, 3)];
        expect(flyingPathCost(new Point(0, 0), path)).toBe(4.5);
    });

    it("ignores intermediate steps - flies point-to-point", () => {
        // Even though the path zig-zags, the cost is just the
        // direct fly distance from origin to terminal step.
        const origin = new Point(0, 0);
        const direct: Point[] = [new Point(3, 3)];
        const detour: Point[] = [new Point(0, 1), new Point(0, 2), new Point(1, 2), new Point(2, 3), new Point(3, 3)];
        expect(flyingPathCost(origin, detour)).toBe(flyingPathCost(origin, direct));
    });

    it("returns 3 for a 3-tile orthogonal flight", () => {
        const path: Point[] = [new Point(3, 0)];
        expect(flyingPathCost(new Point(0, 0), path)).toBe(3);
    });

    it("returns 4 for a 3-diag + 1-orth fly distance (3 * 1.5 - oops, mixed)", () => {
        // Origin (0,0) to terminal (3,4): max=4, min=3; cost =
        // (4-3) + 3*1.5 = 1 + 4.5 = 5.5.
        const path: Point[] = [new Point(3, 4)];
        expect(flyingPathCost(new Point(0, 0), path)).toBe(5.5);
    });
});

// --- movementBudget ------------------------------------------------

describe("movementBudget", () => {
    it("returns piece.stats.movement + TERMINAL_STEP_BUMP", () => {
        const piece = makeMockPiece({ stats: { movement: 3 } });
        expect(movementBudget(piece)).toBe(3 + TERMINAL_STEP_BUMP);
    });

    it("uses the documented terminal-step bump constant (0.5)", () => {
        expect(TERMINAL_STEP_BUMP).toBe(0.5);
    });

    it("tracks piece.stats.movement when status modifiers change it", () => {
        // Movement = 6 simulates MagicWings or similar status that
        // boosts the stats.movement getter.
        const boosted = makeMockPiece({ stats: { movement: 6 } });
        expect(movementBudget(boosted)).toBe(6 + TERMINAL_STEP_BUMP);

        // Movement = 3 simulates the ShadowForm / default case.
        const baseline = makeMockPiece({ stats: { movement: 3 } });
        expect(movementBudget(baseline)).toBe(3 + TERMINAL_STEP_BUMP);

        // Movement = 0 should still receive the bump.
        const stuck = makeMockPiece({ stats: { movement: 0 } });
        expect(movementBudget(stuck)).toBe(0 + TERMINAL_STEP_BUMP);
    });
});

// --- isStepTraversable ---------------------------------------------

describe("isStepTraversable", () => {
    it("returns true for an empty in-bounds tile", () => {
        const piece = makeMockPiece({ position: new Point(0, 0) });
        const board = makeMockBoard([]);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(1, 1), board, false)).toBe(true);
    });

    it("returns false for an off-board step (negative or out-of-range)", () => {
        const piece = makeMockPiece({ position: new Point(0, 0) });
        const board = makeMockBoard([]);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(-1, 0), board, false)).toBe(false);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(0, -1), board, false)).toBe(false);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(10, 0), board, false)).toBe(false);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(0, 10), board, false)).toBe(false);
    });

    it("returns false when a non-terminal step is blocked by an enemy and allowTerminalException is false", () => {
        const piece = makeMockPiece({ position: new Point(0, 0) });
        const enemy = makeMockPiece({ position: new Point(1, 1) });
        const board = makeMockBoard([piece, enemy]);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(1, 1), board, false)).toBe(false);
    });

    it("returns true for a terminal step into a mountable target when allowTerminalException is true", () => {
        const piece = makeMockPiece({
            position: new Point(0, 0),
            canMountPiece: vi.fn(() => true),
            canAttackPiece: vi.fn(() => false),
        });
        const mount = makeMockPiece({ position: new Point(1, 1) });
        const board = makeMockBoard([piece, mount]);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(1, 1), board, true)).toBe(true);
    });

    it("returns true for a terminal step into an attackable target when allowTerminalException is true", () => {
        const piece = makeMockPiece({
            position: new Point(0, 0),
            canMountPiece: vi.fn(() => false),
            canAttackPiece: vi.fn(() => true),
        });
        const enemy = makeMockPiece({ position: new Point(1, 1) });
        const board = makeMockBoard([piece, enemy]);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(1, 1), board, true)).toBe(true);
    });

    it("returns false for a tile occupied by a non-interactable piece even when allowTerminalException is true", () => {
        const piece = makeMockPiece({
            position: new Point(0, 0),
            canMountPiece: vi.fn(() => false),
            canAttackPiece: vi.fn(() => false),
        });
        const blocker = makeMockPiece({ position: new Point(1, 1) });
        const board = makeMockBoard([piece, blocker]);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(1, 1), board, true)).toBe(false);
    });

    it("treats the moving piece's own rider as part of the moving piece (tile is traversable)", () => {
        const rider = makeMockPiece({ position: new Point(1, 1) });
        const piece = makeMockPiece({
            position: new Point(0, 0),
            currentRider: rider,
        });
        const board = makeMockBoard([piece, rider]);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(1, 1), board, false)).toBe(true);
    });

    it("ignores dead pieces on the destination tile", () => {
        const piece = makeMockPiece({ position: new Point(0, 0) });
        const corpse = makeMockPiece({
            position: new Point(1, 1),
            dead: true,
        });
        const board = makeMockBoard([piece, corpse]);
        expect(isStepTraversable(piece, new Point(0, 0), new Point(1, 1), board, false)).toBe(true);
    });
});

// --- engageableEnemiesAt -------------------------------------------

describe("engageableEnemiesAt", () => {
    it("returns enemies adjacent to the tile that can engage the piece", () => {
        const piece = makeMockPiece({ position: new Point(2, 2) });
        const enemy = makeMockPiece({
            position: new Point(2, 1),
            canEngagePiece: vi.fn(() => true),
        });
        const board = makeMockBoard([piece, enemy]);
        const result = engageableEnemiesAt(piece, new Point(2, 2), board);
        expect(result).toContain(enemy);
    });

    it("does not return enemies that cannot engage the piece", () => {
        const piece = makeMockPiece({ position: new Point(2, 2) });
        const nonEngager = makeMockPiece({
            position: new Point(2, 1),
            canEngagePiece: vi.fn(() => false),
        });
        const board = makeMockBoard([piece, nonEngager]);
        const result = engageableEnemiesAt(piece, new Point(2, 2), board);
        expect(result).not.toContain(nonEngager);
    });

    it("does not return the moving piece itself", () => {
        const piece = makeMockPiece({
            position: new Point(2, 2),
            canEngagePiece: vi.fn(() => true),
        });
        const board = makeMockBoard([piece]);
        const result = engageableEnemiesAt(piece, new Point(2, 2), board);
        expect(result).not.toContain(piece);
    });

    it("filters out dead pieces", () => {
        const piece = makeMockPiece({ position: new Point(2, 2) });
        const corpse = makeMockPiece({
            position: new Point(2, 1),
            dead: true,
            canEngagePiece: vi.fn(() => true),
        });
        const board = makeMockBoard([piece, corpse]);
        const result = engageableEnemiesAt(piece, new Point(2, 2), board);
        expect(result).not.toContain(corpse);
    });

    it("returns multiple engageable enemies when several are adjacent", () => {
        const piece = makeMockPiece({ position: new Point(2, 2) });
        const enemyA = makeMockPiece({
            position: new Point(1, 1),
            canEngagePiece: vi.fn(() => true),
        });
        const enemyB = makeMockPiece({
            position: new Point(3, 3),
            canEngagePiece: vi.fn(() => true),
        });
        const board = makeMockBoard([piece, enemyA, enemyB]);
        const result = engageableEnemiesAt(piece, new Point(2, 2), board);
        expect(result).toContain(enemyA);
        expect(result).toContain(enemyB);
    });
});
