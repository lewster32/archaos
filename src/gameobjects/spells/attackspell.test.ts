import { describe, it, expect, beforeEach, vi } from "vitest";
// Resolve circular dependency: Spell → Board → AttackSpell/SummonSpell → Spell
import "../wizard";
import { AttackSpell } from "./attackspell";
import { Spell } from "./spell";
import { SpellTarget } from "../enums/spelltarget";
import { SpellType } from "../enums/spelltype";
import { UnitStatus } from "../enums/unitstatus";
import { UnitType } from "../enums/unittype";
import { UnitRangedProjectileType } from "../enums/unitrangedprojectiletype";
import { Geom } from "phaser";
import type { Board } from "../board";
import type { SpellConfig } from "../configs/spellconfig";
import { TestRNG } from "../rng";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockBoard(opts: { rollResult?: boolean } = {}): Board {
    const { rollResult = true } = opts;
    return {
        balance: 0,
        balanceShift: 0,
        rollChance: vi.fn().mockReturnValue(true),
        roll: vi.fn().mockReturnValue(rollResult),
        hasLineOfSight: vi.fn().mockReturnValue(true),
        getAdjacentPiecesAtPosition: vi.fn().mockReturnValue([]),
        getPiecesAtPosition: vi.fn().mockReturnValue([]),
        playEffect: vi.fn().mockResolvedValue(undefined),
        idleDelay: vi.fn().mockResolvedValue(undefined),
        logger: { log: vi.fn() },
        sound: {
            play: vi.fn(),
            playAsync: vi.fn().mockResolvedValue(undefined),
        },
        rangeGizmo: { showSimpleRange: vi.fn(), reset: vi.fn() },
        pieces: [],
        players: [],
        rng: new TestRNG(),
    } as unknown as Board;
}

function makeMockPiece(
    opts: {
        id?: number;
        type?: UnitType;
        owner?: any;
        dead?: boolean;
        currentMount?: any;
        engulfed?: boolean;
        canBeMagicAttacked?: boolean;
        x?: number;
        y?: number;
        fullName?: string;
        wizardStatus?: boolean;
    } = {},
): any {
    const {
        id = 1,
        type = UnitType.Creature,
        owner = null,
        dead = false,
        currentMount = null,
        engulfed = false,
        canBeMagicAttacked = true,
        x = 0,
        y = 0,
        fullName = "Test Piece",
        wizardStatus = false,
    } = opts;
    return {
        id,
        type,
        owner,
        dead,
        currentMount,
        engulfed,
        canBeMagicAttacked,
        position: new Geom.Point(x, y),
        stats: { magicResistance: 0 },
        hasStatus: vi
            .fn()
            .mockImplementation((s: string) =>
                s === UnitStatus.Wizard ? wizardStatus : false,
            ),
        sprite: { getCenter: vi.fn().mockReturnValue({ x: 0, y: 0 }) },
        kill: vi.fn().mockResolvedValue(undefined),
        fullName,
        name: fullName,
    };
}

function makeMockPlayer(castingPiece?: any): any {
    return {
        castingPiece: castingPiece ?? null,
        name: "Caster",
        ai: null,
        destroyCreations: vi.fn().mockResolvedValue(undefined),
    };
}

/** Config for a generic damage+enemy-targeting spell. Piece config is required
 *  so that getValidTarget can find the target via getPiecesAtPosition. */
function makeAttackConfig(overrides: Partial<SpellConfig> = {}): SpellConfig {
    return {
        id: "test-attack",
        name: "Test Attack",
        chance: 1,
        balance: 0,
        target: SpellTarget.Piece,
        castOnEnemyUnit: true,
        castOnWizard: true,
        damage: 3,
        range: -1,
        ...overrides,
    };
}

/** Set up a mock board whose getPiecesAtPosition returns the given enemy so
 *  that getValidTarget resolves it as a valid target for the spell. */
function wireEnemy(board: Board, enemy: any) {
    (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([enemy]);
}

// ─── Constructor ──────────────────────────────────────────────────────────────

describe("AttackSpell constructor", () => {
    it("sets type to SpellType.Attack", () => {
        const board = makeMockBoard();
        const s = new AttackSpell(board, 1, makeAttackConfig());
        expect(s.type).toBe(SpellType.Attack);
    });
});

// ─── damage getter ────────────────────────────────────────────────────────────

describe("AttackSpell.damage", () => {
    let board: Board;
    beforeEach(() => {
        board = makeMockBoard();
    });

    it("returns the config damage value", () => {
        const s = new AttackSpell(board, 1, makeAttackConfig({ damage: 7 }));
        expect(s.damage).toBe(7);
    });

    it("returns 0 when damage is not set in config", () => {
        const s = new AttackSpell(
            board,
            1,
            makeAttackConfig({ damage: undefined }),
        );
        expect(s.damage).toBe(0);
    });
});

// ─── description getter ───────────────────────────────────────────────────────

describe("AttackSpell.description", () => {
    let board: Board;
    beforeEach(() => {
        board = makeMockBoard();
    });

    it('includes "Attack with <name>"', () => {
        const s = new AttackSpell(
            board,
            1,
            makeAttackConfig({ name: "Magic Bolt", chance: 1, balance: 0 }),
        );
        expect(s.description).toContain("Attack with Magic Bolt");
    });

    it("includes destroyWizardCreatures note when flag is set", () => {
        const s = new AttackSpell(
            board,
            1,
            makeAttackConfig({ destroyWizardCreatures: true }),
        );
        expect(s.description).toContain("destroy their creations");
    });

    it("does not include destroyWizardCreatures note when flag is absent", () => {
        const s = new AttackSpell(
            board,
            1,
            makeAttackConfig({ destroyWizardCreatures: false }),
        );
        expect(s.description).not.toContain("destroy their creations");
    });

    it("appends the base Spell description when chance is low and balance is chaotic", () => {
        const s = new AttackSpell(
            board,
            1,
            makeAttackConfig({ chance: 0.1, balance: -1 }),
        );
        expect(s.description).toContain("Attack with");
        expect(s.description).toContain("chaotic");
    });
});

// ─── doCast ───────────────────────────────────────────────────────────────────

describe("AttackSpell.doCast", () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;
    let enemy: any;

    beforeEach(() => {
        castingPiece = makeMockPiece({ x: 0, y: 0 });
        owner = makeMockPlayer(castingPiece);
        board = makeMockBoard({ rollResult: true });
        enemy = makeMockPiece({
            owner: { id: 99, name: "Enemy" },
            canBeMagicAttacked: true,
        });
        wireEnemy(board, enemy);
    });

    it("throws when targets list is empty", async () => {
        const s = new AttackSpell(board, 1, makeAttackConfig());
        s.owner = owner;
        await expect(
            s.doCast(owner, castingPiece, new Geom.Point(0, 0), []),
        ).rejects.toThrow("No targets");
    });

    it("throws when no target passes getValidTarget", async () => {
        // Make the board return no pieces, so getValidTarget returns null for every target
        (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([]);
        const s = new AttackSpell(board, 1, makeAttackConfig());
        s.owner = owner;
        await expect(
            s.doCast(owner, castingPiece, new Geom.Point(0, 0), [enemy]),
        ).rejects.toThrow("No valid target");
    });

    it("returns true on a successful attack", async () => {
        const s = new AttackSpell(board, 1, makeAttackConfig());
        s.owner = owner;
        const result = await s.doCast(
            owner,
            castingPiece,
            new Geom.Point(0, 0),
            [enemy],
        );
        expect(result).toBe(true);
    });

    it("kills the target when roll succeeds", async () => {
        const s = new AttackSpell(board, 1, makeAttackConfig());
        s.owner = owner;
        await s.doCast(owner, castingPiece, new Geom.Point(0, 0), [enemy]);
        expect(enemy.kill).toHaveBeenCalledTimes(1);
    });

    it("does not kill target when roll fails", async () => {
        (board as any).roll = vi.fn().mockReturnValue(false);
        const s = new AttackSpell(board, 1, makeAttackConfig());
        s.owner = owner;
        await s.doCast(owner, castingPiece, new Geom.Point(0, 0), [enemy]);
        expect(enemy.kill).not.toHaveBeenCalled();
    });

    it("logs defeat message when target is killed", async () => {
        const s = new AttackSpell(board, 1, makeAttackConfig());
        s.owner = owner;
        enemy.fullName = "Giant Rat";
        await s.doCast(owner, castingPiece, new Geom.Point(0, 0), [enemy]);
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining("Giant Rat"),
            expect.anything(),
        );
    });

    describe("Lightning projectile", () => {
        let spell: AttackSpell;
        beforeEach(() => {
            spell = new AttackSpell(
                board,
                1,
                makeAttackConfig({
                    projectile: UnitRangedProjectileType.Lightning,
                }),
            );
            spell.owner = owner;
        });

        it('plays "lightning4" beam sound', async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            expect((board as any).sound.play).toHaveBeenCalledWith(
                "lightning4",
            );
        });

        it('plays "lightningexplode" hit sound', async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            expect((board as any).sound.play).toHaveBeenCalledWith(
                "lightningexplode",
            );
        });

        it("calls playEffect twice (beam + hit)", async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            expect(board.playEffect).toHaveBeenCalledTimes(2);
        });
    });

    describe("Magic Bolt projectile", () => {
        let spell: AttackSpell;
        beforeEach(() => {
            spell = new AttackSpell(
                board,
                1,
                makeAttackConfig({
                    projectile: UnitRangedProjectileType.MagicBolt,
                }),
            );
            spell.owner = owner;
        });

        it('plays "magicbolt6" beam sound', async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            expect((board as any).sound.play).toHaveBeenCalledWith(
                "magicbolt6",
            );
        });

        it('plays "magicboltexplode" hit sound', async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            expect((board as any).sound.play).toHaveBeenCalledWith(
                "magicboltexplode",
            );
        });
    });

    describe("Justice projectile", () => {
        let spell: AttackSpell;
        beforeEach(() => {
            spell = new AttackSpell(
                board,
                1,
                makeAttackConfig({
                    projectile: UnitRangedProjectileType.Justice,
                }),
            );
            spell.owner = owner;
        });

        it('plays "justice" hit sound', async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            expect((board as any).sound.play).toHaveBeenCalledWith("justice");
        });

        it("does not play a beam sound (no beamSound for Justice)", async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            // Only hitSound played — no beam-specific sounds
            const playCalls = ((board as any).sound.play as any).mock.calls.map(
                (c: any[]) => c[0],
            );
            expect(playCalls).not.toContain("lightning4");
            expect(playCalls).not.toContain("magicbolt6");
        });

        it("calls playEffect once (hit only, no beam)", async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            expect(board.playEffect).toHaveBeenCalledTimes(1);
        });
    });

    describe("Dark Power projectile", () => {
        let spell: AttackSpell;
        beforeEach(() => {
            spell = new AttackSpell(
                board,
                1,
                makeAttackConfig({
                    projectile: UnitRangedProjectileType.DarkPower,
                }),
            );
            spell.owner = owner;
        });

        it('plays "justice" hit sound', async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            expect((board as any).sound.play).toHaveBeenCalledWith("justice");
        });

        it("calls playEffect once (hit only, no beam)", async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                enemy,
            ]);
            expect(board.playEffect).toHaveBeenCalledTimes(1);
        });
    });

    describe("unknown / unspecified projectile", () => {
        it("plays no beam or hit sounds", async () => {
            const s = new AttackSpell(
                board,
                1,
                makeAttackConfig({ projectile: undefined }),
            );
            s.owner = owner;
            (board as any).roll.mockReturnValue(false); // prevent "killcreature" sound
            await s.doCast(owner, castingPiece, new Geom.Point(0, 0), [enemy]);
            expect((board as any).sound.play).not.toHaveBeenCalled();
        });

        it("calls playEffect zero times (no beam, no hit effect)", async () => {
            const s = new AttackSpell(
                board,
                1,
                makeAttackConfig({ projectile: undefined }),
            );
            s.owner = owner;
            await s.doCast(owner, castingPiece, new Geom.Point(0, 0), [enemy]);
            expect(board.playEffect).not.toHaveBeenCalled();
        });
    });

    describe("destroyWizardCreatures", () => {
        let wizardTarget: any;
        let wizardOwner: any;
        let spell: AttackSpell;

        beforeEach(() => {
            wizardOwner = {
                id: 99,
                name: "Enemy Wizard",
                destroyCreations: vi.fn().mockResolvedValue(undefined),
            };
            wizardTarget = makeMockPiece({
                owner: wizardOwner,
                type: UnitType.Wizard,
                wizardStatus: true,
                fullName: "Gandalf",
            });
            wireEnemy(board, wizardTarget);
            spell = new AttackSpell(
                board,
                1,
                makeAttackConfig({
                    destroyWizardCreatures: true,
                    castOnWizard: true,
                }),
            );
            spell.owner = owner;
        });

        it("calls destroyCreations when roll succeeds on a wizard target", async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                wizardTarget,
            ]);
            expect(wizardOwner.destroyCreations).toHaveBeenCalledTimes(1);
        });

        it("does not kill the wizard directly (creations are destroyed instead)", async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                wizardTarget,
            ]);
            expect(wizardTarget.kill).not.toHaveBeenCalled();
        });

        it("logs a creations-dispelled message", async () => {
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                wizardTarget,
            ]);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("dispelled"),
            );
        });

        it("does not call destroyCreations when roll fails", async () => {
            (board as any).roll = vi.fn().mockReturnValue(false);
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                wizardTarget,
            ]);
            expect(wizardOwner.destroyCreations).not.toHaveBeenCalled();
        });

        it("kills a non-wizard target normally even when destroyWizardCreatures is set", async () => {
            const creature = makeMockPiece({
                owner: { id: 99 },
                canBeMagicAttacked: true,
            });
            wireEnemy(board, creature);
            await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
                creature,
            ]);
            expect(creature.kill).toHaveBeenCalledTimes(1);
        });
    });

    it("uses the real Magic Bolt spell config from JSON", async () => {
        const config = Spell.getSpellProperties("Magic Bolt");
        const s = new AttackSpell(board, 1, config);
        s.owner = owner;
        const result = await s.doCast(
            owner,
            castingPiece,
            new Geom.Point(0, 0),
            [enemy],
        );
        expect(result).toBe(true);
        expect((board as any).sound.play).toHaveBeenCalledWith("magicbolt6");
    });

    it("uses the real Lightning spell config from JSON", async () => {
        const config = Spell.getSpellProperties("Lightning");
        const s = new AttackSpell(board, 1, config);
        s.owner = owner;
        const result = await s.doCast(
            owner,
            castingPiece,
            new Geom.Point(0, 0),
            [enemy],
        );
        expect(result).toBe(true);
        expect((board as any).sound.play).toHaveBeenCalledWith("lightning4");
    });
});
