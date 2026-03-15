import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// Resolve circular dependency: Spell → Board → AttackSpell/SummonSpell → Spell
import '../wizard';
import { SummonSpell } from './summonspell';
import { Piece } from '../piece';
import { SpellTarget } from '../enums/spelltarget';
import { SpellType } from '../enums/spelltype';
import { UnitType } from '../enums/unittype';
import { Geom, Math as PMath } from 'phaser';
import type { Board } from '../board';
import type { SpellConfig } from '../configs/spellconfig';

// PMath.RND is not initialised without a Phaser.Game instance.
PMath.RND = { pick: (arr: any[]) => arr[Math.floor(Math.random() * arr.length)] } as any;

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockBoard(): Board {
    return {
        balance: 0,
        balanceShift: 0,
        rollChance: vi.fn().mockReturnValue(true),
        roll: vi.fn().mockReturnValue(true),
        hasLineOfSight: vi.fn().mockReturnValue(true),
        getAdjacentPiecesAtPosition: vi.fn().mockReturnValue([]),
        getPiecesAtPosition: vi.fn().mockReturnValue([]),
        playEffect: vi.fn().mockResolvedValue(undefined),
        idleDelay: vi.fn().mockResolvedValue(undefined),
        logger: { log: vi.fn() },
        sound: { play: vi.fn() },
        rangeGizmo: { showSimpleRange: vi.fn(), reset: vi.fn() },
        addPiece: vi.fn().mockResolvedValue({ turnOver: false, name: 'Summoned' }),
        getIsoPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
        pieces: [],
        players: [],
    } as unknown as Board;
}

function makeMockCastingPiece(): any {
    return {
        position: new Geom.Point(0, 0),
        sprite: { getCenter: vi.fn().mockReturnValue({ x: 0, y: 0 }) },
    };
}

function makeMockPlayer(castingPiece?: any): any {
    return {
        castingPiece: castingPiece ?? null,
        name: 'Caster',
        ai: null,
    };
}

/** A minimal SummonSpell config. */
function makeSummonConfig(overrides: Partial<SpellConfig> = {}): SpellConfig {
    return {
        id: 'test-summon',
        name: 'Test Summon',
        chance: 0.8,
        balance: 0,
        unitId: 'lion',
        target: SpellTarget.Empty,
        range: -1,
        ...overrides,
    };
}

/** Minimal unit config returned by Piece.getUnitConfig stubs. */
function makeUnitConfig(opts: {
    name?: string;
    indefiniteArticle?: string;
    status?: string[];
} = {}): any {
    return {
        id: 'test-unit',
        name: opts.name ?? 'Lion',
        indefiniteArticle: opts.indefiniteArticle,
        status: opts.status ?? [],
        properties: { mov: 3, com: 3, rcm: 0, rng: 0, def: 3, mnv: 3, res: 3 },
        attackType: 'mauled',
        rangedType: 'shot',
        projectileType: 'arrow',
        group: 'classicunits',
    };
}

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('SummonSpell constructor', () => {
    it('sets type to SpellType.Summon', () => {
        const board = makeMockBoard();
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.type).toBe(SpellType.Summon);
    });

    it('starts with illusion = false', () => {
        const board = makeMockBoard();
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.illusion).toBe(false);
    });
});

// ─── unitId getter ────────────────────────────────────────────────────────────

describe('SummonSpell.unitId', () => {
    let board: Board;
    beforeEach(() => { board = makeMockBoard(); });

    it('returns unitId from config', () => {
        const s = new SummonSpell(board, 1, makeSummonConfig({ unitId: 'dragon' }));
        expect(s.unitId).toBe('dragon');
    });

    it('falls back to unit.id when unitId is absent', () => {
        const s = new SummonSpell(board, 1, makeSummonConfig({ unitId: undefined, unit: { id: 'phoenix' } as any }));
        expect(s.unitId).toBe('phoenix');
    });

    it('returns empty string when neither unitId nor unit.id is set', () => {
        const s = new SummonSpell(board, 1, makeSummonConfig({ unitId: undefined }));
        expect(s.unitId).toBe('');
    });
});

// ─── illusion getter / setter ─────────────────────────────────────────────────

describe('SummonSpell.illusion', () => {
    let board: Board;
    beforeEach(() => { board = makeMockBoard(); });

    it('can be set to true', () => {
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.illusion = true;
        expect(s.illusion).toBe(true);
    });

    it('can be set back to false', () => {
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.illusion = true;
        s.illusion = false;
        expect(s.illusion).toBe(false);
    });
});

// ─── allowIllusion getter ────────────────────────────────────────────────────

describe('SummonSpell.allowIllusion', () => {
    let board: Board;
    beforeEach(() => { board = makeMockBoard(); });

    it('defaults to true when allowIllusion is not set', () => {
        const s = new SummonSpell(board, 1, makeSummonConfig({ allowIllusion: undefined }));
        expect(s.allowIllusion).toBe(true);
    });

    it('is true when allowIllusion is explicitly true', () => {
        const s = new SummonSpell(board, 1, makeSummonConfig({ allowIllusion: true }));
        expect(s.allowIllusion).toBe(true);
    });

    it('is false when allowIllusion is explicitly false', () => {
        const s = new SummonSpell(board, 1, makeSummonConfig({ allowIllusion: false }));
        expect(s.allowIllusion).toBe(false);
    });
});

// ─── roll() override ─────────────────────────────────────────────────────────

describe('SummonSpell.roll (via cast)', () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;
    let getUnitConfigSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        castingPiece = makeMockCastingPiece();
        owner = makeMockPlayer(castingPiece);
        board = makeMockBoard();
        getUnitConfigSpy = vi.spyOn(Piece, 'getUnitConfig').mockReturnValue(makeUnitConfig({ name: 'Wolf' }));
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
    });

    it('always succeeds (no board roll) when illusion is true', async () => {
        (board as any).rollChance = vi.fn().mockReturnValue(false); // would normally fail
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.owner = owner;
        s.illusion = true;
        // cast() checks roll() on the first cast; illusion bypasses rollChance
        const result = await s.cast(owner, castingPiece, new Geom.Point(0, 0));
        // Should not have returned null (which would mean castFail was called)
        // doCast for SummonSpell with addPiece mocked returns a piece
        expect((board as any).rollChance).not.toHaveBeenCalled();
    });

    it('delegates to board.rollChance when illusion is false', async () => {
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.owner = owner;
        s.illusion = false;
        await s.cast(owner, castingPiece, new Geom.Point(0, 0));
        expect((board as any).rollChance).toHaveBeenCalled();
    });

    it('fails when illusion is false and rollChance returns false', async () => {
        (board as any).rollChance = vi.fn().mockReturnValue(false);
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.owner = owner;
        s.illusion = false;
        const result = await s.cast(owner, castingPiece, new Geom.Point(0, 0));
        expect(result).toBeNull(); // castFail sets failed and returns null
        expect(s.failed).toBe(true);
    });
});

// ─── description getter ───────────────────────────────────────────────────────

describe('SummonSpell.description', () => {
    let board: Board;
    let getUnitConfigSpy: any;

    beforeEach(() => {
        board = makeMockBoard();
        getUnitConfigSpy = vi.spyOn(Piece, 'getUnitConfig');
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
    });

    it('generates "Summon a <name>" for a basic unit with castTimes=1', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ name: 'Lion' }));
        const s = new SummonSpell(board, 1, makeSummonConfig({ castTimes: 1 }));
        expect(s.description).toContain('Summon a Lion');
    });

    it('uses "an" for vowel-starting unit names', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ name: 'Elf' }));
        const s = new SummonSpell(board, 1, makeSummonConfig({ castTimes: 1 }));
        expect(s.description).toContain('Summon an Elf');
    });

    it('uses indefiniteArticle override when provided', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ name: 'Unicorn', indefiniteArticle: 'the only' }));
        const s = new SummonSpell(board, 1, makeSummonConfig({ castTimes: 1 }));
        expect(s.description).toContain('Summon the only Unicorn');
    });

    it('omits "Summon a <name>" when castTimes > 1', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ name: 'Wall' }));
        const s = new SummonSpell(board, 1, makeSummonConfig({ castTimes: 4 }));
        expect(s.description).not.toContain('Summon');
    });

    it('includes undead note when unit has undead status', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ status: ['undead'] }));
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain('Undead units');
    });

    it('includes mount+struct note for structures that can be occupied', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ status: ['mount', 'struct'] }));
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain('occupied by the owning wizard');
    });

    it('includes mount note for rideable (non-struct) mounts', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ status: ['mount'] }));
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain('ridden by the owning wizard');
    });

    it('includes expires note when unit has expires status', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ status: ['expires'] }));
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain('expire');
    });

    it('includes expiresGivesSpell note when both expires flags are present', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ status: ['expires', 'expiresGivesSpell'] }));
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain('grants a new spell');
    });
});

// ─── unitProperties getter ────────────────────────────────────────────────────

describe('SummonSpell.unitProperties', () => {
    it('calls Piece.getUnitConfig with the unitId', () => {
        const board = makeMockBoard();
        const stub = vi.spyOn(Piece, 'getUnitConfig').mockReturnValue(makeUnitConfig());
        const s = new SummonSpell(board, 1, makeSummonConfig({ unitId: 'lion' }));
        const props = s.unitProperties;
        expect(stub).toHaveBeenCalledWith('lion');
        expect(props).toBeDefined();
        stub.mockRestore();
    });
});

// ─── getValidTarget ───────────────────────────────────────────────────────────

describe('SummonSpell.getValidTarget', () => {
    let board: Board;
    let spell: SummonSpell;
    let owner: any;

    beforeEach(() => {
        board = makeMockBoard();
        const castingPiece = makeMockCastingPiece();
        owner = makeMockPlayer(castingPiece);
        spell = new SummonSpell(board, 1, makeSummonConfig({ range: -1 }));
        spell.owner = owner;
    });

    it('returns the target point when position is empty', () => {
        (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const pt = new Geom.Point(3, 4);
        expect(spell.getValidTarget(pt)).toBe(pt);
    });

    it('returns null when position is occupied', () => {
        const occupant = { currentMount: null, engulfed: false, dead: false };
        (board as any).getPiecesAtPosition = vi.fn().mockImplementation((_pt: any, filter?: any) =>
            filter ? [occupant].filter((p) => filter(p)) : [occupant]
        );
        expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
    });

    it('logs occupied reason when showReason=true', () => {
        const occupant = { currentMount: null, engulfed: false, dead: false };
        (board as any).getPiecesAtPosition = vi.fn().mockImplementation((_pt: any, filter?: any) =>
            filter ? [occupant].filter((p) => filter(p)) : [occupant]
        );
        spell.getValidTarget(new Geom.Point(0, 0), true);
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining('empty position'),
            expect.anything()
        );
    });

    it('returns null when target is out of range', () => {
        const s = new SummonSpell(board, 2, makeSummonConfig({ range: 1.5 }));
        const castingPiece = makeMockCastingPiece();
        s.owner = makeMockPlayer(castingPiece);
        expect(s.getValidTarget(new Geom.Point(10, 10))).toBeNull();
    });

    it('logs out-of-range reason when showReason=true', () => {
        const s = new SummonSpell(board, 2, makeSummonConfig({ range: 1.5 }));
        s.owner = makeMockPlayer(makeMockCastingPiece());
        s.getValidTarget(new Geom.Point(10, 10), true);
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining('out of range'),
            expect.anything()
        );
    });

    it('returns null when line of sight is blocked', () => {
        (board as any).hasLineOfSight = vi.fn().mockReturnValue(false);
        const s = new SummonSpell(board, 2, makeSummonConfig({ lineOfSight: true, range: -1 }));
        s.owner = makeMockPlayer(makeMockCastingPiece());
        expect(s.getValidTarget(new Geom.Point(0, 0))).toBeNull();
    });

    it('returns null when tree spell is adjacent to another tree', () => {
        const adjacentTree = { hasStatus: vi.fn().mockReturnValue(true) };
        (board as any).getAdjacentPiecesAtPosition = vi.fn().mockImplementation((_pt: any, filter?: any) =>
            filter ? [adjacentTree].filter((p) => filter(p)) : [adjacentTree]
        );
        const s = new SummonSpell(board, 2, makeSummonConfig({ tree: true, range: -1 }));
        s.owner = makeMockPlayer(makeMockCastingPiece());
        expect(s.getValidTarget(new Geom.Point(0, 0))).toBeNull();
    });

    it('filters out mounted/engulfed/dead pieces when checking occupancy', () => {
        // A mounted piece should be excluded, leaving the position "empty"
        const mountedPiece = { currentMount: { id: 99 }, engulfed: false, dead: false };
        (board as any).getPiecesAtPosition = vi.fn().mockImplementation((_pt: any, filter?: any) =>
            filter ? [mountedPiece].filter((p) => filter(p)) : [mountedPiece]
        );
        const pt = new Geom.Point(0, 0);
        expect(spell.getValidTarget(pt)).toBe(pt);
    });

    it('returns null for a target that is a non-Geom.Point object (Piece-shaped)', () => {
        // target instanceof Piece: false for plain objects → falls through to
        // the SpellTarget.Empty check with no matching enum → returns null
        // We test this by using a non-Empty target type:
        const s = new SummonSpell(board, 2, makeSummonConfig({ target: SpellTarget.Piece as any, range: -1 }));
        s.owner = makeMockPlayer(makeMockCastingPiece());
        (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([]);
        expect(s.getValidTarget(new Geom.Point(0, 0))).toBeNull();
    });

    it('returns null and logs "cannot be cast in occupied positions" when Piece.isPiece returns true with showReason', () => {
        const spy = vi.spyOn(Piece, 'isPiece').mockReturnValue(true);
        const result = spell.getValidTarget({} as any, true);
        expect(result).toBeNull();
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining('cannot be cast in occupied positions'),
            expect.anything()
        );
        spy.mockRestore();
    });

    it('returns null silently when Piece.isPiece returns true and showReason is absent', () => {
        const spy = vi.spyOn(Piece, 'isPiece').mockReturnValue(true);
        const result = spell.getValidTarget({} as any);
        expect(result).toBeNull();
        expect(board.logger.log).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

// ─── doCast ───────────────────────────────────────────────────────────────────

describe('SummonSpell.doCast', () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;
    let spell: SummonSpell;
    let getUnitConfigSpy: any;

    beforeEach(() => {
        castingPiece = makeMockCastingPiece();
        owner = makeMockPlayer(castingPiece);
        board = makeMockBoard();
        getUnitConfigSpy = vi.spyOn(Piece, 'getUnitConfig').mockReturnValue(makeUnitConfig({ name: 'Lion' }));
        spell = new SummonSpell(board, 1, makeSummonConfig());
        spell.owner = owner;
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
    });

    it('returns the newly summoned piece', async () => {
        const newPiece = { turnOver: false, name: 'Lion' };
        (board as any).addPiece = vi.fn().mockResolvedValue(newPiece);
        const result = await spell.doCast(owner, castingPiece, new Geom.Point(2, 3));
        expect(result).toBe(newPiece);
    });

    it('sets turnOver to true on the summoned piece', async () => {
        const newPiece: any = { turnOver: false, name: 'Lion' };
        (board as any).addPiece = vi.fn().mockResolvedValue(newPiece);
        await spell.doCast(owner, castingPiece, new Geom.Point(2, 3));
        expect(newPiece.turnOver).toBe(true);
    });

    it('calls board.addPiece with position, unitId, and owner', async () => {
        await spell.doCast(owner, castingPiece, new Geom.Point(2, 3));
        expect((board as any).addPiece).toHaveBeenCalledWith(
            expect.objectContaining({
                x: 2,
                y: 3,
                owner,
            })
        );
    });

    it('calls board.addPiece with illusion=false by default', async () => {
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0));
        expect((board as any).addPiece).toHaveBeenCalledWith(
            expect.objectContaining({ illusion: false })
        );
    });

    it('calls board.addPiece with illusion=true when spell.illusion is set', async () => {
        spell.illusion = true;
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0));
        expect((board as any).addPiece).toHaveBeenCalledWith(
            expect.objectContaining({ illusion: true })
        );
    });

    it('plays "castloop08" and "spelleffect" sounds', async () => {
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0));
        expect((board as any).sound.play).toHaveBeenCalledWith('castloop08');
        expect((board as any).sound.play).toHaveBeenCalledWith('spelleffect');
    });

    it('logs a success message', async () => {
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0));
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining('Caster'),
            expect.anything()
        );
    });

    it('calls playEffect three times (WizardCasting + WizardCastBeam + SummonPiece)', async () => {
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0));
        expect(board.playEffect).toHaveBeenCalledTimes(3);
    });

    it('uses fallback values when unit config omits attackType, rangedType, projectileType, status and group', async () => {
        getUnitConfigSpy.mockReturnValue({
            id: 'test-unit',
            name: 'Wolf',
            properties: { mov: 3, com: 3, rcm: 0, rng: 0, def: 3, mnv: 3, res: 3 },
        });
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0));
        const args = (board as any).addPiece.mock.calls[0][0];
        expect(args.properties.attackType).toBe('attacked');
        expect(args.properties.rangedType).toBe('shot');
        expect(args.properties.status).toEqual([]);
        expect(args.group).toBe('classicunits');
    });
});
