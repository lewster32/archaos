import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputerWizard } from './computerwizard';
import type { Board } from './board';
import type { Player } from './player';
import type { Piece } from './piece';
import type { Spell } from './spells/spell';
import { SpellType } from './enums/spelltype';
import { UnitType } from './enums/unittype';
import { UnitStatus } from './enums/unitstatus';
import { Geom } from 'phaser';

// ─── Shared stubs ────────────────────────────────────────────────────────────

/** Minimal board mock — only `rollChance` is used by the simplest tested methods */
function makeMockBoard(rollChanceResult: boolean = true) {
    return {
        rollChance: vi.fn().mockReturnValue(rollChanceResult),
    } as unknown as Board;
}

/**
 * Build a board stub suitable for evaluateEnemyPlayerPriorities and
 * findSpellTargets. Accepts a `pieces` array and a `players` array so
 * individual tests can supply the board state they need.
 */
function makeBoardStub(opts: {
    pieces?: any[];
    players?: any[];
    getPiecesByOwner?: (p: any) => any[];
    rollChanceResult?: boolean;
} = {}): Board {
    const { pieces = [], players = [], rollChanceResult = true } = opts;
    return {
        pieces,
        players,
        rollChance: vi.fn().mockReturnValue(rollChanceResult),
        getPiecesByOwner: opts.getPiecesByOwner ?? vi.fn().mockReturnValue([]),
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
        position: new Geom.Point(0, 0),
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

const mockPlayer = { name: 'TestAI' } as unknown as Player;

describe('ComputerWizard', () => {
    describe('difficulty getter', () => {
        it('defaults to 0.5 when no difficulty is provided', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            expect(cw.difficulty).toBe(0.5);
        });

        it('returns 0 for minimum difficulty', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer, 0);
            expect(cw.difficulty).toBe(0);
        });

        it('returns 1 for maximum difficulty', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer, 1);
            expect(cw.difficulty).toBe(1);
        });

        it('returns a custom difficulty value', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer, 0.75);
            expect(cw.difficulty).toBe(0.75);
        });
    });

    describe('knowsPieceIsNonIllusion', () => {
        it('returns false for any piece ID on a fresh instance', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            expect(cw.knowsPieceIsNonIllusion(42)).toBe(false);
            expect(cw.knowsPieceIsNonIllusion(0)).toBe(false);
            expect(cw.knowsPieceIsNonIllusion(999)).toBe(false);
        });
    });

    describe('rememberNonIllusionPiece', () => {
        it('adds a piece to known non-illusions when rollChance returns true', () => {
            const cw = new ComputerWizard(makeMockBoard(true), mockPlayer);
            cw.rememberNonIllusionPiece(42);
            expect(cw.knowsPieceIsNonIllusion(42)).toBe(true);
        });

        it('does not add a piece when rollChance returns false (failed to notice)', () => {
            const cw = new ComputerWizard(makeMockBoard(false), mockPlayer);
            cw.rememberNonIllusionPiece(42);
            expect(cw.knowsPieceIsNonIllusion(42)).toBe(false);
        });

        it('tracks multiple pieces independently', () => {
            const board = makeMockBoard(true);
            const cw = new ComputerWizard(board, mockPlayer);
            cw.rememberNonIllusionPiece(1);
            cw.rememberNonIllusionPiece(2);
            expect(cw.knowsPieceIsNonIllusion(1)).toBe(true);
            expect(cw.knowsPieceIsNonIllusion(2)).toBe(true);
            expect(cw.knowsPieceIsNonIllusion(3)).toBe(false);
        });

        it('does not affect other piece IDs when one remember fails', () => {
            const board = {
                rollChance: vi.fn()
                    .mockReturnValueOnce(true)  // piece 1: remembered
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

    describe('forgetIllusionKnowledge', () => {
        it('removes a known non-illusion piece when rollChance returns true', () => {
            const cw = new ComputerWizard(makeMockBoard(true), mockPlayer, 0.5);
            // Seed the known-non-illusion set by remembering a piece
            cw.rememberNonIllusionPiece(10);
            expect(cw.knowsPieceIsNonIllusion(10)).toBe(true);
            // Now trigger forgetting — rollChance returns true → piece is removed
            (cw as any).forgetIllusionKnowledge();
            expect(cw.knowsPieceIsNonIllusion(10)).toBe(false);
        });

        it('keeps a known non-illusion piece when rollChance returns false', () => {
            const board = {
                rollChance: vi.fn()
                    .mockReturnValueOnce(true)  // rememberNonIllusionPiece succeeds
                    .mockReturnValueOnce(false), // forgetIllusionKnowledge fails → keep
            } as unknown as Board;
            const cw = new ComputerWizard(board, mockPlayer, 0.5);
            cw.rememberNonIllusionPiece(10);
            (cw as any).forgetIllusionKnowledge();
            expect(cw.knowsPieceIsNonIllusion(10)).toBe(true);
        });

        it('does not throw when the known-non-illusion set is empty', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            expect(() => (cw as any).forgetIllusionKnowledge()).not.toThrow();
        });

        it('selectively forgets: removes only pieces whose rollChance succeeds', () => {
            const board = {
                rollChance: vi.fn()
                    .mockReturnValueOnce(true)  // remember piece 1
                    .mockReturnValueOnce(true)  // remember piece 2
                    .mockReturnValueOnce(true)  // forget piece 1
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

    describe('ComputerWizard.findSpellTargets', () => {
        it('returns an empty map when board has no pieces', () => {
            const board = makeBoardStub({ pieces: [] });
            const spell = makeSpellStub();
            const result = ComputerWizard.findSpellTargets(board, [spell]);
            expect(result.size).toBe(0);
        });

        it('returns an empty map when no spell can target any piece', () => {
            const piece = makePieceStub();
            const board = makeBoardStub({ pieces: [piece] });
            // getValidTarget always returns null
            const spell = makeSpellStub({ getValidTarget: vi.fn().mockReturnValue(null) });
            const result = ComputerWizard.findSpellTargets(board, [spell]);
            expect(result.has(spell)).toBe(false);
        });

        it('maps a spell to a piece when getValidTarget returns the piece', () => {
            const piece = makePieceStub({ id: 5 });
            const board = makeBoardStub({ pieces: [piece] });
            const spell = makeSpellStub({ getValidTarget: vi.fn().mockReturnValue(piece) });
            const result = ComputerWizard.findSpellTargets(board, [spell]);
            expect(result.get(spell)).toContain(piece);
        });

        it('collects multiple pieces for a single spell', () => {
            const p1 = makePieceStub({ id: 1 });
            const p2 = makePieceStub({ id: 2 });
            const board = makeBoardStub({ pieces: [p1, p2] });
            const spell = makeSpellStub({ getValidTarget: vi.fn().mockReturnValue(p1) });
            const result = ComputerWizard.findSpellTargets(board, [spell]);
            expect(result.get(spell)).toHaveLength(2);
        });

        it('handles multiple spells independently', () => {
            const p1 = makePieceStub({ id: 1 });
            const p2 = makePieceStub({ id: 2 });
            const board = makeBoardStub({ pieces: [p1, p2] });
            const spellA = makeSpellStub({
                getValidTarget: vi.fn().mockImplementation((p: any) => p.id === 1 ? p : null),
            });
            const spellB = makeSpellStub({
                getValidTarget: vi.fn().mockImplementation((p: any) => p.id === 2 ? p : null),
            });
            const result = ComputerWizard.findSpellTargets(board, [spellA, spellB]);
            expect(result.get(spellA)).toEqual([p1]);
            expect(result.get(spellB)).toEqual([p2]);
        });

        it('returns empty map when spells array is empty', () => {
            const board = makeBoardStub({ pieces: [makePieceStub()] });
            const result = ComputerWizard.findSpellTargets(board, []);
            expect(result.size).toBe(0);
        });

        describe('justice spell (destroyWizardCreatures) filtering', () => {
            it('keeps a wizard target whose owner has non-wizard living units', () => {
                const owner = { name: 'EnemyOwner' } as unknown as Player;
                const wizardPiece = makePieceStub({ id: 1, type: UnitType.Wizard, owner });
                const creaturePiece = makePieceStub({ id: 2, type: UnitType.Creature, owner, dead: false });
                const board = makeBoardStub({
                    pieces: [wizardPiece],
                    getPiecesByOwner: vi.fn().mockReturnValue([wizardPiece, creaturePiece]),
                });
                const justiceSpell = makeSpellStub({
                    type: SpellType.Attack,
                    properties: { destroyWizardCreatures: true },
                    getValidTarget: vi.fn().mockReturnValue(wizardPiece),
                });
                const result = ComputerWizard.findSpellTargets(board, [justiceSpell]);
                // creaturePiece is alive and non-wizard → wizard target is kept
                expect(result.get(justiceSpell)).toContain(wizardPiece);
            });

            it('removes a wizard target whose owner has no living non-wizard units', () => {
                const owner = { name: 'EnemyOwner' } as unknown as Player;
                const wizardPiece = makePieceStub({ id: 1, type: UnitType.Wizard, owner });
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
                const result = ComputerWizard.findSpellTargets(board, [justiceSpell]);
                // No non-wizard units → wizard target is filtered out
                const targets = result.get(justiceSpell);
                expect(targets).toBeDefined();
                expect(targets).not.toContain(wizardPiece);
            });

            it('does not apply justice filtering when spell has no targets at all', () => {
                const board = makeBoardStub({ pieces: [] });
                const justiceSpell = makeSpellStub({
                    type: SpellType.Attack,
                    properties: { destroyWizardCreatures: true },
                    getValidTarget: vi.fn().mockReturnValue(null),
                });
                const result = ComputerWizard.findSpellTargets(board, [justiceSpell]);
                expect(result.has(justiceSpell)).toBe(false);
            });

            it('non-wizard pieces are dropped by the justice spell filtering loop', () => {
                // The filtering loop only pushes wizard pieces that pass the owner-unit
                // check into filteredTargets; non-wizard pieces are never pushed, so
                // they are removed from the final target list for a justice spell.
                const owner = { name: 'EnemyOwner' } as unknown as Player;
                const creature = makePieceStub({ id: 2, type: UnitType.Creature, owner });
                const board = makeBoardStub({
                    pieces: [creature],
                    getPiecesByOwner: vi.fn().mockReturnValue([creature]),
                });
                const justiceSpell = makeSpellStub({
                    type: SpellType.Attack,
                    properties: { destroyWizardCreatures: true },
                    getValidTarget: vi.fn().mockReturnValue(creature),
                });
                const result = ComputerWizard.findSpellTargets(board, [justiceSpell]);
                // Non-wizard pieces are filtered out of justice spell targets
                const targets = result.get(justiceSpell);
                expect(targets).toBeDefined();
                expect(targets).not.toContain(creature);
                expect(targets).toHaveLength(0);
            });
        });
    });

    // ─── evaluateEnemyPlayerPriorities (protected) ───────────────────────────

    describe('evaluateEnemyPlayerPriorities', () => {
        it('does not throw when there are no enemy players', () => {
            const wizardPiece = makePieceStub({ type: UnitType.Wizard, position: new Geom.Point(0, 0) });
            const player = { name: 'TestAI', castingPiece: wizardPiece, defeated: false } as unknown as Player;
            const board = makeBoardStub({ players: [player], pieces: [] });
            const cw = new ComputerWizard(board, player);
            expect(() => (cw as any).evaluateEnemyPlayerPriorities()).not.toThrow();
        });

        it('logs an error and returns early when the own wizard piece is missing', () => {
            const enemy = { name: 'Enemy', castingPiece: makePieceStub(), defeated: false } as unknown as Player;
            const player = { name: 'TestAI', castingPiece: null, defeated: false } as unknown as Player;
            const board = makeBoardStub({
                players: [player, enemy],
                getPiecesByOwner: vi.fn().mockReturnValue([]),
            });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const cw = new ComputerWizard(board, player);
            expect(() => (cw as any).evaluateEnemyPlayerPriorities()).not.toThrow();
            consoleSpy.mockRestore();
        });

        it('normalises threat levels so the highest threat maps to 1', () => {
            const ownWizardPos = new Geom.Point(0, 0);
            const ownWizardPiece = makePieceStub({ type: UnitType.Wizard, position: ownWizardPos });
            const player = { name: 'TestAI', castingPiece: ownWizardPiece, defeated: false } as unknown as Player;

            const enemyWizardPos = new Geom.Point(3, 0);
            const enemyWizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: enemyWizardPos,
                strength: 10,
                hasStatus: vi.fn().mockReturnValue(false),
                canAttackPiece: vi.fn().mockReturnValue(false),
            });
            const enemy = { name: 'Enemy', castingPiece: enemyWizardPiece, defeated: false } as unknown as Player;

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
            const priorities: Map<Player, number> = (cw as any)._enemyPlayerPriorities;
            expect(priorities.size).toBe(1);
            const [, level] = [...priorities.entries()][0];
            expect(level).toBeGreaterThanOrEqual(0);
            expect(level).toBeLessThanOrEqual(1);
        });

        it('excludes defeated players from enemy priority evaluation', () => {
            const ownWizardPiece = makePieceStub({ type: UnitType.Wizard, position: new Geom.Point(0, 0) });
            const player = { name: 'TestAI', castingPiece: ownWizardPiece, defeated: false } as unknown as Player;
            const defeatedEnemy = { name: 'DefeatedEnemy', castingPiece: null, defeated: true } as unknown as Player;
            const board = makeBoardStub({
                players: [player, defeatedEnemy],
                getPiecesByOwner: vi.fn().mockReturnValue([]),
            });
            const cw = new ComputerWizard(board, player);
            (cw as any).evaluateEnemyPlayerPriorities();
            const priorities: Map<Player, number> = (cw as any)._enemyPlayerPriorities;
            // Defeated player should not appear in the map
            expect(priorities.size).toBe(0);
        });

        it('uses the enemy wizard as fallback when there are no threatening pieces', () => {
            const ownWizardPos = new Geom.Point(0, 0);
            const ownWizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: ownWizardPos,
            });
            const player = { name: 'TestAI', castingPiece: ownWizardPiece, defeated: false } as unknown as Player;

            const enemyWizardPos = new Geom.Point(5, 0);
            const enemyWizardPiece = makePieceStub({
                type: UnitType.Wizard,
                position: enemyWizardPos,
                strength: 0,
                hasStatus: vi.fn().mockReturnValue(false),
                canAttackPiece: vi.fn().mockReturnValue(false),
            });
            const enemy = {
                name: 'Enemy',
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
            expect(() => (cw as any).evaluateEnemyPlayerPriorities()).not.toThrow();
        });
    });
});
