import { describe, it, expect, vi, beforeEach } from "vitest";
import { Piece } from "./piece";
import { Board } from "./board";
import { TestRNG } from "./rng";
import { Point } from "./point";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { UnitDirection } from "./enums/unitdirection";
import { SpreadAction } from "./enums/spreadaction";
import type { PieceConfig } from "./configs/piececonfig";
import type { UnitConfig } from "./interfaces/ui";

// Seed the static unit data so spread() can look
// up the config for newly created pieces.
Piece.units = {
    gooeyblob: {
        name: "Gooey Blob",
        group: "classicunits",
        shadowScale: 1,
        offY: 0,
        properties: {
            mov: 0,
            com: 0,
            rcm: 0,
            rng: 0,
            def: 1,
            mnv: 0,
            res: 0,
        },
        status: [UnitStatus.Spreads, UnitStatus.Engulfs],
    } as unknown as UnitConfig,
};

/**
 * Build a minimal mock board for Piece tests.
 */
function makeMockBoard(rng = new TestRNG()): Board {
    return {
        rng,
        width: 13,
        height: 13,
        logger: { log: vi.fn() },
        emitBoardUpdateEvent: vi.fn(),
        boardEvents: { emit: vi.fn() },
        events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
        getAdjacentPoints: vi
            .fn()
            .mockReturnValue([new Point(1, 0), new Point(0, 1)]),
        getPiecesAtPosition: vi.fn().mockReturnValue([]),
        removePiece: vi.fn(),
        addPiece: vi.fn().mockImplementation(() => ({
            id: 99,
            hasStatus: vi.fn().mockReturnValue(false),
            currentEngulfed: null,
        })),
    } as unknown as Board;
}

function makeSpreader(board: Board, id = 1, x = 0, y = 0): Piece {
    return new Piece(board, id, {
        type: UnitType.Creature,
        x,
        y,
        properties: {
            id: "gooeyblob",
            name: "Gooey Blob",
            movement: 0,
            combat: 0,
            rangedCombat: 0,
            range: 0,
            defence: 1,
            manoeuvrability: 0,
            magicResistance: 0,
            attackType: "attacked",
            rangedType: "shot",
            status: [UnitStatus.Spreads, UnitStatus.Engulfs],
        },
        owner: { name: "Player 1" } as any,
    } as PieceConfig);
}

describe("Piece.spread", () => {
    it("returns { action: 'none' } when RNG picks None", async () => {
        const rng = new TestRNG();
        rng.weightedRandomPick = () => SpreadAction.None;
        const board = makeMockBoard(rng);
        const piece = makeSpreader(board);
        const result = await piece.spread();
        expect(result).toEqual({ action: "none" });
    });

    it("returns shrink result and destroys the piece", async () => {
        const rng = new TestRNG();
        rng.weightedRandomPick = () => SpreadAction.Shrink;
        const board = makeMockBoard(rng);
        const piece = makeSpreader(board);
        const result = await piece.spread();
        expect(result).toEqual({
            action: "shrink",
            pieceId: piece.id,
        });
        expect(board.removePiece).toHaveBeenCalledWith(piece.id);
    });

    it("returns shrink with releasedPieceId when engulfing", async () => {
        const rng = new TestRNG();
        rng.weightedRandomPick = () => SpreadAction.Shrink;
        const board = makeMockBoard(rng);
        const piece = makeSpreader(board);
        const engulfed = {
            id: 42,
            engulfed: true,
            fullName: "Engulfed Piece",
        } as any;
        piece.currentEngulfed = engulfed;
        const result = await piece.spread();
        expect(result).toEqual({
            action: "shrink",
            pieceId: piece.id,
            releasedPieceId: 42,
        });
        expect(engulfed.engulfed).toBe(false);
    });

    it("returns spread result when spreading to empty square", async () => {
        const rng = new TestRNG();
        (rng as any).weightedRandomPick = () => SpreadAction.Spread;
        rng.pick = (arr: any[]) => arr[0];
        const board = makeMockBoard(rng);
        const piece = makeSpreader(board);
        const result = await piece.spread();
        expect(result).toMatchObject({
            action: "spread",
            pieceId: piece.id,
            targetPoint: { x: 1, y: 0 },
            newPieceId: 99,
            destroyedPieceIds: [],
        });
    });

    it("throws when called on a non-spreading piece", async () => {
        const board = makeMockBoard();
        const piece = new Piece(board, 1, {
            type: UnitType.Creature,
            x: 0,
            y: 0,
            properties: {
                id: "horse",
                name: "Horse",
                movement: 4,
                combat: 1,
                rangedCombat: 0,
                range: 0,
                defence: 1,
                manoeuvrability: 0,
                magicResistance: 0,
                attackType: "attacked",
                rangedType: "shot",
                status: [],
            },
            owner: { name: "P1" } as any,
        } as PieceConfig);
        await expect(piece.spread()).rejects.toThrow(
            "Cannot spread a non-spreading or dead piece",
        );
    });
});

// ── Helpers for combat/lifecycle tests ───────────────────────────────────────

/**
 * Build a fully functional mock board that supports roll() for
 * combat tests.
 */
function makeCombatBoard(rollResult: boolean): Board {
    return {
        rng: new TestRNG(),
        width: 13,
        height: 13,
        logger: { log: vi.fn() },
        emitBoardUpdateEvent: vi.fn(),
        boardEvents: { emit: vi.fn() },
        events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
        getAdjacentPoints: vi
            .fn()
            .mockReturnValue([new Point(1, 0), new Point(0, 1)]),
        getAdjacentPiecesAtPosition: vi.fn().mockReturnValue([]),
        getPiecesAtPosition: vi.fn().mockReturnValue([]),
        removePiece: vi.fn(),
        addPiece: vi.fn(),
        roll: vi.fn().mockReturnValue(rollResult),
        hasLineOfSight: vi.fn().mockReturnValue(true),
        dismountPiece: vi.fn(),
        movePiece: vi.fn().mockResolvedValue(undefined),
        pieces: [],
        rangeGizmo: {
            getPathTo: vi.fn().mockReturnValue(null),
        },
        currentPlayer: null,
    } as unknown as Board;
}

const OWNER_A = { id: 1, name: "Player A" } as any;
const OWNER_B = { id: 2, name: "Player B" } as any;

function makeCreature(
    board: Board,
    id: number,
    x: number,
    y: number,
    owner: any = OWNER_A,
    status: UnitStatus[] = [],
    overrides: Partial<{
        movement: number;
        combat: number;
        rangedCombat: number;
        range: number;
        defence: number;
        manoeuvrability: number;
        magicResistance: number;
    }> = {},
): Piece {
    return new Piece(board, id, {
        type: UnitType.Creature,
        x,
        y,
        properties: {
            id: "creature",
            name: "Creature",
            movement: 3,
            combat: 3,
            rangedCombat: 0,
            range: 0,
            defence: 3,
            manoeuvrability: 3,
            magicResistance: 0,
            attackType: "hit",
            rangedType: "shot",
            status,
            ...overrides,
        },
        owner,
    } as PieceConfig);
}

// ── Piece.kill ────────────────────────────────────────────────────────────────

describe("Piece.kill", () => {
    it("marks the piece as dead and clears owner", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        await piece.kill();
        expect(piece.dead).toBe(true);
        expect(piece.owner).toBeNull();
    });

    it("throws when called on a piece that is already dead", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        await piece.kill();
        await expect(piece.kill()).rejects.toThrow(
            "Cannot kill unit that is already dead",
        );
    });

    it("releases an engulfed piece on kill", async () => {
        const board = makeMockBoard();
        const spreader = makeSpreader(board, 1);
        const victim = makeCreature(board, 2, 0, 0);
        victim._engulfed = true as any;
        spreader.currentEngulfed = victim as any;
        await spreader.kill();
        expect(victim.engulfed).toBe(false);
        expect(spreader.currentEngulfed).toBeNull();
    });

    it("destroys illusion pieces immediately", async () => {
        const board = makeMockBoard();
        const piece = new Piece(board, 1, {
            type: UnitType.Creature,
            x: 0,
            y: 0,
            illusion: true,
            properties: {
                id: "creature",
                name: "Illusion",
                movement: 1,
                combat: 1,
                rangedCombat: 0,
                range: 0,
                defence: 1,
                manoeuvrability: 1,
                magicResistance: 0,
                attackType: "hit",
                rangedType: "shot",
                status: [],
            },
            owner: OWNER_A,
        } as PieceConfig);
        await piece.kill();
        expect((board.removePiece as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it("destroys pieces with NoCorpse status immediately", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.NoCorpse],
        );
        await piece.kill();
        expect((board.removePiece as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it("destroys undead pieces immediately", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Undead],
        );
        await piece.kill();
        expect((board.removePiece as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
});

// ── Piece.destroy ─────────────────────────────────────────────────────────────

describe("Piece.destroy", () => {
    it("removes the piece from the board", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        await piece.destroy();
        expect((board.removePiece as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(1);
    });

    it("marks the piece as dead", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        await piece.destroy();
        expect(piece.dead).toBe(true);
    });
});

// ── Piece.raiseDead ───────────────────────────────────────────────────────────

describe("Piece.raiseDead", () => {
    it("revives a dead piece with a new owner", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        await piece.kill();
        await piece.raiseDead(OWNER_B);
        expect(piece.dead).toBe(false);
        expect(piece.owner).toBe(OWNER_B);
        expect(piece.raisedDead).toBe(true);
        expect(piece.hasStatus(UnitStatus.Undead)).toBe(true);
    });

    it("throws when raising a piece that is not dead", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        await expect(piece.raiseDead(OWNER_A)).rejects.toThrow(
            "Cannot raise a piece that is not dead",
        );
    });
});

// ── Piece.moveTo ──────────────────────────────────────────────────────────────

describe("Piece.moveTo", () => {
    it("updates the piece position", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        await piece.moveTo({ x: 5, y: 3 });
        expect(piece.position.x).toBe(5);
        expect(piece.position.y).toBe(3);
    });

    it("moves the rider along with the mount", async () => {
        const board = makeCombatBoard(true);
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        // Bypass canMountPiece validation by directly wiring up the relationship
        (mount as any)._currentRider = rider;
        (rider as any)._currentMount = mount;
        await mount.moveTo({ x: 3, y: 3 });
        expect(rider.position.x).toBe(3);
        expect(rider.position.y).toBe(3);
    });

    it("updates direction when moving right (isometric)", async () => {
        const board = makeMockBoard();
        // Moving from (2,2) to (4,0) → isoX offset = (4-0)-(2-2) = 4 → Right
        const piece = makeCreature(board, 1, 2, 2);
        await piece.moveTo({ x: 4, y: 0 });
        expect(piece.direction).toBe(UnitDirection.Right);
    });

    it("updates direction when moving left (isometric)", async () => {
        const board = makeMockBoard();
        // Moving from (4,0) to (2,2) → isoX offset = (2-2)-(4-0) = -4 → Left
        const piece = makeCreature(board, 1, 4, 0);
        await piece.moveTo({ x: 2, y: 2 });
        expect(piece.direction).toBe(UnitDirection.Left);
    });
});

// ── Piece.attack ──────────────────────────────────────────────────────────────

describe("Piece.attack", () => {
    it("returns false if the target cannot be attacked", async () => {
        const board = makeCombatBoard(true);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        // Attack self – canAttackPiece returns false
        const result = await attacker.attack(attacker);
        expect(result).toBe(false);
    });

    it("returns false if the target is undead and attacker cannot attack undead", async () => {
        const board = makeCombatBoard(true);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        const defender = makeCreature(
            board, 2, 1, 0, OWNER_B, [UnitStatus.Undead],
        );
        const result = await attacker.attack(defender);
        expect(result).toBe(false);
    });

    it("kills the defender when the roll succeeds", async () => {
        const board = makeCombatBoard(true);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        const defender = makeCreature(board, 2, 1, 0, OWNER_B);
        const result = await attacker.attack(defender);
        expect(result).toBe(true);
        expect(defender.dead).toBe(true);
    });

    it("returns false and does not kill when the roll fails", async () => {
        const board = makeCombatBoard(false);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        const defender = makeCreature(board, 2, 1, 0, OWNER_B);
        const result = await attacker.attack(defender);
        expect(result).toBe(false);
        expect(defender.dead).toBe(false);
    });

    it("marks the attacker as having attacked and moved", async () => {
        const board = makeCombatBoard(false);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        const defender = makeCreature(board, 2, 1, 0, OWNER_B);
        await attacker.attack(defender);
        expect(attacker._attacked).toBe(true);
    });

    it("removes ShadowForm from attacker regardless of outcome", async () => {
        const board = makeCombatBoard(false);
        const attacker = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.ShadowForm],
        );
        const defender = makeCreature(board, 2, 1, 0, OWNER_B);
        await attacker.attack(defender);
        expect(attacker.hasStatus(UnitStatus.ShadowForm)).toBe(false);
    });
});

// ── Piece.rangedAttack ────────────────────────────────────────────────────────

describe("Piece.rangedAttack", () => {
    it("returns false when canRangedAttackPiece is false (no range)", async () => {
        const board = makeCombatBoard(true);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        const defender = makeCreature(board, 2, 5, 5, OWNER_B);
        // attacker has range=0, so canRangedAttack is false
        const result = await attacker.rangedAttack(defender);
        expect(result).toBe(false);
    });

    it("kills the defender on a successful ranged roll", async () => {
        const board = makeCombatBoard(true);
        // Attacker needs: moved=true, rangedCombat>0, range>0, and the
        // canRangedAttackPiece check passes.
        const attacker = makeCreature(
            board, 1, 0, 0, OWNER_A, [],
            { rangedCombat: 3, range: 6 },
        );
        const defender = makeCreature(board, 2, 3, 0, OWNER_B);
        // canRangedAttackPiece requires moved=true
        (attacker as any)._moved = true;
        const result = await attacker.rangedAttack(defender);
        expect(result).toBe(true);
        expect(defender.dead).toBe(true);
    });

    it("removes ShadowForm on a successful ranged attack", async () => {
        const board = makeCombatBoard(true);
        const attacker = makeCreature(
            board, 1, 0, 0, OWNER_A,
            [UnitStatus.ShadowForm],
            { rangedCombat: 3, range: 6 },
        );
        const defender = makeCreature(board, 2, 3, 0, OWNER_B);
        (attacker as any)._moved = true;
        await attacker.rangedAttack(defender);
        expect(attacker.hasStatus(UnitStatus.ShadowForm)).toBe(false);
    });

    it("returns false when target is undead and attacker cannot attack undead", async () => {
        const board = makeCombatBoard(true);
        const attacker = makeCreature(
            board, 1, 0, 0, OWNER_A, [],
            { rangedCombat: 3, range: 6 },
        );
        const defender = makeCreature(
            board, 2, 3, 0, OWNER_B, [UnitStatus.Undead],
        );
        (attacker as any)._moved = true;
        const result = await attacker.rangedAttack(defender);
        expect(result).toBe(false);
    });
});

// ── Piece stats with status effects ───────────────────────────────────────────

describe("Piece.stats status-effect modifiers", () => {
    it("ShadowForm adds +3 defence (capped at 9) and sets movement to 3", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.ShadowForm],
            { movement: 1, defence: 3 },
        );
        const stats = piece.stats;
        expect(stats.movement).toBe(3);
        expect(stats.defence).toBe(6);
    });

    it("MagicSword adds +6 combat (capped at 9)", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.MagicSword], { combat: 3 },
        );
        expect(piece.stats.combat).toBe(9);
    });

    it("MagicKnife adds +3 combat (when no MagicSword)", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.MagicKnife], { combat: 3 },
        );
        expect(piece.stats.combat).toBe(6);
    });

    it("MagicArmour adds +6 defence", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.MagicArmour], { defence: 2 },
        );
        expect(piece.stats.defence).toBe(8);
    });

    it("MagicShield adds +3 defence (when no MagicArmour)", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.MagicShield], { defence: 2 },
        );
        expect(piece.stats.defence).toBe(5);
    });

    it("MagicBow sets rangedCombat=3 and range=6", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0, OWNER_A, [UnitStatus.MagicBow]);
        expect(piece.stats.rangedCombat).toBe(3);
        expect(piece.stats.range).toBe(6);
    });

    it("MagicWings sets movement to 6", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.MagicWings], { movement: 2 },
        );
        expect(piece.stats.movement).toBe(6);
    });
});

// ── Piece.strength ────────────────────────────────────────────────────────────

describe("Piece.strength", () => {
    it("calculates strength from stats", () => {
        const board = makeMockBoard();
        // combat=3, movement=3, defence=3, magicResistance=0
        const piece = makeCreature(board, 1, 0, 0);
        // rangedCombat=0 → no range contribution; undead=false
        // strength = 3 + 3 + 3 + 0 = 9
        expect(piece.strength).toBe(9);
    });

    it("adds +2 strength for undead pieces", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Undead],
        );
        expect(piece.strength).toBeGreaterThan(9);
    });

    it("adds range contribution when rangedCombat > 0", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [], { rangedCombat: 2, range: 3 },
        );
        // strength += rangedCombat + range = 5
        const base = piece.stats.combat + piece.stats.movement + piece.stats.defence
            + piece.stats.magicResistance / 2;
        expect(piece.strength).toBe(base + 2 + 3);
    });
});

// ── Piece capability checks ───────────────────────────────────────────────────

describe("Piece capability checks", () => {
    describe("canMove", () => {
        it("returns true for a living mobile piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(board, 1, 0, 0);
            expect(piece.canMove).toBe(true);
        });

        it("returns false for a dead piece", async () => {
            const board = makeMockBoard();
            const piece = makeCreature(board, 1, 0, 0);
            await piece.kill();
            expect(piece.canMove).toBe(false);
        });

        it("returns false for a piece with movement=0", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [], { movement: 0 },
            );
            expect(piece.canMove).toBe(false);
        });

        it("returns false for a Structure piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Structure],
            );
            expect(piece.canMove).toBe(false);
        });

        it("returns false for a Tree piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Tree],
            );
            expect(piece.canMove).toBe(false);
        });

        it("returns false for an engulfed piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(board, 1, 0, 0);
            piece.engulfed = true;
            expect(piece.canMove).toBe(false);
        });
    });

    describe("canBeDisbelieved", () => {
        it("returns true for a regular creature", () => {
            const board = makeMockBoard();
            const piece = makeCreature(board, 1, 0, 0);
            expect(piece.canBeDisbelieved).toBe(true);
        });

        it("returns false for a wizard", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Wizard],
            );
            expect(piece.canBeDisbelieved).toBe(false);
        });

        it("returns false for a spreading piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Spreads],
            );
            expect(piece.canBeDisbelieved).toBe(false);
        });

        it("returns false for a structure", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Structure],
            );
            expect(piece.canBeDisbelieved).toBe(false);
        });

        it("returns false for a tree", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Tree],
            );
            expect(piece.canBeDisbelieved).toBe(false);
        });
    });

    describe("canBeSubverted", () => {
        it("returns true for a plain creature", () => {
            const board = makeMockBoard();
            const piece = makeCreature(board, 1, 0, 0);
            expect(piece.canBeSubverted).toBe(true);
        });

        it("returns false for a wizard", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Wizard],
            );
            expect(piece.canBeSubverted).toBe(false);
        });

        it("returns false for an invulnerable piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Invulnerable],
            );
            expect(piece.canBeSubverted).toBe(false);
        });
    });

    describe("canBeMagicAttacked", () => {
        it("returns true for a regular piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(board, 1, 0, 0);
            expect(piece.canBeMagicAttacked).toBe(true);
        });

        it("returns false for an invulnerable piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Invulnerable],
            );
            expect(piece.canBeMagicAttacked).toBe(false);
        });

        it("returns false for a piece with Sanctity", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Sanctity],
            );
            expect(piece.canBeMagicAttacked).toBe(false);
        });
    });

    describe("canBeSpreadOn", () => {
        it("returns true for a regular creature", () => {
            const board = makeMockBoard();
            const piece = makeCreature(board, 1, 0, 0);
            expect(piece.canBeSpreadOn).toBe(true);
        });

        it("returns false for an engulfing piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Engulfs],
            );
            expect(piece.canBeSpreadOn).toBe(false);
        });

        it("returns false for a structure", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Structure],
            );
            expect(piece.canBeSpreadOn).toBe(false);
        });
    });

    describe("canAttackPiece", () => {
        it("returns false when attacker and defender are the same piece", () => {
            const board = makeMockBoard();
            const piece = makeCreature(board, 1, 0, 0);
            expect(piece.canAttackPiece(piece)).toBe(false);
        });

        it("returns false when attacker and defender share an owner", () => {
            const board = makeMockBoard();
            const a = makeCreature(board, 1, 0, 0, OWNER_A);
            const b = makeCreature(board, 2, 1, 0, OWNER_A);
            expect(a.canAttackPiece(b)).toBe(false);
        });

        it("returns false when the defender is invulnerable", () => {
            const board = makeMockBoard();
            const a = makeCreature(board, 1, 0, 0, OWNER_A);
            const b = makeCreature(
                board, 2, 1, 0, OWNER_B, [UnitStatus.Invulnerable],
            );
            expect(a.canAttackPiece(b)).toBe(false);
        });

        it("returns true for valid attacker/defender pair", () => {
            const board = makeMockBoard();
            const a = makeCreature(board, 1, 0, 0, OWNER_A);
            const b = makeCreature(board, 2, 1, 0, OWNER_B);
            expect(a.canAttackPiece(b)).toBe(true);
        });
    });

    describe("canEngagePiece", () => {
        it("returns false for same owner", () => {
            const board = makeMockBoard();
            const a = makeCreature(board, 1, 0, 0, OWNER_A);
            const b = makeCreature(board, 2, 1, 0, OWNER_A);
            expect(a.canEngagePiece(b)).toBe(false);
        });

        it("returns false when either piece has manoeuvrability=0", () => {
            const board = makeMockBoard();
            const a = makeCreature(
                board, 1, 0, 0, OWNER_A, [], { manoeuvrability: 0 },
            );
            const b = makeCreature(board, 2, 1, 0, OWNER_B);
            expect(a.canEngagePiece(b)).toBe(false);
        });

        it("returns true for valid opposing pieces", () => {
            const board = makeMockBoard();
            const a = makeCreature(board, 1, 0, 0, OWNER_A);
            const b = makeCreature(board, 2, 1, 0, OWNER_B);
            expect(a.canEngagePiece(b)).toBe(true);
        });
    });
});

// ── Piece status helpers ──────────────────────────────────────────────────────

describe("Piece status helpers", () => {
    describe("hasAnyStatus", () => {
        it("returns true when the piece has at least one of the given statuses", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Flying],
            );
            expect(
                piece.hasAnyStatus([UnitStatus.Flying, UnitStatus.Undead]),
            ).toBe(true);
        });

        it("returns false when the piece has none of the given statuses", () => {
            const board = makeMockBoard();
            const piece = makeCreature(board, 1, 0, 0);
            expect(
                piece.hasAnyStatus([UnitStatus.Flying, UnitStatus.Undead]),
            ).toBe(false);
        });
    });

    describe("hasAllStatuses", () => {
        it("returns true when the piece has all of the given statuses", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A,
                [UnitStatus.Flying, UnitStatus.Undead],
            );
            expect(
                piece.hasAllStatuses([UnitStatus.Flying, UnitStatus.Undead]),
            ).toBe(true);
        });

        it("returns false when the piece is missing one status", () => {
            const board = makeMockBoard();
            const piece = makeCreature(
                board, 1, 0, 0, OWNER_A, [UnitStatus.Flying],
            );
            expect(
                piece.hasAllStatuses([UnitStatus.Flying, UnitStatus.Undead]),
            ).toBe(false);
        });
    });
});

// ── Piece.unitConfig / static helpers ─────────────────────────────────────────

describe("Piece.unitConfig", () => {
    it("returns a config matching the piece stats", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        const config = piece.unitConfig;
        expect(config.properties.com).toBe(piece.stats.combat);
        expect(config.properties.mov).toBe(piece.stats.movement);
        expect(config.name).toBe(piece.name);
        expect(config.dead).toBe(false);
    });
});

describe("Piece.getUnitConfig", () => {
    it("returns the unit config for a known id", () => {
        const config = Piece.getUnitConfig("gooeyblob");
        expect(config).toBeDefined();
        expect(config?.name).toBe("Gooey Blob");
    });

    it("returns undefined for an unknown id", () => {
        expect(Piece.getUnitConfig("nonexistent")).toBeUndefined();
    });
});

describe("Piece.getUnitPropertiesByName", () => {
    it("returns properties for a known unit name", () => {
        const props = Piece.getUnitPropertiesByName("Gooey Blob");
        expect(props).not.toBeNull();
        expect(props?.name).toBe("Gooey Blob");
    });

    it("is case-insensitive", () => {
        const props = Piece.getUnitPropertiesByName("gooey blob");
        expect(props).not.toBeNull();
    });

    it("returns null for an unknown name", () => {
        expect(Piece.getUnitPropertiesByName("No Such Unit")).toBeNull();
    });
});

describe("Piece.getPieceProperties", () => {
    it("returns piece properties for a known name", () => {
        const props = Piece.getPieceProperties("Gooey Blob");
        expect(props).toBeDefined();
        expect(props?.type).toBe(UnitType.Creature);
    });

    it("returns undefined for an unknown name", () => {
        expect(Piece.getPieceProperties("No Such Unit")).toBeUndefined();
    });
});

describe("Piece.isPiece", () => {
    it("returns true for a Piece instance", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        expect(Piece.isPiece(piece)).toBe(true);
    });

    it("returns false for a plain object", () => {
        expect(Piece.isPiece({ id: 1 })).toBe(false);
    });

    it("returns false for null", () => {
        expect(Piece.isPiece(null)).toBe(false);
    });
});

// ── Piece.reset / turn flags ──────────────────────────────────────────────────

describe("Piece.reset", () => {
    it("clears moved, attacked, rangedAttacked, and engaged flags", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        piece.turnOver = true;
        piece.engaged = true;
        piece.reset();
        expect(piece.engaged).toBe(false);
    });
});

describe("Piece.moved setter with rider", () => {
    it("propagates moved flag to the current rider", () => {
        const board = makeMockBoard();
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        (mount as any)._currentRider = rider;
        mount.moved = true;
        expect(rider.moved).toBe(true);
    });
});

describe("Piece.fullName", () => {
    it("includes the owner name when there is an owner", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        expect(piece.fullName).toContain("Player A");
    });

    it("is just the piece name when there is no owner", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        await piece.kill();
        expect(piece.fullName).toBe(piece.name);
    });
});

// ── Piece.inRangedAttackRange ─────────────────────────────────────────────────

describe("Piece.inRangedAttackRange", () => {
    it("returns true when the target is within range", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [], { rangedCombat: 3, range: 6 },
        );
        expect(piece.inRangedAttackRange({ x: 4, y: 0 })).toBe(true);
    });

    it("returns false when the target is beyond range", () => {
        const board = makeMockBoard();
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [], { rangedCombat: 3, range: 2 },
        );
        expect(piece.inRangedAttackRange({ x: 10, y: 0 })).toBe(false);
    });
});

// ── Piece.engage ──────────────────────────────────────────────────────────────

describe("Piece.engage", () => {
    it("sets engaged on both pieces when engagement is valid", async () => {
        const board = makeMockBoard();
        const a = makeCreature(board, 1, 0, 0, OWNER_A);
        const b = makeCreature(board, 2, 1, 0, OWNER_B);
        await a.engage(b);
        expect(a.engaged).toBe(true);
        expect(b.engaged).toBe(true);
    });

    it("does not engage when canEngagePiece is false", async () => {
        const board = makeMockBoard();
        const a = makeCreature(board, 1, 0, 0, OWNER_A);
        const b = makeCreature(board, 2, 1, 0, OWNER_A); // same owner
        await a.engage(b);
        expect(a.engaged).toBe(false);
        expect(b.engaged).toBe(false);
    });
});

// ── Piece.moved getter – zero-movement and engaged branches ───────────────────

describe("Piece.moved getter", () => {
    it("returns true when movement stat is 0", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0, OWNER_A, [], {
            movement: 0,
        });
        expect(piece.moved).toBe(true);
    });

    it("returns true when piece is engaged", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        piece.engaged = true;
        expect(piece.moved).toBe(true);
    });
});

// ── Piece.attacked getter – zero-combat branch ────────────────────────────────

describe("Piece.attacked getter", () => {
    it("returns true when combat stat is 0", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0, OWNER_A, [], {
            combat: 0,
        });
        expect(piece.attacked).toBe(true);
    });
});

// ── Piece.attacked setter – rider propagation ─────────────────────────────────

describe("Piece.attacked setter with rider", () => {
    it("propagates attacked flag to the current rider", () => {
        const board = makeMockBoard();
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        (mount as any)._currentRider = rider;
        mount.attacked = true;
        expect((rider as any)._attacked).toBe(true);
    });
});

// ── Piece.rangedAttacked setter – rider and mount propagation ─────────────────

describe("Piece.rangedAttacked setter", () => {
    it("propagates to rider when rangedAttacked is set on mount", () => {
        const board = makeMockBoard();
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A, [], {
            rangedCombat: 3,
            range: 6,
        });
        (mount as any)._currentRider = rider;
        mount.rangedAttacked = true;
        expect((rider as any)._moved).toBe(true);
        expect((rider as any)._attacked).toBe(true);
    });

    it("propagates to mount when rangedAttacked is set on rider", () => {
        const board = makeMockBoard();
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A, [], {
            rangedCombat: 3,
            range: 6,
        });
        (rider as any)._currentMount = mount;
        rider.rangedAttacked = true;
        expect((mount as any)._moved).toBe(true);
        expect((mount as any)._attacked).toBe(true);
    });
});

// ── Piece.currentRider setter – unmountable error path ────────────────────────

describe("Piece.currentRider setter", () => {
    it("logs an error and does not assign rider for non-mountable pieces", () => {
        const board = makeMockBoard();
        const nonMount = makeCreature(board, 1, 0, 0, OWNER_A);
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(
            () => {},
        );
        nonMount.currentRider = rider;
        expect(nonMount.currentRider).toBeNull();
        consoleSpy.mockRestore();
    });
});

// ── Piece.turnOver getter – all branches ─────────────────────────────────────

describe("Piece.turnOver getter", () => {
    it("returns true when piece is dead", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        await piece.kill();
        expect(piece.turnOver).toBe(true);
    });

    it("returns true when piece is engulfed", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        piece.engulfed = true;
        expect(piece.turnOver).toBe(true);
    });

    it("returns true when moved and all attack flags set", () => {
        const board = makeCombatBoard(false);
        // combat=0 means attacked getter always true;
        // rangedCombat=0 means rangedAttacked getter always true;
        // movement=0 means moved getter always true.
        const piece = makeCreature(board, 1, 0, 0, OWNER_A, [], {
            movement: 0,
            combat: 0,
            rangedCombat: 0,
        });
        expect(piece.turnOver).toBe(true);
    });
});

// ── Piece.reset with rider ────────────────────────────────────────────────────

describe("Piece.reset with rider", () => {
    it("propagates reset to the current rider", () => {
        const board = makeMockBoard();
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        (mount as any)._currentRider = rider;
        rider.turnOver = true;
        mount.reset();
        expect((rider as any)._moved).toBe(false);
        expect((rider as any)._attacked).toBe(false);
    });
});

// ── Piece.kill with rider ─────────────────────────────────────────────────────
//
// Scenario A: mount killed before it moved this turn.
//   The mount's movement setter propagates to rider._moved, so rider._moved is
//   still false. The rider gets a fresh turn (reset) if it has actions left.
//
// Scenario B: mount moved this turn, then killed.
//   rider._moved was already set to true via propagation. The rider's turn is
//   ended by setting turnOver=true — no reset so it cannot move again.
//
// Loophole: voluntary dismount (Board.dismountPiece → piece.dismount()) never
//   calls reset(). The reset() below is only reached through kill(). A rider
//   that walks off a live mount just has moved=true set and keeps all other
//   flags (including any engagement set when landing adjacent to an enemy).

describe("Piece.kill with rider – scenario A (mount not yet moved)", () => {
    it("dismounts the rider and clears mount references", async () => {
        const board = makeCombatBoard(false);
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        (mount as any)._currentRider = rider;
        (rider as any)._currentMount = mount;
        await mount.kill();
        expect(mount.dead).toBe(true);
        expect(rider.currentMount).toBeNull();
    });

    it("resets the rider when it still has actions after dismount", async () => {
        // Rider has ranged capability and an enemy in range: after dismount
        // canRangedAttack is true, so turnOver is false and reset() is called,
        // restoring moved=false so the rider can also move on foot.
        const board = makeCombatBoard(false);
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A, [], {
            rangedCombat: 3,
            range: 6,
        });
        const enemy = makeCreature(board, 3, 5, 0, OWNER_B);
        (board as any).pieces = [rider, enemy];
        (mount as any)._currentRider = rider;
        (rider as any)._currentMount = mount;
        await mount.kill();
        // reset() was called: rider can still move on foot
        expect((rider as any)._moved).toBe(false);
    });

    it("does not reset the rider when its turn was already over", async () => {
        // Rider has no stats, so turnOver is true immediately after dismount.
        const board = makeCombatBoard(false);
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A, [], {
            movement: 0,
            combat: 0,
            rangedCombat: 0,
        });
        (mount as any)._currentRider = rider;
        (rider as any)._currentMount = mount;
        await mount.kill();
        expect(rider.turnOver).toBe(true);
    });
});

describe("Piece.kill with rider – scenario B (mount already moved)", () => {
    it("ends the rider's turn even if it has actions remaining", async () => {
        // Simulate the mount having moved this turn by setting rider._moved=true,
        // which is what the mount's moved setter propagates to the rider.
        // Even with an enemy in ranged range, the rider must not get a free turn.
        const board = makeCombatBoard(false);
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A, [], {
            rangedCombat: 3,
            range: 6,
        });
        const enemy = makeCreature(board, 3, 5, 0, OWNER_B);
        (board as any).pieces = [rider, enemy];
        (mount as any)._currentRider = rider;
        (rider as any)._currentMount = mount;
        // Simulate mount having moved by propagating its moved=true to the rider
        (rider as any)._moved = true;
        await mount.kill();
        expect(rider.turnOver).toBe(true);
    });
});

// ── Piece.destroy with rider ──────────────────────────────────────────────────

describe("Piece.destroy with rider", () => {
    it("dismounts the rider when the mount is destroyed", async () => {
        const board = makeCombatBoard(false);
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        (mount as any)._currentRider = rider;
        (rider as any)._currentMount = mount;
        await mount.destroy();
        expect(mount.dead).toBe(true);
        expect(rider.currentMount).toBeNull();
    });
});

// ── Piece.rangedAttack – roll-fail branch ─────────────────────────────────────

describe("Piece.rangedAttack roll-fail branch", () => {
    it("returns false when roll fails", async () => {
        const board = makeCombatBoard(false); // roll returns false
        const attacker = makeCreature(
            board, 1, 0, 0, OWNER_A, [],
            { rangedCombat: 3, range: 6 },
        );
        const defender = makeCreature(board, 2, 3, 0, OWNER_B);
        // canRangedAttackPiece requires this.moved === true
        (attacker as any)._moved = true;
        const result = await attacker.rangedAttack(defender);
        expect(result).toBe(false);
        expect(defender.dead).toBe(false);
    });
});

// ── Piece.mount and Piece.dismount ────────────────────────────────────────────

describe("Piece.mount", () => {
    it("throws when canMountPiece returns false", async () => {
        const board = makeCombatBoard(false);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        const target = makeCreature(board, 2, 1, 0, OWNER_B);
        await expect(attacker.mount(target)).rejects.toThrow(
            "cannot mount",
        );
    });

    it("sets flags and calls board.movePiece on success", async () => {
        const board = makeCombatBoard(false);
        const wizard = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Wizard],
        );
        const horse = makeCreature(
            board, 2, 1, 0, OWNER_A, [UnitStatus.Mount],
        );
        await wizard.mount(horse);
        expect(wizard.currentMount).toBe(horse);
        expect(horse.currentRider).toBe(wizard);
        expect((wizard as any)._moved).toBe(true);
        expect((wizard as any)._attacked).toBe(true);
        expect(board.movePiece).toHaveBeenCalled();
    });
});

describe("Piece.dismount", () => {
    it("throws when piece is not mounted", async () => {
        const board = makeCombatBoard(false);
        const rider = makeCreature(board, 1, 0, 0, OWNER_A);
        await expect(rider.dismount()).rejects.toThrow("is not mounted");
    });

    it("clears currentMount and marks rider as moved", async () => {
        const board = makeCombatBoard(false);
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        (mount as any)._currentRider = rider;
        (rider as any)._currentMount = mount;
        await rider.dismount();
        expect(rider.currentMount).toBeNull();
        expect(mount.currentRider).toBeNull();
        expect((rider as any)._moved).toBe(true);
    });
});

// ── Piece.moveTo – dismount when mount left behind ────────────────────────────

describe("Piece.moveTo with mount left behind", () => {
    it("calls board.dismountPiece when mount position differs from new position", async () => {
        const board = makeCombatBoard(false);
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        // Wire up relationship without going through mount() to bypass
        // movement validation.
        (rider as any)._currentMount = mount;
        (mount as any)._currentRider = rider;
        // mount is at (0,0), rider moves to (5,5)
        await rider.moveTo({ x: 5, y: 5 });
        expect(board.dismountPiece).toHaveBeenCalledWith(rider.id);
    });
});

// ── Piece.spread – occupied square branches ───────────────────────────────────

describe("Piece.spread – occupied square branches", () => {
    it("returns none when the occupied square has a same-owner piece", async () => {
        const rng = new TestRNG();
        (rng as any).weightedRandomPick = () => SpreadAction.Spread;
        const board = makeMockBoard(rng);
        const spreader = makeSpreader(board, 1, 0, 0);
        // Use the same owner object reference so owner === check passes
        const ally = makeCreature(board, 2, 1, 0, spreader.owner as any);
        (board.getPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([ally]);
        const result = await spreader.spread();
        expect(result).toEqual({ action: "none" });
    });

    it("kills a wizard piece on the target square", async () => {
        const rng = new TestRNG();
        (rng as any).weightedRandomPick = () => SpreadAction.Spread;
        const board = makeMockBoard(rng);
        const spreader = makeSpreader(board, 1, 0, 0);
        const wizard = makeCreature(
            board, 2, 1, 0, OWNER_B, [UnitStatus.Wizard],
        );
        (board.getPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([wizard]);
        const result = await spreader.spread() as any;
        expect(result.killedPieceId).toBe(wizard.id);
        expect(wizard.dead).toBe(true);
    });

    it("engulfs a non-wizard enemy piece when Engulfs status is set", async () => {
        const rng = new TestRNG();
        (rng as any).weightedRandomPick = () => SpreadAction.Spread;
        const board = makeMockBoard(rng);
        const spreader = makeSpreader(board, 1, 0, 0);
        // Non-wizard, non-same-owner, non-Invulnerable enemy
        const victim = makeCreature(board, 2, 1, 0, OWNER_B);
        (board.getPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([victim]);
        const result = await spreader.spread() as any;
        expect(result.engulfedPieceId).toBe(victim.id);
        expect(victim.engulfed).toBe(true);
    });

    it("assigns currentEngulfed on new piece when it has Engulfs and victim survives", async () => {
        const rng = new TestRNG();
        (rng as any).weightedRandomPick = () => SpreadAction.Spread;
        const board = makeMockBoard(rng);
        const spreader = makeSpreader(board, 1, 0, 0);
        const victim = makeCreature(board, 2, 1, 0, OWNER_B);
        (board.getPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([victim]);
        // New piece returned by addPiece has Engulfs so lines 894-895 execute
        const newPieceMock = {
            id: 99,
            hasStatus: (s: UnitStatus) => s === UnitStatus.Engulfs,
            currentEngulfed: null as any,
        };
        (board.addPiece as ReturnType<typeof vi.fn>)
            .mockResolvedValue(newPieceMock);
        const result = await spreader.spread() as any;
        expect(result.newPieceEngulfedId).toBe(victim.id);
        expect(newPieceMock.currentEngulfed).toBe(victim);
    });

    it("destroys non-wizard enemies when spreader does not have Engulfs", async () => {
        const rng = new TestRNG();
        (rng as any).weightedRandomPick = () => SpreadAction.Spread;
        const board = makeMockBoard(rng);
        // Create a non-Engulfs spreader (no Engulfs status)
        const nonEngulfSpreader = new Piece(board, 1, {
            type: UnitType.Creature,
            x: 0,
            y: 0,
            properties: {
                id: "gooeyblob",
                name: "Gooey Blob",
                movement: 0,
                combat: 0,
                rangedCombat: 0,
                range: 0,
                defence: 1,
                manoeuvrability: 0,
                magicResistance: 0,
                attackType: "attacked",
                rangedType: "shot",
                status: [UnitStatus.Spreads],
            },
            owner: { id: 1, name: "Player 1" } as any,
        } as PieceConfig);
        const victim = makeCreature(board, 2, 1, 0, OWNER_B);
        (board.getPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([victim]);
        const result = await nonEngulfSpreader.spread() as any;
        expect(result.destroyedPieceIds).toContain(victim.id);
        expect(victim.dead).toBe(true);
    });
});

// ── Piece.canPerformActions ───────────────────────────────────────────────────

describe("Piece.canPerformActions", () => {
    it("returns false when piece is dead", async () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        await piece.kill();
        expect(piece.canPerformActions).toBe(false);
    });

    it("returns false when piece is engulfed", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        piece.engulfed = true;
        expect(piece.canPerformActions).toBe(false);
    });

    it("returns true when piece has positive movement", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0);
        expect(piece.canPerformActions).toBe(true);
    });

    it("returns false when all combat/movement stats are 0", () => {
        const board = makeMockBoard();
        const piece = makeCreature(board, 1, 0, 0, OWNER_A, [], {
            movement: 0,
            combat: 0,
            rangedCombat: 0,
        });
        expect(piece.canPerformActions).toBe(false);
    });
});

// ── Piece.canSelect ───────────────────────────────────────────────────────────

describe("Piece.canSelect", () => {
    it("returns true for a mount with an active rider from current player", () => {
        const board = makeCombatBoard(false);
        (board as any).currentPlayer = OWNER_A;
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        (mount as any)._currentRider = rider;
        // rider.turnOver is false (fresh creature with stats > 0)
        expect(mount.canSelect).toBe(true);
    });

    it("returns false when piece is engulfed", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        piece.engulfed = true;
        expect(piece.canSelect).toBe(false);
    });

    it("returns false when piece has Structure status", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Structure],
        );
        expect(piece.canSelect).toBe(false);
    });

    it("returns false when all action stats are 0", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(board, 1, 0, 0, OWNER_A, [], {
            movement: 0,
            combat: 0,
            rangedCombat: 0,
        });
        expect(piece.canSelect).toBe(false);
    });

    it("returns true for a live active piece with available actions", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        expect(piece.canSelect).toBe(true);
    });
});

// ── Piece.canAttack ───────────────────────────────────────────────────────────

describe("Piece.canAttack", () => {
    it("returns true when there is an attackable adjacent enemy", () => {
        const board = makeCombatBoard(false);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        const enemy = makeCreature(board, 2, 1, 0, OWNER_B);
        (board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([enemy]);
        expect(attacker.canAttack).toBe(true);
    });

    it("returns false when no adjacent enemies can be attacked", () => {
        const board = makeCombatBoard(false);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        const ally = makeCreature(board, 2, 1, 0, OWNER_A);
        (board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([ally]);
        expect(attacker.canAttack).toBe(false);
    });

    it("returns false when attacker has already attacked", () => {
        const board = makeCombatBoard(false);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        (attacker as any)._attacked = true;
        const enemy = makeCreature(board, 2, 1, 0, OWNER_B);
        (board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([enemy]);
        expect(attacker.canAttack).toBe(false);
    });
});

// ── Piece.canRangedAttack ─────────────────────────────────────────────────────

describe("Piece.canRangedAttack", () => {
    it("returns true when a valid ranged target exists on the board", () => {
        const board = makeCombatBoard(false);
        const attacker = makeCreature(
            board, 1, 0, 0, OWNER_A, [],
            { rangedCombat: 3, range: 6 },
        );
        const enemy = makeCreature(board, 2, 3, 0, OWNER_B);
        // canRangedAttackPiece requires attacker.moved === true
        (attacker as any)._moved = true;
        (board as any).pieces = [attacker, enemy];
        expect(attacker.canRangedAttack).toBe(true);
    });

    it("returns false when rangedCombat stat is 0", () => {
        const board = makeCombatBoard(false);
        const attacker = makeCreature(board, 1, 0, 0, OWNER_A);
        // default rangedCombat = 0
        expect(attacker.canRangedAttack).toBe(false);
    });
});

// ── Piece.getNeighbours ───────────────────────────────────────────────────────

describe("Piece.getNeighbours", () => {
    it("delegates to board.getAdjacentPiecesAtPosition", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        const neighbour = makeCreature(board, 2, 1, 0, OWNER_B);
        (board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([neighbour]);
        const result = piece.getNeighbours();
        expect(result).toEqual([neighbour]);
        expect(board.getAdjacentPiecesAtPosition).toHaveBeenCalledWith(
            piece.position,
            expect.any(Function),
        );
    });
});

// ── Piece.getFirstEngagingPiece ───────────────────────────────────────────────

describe("Piece.getFirstEngagingPiece", () => {
    it("returns the first engageable neighbour", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        const enemy = makeCreature(board, 2, 1, 0, OWNER_B);
        (board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([enemy]);
        const result = piece.getFirstEngagingPiece();
        expect(result).toBe(enemy);
    });

    it("returns null when no neighbour can be engaged", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        const ally = makeCreature(board, 2, 1, 0, OWNER_A); // same owner
        (board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>)
            .mockReturnValue([ally]);
        const result = piece.getFirstEngagingPiece();
        expect(result).toBeNull();
    });
});

// ── Piece.findThreatPieces ────────────────────────────────────────────────────

describe("Piece.findThreatPieces", () => {
    it("includes an adjacent enemy as a melee threat", () => {
        const board = makeCombatBoard(false);
        const us = makeCreature(board, 1, 0, 0, OWNER_A);
        const enemy = makeCreature(board, 2, 1, 0, OWNER_B);
        (board as any).pieces = [us, enemy];
        const threats = us.findThreatPieces();
        expect(threats.has(enemy)).toBe(true);
    });

    it("excludes same-owner pieces from threats", () => {
        const board = makeCombatBoard(false);
        const us = makeCreature(board, 1, 0, 0, OWNER_A);
        const ally = makeCreature(board, 2, 1, 0, OWNER_A);
        (board as any).pieces = [us, ally];
        const threats = us.findThreatPieces();
        expect(threats.has(ally)).toBe(false);
    });

    it("includes a ranged attacker as a threat", () => {
        const board = makeCombatBoard(false);
        // us also needs range >= 3 so inRangedAttackRange(archer.position)
        // returns true (findThreatPieces checks this.inRangedAttackRange)
        const us = makeCreature(
            board, 1, 0, 0, OWNER_A, [],
            { rangedCombat: 3, range: 6 },
        );
        const archer = makeCreature(
            board, 2, 3, 0, OWNER_B, [],
            { rangedCombat: 3, range: 6 },
        );
        // archer needs to have moved for canRangedAttackPiece
        (archer as any)._moved = true;
        (board as any).pieces = [us, archer];
        const threats = us.findThreatPieces();
        expect(threats.has(archer)).toBe(true);
    });

    it("includes a spreader within distance 3 as a threat", () => {
        const board = makeCombatBoard(false);
        const us = makeCreature(board, 1, 0, 0, OWNER_A);
        const spreader = makeCreature(
            board, 2, 2, 0, OWNER_B, [UnitStatus.Spreads], {
                movement: 0,
                combat: 0,
            },
        );
        (board as any).pieces = [us, spreader];
        const threats = us.findThreatPieces();
        expect(threats.has(spreader)).toBe(true);
    });
});

// ── Piece.inMovementRange ─────────────────────────────────────────────────────

describe("Piece.inMovementRange", () => {
    it("returns false when the target is the same position", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(board, 1, 2, 2, OWNER_A);
        expect(piece.inMovementRange({ x: 2, y: 2 })).toBe(false);
    });

    it("returns false when mounted and target is more than 1.5 away", () => {
        const board = makeCombatBoard(false);
        const mount = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Mount],
        );
        const rider = makeCreature(board, 2, 0, 0, OWNER_A);
        (rider as any)._currentMount = mount;
        expect(rider.inMovementRange({ x: 5, y: 5 })).toBe(false);
    });

    it("returns true for a flying piece within fly-distance", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Flying],
            { movement: 4 },
        );
        // Fly distance to (3,0): approx 3 ≤ 4.5 → true
        expect(piece.inMovementRange({ x: 3, y: 0 })).toBe(true);
    });

    it("returns false for a flying piece beyond fly-distance", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Flying],
            { movement: 2 },
        );
        expect(piece.inMovementRange({ x: 10, y: 0 })).toBe(false);
    });

    it("returns false for ground piece when rangeGizmo has no path", () => {
        const board = makeCombatBoard(false);
        // Default mock: getPathTo returns null
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        expect(piece.inMovementRange({ x: 3, y: 0 })).toBe(false);
    });

    it("returns true for ground piece when rangeGizmo provides a path", () => {
        const board = makeCombatBoard(false);
        (board.rangeGizmo.getPathTo as ReturnType<typeof vi.fn>)
            .mockReturnValue([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        expect(piece.inMovementRange({ x: 3, y: 0 })).toBe(true);
    });
});

// ── Piece.inAttackRange ───────────────────────────────────────────────────────

describe("Piece.inAttackRange", () => {
    it("returns true for adjacent point (distance ≤ 1.5)", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        expect(piece.inAttackRange({ x: 1, y: 0 })).toBe(true);
    });

    it("returns false for far point when piece has already moved", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(board, 1, 0, 0, OWNER_A);
        (piece as any)._moved = true;
        expect(piece.inAttackRange({ x: 5, y: 5 })).toBe(false);
    });

    it("returns true for flying piece that can reach the point", () => {
        const board = makeCombatBoard(false);
        const piece = makeCreature(
            board, 1, 0, 0, OWNER_A, [UnitStatus.Flying],
            { movement: 6 },
        );
        // !moved && inMovementRange(point) && Flying → true
        expect(piece.inAttackRange({ x: 3, y: 0 })).toBe(true);
    });
});
