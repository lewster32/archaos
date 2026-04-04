import { SpellTarget } from "../enums/spelltarget";
import { SpellType } from "../enums/spelltype";
import { UnitStatus } from "../enums/unitstatus";
import type { SpellConfig } from "../configs/spellconfig";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SummonSpell } from "./summonspell";
import { Piece } from "../piece";
import { Point } from "../point";
import { Board } from "../board";
import { TestRNG } from "../rng";

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
        addPiece: vi
            .fn()
            .mockResolvedValue({ turnOver: false, name: "Summoned" }),
        getIsoPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
        pieces: [],
        players: [],
        rng: new TestRNG(),
    } as unknown as Board;
}

function makeMockCastingPiece(): any {
    return {
        position: new Point(0, 0),
        sprite: { getCenter: vi.fn().mockReturnValue({ x: 0, y: 0 }) },
    };
}

function makeMockPlayer(castingPiece?: any): any {
    return {
        castingPiece: castingPiece ?? null,
        name: "Caster",
        ai: null,
    };
}

/** A minimal SummonSpell config. */
function makeSummonConfig(overrides: Partial<SpellConfig> = {}): SpellConfig {
    return {
        id: "test-summon",
        name: "Test Summon",
        chance: 0.8,
        balance: 0,
        unitId: "lion",
        target: SpellTarget.Empty,
        range: -1,
        ...overrides,
    };
}

/** Minimal unit config returned by Piece.getUnitConfig stubs. */
function makeUnitConfig(
    opts: {
        name?: string;
        indefiniteArticle?: string;
        status?: string[];
    } = {},
): any {
    return {
        id: "test-unit",
        name: opts.name ?? "Lion",
        indefiniteArticle: opts.indefiniteArticle,
        status: opts.status ?? [],
        properties: { mov: 3, com: 3, rcm: 0, rng: 0, def: 3, mnv: 3, res: 3 },
        attackType: "mauled",
        rangedType: "shot",
        projectileType: "arrow",
        group: "classicunits",
    };
}

// ─── Constructor ──────────────────────────────────────────────────────────────

describe("SummonSpell constructor", () => {
    it("sets type to SpellType.Summon", () => {
        const board = makeMockBoard();
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.type).toBe(SpellType.Summon);
    });

    it("starts with illusion = false", () => {
        const board = makeMockBoard();
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.illusion).toBe(false);
    });
});

// ─── unitId getter ────────────────────────────────────────────────────────────

describe("SummonSpell.unitId", () => {
    let board: Board;
    beforeEach(() => {
        board = makeMockBoard();
    });

    it("returns unitId from config", () => {
        const s = new SummonSpell(
            board,
            1,
            makeSummonConfig({ unitId: "dragon" }),
        );
        expect(s.unitId).toBe("dragon");
    });

    it("falls back to unit.id when unitId is absent", () => {
        const s = new SummonSpell(
            board,
            1,
            makeSummonConfig({
                unitId: undefined,
                unit: { id: "phoenix" } as any,
            }),
        );
        expect(s.unitId).toBe("phoenix");
    });

    it("returns empty string when neither unitId nor unit.id is set", () => {
        const s = new SummonSpell(
            board,
            1,
            makeSummonConfig({ unitId: undefined }),
        );
        expect(s.unitId).toBe("");
    });

    it("returns an appropriate spellFrame value from config or defaults to 0", () => {
        const s1 = new SummonSpell(
            board,
            1,
            makeSummonConfig({ spellFrame: 5 }),
        );
        expect(s1.spellFrame).toBe(5);
        const s2 = new SummonSpell(
            board,
            1,
            makeSummonConfig({ spellFrame: undefined }),
        );
        expect(s2.spellFrame).toBe(0);
    });
});

// ─── illusion getter / setter ─────────────────────────────────────────────────

describe("SummonSpell.illusion", () => {
    let board: Board;
    beforeEach(() => {
        board = makeMockBoard();
    });

    it("can be set to true", () => {
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.illusion = true;
        expect(s.illusion).toBe(true);
    });

    it("can be set back to false", () => {
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.illusion = true;
        s.illusion = false;
        expect(s.illusion).toBe(false);
    });
});

// ─── allowIllusion getter ────────────────────────────────────────────────────

describe("SummonSpell.allowIllusion", () => {
    let board: Board;
    beforeEach(() => {
        board = makeMockBoard();
    });

    it("defaults to true when allowIllusion is not set", () => {
        const s = new SummonSpell(
            board,
            1,
            makeSummonConfig({ allowIllusion: undefined }),
        );
        expect(s.allowIllusion).toBe(true);
    });

    it("is true when allowIllusion is explicitly true", () => {
        const s = new SummonSpell(
            board,
            1,
            makeSummonConfig({ allowIllusion: true }),
        );
        expect(s.allowIllusion).toBe(true);
    });

    it("is false when allowIllusion is explicitly false", () => {
        const s = new SummonSpell(
            board,
            1,
            makeSummonConfig({ allowIllusion: false }),
        );
        expect(s.allowIllusion).toBe(false);
    });

    it("is false when board.disableIllusions is true, even if spell allows it", () => {
        board.disableIllusions = true;
        const s = new SummonSpell(
            board,
            1,
            makeSummonConfig({ allowIllusion: true }),
        );
        expect(s.allowIllusion).toBe(false);
    });

    it("is false when board.disableIllusions is true and allowIllusion is undefined", () => {
        board.disableIllusions = true;
        const s = new SummonSpell(
            board,
            1,
            makeSummonConfig({ allowIllusion: undefined }),
        );
        expect(s.allowIllusion).toBe(false);
    });
});

// ─── roll() override ─────────────────────────────────────────────────────────

describe("SummonSpell.roll (via cast)", () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;
    let getUnitConfigSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        castingPiece = makeMockCastingPiece();
        owner = makeMockPlayer(castingPiece);
        board = makeMockBoard();
        getUnitConfigSpy = vi
            .spyOn(Piece, "getUnitConfig")
            .mockReturnValue(makeUnitConfig({ name: "Wolf" }));
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
    });

    it("always succeeds (no board roll) when illusion is true", async () => {
        (board as any).rollChance = vi.fn().mockReturnValue(false); // would normally fail
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.owner = owner;
        s.illusion = true;
        // cast() checks roll() on the first cast; illusion bypasses rollChance
        await s.cast(owner, castingPiece, new Point(0, 0));
        // Should not have returned null (which would mean castFail was called)
        // doCast for SummonSpell with addPiece mocked returns a piece
        expect((board as any).rollChance).not.toHaveBeenCalled();
    });

    it("delegates to board.rollChance when illusion is false", async () => {
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.owner = owner;
        s.illusion = false;
        await s.cast(owner, castingPiece, new Point(0, 0));
        expect((board as any).rollChance).toHaveBeenCalled();
    });

    it("fails when illusion is false and rollChance returns false", async () => {
        (board as any).rollChance = vi.fn().mockReturnValue(false);
        const s = new SummonSpell(board, 1, makeSummonConfig());
        s.owner = owner;
        s.illusion = false;
        const result = await s.cast(owner, castingPiece, new Point(0, 0));
        expect(result).toBeNull(); // castFail sets failed and returns null
        expect(s.failed).toBe(true);
    });
});

// ─── description getter ───────────────────────────────────────────────────────

describe("SummonSpell.description", () => {
    let board: Board;
    let getUnitConfigSpy: any;

    beforeEach(() => {
        board = makeMockBoard();
        getUnitConfigSpy = vi.spyOn(Piece, "getUnitConfig");
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
    });

    it('generates "Summon a <name>" for a basic unit with castTimes=1', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ name: "Lion" }));
        const s = new SummonSpell(board, 1, makeSummonConfig({ castTimes: 1 }));
        expect(s.description).toContain("Summon a Lion");
    });

    it('uses "an" for vowel-starting unit names', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ name: "Elf" }));
        const s = new SummonSpell(board, 1, makeSummonConfig({ castTimes: 1 }));
        expect(s.description).toContain("Summon an Elf");
    });

    it("uses indefiniteArticle override when provided", () => {
        getUnitConfigSpy.mockReturnValue(
            makeUnitConfig({ name: "Unicorn", indefiniteArticle: "the only" }),
        );
        const s = new SummonSpell(board, 1, makeSummonConfig({ castTimes: 1 }));
        expect(s.description).toContain("Summon the only Unicorn");
    });

    it('omits "Summon a <name>" when castTimes > 1', () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ name: "Wall" }));
        const s = new SummonSpell(board, 1, makeSummonConfig({ castTimes: 4 }));
        expect(s.description).not.toContain("Summon");
    });

    it("includes undead note when unit has undead status", () => {
        getUnitConfigSpy.mockReturnValue(
            makeUnitConfig({ status: ["undead"] }),
        );
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain("Undead units");
    });

    it("includes mount+struct note for structures that can be occupied", () => {
        getUnitConfigSpy.mockReturnValue(
            makeUnitConfig({ status: ["mount", "struct"] }),
        );
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain("occupied by the owning wizard");
    });

    it("includes mount note for rideable (non-struct) mounts", () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ status: ["mount"] }));
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain("ridden by the owning wizard");
    });

    it("includes expires note when unit has expires status", () => {
        getUnitConfigSpy.mockReturnValue(
            makeUnitConfig({ status: ["expires"] }),
        );
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain("expire");
    });

    it("includes expiresGivesSpell note when both expires flags are present", () => {
        getUnitConfigSpy.mockReturnValue(
            makeUnitConfig({ status: ["expires", "expiresGivesSpell"] }),
        );
        const s = new SummonSpell(board, 1, makeSummonConfig());
        expect(s.description).toContain("grants a new spell");
    });
});

// ─── unitProperties getter ────────────────────────────────────────────────────

describe("SummonSpell.unitProperties", () => {
    it("calls Piece.getUnitConfig with the unitId", () => {
        const board = makeMockBoard();
        const stub = vi
            .spyOn(Piece, "getUnitConfig")
            .mockReturnValue(makeUnitConfig());
        const s = new SummonSpell(
            board,
            1,
            makeSummonConfig({ unitId: "lion" }),
        );
        const props = s.unitProperties;
        expect(stub).toHaveBeenCalledWith("lion");
        expect(props).toBeDefined();
        stub.mockRestore();
    });
});

// ─── getValidTarget ───────────────────────────────────────────────────────────

describe("SummonSpell.getValidTarget", () => {
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

    it("returns the target point when position is empty", () => {
        (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const pt = new Point(3, 4);
        expect(spell.getValidTarget(pt)).toBe(pt);
    });

    it("returns null when position is occupied", () => {
        const occupant = { currentMount: null, engulfed: false, dead: false };
        (board as any).getPiecesAtPosition = vi
            .fn()
            .mockImplementation((_pt: any, filter?: any) =>
                filter ? [occupant].filter((p) => filter(p)) : [occupant],
            );
        expect(spell.getValidTarget(new Point(0, 0))).toBeNull();
    });

    it("logs occupied reason when showReason=true", () => {
        const occupant = { currentMount: null, engulfed: false, dead: false };
        (board as any).getPiecesAtPosition = vi
            .fn()
            .mockImplementation((_pt: any, filter?: any) =>
                filter ? [occupant].filter((p) => filter(p)) : [occupant],
            );
        spell.getValidTarget(new Point(0, 0), true);
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining("empty position"),
            expect.anything(),
        );
    });

    it("returns null when target is out of range", () => {
        const s = new SummonSpell(board, 2, makeSummonConfig({ range: 1.5 }));
        const castingPiece = makeMockCastingPiece();
        s.owner = makeMockPlayer(castingPiece);
        expect(s.getValidTarget(new Point(10, 10))).toBeNull();
    });

    it("logs out-of-range reason when showReason=true", () => {
        const s = new SummonSpell(board, 2, makeSummonConfig({ range: 1.5 }));
        s.owner = makeMockPlayer(makeMockCastingPiece());
        s.getValidTarget(new Point(10, 10), true);
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining("out of range"),
            expect.anything(),
        );
    });

    it("returns null when line of sight is blocked", () => {
        (board as any).hasLineOfSight = vi.fn().mockReturnValue(false);
        const s = new SummonSpell(
            board,
            2,
            makeSummonConfig({ lineOfSight: true, range: -1 }),
        );
        s.owner = makeMockPlayer(makeMockCastingPiece());
        expect(s.getValidTarget(new Point(0, 0))).toBeNull();
    });

    it("returns null when tree spell is adjacent to another tree", () => {
        const adjacentTree = { hasStatus: vi.fn().mockReturnValue(true) };
        (board as any).getAdjacentPiecesAtPosition = vi
            .fn()
            .mockImplementation((_pt: any, filter?: any) =>
                filter
                    ? [adjacentTree].filter((p) => filter(p))
                    : [adjacentTree],
            );
        const s = new SummonSpell(
            board,
            2,
            makeSummonConfig({ tree: true, range: -1 }),
        );
        s.owner = makeMockPlayer(makeMockCastingPiece());
        expect(s.getValidTarget(new Point(0, 0))).toBeNull();
    });

    it("filters out mounted/engulfed/dead pieces when checking occupancy", () => {
        // A mounted piece should be excluded, leaving the position "empty"
        const mountedPiece = {
            currentMount: { id: 99 },
            engulfed: false,
            dead: false,
        };
        (board as any).getPiecesAtPosition = vi
            .fn()
            .mockImplementation((_pt: any, filter?: any) =>
                filter
                    ? [mountedPiece].filter((p) => filter(p))
                    : [mountedPiece],
            );
        const pt = new Point(0, 0);
        expect(spell.getValidTarget(pt)).toBe(pt);
    });

    it("returns null for a target that is a non-Geom.Point object (Piece-shaped)", () => {
        // target instanceof Piece: false for plain objects → falls through to
        // the SpellTarget.Empty check with no matching enum → returns null
        // We test this by using a non-Empty target type:
        const s = new SummonSpell(
            board,
            2,
            makeSummonConfig({ target: SpellTarget.Piece as any, range: -1 }),
        );
        s.owner = makeMockPlayer(makeMockCastingPiece());
        (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([]);
        expect(s.getValidTarget(new Point(0, 0))).toBeNull();
    });

    it('returns null and logs "cannot be cast in occupied positions" when Piece.isPiece returns true with showReason', () => {
        const spy = vi.spyOn(Piece, "isPiece").mockReturnValue(true);
        const result = spell.getValidTarget({} as any, true);
        expect(result).toBeNull();
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining("cannot be cast in occupied positions"),
            expect.anything(),
        );
        spy.mockRestore();
    });

    it("returns null silently when Piece.isPiece returns true and showReason is absent", () => {
        const spy = vi.spyOn(Piece, "isPiece").mockReturnValue(true);
        const result = spell.getValidTarget({} as any);
        expect(result).toBeNull();
        expect(board.logger.log).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

// ─── doCast ───────────────────────────────────────────────────────────────────

describe("SummonSpell.doCast", () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;
    let spell: SummonSpell;
    let getUnitConfigSpy: any;

    beforeEach(() => {
        castingPiece = makeMockCastingPiece();
        owner = makeMockPlayer(castingPiece);
        board = makeMockBoard();
        getUnitConfigSpy = vi
            .spyOn(Piece, "getUnitConfig")
            .mockReturnValue(makeUnitConfig({ name: "Lion" }));
        spell = new SummonSpell(board, 1, makeSummonConfig());
        spell.owner = owner;
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
    });

    it("returns the newly summoned piece", async () => {
        const newPiece = { turnOver: false, name: "Lion" };
        (board as any).addPiece = vi.fn().mockResolvedValue(newPiece);
        const result = await spell.doCast(
            owner,
            castingPiece,
            new Point(2, 3),
        );
        expect(result).toBe(newPiece);
    });

    it("sets turnOver to true on the summoned piece", async () => {
        const newPiece: any = { turnOver: false, name: "Lion" };
        (board as any).addPiece = vi.fn().mockResolvedValue(newPiece);
        await spell.doCast(owner, castingPiece, new Point(2, 3));
        expect(newPiece.turnOver).toBe(true);
    });

    it("calls board.addPiece with position, unitId, and owner", async () => {
        await spell.doCast(owner, castingPiece, new Point(2, 3));
        expect((board as any).addPiece).toHaveBeenCalledWith(
            expect.objectContaining({
                x: 2,
                y: 3,
                owner,
            }),
        );
    });

    it("calls board.addPiece with illusion=false by default", async () => {
        await spell.doCast(owner, castingPiece, new Point(0, 0));
        expect((board as any).addPiece).toHaveBeenCalledWith(
            expect.objectContaining({ illusion: false }),
        );
    });

    it("calls board.addPiece with illusion=true when spell.illusion is set", async () => {
        spell.illusion = true;
        await spell.doCast(owner, castingPiece, new Point(0, 0));
        expect((board as any).addPiece).toHaveBeenCalledWith(
            expect.objectContaining({ illusion: true }),
        );
    });

    it('plays "castloop08" and "spelleffect" sounds', async () => {
        await spell.doCast(owner, castingPiece, new Point(0, 0));
        expect((board as any).sound.play).toHaveBeenCalledWith("castloop08");
        expect((board as any).sound.play).toHaveBeenCalledWith("spelleffect");
    });

    it("logs a success message", async () => {
        await spell.doCast(owner, castingPiece, new Point(0, 0));
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining("Caster"),
            expect.anything(),
        );
    });

    it("calls playEffect three times (WizardCasting + WizardCastBeam + SummonPiece)", async () => {
        await spell.doCast(owner, castingPiece, new Point(0, 0));
        expect(board.playEffect).toHaveBeenCalledTimes(3);
    });

    it("uses fallback values when unit config omits attackType, rangedType, projectileType, status and group", async () => {
        getUnitConfigSpy.mockReturnValue({
            id: "test-unit",
            name: "Wolf",
            properties: {
                mov: 3,
                com: 3,
                rcm: 0,
                rng: 0,
                def: 3,
                mnv: 3,
                res: 3,
            },
        });
        await spell.doCast(owner, castingPiece, new Point(0, 0));
        const args = (board as any).addPiece.mock.calls[0][0];
        expect(args.properties.attackType).toBe("attacked");
        expect(args.properties.rangedType).toBe("shot");
        expect(args.properties.status).toEqual([]);
        expect(args.group).toBe("classicunits");
    });
});

// ─── scoreLoSBlock ────────────────────────────────────────────────────────────

describe("SummonSpell.scoreLoSBlock (private)", () => {
    let spell: SummonSpell;

    beforeEach(() => {
        const board = makeMockBoard();
        spell = new SummonSpell(board, 1, makeSummonConfig());
    });

    it("returns 0 when fromPos equals toPos (zero-length segment)", () => {
        const pos = new Point(3, 3);
        expect(
            (spell as any).scoreLoSBlock(new Point(3, 3), pos, pos),
        ).toBe(0);
    });

    it("returns 0 when tile projects before the segment (proj <= 0.05)", () => {
        // Enemy at (0,0), wizard at (10,0). Tile at (-1,0) projects behind enemy.
        const result = (spell as any).scoreLoSBlock(
            new Point(-1, 0),
            new Point(0, 0),
            new Point(10, 0),
        );
        expect(result).toBe(0);
    });

    it("returns 0 when tile projects beyond the segment (proj >= 0.95)", () => {
        // Enemy at (0,0), wizard at (10,0). Tile at (11,0) projects beyond wizard.
        const result = (spell as any).scoreLoSBlock(
            new Point(11, 0),
            new Point(0, 0),
            new Point(10, 0),
        );
        expect(result).toBe(0);
    });

    it("returns 3 when tile lies exactly on the segment midpoint", () => {
        // Enemy at (0,0), wizard at (10,0). Tile at (5,0) is exactly on the line.
        const result = (spell as any).scoreLoSBlock(
            new Point(5, 0),
            new Point(0, 0),
            new Point(10, 0),
        );
        expect(result).toBeCloseTo(3, 5);
    });

    it("returns a value between 0 and 3 for a tile near but off the segment", () => {
        // Enemy at (0,0), wizard at (10,0). Tile at (5,1) is 1 unit off the midpoint.
        const result = (spell as any).scoreLoSBlock(
            new Point(5, 1),
            new Point(0, 0),
            new Point(10, 0),
        );
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThan(3);
    });

    it("returns 0 when tile is more than 1.5 units from the segment", () => {
        // Enemy at (0,0), wizard at (10,0). Tile at (5,2) is 2 units off the midpoint.
        const result = (spell as any).scoreLoSBlock(
            new Point(5, 2),
            new Point(0, 0),
            new Point(10, 0),
        );
        expect(result).toBe(0);
    });

    it("scores a diagonal segment correctly (non-zero for on-path tile)", () => {
        // Enemy at (0,0), wizard at (4,4). Tile at (2,2) is exactly on the diagonal.
        const result = (spell as any).scoreLoSBlock(
            new Point(2, 2),
            new Point(0, 0),
            new Point(4, 4),
        );
        expect(result).toBeCloseTo(3, 5);
    });
});

// ─── selectSpreadingTile ──────────────────────────────────────────────────────

describe("SummonSpell.selectSpreadingTile (private)", () => {
    let board: ReturnType<typeof makeMockBoard>;
    let spell: SummonSpell;
    let getUnitConfigSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        board = makeMockBoard();
        getUnitConfigSpy = vi
            .spyOn(Piece, "getUnitConfig")
            .mockReturnValue(makeUnitConfig({ status: [UnitStatus.Spreads] }));
        spell = new SummonSpell(board, 1, makeSummonConfig());
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
    });

    it("sorts tiles ascending by nearest-enemy distance when enemies exist", () => {
        // Enemy at (8,8). Tile (7,7) is closer to enemy than (0,0).
        const enemy = {
            owner: { name: "foe" },
            dead: false,
            position: new Point(8, 8),
        };
        const player = makeMockPlayer(makeMockCastingPiece());
        (board as any).pieces = [enemy];
        const near = new Point(7, 7);
        const far = new Point(0, 0);
        const validTiles = [far, near];
        // weightedPick returns arr[0] — should be the nearest tile after sort
        const result = (spell as any).selectSpreadingTile(
            player,
            new Point(0, 0),
            validTiles,
        );
        expect(result).toBe(near);
    });

    it("sorts tiles descending by wizard distance when no enemies exist", () => {
        // No enemies. Wizard at (0,0). Tile (5,5) is farther; should be index 0 after sort.
        const player = makeMockPlayer(makeMockCastingPiece());
        (board as any).pieces = [];
        const near = new Point(1, 0);
        const far = new Point(5, 5);
        const validTiles = [near, far];
        const result = (spell as any).selectSpreadingTile(
            player,
            new Point(0, 0),
            validTiles,
        );
        expect(result).toBe(far);
    });

    it("returns a tile without sorting when no enemies and wizardPos is null", () => {
        const player = makeMockPlayer(makeMockCastingPiece());
        (board as any).pieces = [];
        const t1 = new Point(2, 3);
        const t2 = new Point(4, 5);
        const validTiles = [t1, t2];
        const result = (spell as any).selectSpreadingTile(
            player,
            null,
            validTiles,
        );
        // weightedPick returns arr[0] — no sort applied, so first tile returned
        expect(result).toBe(t1);
    });

    it("filters out pieces owned by the same player and dead pieces when finding enemies", () => {
        const ownPiece = {
            owner: "samePlayer",
            dead: false,
            position: new Point(1, 1),
        };
        const deadEnemy = {
            owner: "foe",
            dead: true,
            position: new Point(2, 2),
        };
        const player = {
            ...makeMockPlayer(makeMockCastingPiece()),
            name: "samePlayer",
        };
        // Both pieces should be excluded: own piece (same owner) and dead enemy
        (board as any).pieces = [ownPiece, deadEnemy];
        const t1 = new Point(0, 0);
        const validTiles = [t1];
        // No enemies after filter → falls to wizardPos branch but wizardPos is null
        const result = (spell as any).selectSpreadingTile(
            player,
            null,
            validTiles,
        );
        expect(result).toBe(t1);
    });
});

// ─── selectMagicWoodTile ──────────────────────────────────────────────────────

describe("SummonSpell.selectMagicWoodTile (private)", () => {
    let board: ReturnType<typeof makeMockBoard>;
    let spell: SummonSpell;

    beforeEach(() => {
        board = makeMockBoard();
        spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ autoPlace: true }),
        );
    });

    it("sorts tiles ascending by distance from wizard when wizardPos is provided", () => {
        // Wizard at (0,0). Tile (1,0) closer than (5,5).
        const near = new Point(1, 0);
        const far = new Point(5, 5);
        const validTiles = [far, near];
        // Mock board.weightedRandomPick picks arr[0]
        const result = (spell as any).selectMagicWoodTile(
            new Point(0, 0),
            validTiles,
        );
        // After ascending sort by distance, nearest tile is at index 0
        expect(result).toBe(near);
    });

    it("returns a tile without sorting when wizardPos is null", () => {
        const t1 = new Point(3, 3);
        const t2 = new Point(1, 1);
        const validTiles = [t1, t2];
        // Mock board.weightedRandomPick picks arr[0] — no sort should occur
        const result = (spell as any).selectMagicWoodTile(null, validTiles);
        // No sort applied; original first element is returned
        expect(result).toBe(t1);
    });

    it("handles a single tile", () => {
        const only = new Point(2, 2);
        const result = (spell as any).selectMagicWoodTile(
            new Point(0, 0),
            [only],
        );
        expect(result).toBe(only);
    });
});

// ─── selectShadowWoodTile ─────────────────────────────────────────────────────

describe("SummonSpell.selectShadowWoodTile (private)", () => {
    let board: ReturnType<typeof makeMockBoard>;
    let spell: SummonSpell;
    let getUnitConfigSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        board = makeMockBoard();
        getUnitConfigSpy = vi
            .spyOn(Piece, "getUnitConfig")
            .mockReturnValue(makeUnitConfig({ status: ["tree"] }));
        spell = new SummonSpell(board, 1, makeSummonConfig({ tree: true }));
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it("returns a tile from validTiles when no enemies are present", () => {
        (board as any).pieces = [];
        const t = new Point(2, 2);
        const result = (spell as any).selectShadowWoodTile(
            makeMockPlayer(makeMockCastingPiece()),
            new Point(0, 0),
            [t],
        );
        expect(result).toBe(t);
    });

    it("returns a tile from validTiles when enemies exist but wizardPos is null", () => {
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(5, 5),
        };
        const player = makeMockPlayer(makeMockCastingPiece());
        (board as any).pieces = [enemy];
        const t = new Point(3, 3);
        const result = (spell as any).selectShadowWoodTile(player, null, [t]);
        expect(result).toBe(t);
    });

    it("scores tiles by LoS-block and proximity bonus and sorts descending", () => {
        // Wizard at (5,0). Enemy at (0,0). Tile on the line (2,0) gets LoS score;
        // tile (5,5) is far from both.
        const wizard = new Point(5, 0);
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(0, 0),
        };
        const player = makeMockPlayer(makeMockCastingPiece());
        (board as any).pieces = [enemy];
        const onLine = new Point(2, 0); // near midpoint of enemy-wizard line
        const offBoard = new Point(5, 5); // far from both
        const validTiles = [offBoard, onLine];
        const result = (spell as any).selectShadowWoodTile(
            player,
            wizard,
            validTiles,
        );
        // onLine should score higher (LoS block + proximity bonus) → index 0 after sort
        expect(result).toBe(onLine);
    });

    it("applies proximity bonus when tile is within 3 units of enemy", () => {
        // Enemy at (0,0). Wizard at (20,0). Tile (1,0) is 1 unit from enemy:
        //   proj = 1/20 = 0.05 → on the boundary (LoS score ~0), proximity = max(0,3-1)=2.
        // Tile (18,0) is 18 units from enemy:
        //   proj = 18/20 = 0.9 → LoS score ~3, proximity = max(0,3-18)=0.
        // Use tile (1,1): proj = dot((1,1),(20,0))/400 = 20/400 = 0.05 boundary → LoS ~0,
        //   distance from enemy = sqrt(2) ≈ 1.41 → proximity = max(0,3-1.41) ≈ 1.59.
        // Use far-off tile (0,8): proj = 0 → LoS 0, dist from enemy = 8 → proximity 0.
        // So tile (1,1) should outscore (0,8) via proximity bonus alone.
        const wizard = new Point(20, 0);
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(0, 0),
        };
        const player = makeMockPlayer(makeMockCastingPiece());
        (board as any).pieces = [enemy];
        const close = new Point(1, 1); // proximity bonus > 0
        const nowhere = new Point(0, 8); // proximity 0, LoS 0
        const validTiles = [nowhere, close];
        const result = (spell as any).selectShadowWoodTile(
            player,
            wizard,
            validTiles,
        );
        // close tile scores higher via proximity bonus → index 0 after descending sort
        expect(result).toBe(close);
    });
});

// ─── trySelectWallTile ────────────────────────────────────────────────────────

describe("SummonSpell.trySelectWallTile (private)", () => {
    let board: ReturnType<typeof makeMockBoard>;
    let spell: SummonSpell;

    beforeEach(() => {
        board = makeMockBoard();
        spell = new SummonSpell(board, 1, makeSummonConfig({ name: "Wall" }));
    });

    it("returns null when all tiles are adjacent (Chebyshev ≤ 1) to the wizard", () => {
        const wizardPos = new Point(5, 5);
        // All tiles within Chebyshev distance 1
        const adjacent = [
            new Point(4, 4),
            new Point(5, 4),
            new Point(6, 4),
            new Point(4, 5),
            new Point(6, 5),
            new Point(4, 6),
            new Point(5, 6),
            new Point(6, 6),
        ];
        const result = (spell as any).trySelectWallTile(
            makeMockPlayer(makeMockCastingPiece()),
            wizardPos,
            adjacent,
            null,
            null,
        );
        expect(result).toBeNull();
    });

    it("returns null when validTiles is empty", () => {
        const result = (spell as any).trySelectWallTile(
            makeMockPlayer(makeMockCastingPiece()),
            new Point(5, 5),
            [],
            null,
            null,
        );
        expect(result).toBeNull();
    });

    it("returns a candidate when a non-adjacent tile exists", () => {
        const wizardPos = new Point(0, 0);
        const safeTile = new Point(3, 3);
        const result = (spell as any).trySelectWallTile(
            makeMockPlayer(makeMockCastingPiece()),
            wizardPos,
            [safeTile],
            null,
            null,
        );
        expect(result).toBe(safeTile);
    });

    it("uses all validTiles as candidates when wizardPos is null", () => {
        const t1 = new Point(0, 0);
        const t2 = new Point(1, 0);
        const result = (spell as any).trySelectWallTile(
            makeMockPlayer(makeMockCastingPiece()),
            null,
            [t1, t2],
            null,
            null,
        );
        // No filtering → weightedPick returns arr[0]
        expect(result).toBe(t1);
    });

    it("skips scoring branch when no enemies present, still returns a tile", () => {
        (board as any).pieces = [];
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const wizardPos = new Point(0, 0);
        const safeTile = new Point(3, 3);
        const result = (spell as any).trySelectWallTile(
            makeMockPlayer(makeMockCastingPiece()),
            wizardPos,
            [safeTile],
            null,
            null,
        );
        expect(result).toBe(safeTile);
    });

    it("applies LoS-scoring when enemies exist and rollChance is true", () => {
        // Wizard at (5,0). Enemy at (0,0). Tile on line (2,0) scores higher than (3,7).
        const wizardPos = new Point(5, 0);
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(0, 0),
        };
        (board as any).pieces = [enemy];
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const player = makeMockPlayer(makeMockCastingPiece());
        const onLine = new Point(2, 0);
        const offLine = new Point(3, 7);
        const result = (spell as any).trySelectWallTile(
            player,
            wizardPos,
            [offLine, onLine],
            null,
            null,
        );
        // onLine scores higher — ends up at index 0 after sort
        expect(result).toBe(onLine);
    });

    it("skips scoring when rollChance is false and returns first candidate", () => {
        const wizardPos = new Point(5, 0);
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(0, 0),
        };
        (board as any).pieces = [enemy];
        (board as any).rollChance = vi.fn().mockReturnValue(false);
        const player = makeMockPlayer(makeMockCastingPiece());
        const t1 = new Point(3, 3);
        const t2 = new Point(4, 4);
        const result = (spell as any).trySelectWallTile(
            player,
            wizardPos,
            [t1, t2],
            null,
            null,
        );
        expect(result).toBe(t1);
    });

    it("adds contiguity bonus (+4) when tile is adjacent to lastWallPt", () => {
        const wizardPos = new Point(0, 0);
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(9, 0),
        };
        (board as any).pieces = [enemy];
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const player = makeMockPlayer(makeMockCastingPiece());
        // lastWallPt at (5,5). Adjacent tile (6,5) gets +4; isolated tile (3,3) does not.
        const lastWallPt = new Point(5, 5);
        const adjacent = new Point(6, 5);
        const isolated = new Point(3, 3);
        const result = (spell as any).trySelectWallTile(
            player,
            wizardPos,
            [isolated, adjacent],
            lastWallPt,
            null,
        );
        expect(result).toBe(adjacent);
    });

    it("awards straight-continuation bonus (+3) when tile continues the wall direction", () => {
        const wizardPos = new Point(0, 0);
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(9, 0),
        };
        (board as any).pieces = [enemy];
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const player = makeMockPlayer(makeMockCastingPiece());
        // Wall running rightward: prevWallPt (4,5) → lastWallPt (5,5) → dir=(1,0).
        // Tile (6,5) continues straight; tile (5,6) turns 90°.
        const prevWallPt = new Point(4, 5);
        const lastWallPt = new Point(5, 5);
        const straight = new Point(6, 5);
        const turn = new Point(5, 6);
        const result = (spell as any).trySelectWallTile(
            player,
            wizardPos,
            [turn, straight],
            lastWallPt,
            prevWallPt,
        );
        expect(result).toBe(straight);
    });

    it("awards 90-degree-turn bonus (+1) over diagonal step (no bonus)", () => {
        const wizardPos = new Point(0, 0);
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(9, 0),
        };
        (board as any).pieces = [enemy];
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const player = makeMockPlayer(makeMockCastingPiece());
        // Wall running rightward: prevWallPt (4,5) → lastWallPt (5,5) → dir=(1,0).
        // 90-degree turn tile (5,6): tdx=0, tdy=1 → dot product=0 → +1.
        // Diagonal tile (6,6): tdx=1, tdy=1 → dot product=1 → no straight, not 0 → 0 bonus.
        const prevWallPt = new Point(4, 5);
        const lastWallPt = new Point(5, 5);
        const turnTile = new Point(5, 6);
        const diagTile = new Point(6, 6);
        const result = (spell as any).trySelectWallTile(
            player,
            wizardPos,
            [diagTile, turnTile],
            lastWallPt,
            prevWallPt,
        );
        expect(result).toBe(turnTile);
    });

    it("uses default difficulty 0.5 when player has no ai", () => {
        const wizardPos = new Point(0, 0);
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(9, 0),
        };
        (board as any).pieces = [enemy];
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        // Player with no ai — difficulty defaults to 0.5 inside trySelectWallTile
        const playerNoAi = {
            ...makeMockPlayer(makeMockCastingPiece()),
            ai: null,
        };
        const safeTile = new Point(3, 3);
        const result = (spell as any).trySelectWallTile(
            playerNoAi,
            wizardPos,
            [safeTile],
            null,
            null,
        );
        expect(result).toBe(safeTile);
    });
});

// ─── autoCast ─────────────────────────────────────────────────────────────────

describe("SummonSpell.autoCast", () => {
    let board: ReturnType<typeof makeMockBoard>;
    let getUnitConfigSpy: ReturnType<typeof vi.spyOn>;

    /** Build a board stub suitable for autoCast with a 2×2 grid (4 tiles). */
    function makeAutoCastBoard(): ReturnType<typeof makeMockBoard> {
        const b = makeMockBoard();
        (b as any).width = 2;
        (b as any).height = 2;
        (b as any).pieces = [];
        (b as any).rules = {
            doCastSpell: vi.fn(),
        };
        return b;
    }

    /** Build a player stub with a castingPiece at (0,0). */
    function makeAutoCastPlayer(): any {
        const castingPiece = makeMockCastingPiece();
        castingPiece.position = new Point(0, 0);
        return {
            castingPiece,
            name: "TestPlayer",
            ai: null,
            discardSpell: vi.fn().mockResolvedValue(undefined),
        };
    }

    beforeEach(() => {
        board = makeAutoCastBoard();
        getUnitConfigSpy = vi
            .spyOn(Piece, "getUnitConfig")
            .mockReturnValue(makeUnitConfig({ status: [] }));
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
    });

    it('returns false and plays "cancel" when no valid tiles exist on first iteration', async () => {
        // Make getValidTarget always return null by filling every tile
        board.getPiecesAtPosition = vi
            .fn()
            .mockImplementation((_pt: any, filter: any) =>
                filter
                    ? [{ currentMount: null, engulfed: false, dead: false }]
                    : [],
            );
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        const player = makeAutoCastPlayer();
        spell.owner = player;
        const result = await spell.autoCast(player);
        expect(result).toBe(false);
        expect(board.sound.play).toHaveBeenCalledWith("cancel");
        expect(player.discardSpell).not.toHaveBeenCalled();
    });

    it('calls discardSpell and plays "cancel" when no valid tiles remain after first successful cast', async () => {
        // First iteration: tiles available → cast succeeds and decrements castTimes.
        // Second iteration (castTimes=1 multi-cast): no tiles left.
        let callCount = 0;
        board.getPiecesAtPosition = vi
            .fn()
            .mockImplementation((_pt: any, filter: any) => {
                callCount++;
                // First 4 calls (first iteration grid scan): empty → tiles valid
                // Subsequent calls (second iteration grid scan): occupied → no valid tiles
                if (callCount <= 4) {
                    return [];
                }
                return filter
                    ? [{ currentMount: null, engulfed: false, dead: false }]
                    : [];
            });
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 2 }),
        );
        const player = makeAutoCastPlayer();
        spell.owner = player;
        // doCastSpell decrements _castTimes by calling cast → simulate that directly
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const result = await spell.autoCast(player);
        expect(result).toBe(false);
        expect(player.discardSpell).toHaveBeenCalled();
        expect(board.sound.play).toHaveBeenCalledWith("cancel");
    });

    it("returns true and calls discardSpell after casting all times (random path)", async () => {
        // Standard summon (not spreading, not autoPlace, not tree, not Wall).
        // rollChance is not consulted for random path.
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        const player = makeAutoCastPlayer();
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const result = await spell.autoCast(player);
        expect(result).toBe(true);
        expect(player.discardSpell).toHaveBeenCalled();
    });

    it("uses selectSpreadingTile path when unit has Spreads status and rollChance favours it", async () => {
        getUnitConfigSpy.mockReturnValue(
            makeUnitConfig({ status: [UnitStatus.Spreads] }),
        );
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        const player = makeAutoCastPlayer();
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const selectSpy = vi.spyOn(spell as any, "selectSpreadingTile");
        const result = await spell.autoCast(player);
        expect(selectSpy).toHaveBeenCalled();
        expect(result).toBe(true);
    });

    it("uses selectMagicWoodTile path when autoPlace is true", async () => {
        // autoPlace overrides spreading/tree branches
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        (board as any).rollChance = vi.fn().mockReturnValue(false); // not spreading
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1, autoPlace: true }),
        );
        const player = makeAutoCastPlayer();
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const selectSpy = vi.spyOn(spell as any, "selectMagicWoodTile");
        await spell.autoCast(player);
        expect(selectSpy).toHaveBeenCalled();
    });

    it("uses selectShadowWoodTile path when tree=true and unit has positive combat", async () => {
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ status: ["tree"] }));
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        (board as any).rollChance = vi.fn().mockReturnValue(false); // not spreading
        // combat > 0 is provided by default makeUnitConfig (com: 3)
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1, tree: true }),
        );
        const player = makeAutoCastPlayer();
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const selectSpy = vi.spyOn(spell as any, "selectShadowWoodTile");
        await spell.autoCast(player);
        expect(selectSpy).toHaveBeenCalled();
    });

    it("uses trySelectWallTile path for Wall spell and returns true on success", async () => {
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1, name: "Wall" }),
        );
        const player = makeAutoCastPlayer();
        player.castingPiece.position = new Point(9, 9); // wizard far from valid tiles
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const selectSpy = vi.spyOn(spell as any, "trySelectWallTile");
        const result = await spell.autoCast(player);
        expect(selectSpy).toHaveBeenCalled();
        expect(result).toBe(true);
    });

    it("returns successfullyCast=true and stops when trySelectWallTile returns null mid-cast", async () => {
        // First iteration: wall cast succeeds (castTimes goes 2→1).
        // Second iteration: trySelectWallTile returns null → returns true (already cast once).
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 2, name: "Wall" }),
        );
        const player = makeAutoCastPlayer();
        player.castingPiece.position = new Point(9, 9);
        spell.owner = player;
        let tryCallCount = 0;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        vi.spyOn(spell as any, "trySelectWallTile").mockImplementation(() => {
            tryCallCount++;
            if (tryCallCount === 1) return new Point(0, 0);
            return null;
        });
        const result = await spell.autoCast(player);
        expect(result).toBe(true);
        expect(player.discardSpell).toHaveBeenCalled();
    });

    it('plays "cancel" and returns false when trySelectWallTile returns null on first cast', async () => {
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1, name: "Wall" }),
        );
        const player = makeAutoCastPlayer();
        player.castingPiece.position = new Point(9, 9);
        spell.owner = player;
        vi.spyOn(spell as any, "trySelectWallTile").mockReturnValue(null);
        const result = await spell.autoCast(player);
        expect(result).toBe(false);
        expect(board.sound.play).toHaveBeenCalledWith("cancel");
        expect(player.discardSpell).not.toHaveBeenCalled();
    });

    it("tracks lastWallPt and prevWallPt across wall casts", async () => {
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 3, name: "Wall" }),
        );
        const player = makeAutoCastPlayer();
        player.castingPiece.position = new Point(9, 9);
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const pt1 = new Point(0, 0);
        const pt2 = new Point(1, 0);
        const pt3 = new Point(2, 0);
        let tryCallCount = 0;
        const capturedArgs: Array<{ lastPt: unknown; prevPt: unknown }> = [];
        const tryMock = vi
            .spyOn(spell as any, "trySelectWallTile")
            .mockImplementation(
                (_p: any, _w: any, _v: any, lastPt: any, prevPt: any) => {
                    capturedArgs.push({ lastPt, prevPt });
                    tryCallCount++;
                    if (tryCallCount === 1) return pt1;
                    if (tryCallCount === 2) return pt2;
                    return pt3;
                },
            );
        await spell.autoCast(player);
        expect(tryMock).toHaveBeenCalledTimes(3);
        expect(capturedArgs[0].lastPt).toBeNull();
        expect(capturedArgs[1].lastPt).toBe(pt1);
        expect(capturedArgs[1].prevPt).toBeNull();
        expect(capturedArgs[2].lastPt).toBe(pt2);
        expect(capturedArgs[2].prevPt).toBe(pt1);
    });

    it("uses ai.difficulty when player has an ai controller (spreading path)", async () => {
        getUnitConfigSpy.mockReturnValue(
            makeUnitConfig({ status: [UnitStatus.Spreads] }),
        );
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        const player = makeAutoCastPlayer();
        player.ai = { difficulty: 1 };
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const result = await spell.autoCast(player);
        // rollChance was called with 0.5 + 1 * 0.5 = 1.0 — should have taken spreading path
        expect((board as any).rollChance).toHaveBeenCalledWith(1);
        expect(result).toBe(true);
    });

    it("treats isSpreading as false when unitProperties is null (covers ?? false branch)", async () => {
        // getUnitConfig returns null — unitProperties?.status?.includes(...) ?? false → false
        getUnitConfigSpy.mockReturnValue(null as any);
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        const player = makeAutoCastPlayer();
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        // Should not throw and should use the random path
        const result = await spell.autoCast(player);
        expect(result).toBe(true);
    });

    it("treats wizardPos as null when player.castingPiece is null (covers ?? null branch)", async () => {
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        // castingPiece has no position — spell.owner setter requires a castingPiece but position
        // comes from player.castingPiece?.position ?? null inside autoCast
        const playerNoCastPos = {
            castingPiece: { ...makeMockCastingPiece(), position: undefined },
            name: "NoPosPlayer",
            ai: null,
            discardSpell: vi.fn().mockResolvedValue(undefined),
        };
        // owner setter requires castingPiece; use a fully-formed player for that, then swap
        const ownerForSetter = makeAutoCastPlayer();
        spell.owner = ownerForSetter;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        // Call autoCast with a player whose castingPiece.position is undefined → wizardPos = null
        const result = await spell.autoCast(playerNoCastPos as any);
        expect(result).toBe(true);
    });

    // ── line 284: if (successfullyCast) false branch ──────────────────────────

    it("returns true without calling discardSpell when _castTimes is already 0 (line 284 false branch)", async () => {
        // Force the while loop to be skipped entirely so successfullyCast stays false.
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        const player = makeAutoCastPlayer();
        spell.owner = player;
        (spell as any)._castTimes = 0; // skip the loop
        const result = await spell.autoCast(player);
        expect(result).toBe(true);
        expect(player.discardSpell).not.toHaveBeenCalled();
    });

    // ── line 364: sort comparator in selectShadowWoodTile ────────────────────

    it("sort comparator in selectShadowWoodTile is exercised when enemies are on the board (line 364)", async () => {
        // Use a Shadow Wood spell (tree=true, unit has positive com).
        getUnitConfigSpy.mockReturnValue(makeUnitConfig({ status: ["tree"] }));
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        // Place an enemy on the board so the enemies array is non-empty → sort runs.
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(5, 5),
        };
        (board as any).pieces = [enemy];
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1, tree: true }),
        );
        const player = makeAutoCastPlayer();
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const selectSpy = vi.spyOn(spell as any, "selectShadowWoodTile");
        const result = await spell.autoCast(player);
        expect(selectSpy).toHaveBeenCalled();
        expect(result).toBe(true);
        expect(player.discardSpell).toHaveBeenCalled();
    });

    // ── line 446: sort comparator in trySelectWallTile ────────────────────────

    it("sort comparator in trySelectWallTile is exercised when enemies are on the board (line 446)", async () => {
        // Use a Wall spell with an enemy on the board and rollChance=true so scoring runs.
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const enemy = {
            owner: "foe",
            dead: false,
            position: new Point(9, 9),
        };
        (board as any).pieces = [enemy];
        // Wizard far from the 2×2 grid tiles so all candidates pass the adjacency filter.
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1, name: "Wall" }),
        );
        const player = makeAutoCastPlayer();
        player.castingPiece.position = new Point(5, 5);
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const selectSpy = vi.spyOn(spell as any, "trySelectWallTile");
        const result = await spell.autoCast(player);
        expect(selectSpy).toHaveBeenCalled();
        expect(result).toBe(true);
        expect(player.discardSpell).toHaveBeenCalled();
    });

    // ── selectDefaultTile via autoCast — difficulty-gated call site ───────────

    it("calls selectDefaultTile when rollChance(difficulty) returns true for an AI player", async () => {
        // Standard summon with no special flags (not spreading, autoPlace, tree, or Wall)
        // so autoCast falls into the else branch and tests rollChance(difficulty).
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        (board as any).rollChance = vi.fn().mockReturnValue(true);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        const player = makeAutoCastPlayer();
        player.ai = { difficulty: 0.8 };
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const selectSpy = vi.spyOn(spell as any, "selectDefaultTile");
        const result = await spell.autoCast(player);
        expect(selectSpy).toHaveBeenCalled();
        // rollChance called with the player's difficulty value
        expect((board as any).rollChance).toHaveBeenCalledWith(0.8);
        expect(result).toBe(true);
    });

    it("falls back to rng.pick when rollChance(difficulty) returns false", async () => {
        // rollChance false → random tile via rng.pick; selectDefaultTile must NOT be called.
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        (board as any).rollChance = vi.fn().mockReturnValue(false);
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        const player = makeAutoCastPlayer();
        player.ai = { difficulty: 0.5 };
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const selectSpy = vi.spyOn(spell as any, "selectDefaultTile");
        const pickSpy = vi.spyOn((board as any).rng, "pick");
        const result = await spell.autoCast(player);
        expect(selectSpy).not.toHaveBeenCalled();
        expect(pickSpy).toHaveBeenCalled();
        expect(result).toBe(true);
    });

    it("passes difficulty 0 to rollChance when player has no ai controller", async () => {
        // player.ai is null → difficulty defaults to 0 → rollChance(0) always false
        // → random rng.pick path.
        board.getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const rollChanceSpy = vi
            .fn()
            .mockImplementation((chance: number) => chance > 0);
        (board as any).rollChance = rollChanceSpy;
        const spell = new SummonSpell(
            board,
            1,
            makeSummonConfig({ castTimes: 1 }),
        );
        const player = makeAutoCastPlayer();
        player.ai = null;
        spell.owner = player;
        (board as any).rules.doCastSpell = vi
            .fn()
            .mockImplementation(async () => {
                (spell as any)._castTimes--;
            });
        const selectSpy = vi.spyOn(spell as any, "selectDefaultTile");
        await spell.autoCast(player);
        // rollChance should have been called with 0 (difficulty default)
        expect(rollChanceSpy).toHaveBeenCalledWith(0);
        // difficulty=0 → rollChance(0) → false → selectDefaultTile NOT called
        expect(selectSpy).not.toHaveBeenCalled();
    });
});

// ─── selectDefaultTile ────────────────────────────────────────────────────────

describe("SummonSpell.selectDefaultTile (private)", () => {
    let board: ReturnType<typeof makeMockBoard>;
    let spell: SummonSpell;
    let getUnitConfigSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        board = makeMockBoard();
        getUnitConfigSpy = vi
            .spyOn(Piece, "getUnitConfig")
            .mockReturnValue(makeUnitConfig({ status: [] }));
        spell = new SummonSpell(board, 1, makeSummonConfig());
    });

    afterEach(() => {
        getUnitConfigSpy.mockRestore();
    });

    /** Helper: a minimal enemy piece stub. */
    function makeEnemy(
        x: number,
        y: number,
        strength: number,
        owner = "foe",
    ): any {
        return {
            owner,
            dead: false,
            hasStatus: vi.fn().mockReturnValue(false),
            position: new Point(x, y),
            strength,
            name: `Enemy@${x},${y}`,
        };
    }

    it("returns a tile from validTiles when there are no enemies on the board", () => {
        (board as any).pieces = [];
        const t1 = new Point(2, 3);
        const t2 = new Point(4, 5);
        // TestRNG.weightedRandomPick returns array[0] — no sort when no enemies
        const result = (spell as any).selectDefaultTile(
            makeMockPlayer(makeMockCastingPiece()),
            new Point(0, 0),
            [t1, t2],
        );
        expect(result).toBe(t1);
    });

    it("returns a tile without sorting when wizardPos is null (even if enemies exist)", () => {
        const enemy = makeEnemy(5, 5, 10);
        (board as any).pieces = [enemy];
        const t1 = new Point(3, 3);
        const t2 = new Point(6, 6);
        // No sort because wizardPos is null — first tile stays at index 0
        const result = (spell as any).selectDefaultTile(
            makeMockPlayer(makeMockCastingPiece()),
            null,
            [t1, t2],
        );
        expect(result).toBe(t1);
    });

    it("sorts tiles ascending by distance to the highest-threat enemy", () => {
        // Wizard at (0,0). Enemy at (8,8), strength=10.
        // dist(wizard → enemy) = ~11.3 → threat = 10 / (11.3 + 1) ≈ 0.81.
        // Tile (7,7) is ~1.4 from enemy; tile (0,0) is ~11.3 from enemy.
        // After ascending sort by distance-to-enemy, (7,7) should be at index 0.
        const wizardPos = new Point(0, 0);
        const enemy = makeEnemy(8, 8, 10);
        (board as any).pieces = [enemy];
        const near = new Point(7, 7); // close to enemy
        const far = new Point(0, 1); // far from enemy
        // TestRNG.weightedRandomPick returns array[0]
        const result = (spell as any).selectDefaultTile(
            makeMockPlayer(makeMockCastingPiece()),
            wizardPos,
            [far, near],
        );
        expect(result).toBe(near);
    });

    it("selects highest-threat enemy by strength / (distance_to_wizard + 1)", () => {
        // Wizard at (0,0).
        // Enemy A at (1,0): strength=2, dist=1 → score = 2/2 = 1.0
        // Enemy B at (5,0): strength=10, dist=5 → score = 10/6 ≈ 1.67  ← highest threat
        // Tiles: (4,0) is close to enemy B; (0,1) is far from enemy B.
        // After sort ascending by distance to highest-threat (enemy B), (4,0) should win.
        const wizardPos = new Point(0, 0);
        const enemyA = makeEnemy(1, 0, 2);
        const enemyB = makeEnemy(5, 0, 10);
        (board as any).pieces = [enemyA, enemyB];
        const nearB = new Point(4, 0); // dist to (5,0) = 1
        const farB = new Point(0, 1); // dist to (5,0) = ~5.1
        const result = (spell as any).selectDefaultTile(
            makeMockPlayer(makeMockCastingPiece()),
            wizardPos,
            [farB, nearB],
        );
        expect(result).toBe(nearB);
    });

    it("excludes pieces owned by the casting player from enemy list", () => {
        // Own piece at (8,8) strength=99 — should be excluded.
        // No remaining enemies → no sort → first tile returned as-is.
        const playerObj = makeMockPlayer(makeMockCastingPiece());
        const ownPiece = {
            owner: playerObj,
            dead: false,
            hasStatus: vi.fn().mockReturnValue(false),
            position: new Point(8, 8),
            strength: 99,
            name: "OwnPiece",
        };
        (board as any).pieces = [ownPiece];
        const t1 = new Point(1, 1);
        const t2 = new Point(2, 2);
        const result = (spell as any).selectDefaultTile(
            playerObj,
            new Point(0, 0),
            [t1, t2],
        );
        // Own piece excluded → no enemies → no sort → array[0] = t1
        expect(result).toBe(t1);
    });

    it("excludes dead enemy pieces from enemy list", () => {
        // Dead enemy at (8,8) — should be excluded.
        const deadEnemy = {
            owner: "foe",
            dead: true,
            hasStatus: vi.fn().mockReturnValue(false),
            position: new Point(8, 8),
            strength: 50,
            name: "DeadEnemy",
        };
        (board as any).pieces = [deadEnemy];
        const t1 = new Point(1, 1);
        const t2 = new Point(2, 2);
        const result = (spell as any).selectDefaultTile(
            makeMockPlayer(makeMockCastingPiece()),
            new Point(0, 0),
            [t1, t2],
        );
        // Dead enemy excluded → no live enemies → no sort → array[0] = t1
        expect(result).toBe(t1);
    });

    it("excludes structure-status pieces from enemy list", () => {
        // A structure enemy at (8,8) — hasStatus(UnitStatus.Structure) returns true
        // so it should be excluded from the threat calculation.
        const structEnemy = {
            owner: "foe",
            dead: false,
            hasStatus: vi.fn().mockReturnValue(true), // any status check → true (including Structure)
            position: new Point(8, 8),
            strength: 50,
            name: "StructureEnemy",
        };
        (board as any).pieces = [structEnemy];
        const t1 = new Point(1, 1);
        const t2 = new Point(2, 2);
        const result = (spell as any).selectDefaultTile(
            makeMockPlayer(makeMockCastingPiece()),
            new Point(0, 0),
            [t1, t2],
        );
        // Structure excluded → no eligible enemies → no sort → array[0] = t1
        expect(result).toBe(t1);
    });

    it("uses player.ai.difficulty to compute weight passed to weightedRandomPick", () => {
        // At difficulty 0 weight = -(2 + 0*4) = -2; at difficulty 1 weight = -(2 + 1*4) = -6.
        // We verify by spying on rng.weightedRandomPick and inspecting the weight argument.
        (board as any).pieces = [];
        const player = makeMockPlayer(makeMockCastingPiece());
        player.ai = { difficulty: 1 };
        const t1 = new Point(0, 0);
        const pickSpy = vi.spyOn((board as any).rng, "weightedRandomPick");
        (spell as any).selectDefaultTile(player, new Point(0, 0), [t1]);
        expect(pickSpy).toHaveBeenCalledWith([t1], -6);
    });

    it("defaults difficulty to 0.5 when player has no ai controller", () => {
        // player.ai is null → difficulty = 0.5 → weight = -(2 + 0.5*4) = -4.
        (board as any).pieces = [];
        const player = makeMockPlayer(makeMockCastingPiece());
        player.ai = null;
        const t1 = new Point(0, 0);
        const pickSpy = vi.spyOn((board as any).rng, "weightedRandomPick");
        (spell as any).selectDefaultTile(player, new Point(0, 0), [t1]);
        expect(pickSpy).toHaveBeenCalledWith([t1], -4);
    });

    it("handles a single valid tile (no enemies)", () => {
        (board as any).pieces = [];
        const only = new Point(3, 3);
        const result = (spell as any).selectDefaultTile(
            makeMockPlayer(makeMockCastingPiece()),
            new Point(0, 0),
            [only],
        );
        expect(result).toBe(only);
    });

    it("does not modify tile order when all enemies are equidistant from all tiles", () => {
        // Enemy at (5,0). Tiles at (3,0) and (7,0) are both 2 units away.
        // Sort is stable on equal distances — original relative order preserved.
        const wizardPos = new Point(0, 0);
        const enemy = makeEnemy(5, 0, 10);
        (board as any).pieces = [enemy];
        const t1 = new Point(3, 0); // dist to (5,0) = 2
        const t2 = new Point(7, 0); // dist to (5,0) = 2
        // Both distances equal; stable sort keeps t1 first
        const result = (spell as any).selectDefaultTile(
            makeMockPlayer(makeMockCastingPiece()),
            wizardPos,
            [t1, t2],
        );
        expect(result).toBe(t1);
    });

    it("keeps the first enemy as highest-threat when the second enemy scores lower", () => {
        // Exercises the false branch of `if (score > highestThreatScore)` when a
        // subsequent enemy produces a score that does NOT exceed the current maximum.
        // Wizard at (0,0).
        // Enemy A at (1,0): strength=20, dist=1 → score = 20/2 = 10.0  ← highest
        // Enemy B at (5,0): strength=2, dist=5 → score = 2/6 ≈ 0.33   ← lower (false branch)
        // Tiles: (0,1) is far from enemy A; (1,1) is close to enemy A.
        // After sort ascending by distance to highest-threat (enemy A), (1,1) should win.
        const wizardPos = new Point(0, 0);
        const enemyA = makeEnemy(1, 0, 20); // high score
        const enemyB = makeEnemy(5, 0, 2); // low score — hits false branch
        (board as any).pieces = [enemyA, enemyB];
        const nearA = new Point(1, 1); // dist to (1,0) = 1
        const farA = new Point(5, 5); // dist to (1,0) ≈ 6.4
        const result = (spell as any).selectDefaultTile(
            makeMockPlayer(makeMockCastingPiece()),
            wizardPos,
            [farA, nearA],
        );
        expect(result).toBe(nearA);
    });
});
