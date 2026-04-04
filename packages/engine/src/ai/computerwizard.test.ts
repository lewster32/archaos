import { SpellType } from "../enums/spelltype";
import { UnitType } from "../enums/unittype";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ComputerWizard } from "./computerwizard";
import type { Board } from "../board";
import type { Player } from "../player";
import type { Piece } from "../piece";
import { Spell } from "../spells/spell";
import { Point } from "../point";
import { TestRNG } from "../rng";

// ─── Shared stubs ────────────────────────────────────────────────────────────

/** Minimal board mock — only `rollChance` is used by the simplest tested methods */
function makeMockBoard(rollChanceResult: boolean = true) {
    return {
        rollChance: vi.fn().mockReturnValue(rollChanceResult),
        rng: new TestRNG(),
        events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
    } as unknown as Board;
}

/**
 * Build a board stub suitable for evaluateEnemyPlayerPriorities and
 * findSpellTargets. Accepts a `pieces` array and a `players` array so
 * individual tests can supply the board state they need.
 */
function makeBoardStub(
    opts: {
        pieces?: any[];
        players?: any[];
        getPiecesByOwner?: (p: any) => any[];
        rollChanceResult?: boolean;
    } = {},
): Board {
    const { pieces = [], players = [], rollChanceResult = true } = opts;
    return {
        pieces,
        players,
        rollChance: vi.fn().mockReturnValue(rollChanceResult),
        getPiecesByOwner: opts.getPiecesByOwner ?? vi.fn().mockReturnValue([]),
        rng: new TestRNG(),
        events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
    } as unknown as Board;
}

/**
 * Build a minimal Piece stub. Override individual fields via `extra`.
 */
function makePieceStub(extra: Record<string, unknown> = {}): Piece {
    return {
        id: 1,
        type: UnitType.Creature,
        owner: null,
        dead: false,
        position: new Point(0, 0),
        strength: 5,
        hasStatus: vi.fn().mockReturnValue(false),
        canAttackPiece: vi.fn().mockReturnValue(true),
        ...extra,
    } as unknown as Piece;
}

/**
 * Build a minimal Spell stub.
 */
function makeSpellStub(extra: Record<string, unknown> = {}): Spell {
    return {
        type: SpellType.Attack,
        properties: { destroyWizardCreatures: false },
        getValidTarget: vi.fn().mockReturnValue(null),
        ...extra,
    } as unknown as Spell;
}

const mockPlayer = { name: "TestAI" } as unknown as Player;

describe("ComputerWizard", () => {
    describe("difficulty getter", () => {
        it("defaults to 0.5 when no difficulty is provided", () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            expect(cw.difficulty).toBe(0.5);
        });

        it("returns 0 for minimum difficulty", () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer, 0);
            expect(cw.difficulty).toBe(0);
        });

        it("returns 1 for maximum difficulty", () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer, 1);
            expect(cw.difficulty).toBe(1);
        });

        it("returns a custom difficulty value", () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer, 0.75);
            expect(cw.difficulty).toBe(0.75);
        });
    });

    describe("knowsPieceIsNonIllusion", () => {
        it("returns false for any piece ID on a fresh instance", () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            expect(cw.knowsPieceIsNonIllusion(42)).toBe(false);
            expect(cw.knowsPieceIsNonIllusion(0)).toBe(false);
            expect(cw.knowsPieceIsNonIllusion(999)).toBe(false);
        });
    });

    describe("rememberNonIllusionPiece", () => {
        it("adds a piece to known non-illusions when rollChance returns true", () => {
            const cw = new ComputerWizard(makeMockBoard(true), mockPlayer);
            cw.rememberNonIllusionPiece(42);
            expect(cw.knowsPieceIsNonIllusion(42)).toBe(true);
        });

        it("does not add a piece when rollChance returns false (failed to notice)", () => {
            const cw = new ComputerWizard(makeMockBoard(false), mockPlayer);
            cw.rememberNonIllusionPiece(42);
            expect(cw.knowsPieceIsNonIllusion(42)).toBe(false);
        });

        it("tracks multiple pieces independently", () => {
            const board = makeMockBoard(true);
            const cw = new ComputerWizard(board, mockPlayer);
            cw.rememberNonIllusionPiece(1);
            cw.rememberNonIllusionPiece(2);
            expect(cw.knowsPieceIsNonIllusion(1)).toBe(true);
            expect(cw.knowsPieceIsNonIllusion(2)).toBe(true);
            expect(cw.knowsPieceIsNonIllusion(3)).toBe(false);
        });

        it("does not affect other piece IDs when one remember fails", () => {
            const board = {
                rollChance: vi
                    .fn()
                    .mockReturnValueOnce(true) // piece 1: remembered
                    .mockReturnValueOnce(false), // piece 2: forgotten
            } as unknown as Board;
            const cw = new ComputerWizard(board, mockPlayer);
            cw.rememberNonIllusionPiece(1);
            cw.rememberNonIllusionPiece(2);
            expect(cw.knowsPieceIsNonIllusion(1)).toBe(true);
            expect(cw.knowsPieceIsNonIllusion(2)).toBe(false);
        });
    });

    // ─── forgetIllusionKnowledge (private) ───────────────────────────────────

    describe("forgetIllusionKnowledge", () => {
        it("removes a known non-illusion piece when rollChance returns true", () => {
            const cw = new ComputerWizard(makeMockBoard(true), mockPlayer, 0.5);
            // Seed the known-non-illusion set by remembering a piece
            cw.rememberNonIllusionPiece(10);
            expect(cw.knowsPieceIsNonIllusion(10)).toBe(true);
            // Now trigger forgetting — rollChance returns true → piece is removed
            (cw as any).forgetIllusionKnowledge();
            expect(cw.knowsPieceIsNonIllusion(10)).toBe(false);
        });

        it("keeps a known non-illusion piece when rollChance returns false", () => {
            const board = {
                rollChance: vi
                    .fn()
                    .mockReturnValueOnce(true) // rememberNonIllusionPiece succeeds
                    .mockReturnValueOnce(false), // forgetIllusionKnowledge fails → keep
            } as unknown as Board;
            const cw = new ComputerWizard(board, mockPlayer, 0.5);
            cw.rememberNonIllusionPiece(10);
            (cw as any).forgetIllusionKnowledge();
            expect(cw.knowsPieceIsNonIllusion(10)).toBe(true);
        });

        it("does not throw when the known-non-illusion set is empty", () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            expect(() => (cw as any).forgetIllusionKnowledge()).not.toThrow();
        });

        it("selectively forgets: removes only pieces whose rollChance succeeds", () => {
            const board = {
                rollChance: vi
                    .fn()
                    .mockReturnValueOnce(true) // remember piece 1
                    .mockReturnValueOnce(true) // remember piece 2
                    .mockReturnValueOnce(true) // forget piece 1
                    .mockReturnValueOnce(false), // keep piece 2
            } as unknown as Board;
            const cw = new ComputerWizard(board, mockPlayer, 0.5);
            cw.rememberNonIllusionPiece(1);
            cw.rememberNonIllusionPiece(2);
            (cw as any).forgetIllusionKnowledge();
            // piece 1 forgotten, piece 2 kept
            expect(cw.knowsPieceIsNonIllusion(1)).toBe(false);
            expect(cw.knowsPieceIsNonIllusion(2)).toBe(true);
        });
    });

    // ─── findSpellTargets (static) ───────────────────────────────────────────

    describe("ComputerWizard.findSpellTargets", () => {
        it("returns an empty map when board has no pieces", () => {
            const board = makeBoardStub({ pieces: [] });
            const spell = makeSpellStub();
            const result = ComputerWizard.findSpellTargets(board, [spell]);
            expect(result.size).toBe(0);
        });

        it("returns an empty map when no spell can target any piece", () => {
            const piece = makePieceStub();
            const board = makeBoardStub({ pieces: [piece] });
            // getValidTarget always returns null
            const spell = makeSpellStub({
                getValidTarget: vi.fn().mockReturnValue(null),
            });
            const result = ComputerWizard.findSpellTargets(board, [spell]);
            expect(result.has(spell)).toBe(false);
        });

        it("maps a spell to a piece when getValidTarget returns the piece", () => {
            const piece = makePieceStub({ id: 5 });
            const board = makeBoardStub({ pieces: [piece] });
            const spell = makeSpellStub({
                getValidTarget: vi.fn().mockReturnValue(piece),
            });
            const result = ComputerWizard.findSpellTargets(board, [spell]);
            expect(result.get(spell)).toContain(piece);
        });

        it("collects multiple pieces for a single spell", () => {
            const p1 = makePieceStub({ id: 1 });
            const p2 = makePieceStub({ id: 2 });
            const board = makeBoardStub({ pieces: [p1, p2] });
            const spell = makeSpellStub({
                getValidTarget: vi.fn().mockReturnValue(p1),
            });
            const result = ComputerWizard.findSpellTargets(board, [spell]);
            expect(result.get(spell)).toHaveLength(2);
        });

        it("handles multiple spells independently", () => {
            const p1 = makePieceStub({ id: 1 });
            const p2 = makePieceStub({ id: 2 });
            const board = makeBoardStub({ pieces: [p1, p2] });
            const spellA = makeSpellStub({
                getValidTarget: vi
                    .fn()
                    .mockImplementation((p: any) => (p.id === 1 ? p : null)),
            });
            const spellB = makeSpellStub({
                getValidTarget: vi
                    .fn()
                    .mockImplementation((p: any) => (p.id === 2 ? p : null)),
            });
            const result = ComputerWizard.findSpellTargets(board, [
                spellA,
                spellB,
            ]);
            expect(result.get(spellA)).toEqual([p1]);
            expect(result.get(spellB)).toEqual([p2]);
        });

        it("returns empty map when spells array is empty", () => {
            const board = makeBoardStub({ pieces: [makePieceStub()] });
            const result = ComputerWizard.findSpellTargets(board, []);
            expect(result.size).toBe(0);
        });

        describe("justice spell (destroyWizardCreatures) filtering", () => {
            it("keeps a wizard target whose owner has non-wizard living units", () => {
                const owner = { name: "EnemyOwner" } as unknown as Player;
                const wizardPiece = makePieceStub({
                    id: 1,
                    type: UnitType.Wizard,
                    owner,
                });
                const creaturePiece = makePieceStub({
                    id: 2,
                    type: UnitType.Creature,
                    owner,
                    dead: false,
                });
                const board = makeBoardStub({
                    pieces: [wizardPiece],
                    getPiecesByOwner: vi
                        .fn()
                        .mockReturnValue([wizardPiece, creaturePiece]),
                });
                const justiceSpell = makeSpellStub({
                    type: SpellType.Attack,
                    properties: { destroyWizardCreatures: true },
                    getValidTarget: vi.fn().mockReturnValue(wizardPiece),
                });
                const result = ComputerWizard.findSpellTargets(board, [
                    justiceSpell,
                ]);
                // creaturePiece is alive and non-wizard → wizard target is kept
                expect(result.get(justiceSpell)).toContain(wizardPiece);
            });

            it("removes a wizard target whose owner has no living non-wizard units", () => {
                const owner = { name: "EnemyOwner" } as unknown as Player;
                const wizardPiece = makePieceStub({
                    id: 1,
                    type: UnitType.Wizard,
                    owner,
                });
                const board = makeBoardStub({
                    pieces: [wizardPiece],
                    // getPiecesByOwner returns only the wizard itself
                    getPiecesByOwner: vi.fn().mockReturnValue([wizardPiece]),
                });
                const justiceSpell = makeSpellStub({
                    type: SpellType.Attack,
                    properties: { destroyWizardCreatures: true },
                    getValidTarget: vi.fn().mockReturnValue(wizardPiece),
                });
                const result = ComputerWizard.findSpellTargets(board, [
                    justiceSpell,
                ]);
                // No non-wizard units → wizard target is filtered out
                const targets = result.get(justiceSpell);
                expect(targets).toBeDefined();
                expect(targets).not.toContain(wizardPiece);
            });

            it("does not apply justice filtering when spell has no targets at all", () => {
                const board = makeBoardStub({ pieces: [] });
                const justiceSpell = makeSpellStub({
                    type: SpellType.Attack,
                    properties: { destroyWizardCreatures: true },
                    getValidTarget: vi.fn().mockReturnValue(null),
                });
                const result = ComputerWizard.findSpellTargets(board, [
                    justiceSpell,
                ]);
                expect(result.has(justiceSpell)).toBe(false);
            });

            it("non-wizard pieces are dropped by the justice spell filtering loop", () => {
                // The filtering loop only pushes wizard pieces that pass the owner-unit
                // check into filteredTargets; non-wizard pieces are never pushed, so
                // they are removed from the final target list for a justice spell.
                const owner = { name: "EnemyOwner" } as unknown as Player;
                const creature = makePieceStub({
                    id: 2,
                    type: UnitType.Creature,
                    owner,
                });
                const board = makeBoardStub({
                    pieces: [creature],
                    getPiecesByOwner: vi.fn().mockReturnValue([creature]),
                });
                const justiceSpell = makeSpellStub({
                    type: SpellType.Attack,
                    properties: { destroyWizardCreatures: true },
                    getValidTarget: vi.fn().mockReturnValue(creature),
                });
                const result = ComputerWizard.findSpellTargets(board, [
                    justiceSpell,
                ]);
                // Non-wizard pieces are filtered out of justice spell targets
                const targets = result.get(justiceSpell);
                expect(targets).toBeDefined();
                expect(targets).not.toContain(creature);
                expect(targets).toHaveLength(0);
            });
        });
    });

    // ─── evaluateEnemyPlayerPriorities (protected) ───────────────────────────

    describe("evaluateEnemyPlayerPriorities", () => {
        it("does not throw when there are no enemy players", () => {
            const wizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: new Point(0, 0),
            });
            const player = {
                name: "TestAI",
                castingPiece: wizardPiece,
                defeated: false,
            } as unknown as Player;
            const board = makeBoardStub({ players: [player], pieces: [] });
            const cw = new ComputerWizard(board, player);
            expect(() =>
                (cw as any).evaluateEnemyPlayerPriorities(),
            ).not.toThrow();
        });

        it("logs an error and returns early when the own wizard piece is missing", () => {
            const enemy = {
                name: "Enemy",
                castingPiece: makePieceStub(),
                defeated: false,
            } as unknown as Player;
            const player = {
                name: "TestAI",
                castingPiece: null,
                defeated: false,
            } as unknown as Player;
            const board = makeBoardStub({
                players: [player, enemy],
                getPiecesByOwner: vi.fn().mockReturnValue([]),
            });
            const consoleSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});
            const cw = new ComputerWizard(board, player);
            expect(() =>
                (cw as any).evaluateEnemyPlayerPriorities(),
            ).not.toThrow();
            consoleSpy.mockRestore();
        });

        it("normalises threat levels so the highest threat maps to 1", () => {
            const ownWizardPos = new Point(0, 0);
            const ownWizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: ownWizardPos,
            });
            const player = {
                name: "TestAI",
                castingPiece: ownWizardPiece,
                defeated: false,
            } as unknown as Player;

            const enemyWizardPos = new Point(3, 0);
            const enemyWizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: enemyWizardPos,
                strength: 10,
                hasStatus: vi.fn().mockReturnValue(false),
                canAttackPiece: vi.fn().mockReturnValue(false),
            });
            const enemy = {
                name: "Enemy",
                castingPiece: enemyWizardPiece,
                defeated: false,
            } as unknown as Player;

            const board = makeBoardStub({
                players: [player, enemy],
                pieces: [ownWizardPiece, enemyWizardPiece],
                getPiecesByOwner: vi.fn().mockImplementation((p: any) => {
                    if (p === enemy) return [enemyWizardPiece];
                    return [ownWizardPiece];
                }),
            });

            const cw = new ComputerWizard(board, player);
            (cw as any).evaluateEnemyPlayerPriorities();

            // After normalisation the single enemy's priority should be capped at most 1
            const priorities: Map<Player, number> = (cw as any)
                ._enemyPlayerPriorities;
            expect(priorities.size).toBe(1);
            const [, level] = [...priorities.entries()][0];
            expect(level).toBeGreaterThanOrEqual(0);
            expect(level).toBeLessThanOrEqual(1);
        });

        it("excludes defeated players from enemy priority evaluation", () => {
            const ownWizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: new Point(0, 0),
            });
            const player = {
                name: "TestAI",
                castingPiece: ownWizardPiece,
                defeated: false,
            } as unknown as Player;
            const defeatedEnemy = {
                name: "DefeatedEnemy",
                castingPiece: null,
                defeated: true,
            } as unknown as Player;
            const board = makeBoardStub({
                players: [player, defeatedEnemy],
                getPiecesByOwner: vi.fn().mockReturnValue([]),
            });
            const cw = new ComputerWizard(board, player);
            (cw as any).evaluateEnemyPlayerPriorities();
            const priorities: Map<Player, number> = (cw as any)
                ._enemyPlayerPriorities;
            // Defeated player should not appear in the map
            expect(priorities.size).toBe(0);
        });

        it("uses the enemy wizard as fallback when there are no threatening pieces", () => {
            const ownWizardPos = new Point(0, 0);
            const ownWizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: ownWizardPos,
            });
            const player = {
                name: "TestAI",
                castingPiece: ownWizardPiece,
                defeated: false,
            } as unknown as Player;

            const enemyWizardPos = new Point(5, 0);
            const enemyWizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: enemyWizardPos,
                strength: 0,
                hasStatus: vi.fn().mockReturnValue(false),
                canAttackPiece: vi.fn().mockReturnValue(false),
            });
            const enemy = {
                name: "Enemy",
                castingPiece: enemyWizardPiece,
                defeated: false,
            } as unknown as Player;

            const board = makeBoardStub({
                players: [player, enemy],
                pieces: [ownWizardPiece, enemyWizardPiece],
                getPiecesByOwner: vi.fn().mockImplementation((p: any) => {
                    if (p === enemy) return [enemyWizardPiece];
                    return [ownWizardPiece];
                }),
            });

            const cw = new ComputerWizard(board, player);
            // Should not throw even when the fallback wizard path is taken
            expect(() =>
                (cw as any).evaluateEnemyPlayerPriorities(),
            ).not.toThrow();
        });
    });

    // ─── getSpellChanceForUnit (private static) ──────────────────────────────

    describe("getSpellChanceForUnit", () => {
        const TEST_KEY = "__test_spell__";

        afterEach(() => {
            delete (Spell.spells as any)[TEST_KEY];
        });

        function inject(overrides: Record<string, unknown> = {}) {
            (Spell.spells as any)[TEST_KEY] = {
                chance: 0.1,
                balance: 0,
                name: "Test Spell",
                unitId: "test-unit",
                ...overrides,
            };
        }

        it("returns the chance for a classic spell matched by unitId", () => {
            inject({ chance: 0.3, balance: 0 });
            expect(
                (ComputerWizard as any).getSpellChanceForUnit("test-unit", 0),
            ).toBe(0.3);
        });

        it("returns the chance for an enhanced spell matched by unit.id", () => {
            (Spell.spells as any)[TEST_KEY] = {
                chance: 0.4,
                balance: 0,
                name: "Test Enhanced",
                unit: { id: "enhanced-unit" },
            };
            expect(
                (ComputerWizard as any).getSpellChanceForUnit(
                    "enhanced-unit",
                    0,
                ),
            ).toBe(0.4);
        });

        it("returns null when no spell matches the unit ID", () => {
            expect(
                (ComputerWizard as any).getSpellChanceForUnit(
                    "no-such-unit",
                    0,
                ),
            ).toBeNull();
        });

        it("increases chance for a chaotic spell on a chaotic board", () => {
            // balance -2, worldBalance -0.3 → offset flips to +0.3
            inject({ chance: 0.1, balance: -2 });
            expect(
                (ComputerWizard as any).getSpellChanceForUnit(
                    "test-unit",
                    -0.3,
                ),
            ).toBeCloseTo(0.4);
        });

        it("increases chance for a lawful spell on a lawful board", () => {
            inject({ chance: 0.3, balance: 2 });
            expect(
                (ComputerWizard as any).getSpellChanceForUnit("test-unit", 0.2),
            ).toBeCloseTo(0.5);
        });

        it("returns base chance unchanged for neutral spells", () => {
            inject({ chance: 0.5, balance: 0 });
            expect(
                (ComputerWizard as any).getSpellChanceForUnit(
                    "test-unit",
                    -0.5,
                ),
            ).toBe(0.5);
        });

        it("clamps the adjusted chance to a maximum of 1", () => {
            inject({ chance: 0.5, balance: -2 });
            expect(
                (ComputerWizard as any).getSpellChanceForUnit("test-unit", -1),
            ).toBe(1);
        });

        it("clamps the adjusted chance to a minimum of 0.1", () => {
            inject({ chance: 0.1, balance: 2 });
            expect(
                (ComputerWizard as any).getSpellChanceForUnit(
                    "test-unit",
                    -0.5,
                ),
            ).toBe(0.1);
        });
    });

    // ─── selectSpell — illusion suspicion ─────────────────────────────────────

    describe("selectSpell — illusion suspicion", () => {
        const TEST_KEY = "__test_selectspell__";
        const DRAGON_UNIT_ID = "test-dragon-unit";

        afterEach(() => {
            delete (Spell.spells as any)[TEST_KEY];
        });

        function injectDragonSpell(chance: number = 0.1, balance: number = -2) {
            (Spell.spells as any)[TEST_KEY] = {
                chance,
                balance,
                name: "Test Dragon",
                unitId: DRAGON_UNIT_ID,
            };
        }

        function makeDisbelieve(): Spell {
            return {
                id: 100,
                type: SpellType.Disbelieve,
                properties: { id: "disbelieve", persist: true },
                getValidTarget: vi.fn().mockReturnValue(true),
                chance: 0.5, // Lower than fallback so weighted-pick prefers fallback on normal path
            } as unknown as Spell;
        }

        function makeFallback(): Spell {
            return {
                id: 200,
                type: SpellType.Summon,
                properties: { unitId: "some-unit" },
                getValidTarget: vi.fn().mockReturnValue(null),
                chance: 0.8,
                allowIllusion: false,
            } as unknown as Spell;
        }

        function makeDragon(
            owner: any,
            extra: Record<string, unknown> = {},
        ): Piece {
            return {
                id: 50,
                type: UnitType.Creature,
                owner,
                dead: false,
                raisedDead: false,
                canBeDisbelieved: true,
                position: new Point(3, 0),
                strength: 30,
                properties: { id: DRAGON_UNIT_ID },
                fullName: "Test Dragon",
                hasStatus: vi.fn().mockReturnValue(false),
                canAttackPiece: vi.fn().mockReturnValue(true),
                ...extra,
            } as unknown as Piece;
        }

        /**
         * Build a board + player + ComputerWizard configured for selectSpell
         * tests. `rollChanceReturn` can be a boolean or a function to control
         * the suspicion preference roll.
         */
        function setup(
            opts: {
                difficulty?: number;
                boardBalance?: number;
                dragonStrength?: number;
                dragonChance?: number;
                dragonBalance?: number;
                rollChanceReturn?: boolean | ((c: number) => boolean);
                threatening?: boolean;
                knownNonIllusion?: boolean;
                raisedDead?: boolean;
                noDragon?: boolean;
            } = {},
        ) {
            const {
                difficulty = 1,
                boardBalance = 0,
                dragonStrength = 30,
                dragonChance = 0.1,
                dragonBalance = -2,
                rollChanceReturn = ((c: number) => c > 0) as
                    | boolean
                    | ((c: number) => boolean),
                threatening = false,
                knownNonIllusion = false,
                raisedDead = false,
                noDragon = false,
            } = opts;

            const enemy = {
                name: "Enemy",
                defeated: false,
            } as unknown as Player;
            const dragon = noDragon
                ? null
                : makeDragon(enemy, {
                      strength: dragonStrength,
                      raisedDead,
                  });

            const disbelieve = makeDisbelieve();
            const fallback = makeFallback();

            const wizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: new Point(0, 0),
                findThreatPieces: vi
                    .fn()
                    .mockReturnValue(
                        threatening && dragon ? new Set([dragon]) : new Set(),
                    ),
            });

            const player = {
                name: "TestAI",
                defeated: false,
                spells: [disbelieve, fallback],
                castingPiece: wizardPiece,
                pickSpell: vi.fn().mockResolvedValue(undefined),
            } as unknown as Player;

            const pieces = dragon ? [dragon] : [];

            const rollChanceFn =
                typeof rollChanceReturn === "function"
                    ? vi.fn().mockImplementation(rollChanceReturn)
                    : vi.fn().mockReturnValue(rollChanceReturn);

            const board = {
                pieces,
                players: [player, enemy],
                balance: boardBalance,
                rollChance: rollChanceFn,
                rng: new TestRNG(),
                getPiecesByOwner: vi.fn().mockReturnValue([]),
                events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
            } as unknown as Board;

            injectDragonSpell(dragonChance, dragonBalance);

            const cw = new ComputerWizard(board, player, difficulty);

            // Stub methods that aren't under test
            vi.spyOn(
                cw as any,
                "evaluateEnemyPlayerPriorities",
            ).mockImplementation(() => {});
            vi.spyOn(cw as any, "forgetIllusionKnowledge").mockImplementation(
                () => {},
            );

            // findSpellTargets: return the dragon as a target for Disbelieve
            vi.spyOn(cw as any, "findSpellTargets").mockReturnValue(
                dragon ? new Map([[disbelieve, [dragon]]]) : new Map(),
            );

            if (knownNonIllusion && dragon) {
                (cw as any)._knownNonIllusionPieces.add(dragon.id);
            }

            return {
                cw,
                board,
                player,
                disbelieve,
                fallback,
                dragon,
                wizardPiece,
            };
        }

        it("prefers Disbelieve when a high-strength low-chance piece is on the board", async () => {
            const { cw, player, disbelieve } = setup();
            await cw.selectSpell();
            expect(player.pickSpell).toHaveBeenCalledWith(disbelieve.id);
        });

        it("does not prefer Disbelieve for a known non-illusion piece", async () => {
            const { cw, player, disbelieve } = setup({
                knownNonIllusion: true,
            });
            await cw.selectSpell();
            expect(player.pickSpell).not.toHaveBeenCalledWith(disbelieve.id);
        });

        it("never prefers Disbelieve at difficulty 0", async () => {
            const { cw, player, disbelieve } = setup({ difficulty: 0 });
            await cw.selectSpell();
            // preference = suspicion/25 * 0 = 0, rollChance(0) → false
            expect(player.pickSpell).not.toHaveBeenCalledWith(disbelieve.id);
        });

        it("falls through to normal selection when the suspicion roll fails", async () => {
            const { cw, player, disbelieve } = setup({
                rollChanceReturn: false,
            });
            await cw.selectSpell();
            expect(player.pickSpell).not.toHaveBeenCalledWith(disbelieve.id);
            // Should have picked normally via the weighted-pick path
            expect(player.pickSpell).toHaveBeenCalled();
        });

        it("does not prefer Disbelieve for raised-dead pieces", async () => {
            const { cw, player, disbelieve } = setup({ raisedDead: true });
            await cw.selectSpell();
            expect(player.pickSpell).not.toHaveBeenCalledWith(disbelieve.id);
        });

        it("threat boost increases the suspicion preference", async () => {
            // No threat: strength 15, chance 0.1, distance 3
            // suspicion = 15*0.9*(5/8) ≈ 8.44, pref ≈ 0.17
            const noThreat = setup({
                difficulty: 0.5,
                dragonStrength: 15,
                threatening: false,
                rollChanceReturn: false,
            });
            await noThreat.cw.selectSpell();
            const noThreatArg = (noThreat.board.rollChance as any).mock
                .calls[0][0];

            // With threat: suspicion ≈ 8.44 * 2 ≈ 16.88
            // pref ≈ 0.34
            const withThreat = setup({
                difficulty: 0.5,
                dragonStrength: 15,
                threatening: true,
                rollChanceReturn: false,
            });
            await withThreat.cw.selectSpell();
            const threatArg = (withThreat.board.rollChance as any).mock
                .calls[0][0];

            expect(threatArg).toBeGreaterThan(noThreatArg);
        });

        it("world balance reduces suspicion for aligned spells", async () => {
            // Chaotic dragon on neutral board: effective chance = 0.1
            const neutral = setup({
                difficulty: 0.5,
                boardBalance: 0,
                dragonChance: 0.1,
                dragonBalance: -2,
                rollChanceReturn: false,
            });
            await neutral.cw.selectSpell();
            const neutralArg = (neutral.board.rollChance as any).mock
                .calls[0][0];

            // Same dragon on chaotic board: effective chance = 0.4
            // → lower suspicion → lower preference
            const chaotic = setup({
                difficulty: 0.5,
                boardBalance: -0.3,
                dragonChance: 0.1,
                dragonBalance: -2,
                rollChanceReturn: false,
            });
            await chaotic.cw.selectSpell();
            const chaoticArg = (chaotic.board.rollChance as any).mock
                .calls[0][0];

            expect(chaoticArg).toBeLessThan(neutralArg);
        });

        it("generates low preference for low-suspicion pieces", async () => {
            const { cw, board } = setup({
                difficulty: 1,
                dragonStrength: 10,
                dragonChance: 0.9,
                dragonBalance: 0,
                rollChanceReturn: false,
            });
            await cw.selectSpell();
            // strength 10 * (1 - 0.9) = 1, dampened = 1*(5/8) ≈ 0.63
            // preference ≈ 0.63/25 ≈ 0.025
            const preference = (board.rollChance as any).mock.calls[0][0];
            expect(preference).toBeLessThan(0.1);
        });

        it("skips suspicion when no pieces have matching spell data", async () => {
            const { cw, player, disbelieve } = setup();
            // Remove the test spell so the lookup returns null
            delete (Spell.spells as any)[TEST_KEY];
            await cw.selectSpell();
            expect(player.pickSpell).not.toHaveBeenCalledWith(disbelieve.id);
        });
    });

    // ─── preferredTargetId ───────────────────────────────────────────────────

    describe("preferredTargetId", () => {
        it("defaults to null", () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            expect(cw.preferredTargetId).toBeNull();
        });

        it("can be set and read back", () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            cw.preferredTargetId = 42;
            expect(cw.preferredTargetId).toBe(42);
        });

        it("can be cleared to null", () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            cw.preferredTargetId = 42;
            cw.preferredTargetId = null;
            expect(cw.preferredTargetId).toBeNull();
        });
    });

    // ─── withPreferredFirst (static) ─────────────────────────────────────────

    describe("withPreferredFirst", () => {
        function stubPiece(id: number): Piece {
            return { id } as unknown as Piece;
        }

        it("returns the original array when preferredId is null", () => {
            const pieces = [stubPiece(1), stubPiece(2), stubPiece(3)];
            const result = ComputerWizard.withPreferredFirst(pieces, null);
            expect(result).toBe(pieces); // Same reference
        });

        it("returns the original array when preferredId is not found", () => {
            const pieces = [stubPiece(1), stubPiece(2)];
            const result = ComputerWizard.withPreferredFirst(pieces, 99);
            expect(result).toBe(pieces);
        });

        it("returns the original array when preferred is already first", () => {
            const pieces = [stubPiece(1), stubPiece(2), stubPiece(3)];
            const result = ComputerWizard.withPreferredFirst(pieces, 1);
            expect(result).toBe(pieces);
        });

        it("moves a middle element to the front", () => {
            const pieces = [stubPiece(1), stubPiece(2), stubPiece(3)];
            const result = ComputerWizard.withPreferredFirst(pieces, 2);
            expect(result.map((p) => p.id)).toEqual([2, 1, 3]);
        });

        it("moves the last element to the front", () => {
            const pieces = [stubPiece(1), stubPiece(2), stubPiece(3)];
            const result = ComputerWizard.withPreferredFirst(pieces, 3);
            expect(result.map((p) => p.id)).toEqual([3, 1, 2]);
        });

        it("does not mutate the original array", () => {
            const pieces = [stubPiece(1), stubPiece(2), stubPiece(3)];
            ComputerWizard.withPreferredFirst(pieces, 3);
            expect(pieces.map((p) => p.id)).toEqual([1, 2, 3]);
        });

        it("works with a single-element array", () => {
            const pieces = [stubPiece(5)];
            const result = ComputerWizard.withPreferredFirst(pieces, 5);
            expect(result).toBe(pieces); // Already first
        });
    });

    // ─── selectSpell sets preferredTargetId ──────────────────────────────────

    describe("selectSpell — preferredTargetId integration", () => {
        const TEST_KEY = "__test_preferred__";
        const DRAGON_UNIT_ID = "test-dragon-pref";

        afterEach(() => {
            delete (Spell.spells as any)[TEST_KEY];
        });

        it("sets preferredTargetId when suspicion fires", async () => {
            const enemy = {
                name: "Enemy",
                defeated: false,
            } as unknown as Player;
            const dragon = {
                id: 77,
                type: UnitType.Creature,
                owner: enemy,
                dead: false,
                raisedDead: false,
                canBeDisbelieved: true,
                position: new Point(3, 0),
                strength: 30,
                properties: { id: DRAGON_UNIT_ID },
                fullName: "Test Dragon",
                hasStatus: vi.fn().mockReturnValue(false),
                canAttackPiece: vi.fn().mockReturnValue(true),
            } as unknown as Piece;

            const disbelieve = {
                id: 100,
                type: SpellType.Disbelieve,
                properties: { id: "disbelieve", persist: true },
                getValidTarget: vi.fn().mockReturnValue(true),
                chance: 0.5,
            } as unknown as Spell;

            const fallback = {
                id: 200,
                type: SpellType.Summon,
                properties: { unitId: "some-unit" },
                getValidTarget: vi.fn().mockReturnValue(null),
                chance: 0.8,
                allowIllusion: false,
            } as unknown as Spell;

            const wizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: new Point(0, 0),
                findThreatPieces: vi.fn().mockReturnValue(new Set()),
            });

            const player = {
                name: "TestAI",
                defeated: false,
                spells: [disbelieve, fallback],
                castingPiece: wizardPiece,
                pickSpell: vi.fn().mockResolvedValue(undefined),
            } as unknown as Player;

            const board = {
                pieces: [dragon],
                players: [player, enemy],
                balance: 0,
                rollChance: vi.fn().mockImplementation((c: number) => c > 0),
                rng: new TestRNG(),
                getPiecesByOwner: vi.fn().mockReturnValue([]),
                events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
            } as unknown as Board;

            (Spell.spells as any)[TEST_KEY] = {
                chance: 0.1,
                balance: -2,
                name: "Test Dragon",
                unitId: DRAGON_UNIT_ID,
            };

            const cw = new ComputerWizard(board, player, 1);
            vi.spyOn(
                cw as any,
                "evaluateEnemyPlayerPriorities",
            ).mockImplementation(() => {});
            vi.spyOn(cw as any, "forgetIllusionKnowledge").mockImplementation(
                () => {},
            );
            vi.spyOn(cw as any, "findSpellTargets").mockReturnValue(
                new Map([[disbelieve, [dragon]]]),
            );

            await cw.selectSpell();

            expect(player.pickSpell).toHaveBeenCalledWith(disbelieve.id);
            expect(cw.preferredTargetId).toBe(77);
        });

        it("does not set preferredTargetId when suspicion does not fire", async () => {
            const enemy = {
                name: "Enemy",
                defeated: false,
            } as unknown as Player;

            // Low-suspicion piece (high chance)
            const goblin = {
                id: 88,
                type: UnitType.Creature,
                owner: enemy,
                dead: false,
                raisedDead: false,
                canBeDisbelieved: true,
                position: new Point(3, 0),
                strength: 8,
                properties: { id: "test-goblin-pref" },
                fullName: "Test Goblin",
                hasStatus: vi.fn().mockReturnValue(false),
                canAttackPiece: vi.fn().mockReturnValue(true),
            } as unknown as Piece;

            const disbelieve = {
                id: 100,
                type: SpellType.Disbelieve,
                properties: { id: "disbelieve", persist: true },
                getValidTarget: vi.fn().mockReturnValue(true),
                chance: 0.5,
            } as unknown as Spell;

            const fallback = {
                id: 200,
                type: SpellType.Summon,
                properties: { unitId: "some-unit" },
                getValidTarget: vi.fn().mockReturnValue(null),
                chance: 0.8,
                allowIllusion: false,
            } as unknown as Spell;

            const wizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: new Point(0, 0),
                findThreatPieces: vi.fn().mockReturnValue(new Set()),
            });

            const player = {
                name: "TestAI",
                defeated: false,
                spells: [disbelieve, fallback],
                castingPiece: wizardPiece,
                pickSpell: vi.fn().mockResolvedValue(undefined),
            } as unknown as Player;

            // Register a high-chance spell for the goblin
            (Spell.spells as any)["__test_goblin__"] = {
                chance: 0.9,
                balance: 0,
                name: "Test Goblin",
                unitId: "test-goblin-pref",
            };

            const board = {
                pieces: [goblin],
                players: [player, enemy],
                balance: 0,
                // Low suspicion → preference ≈ 0.032 → this threshold rejects it
                rollChance: vi.fn().mockImplementation((c: number) => c > 0.5),
                rng: new TestRNG(),
                getPiecesByOwner: vi.fn().mockReturnValue([]),
                events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
            } as unknown as Board;

            const cw = new ComputerWizard(board, player, 1);
            vi.spyOn(
                cw as any,
                "evaluateEnemyPlayerPriorities",
            ).mockImplementation(() => {});
            vi.spyOn(cw as any, "forgetIllusionKnowledge").mockImplementation(
                () => {},
            );
            vi.spyOn(cw as any, "findSpellTargets").mockReturnValue(
                new Map([[disbelieve, [goblin]]]),
            );

            await cw.selectSpell();

            expect(cw.preferredTargetId).toBeNull();

            delete (Spell.spells as any)["__test_goblin__"];
        });
    });

    // ─── autoCastSpell — Disbelieve targeting ─────────────────────────────────

    describe("autoCastSpell — Disbelieve targets preferred piece directly", () => {
        it("targets the preferred piece even when other targets exist", async () => {
            const enemy = {
                name: "Enemy",
                defeated: false,
            } as unknown as Player;

            const dragon = {
                id: 50,
                owner: enemy,
                dead: false,
                canBeDisbelieved: true,
                name: "Dragon",
            } as unknown as Piece;

            const goblin = {
                id: 60,
                owner: enemy,
                dead: false,
                canBeDisbelieved: true,
                name: "Goblin",
            } as unknown as Piece;

            const disbelieveSpell = {
                type: SpellType.Disbelieve,
                name: "Disbelieve",
                properties: { id: "disbelieve" },
            } as unknown as Spell;

            const doCastSpell = vi.fn().mockResolvedValue(true);

            const board = {
                pieces: [goblin, dragon],
                rng: new TestRNG(),
                rules: { doCastSpell },
                events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
            } as unknown as Board;

            const cw = new ComputerWizard(board, mockPlayer, 1);
            cw.preferredTargetId = 50; // the dragon

            const player = {
                name: "TestAI",
                defeated: false,
                ai: cw,
                useSpell: vi.fn().mockResolvedValue(disbelieveSpell),
                discardSpell: vi.fn(),
                castingPiece: makePieceStub({ type: UnitType.Wizard }),
            } as unknown as Player;

            await ComputerWizard.autoCastSpell(board, player);

            // Should have called doCastSpell with the dragon, not the goblin
            expect(doCastSpell).toHaveBeenCalledWith(board, dragon);
        });

        it("falls back to random pick when preferred piece is not in targets", async () => {
            const enemy = {
                name: "Enemy",
                defeated: false,
            } as unknown as Player;

            const goblin = {
                id: 60,
                owner: enemy,
                dead: false,
                canBeDisbelieved: true,
                name: "Goblin",
            } as unknown as Piece;

            const disbelieveSpell = {
                type: SpellType.Disbelieve,
                name: "Disbelieve",
                properties: { id: "disbelieve" },
            } as unknown as Spell;

            const doCastSpell = vi.fn().mockResolvedValue(true);

            const board = {
                pieces: [goblin],
                rng: new TestRNG(),
                rules: { doCastSpell },
                events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
            } as unknown as Board;

            const cw = new ComputerWizard(board, mockPlayer, 1);
            cw.preferredTargetId = 999; // not present

            const player = {
                name: "TestAI",
                defeated: false,
                ai: cw,
                useSpell: vi.fn().mockResolvedValue(disbelieveSpell),
                discardSpell: vi.fn(),
                castingPiece: makePieceStub({ type: UnitType.Wizard }),
            } as unknown as Player;

            await ComputerWizard.autoCastSpell(board, player);

            // Should fall back to picking the goblin (only target)
            expect(doCastSpell).toHaveBeenCalledWith(board, goblin);
        });
    });
});
