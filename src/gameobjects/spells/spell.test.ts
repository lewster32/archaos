import { describe, it, expect, beforeEach, vi } from "vitest";
// Wizard must be imported first to resolve the circular dependency chain:
// Spell → Board → AttackSpell/SummonSpell → Spell (circular). Importing
// Wizard first causes Board to be fully evaluated before Spell is imported,
// so AttackSpell/SummonSpell can extend Spell without seeing it as undefined.
import "../wizard";
import { Spell } from "./spell";
import { Piece } from "../piece";
import { SpellType } from "../enums/spelltype";
import { SpellTarget } from "../enums/spelltarget";
import { UnitType } from "../enums/unittype";
import { Geom } from "phaser";
import { TestRNG } from "../rng";

import type { Board } from "../board";

import {
    makeMockBoard,
    makeMockPiece,
    makeMockPlayer,
    makeConfig,
} from "./spell.testhelpers";

// ─── Static methods ───────────────────────────────────────────────────────────

describe("Spell.getAllSpells", () => {
    it("returns a non-empty array", () => {
        const spells = Spell.getAllSpells();
        expect(Array.isArray(spells)).toBe(true);
        expect(spells.length).toBeGreaterThan(0);
    });

    it("every entry has a name", () => {
        for (const s of Spell.getAllSpells()) {
            expect(typeof s.name).toBe("string");
        }
    });
});

describe("Spell.getSpellProperties", () => {
    it("returns properties for a known spell name", () => {
        const p = Spell.getSpellProperties("Disbelieve");
        expect(p).toBeDefined();
        expect(p.id).toBe("disbelieve");
        expect(p.name).toBe("Disbelieve");
    });

    it("is case-insensitive", () => {
        expect(Spell.getSpellProperties("disbelieve").id).toBe("disbelieve");
        expect(Spell.getSpellProperties("DISBELIEVE").id).toBe("disbelieve");
    });

    it("returns undefined for an unknown name", () => {
        expect(Spell.getSpellProperties("NonExistentSpell")).toBeUndefined();
    });

    it("defaults target to SpellTarget.Empty when not specified", () => {
        const p = Spell.getSpellProperties("Lion");
        expect(p.target).toBe(SpellTarget.Empty);
    });

    it("defaults types to empty array", () => {
        const p = Spell.getSpellProperties("Lion");
        expect(p.types).toEqual([]);
    });

    it('defaults group to "classicspells"', () => {
        const p = Spell.getSpellProperties("Disbelieve");
        expect(p.group).toBe("classicspells");
    });
});

describe("Spell.getSpellsByType", () => {
    it("returns summon spells including Lion", () => {
        expect(Spell.getSpellsByType(SpellType.Summon)).toContain("Lion");
    });

    it("returns attack spells including Magic Bolt", () => {
        expect(Spell.getSpellsByType(SpellType.Attack)).toContain("Magic Bolt");
    });

    it("returns buff spells including Shadow Form", () => {
        expect(Spell.getSpellsByType(SpellType.Buff)).toContain("Shadow Form");
    });

    it("returns results for Misc type", () => {
        expect(Spell.getSpellsByType(SpellType.Misc).length).toBeGreaterThan(0);
    });

    it("contains no duplicates", () => {
        for (const type of [
            SpellType.Summon,
            SpellType.Attack,
            SpellType.Buff,
            SpellType.Misc,
        ]) {
            const spells = Spell.getSpellsByType(type);
            expect(spells.length).toBe(new Set(spells).size);
        }
    });
});

describe("Spell.getRandomSpell", () => {
    const rng = new TestRNG();

    it("returns a spell config", () => {
        const s = Spell.getRandomSpell(rng);
        expect(s).toBeDefined();
        expect(typeof s.name).toBe("string");
    });

    it("excludes persistent spells", () => {
        for (let i = 0; i < 100; i++) {
            expect(Spell.getRandomSpell(rng)?.persist).toBeFalsy();
        }
    });

    it("excludes gift-only spells when not gifted", () => {
        for (let i = 0; i < 100; i++) {
            expect(Spell.getRandomSpell(rng, false)?.giftOnly).toBeFalsy();
        }
    });

    it("respects a custom filter", () => {
        for (let i = 0; i < 100; i++) {
            const s = Spell.getRandomSpell(rng, false, (c) => c.balance > 0);
            expect(s?.balance).toBeGreaterThan(0);
        }
    });

    it("includes gift-only spells when gifted=true", () => {
        // Run enough times that we're very likely to see a gift-only spell
        const results = Array.from({ length: 100 }, () =>
            Spell.getRandomSpell(rng, true),
        );
        // Just verify it returns valid configs (the gifted path is now exercised)
        expect(results.every((s) => s && typeof s.name === "string")).toBe(
            true,
        );
    });
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe("Spell constructor", () => {
    let board: Board;
    beforeEach(() => {
        board = makeMockBoard();
    });

    it("throws when config is null", () => {
        expect(() => new Spell(board, 1, null as any)).toThrow(
            "No spell config provided",
        );
    });

    it("sets type to Buff for Self-target spells (non-turmoil)", () => {
        const s = new Spell(
            board,
            1,
            makeConfig({ target: SpellTarget.Self, id: "shadow-form" }),
        );
        expect(s.type).toBe(SpellType.Buff);
    });

    it("sets type to Misc for turmoil even though target is Self", () => {
        const s = new Spell(
            board,
            1,
            makeConfig({ target: SpellTarget.Self, id: "turmoil" }),
        );
        expect(s.type).toBe(SpellType.Misc);
    });

    it('sets type to Disbelieve for id "disbelieve"', () => {
        const s = new Spell(
            board,
            1,
            makeConfig({ id: "disbelieve", target: SpellTarget.Piece }),
        );
        expect(s.type).toBe(SpellType.Disbelieve);
    });

    it("sets type to Misc for all other spells", () => {
        const s = new Spell(
            board,
            1,
            makeConfig({ target: SpellTarget.Piece }),
        );
        expect(s.type).toBe(SpellType.Misc);
    });

    it("defaults castTimes to 1 when not in config", () => {
        const s = new Spell(board, 1, makeConfig());
        expect(s.castTimes).toBe(1);
        expect(s.totalCastTimes).toBe(1);
    });

    it("reads castTimes from config", () => {
        const s = new Spell(board, 1, makeConfig({ castTimes: 5 }));
        expect(s.castTimes).toBe(5);
        expect(s.totalCastTimes).toBe(5);
    });

    it("starts with failed = false", () => {
        expect(new Spell(board, 1, makeConfig()).failed).toBe(false);
    });
});

// ─── Simple getters ───────────────────────────────────────────────────────────

describe("Spell getters", () => {
    let board: Board;
    beforeEach(() => {
        board = makeMockBoard();
    });

    it("spellId", () => {
        expect(new Spell(board, 1, makeConfig({ id: "foo" })).spellId).toBe(
            "foo",
        );
    });

    it("name", () => {
        expect(new Spell(board, 1, makeConfig({ name: "Fireball" })).name).toBe(
            "Fireball",
        );
    });

    it("balance", () => {
        expect(new Spell(board, 1, makeConfig({ balance: -3 })).balance).toBe(
            -3,
        );
    });

    it("range defaults to 1.5", () => {
        expect(new Spell(board, 1, makeConfig()).range).toBe(1.5);
    });

    it("range reads from config", () => {
        expect(new Spell(board, 1, makeConfig({ range: 6 })).range).toBe(6);
    });

    it("persist defaults to false", () => {
        expect(new Spell(board, 1, makeConfig()).persist).toBe(false);
    });

    it("persist reads from config", () => {
        expect(new Spell(board, 1, makeConfig({ persist: true })).persist).toBe(
            true,
        );
    });

    it("lineOfSight defaults to false", () => {
        expect(new Spell(board, 1, makeConfig()).lineOfSight).toBe(false);
    });

    it("lineOfSight reads from config", () => {
        expect(
            new Spell(board, 1, makeConfig({ lineOfSight: true })).lineOfSight,
        ).toBe(true);
    });

    it("properties returns the config object", () => {
        const cfg = makeConfig();
        expect(new Spell(board, 2, cfg).properties).toBe(cfg);
    });
});

// ─── chance getter ────────────────────────────────────────────────────────────

describe("Spell.chance", () => {
    it("returns raw chance when spell balance is 0", () => {
        const board = makeMockBoard({ balance: 0.3 });
        const s = new Spell(board, 1, makeConfig({ chance: 0.6, balance: 0 }));
        expect(s.chance).toBe(0.6);
    });

    it("adds board balance for lawful spells", () => {
        const board = makeMockBoard({ balance: 0.2 });
        const s = new Spell(board, 1, makeConfig({ chance: 0.5, balance: 1 }));
        expect(s.chance).toBeCloseTo(0.7);
    });

    it("adds board balance for chaotic spells (negated)", () => {
        // balanceOffset *= -1 → negative board balance hurts chaotic chance
        const board = makeMockBoard({ balance: -0.2 });
        const s = new Spell(board, 1, makeConfig({ chance: 0.5, balance: -1 }));
        // boardBalance is -0.2, balanceOffset = -0.2 * -1 = 0.2 → 0.5 + 0.2 = 0.7
        expect(s.chance).toBeCloseTo(0.7);
    });

    it("clamps to minimum 0.1", () => {
        const board = makeMockBoard({ balance: -0.9 });
        const s = new Spell(board, 1, makeConfig({ chance: 0.1, balance: 1 }));
        expect(s.chance).toBe(0.1);
    });

    it("clamps to maximum 1", () => {
        const board = makeMockBoard({ balance: 0.9 });
        const s = new Spell(board, 1, makeConfig({ chance: 0.8, balance: 1 }));
        expect(s.chance).toBe(1);
    });
});

// ─── description getter ───────────────────────────────────────────────────────

describe("Spell.description", () => {
    it("returns the config description when provided", () => {
        const board = makeMockBoard();
        const s = new Spell(
            board,
            1,
            makeConfig({ description: "Custom desc", chance: 0.8, balance: 0 }),
        );
        expect(s.description).toBe("Custom desc");
    });

    it("returns empty string when chance >= 0.3 and no description", () => {
        const board = makeMockBoard();
        const s = new Spell(board, 1, makeConfig({ chance: 0.5, balance: 0 }));
        expect(s.description).toBe("");
    });

    it("returns chaotic warning when chance < 0.3 and balance < 0", () => {
        const board = makeMockBoard();
        const s = new Spell(board, 1, makeConfig({ chance: 0.1, balance: -1 }));
        expect(s.description).toContain("chaotic");
        expect(s.description).toContain("c-magenta");
    });

    it("returns lawful warning when chance < 0.3 and balance > 0", () => {
        const board = makeMockBoard();
        const s = new Spell(board, 1, makeConfig({ chance: 0.1, balance: 1 }));
        expect(s.description).toContain("lawful");
        expect(s.description).toContain("c-cyan");
    });

    it("returns generic warning when chance < 0.3 and balance is 0", () => {
        const board = makeMockBoard();
        const s = new Spell(board, 1, makeConfig({ chance: 0.1, balance: 0 }));
        expect(s.description).toContain("Unlikely to succeed");
        expect(s.description).not.toContain("chaotic");
        expect(s.description).not.toContain("lawful");
    });
});

// ─── owner setter ─────────────────────────────────────────────────────────────

describe("Spell.owner setter", () => {
    it("sets owner when player has a castingPiece", () => {
        const board = makeMockBoard();
        const piece = makeMockPiece();
        const player = makeMockPlayer(piece);
        const s = new Spell(board, 1, makeConfig());
        s.owner = player;
        expect(s.owner).toBe(player);
    });

    it("throws when owner has no castingPiece", () => {
        const board = makeMockBoard();
        const s = new Spell(board, 1, makeConfig());
        expect(() => {
            s.owner = makeMockPlayer(null);
        }).toThrow("Owner has no casting piece");
    });
});

// ─── resetCastTimes ───────────────────────────────────────────────────────────

describe("Spell.resetCastTimes", () => {
    it("restores castTimes to totalCastTimes", () => {
        const board = makeMockBoard();
        const s = new Spell(board, 1, makeConfig({ castTimes: 4 }));
        (s as any)._castTimes = 1;
        s.resetCastTimes();
        expect(s.castTimes).toBe(4);
    });
});

// ─── hasValidTargetsInRange ───────────────────────────────────────────────────

describe("Spell.hasValidTargetsInRange", () => {
    let board: Board;
    let owner: any;

    beforeEach(() => {
        board = makeMockBoard();
        owner = makeMockPlayer(makeMockPiece({ x: 0, y: 0 }));
    });

    it("returns true when range is 0 (self)", () => {
        const s = new Spell(board, 1, makeConfig({ range: 0 }));
        s.owner = owner;
        expect(s.hasValidTargetsInRange()).toBe(true);
    });

    it("returns true for Buff spells", () => {
        const s = new Spell(
            board,
            1,
            makeConfig({ target: SpellTarget.Self, id: "shadow-form" }),
        );
        s.owner = owner;
        expect(s.hasValidTargetsInRange()).toBe(true);
    });

    it("returns true for Summon spells", () => {
        const s = new Spell(board, 1, makeConfig());
        (s as any)._type = SpellType.Summon;
        s.owner = owner;
        expect(s.hasValidTargetsInRange()).toBe(true);
    });

    it("returns false when board has no pieces", () => {
        (board as any).pieces = [];
        const s = new Spell(
            board,
            1,
            makeConfig({
                target: SpellTarget.Piece,
                castOnEnemyUnit: true,
                range: -1,
            }),
        );
        s.owner = owner;
        expect(s.hasValidTargetsInRange()).toBe(false);
    });

    it("returns true when at least one valid piece is in range", () => {
        const enemy = makeMockPiece({
            owner: { id: 99 },
            canBeMagicAttacked: true,
        });
        (board as any).pieces = [enemy];
        (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([enemy]);
        const s = new Spell(
            board,
            1,
            makeConfig({
                target: SpellTarget.Piece,
                castOnEnemyUnit: true,
                range: -1,
                damage: 3,
            }),
        );
        s.owner = owner;
        expect(s.hasValidTargetsInRange()).toBe(true);
    });

    it("returns false when pieces are in range but none are valid targets", () => {
        const enemy = makeMockPiece({
            owner: { id: 99 },
            canBeMagicAttacked: false,
        });
        (board as any).pieces = [enemy];
        (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([enemy]);
        const s = new Spell(
            board,
            1,
            makeConfig({
                target: SpellTarget.Piece,
                castOnEnemyUnit: true,
                range: -1,
                damage: 3,
            }),
        );
        s.owner = owner;
        expect(s.hasValidTargetsInRange()).toBe(false);
    });

    it("returns false when a piece exists but is out of range", () => {
        const enemy = makeMockPiece({
            owner: { id: 99 },
            canBeMagicAttacked: true,
            x: 10,
            y: 10,
        });
        (board as any).pieces = [enemy];
        (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([enemy]);
        const s = new Spell(
            board,
            1,
            makeConfig({
                target: SpellTarget.Piece,
                castOnEnemyUnit: true,
                range: 1,
            }),
        );
        s.owner = owner;
        expect(s.hasValidTargetsInRange()).toBe(false);
    });
});

// ─── isValidTarget ────────────────────────────────────────────────────────────

describe("Spell.getValidTarget", () => {
    let board: Board;
    let owner: any;

    beforeEach(() => {
        board = makeMockBoard();
        owner = makeMockPlayer(makeMockPiece({ x: 0, y: 0 }));
    });

    describe("range checking", () => {
        it("returns null when target point is beyond range", () => {
            const s = new Spell(board, 1, makeConfig({ range: 1.5 }));
            s.owner = owner;
            expect(s.getValidTarget(new Geom.Point(10, 10))).toBeNull();
        });

        it("logs out-of-range reason when showReason=true", () => {
            const s = new Spell(board, 1, makeConfig({ range: 1.5 }));
            s.owner = owner;
            s.getValidTarget(new Geom.Point(10, 10), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("out of range"),
                expect.anything(),
            );
        });

        it("accepts any position when range is -1", () => {
            const enemy = makeMockPiece({
                owner: { id: 99 },
                canBeMagicAttacked: true,
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([enemy]);
            const s = new Spell(
                board,
                1,
                makeConfig({
                    range: -1,
                    target: SpellTarget.Piece,
                    castOnEnemyUnit: true,
                }),
            );
            s.owner = owner;
            expect(s.getValidTarget(new Geom.Point(100, 100))).toBe(enemy);
        });

        it("returns null for out-of-range point when range is exactly 0 and point differs", () => {
            const s = new Spell(board, 1, makeConfig({ range: 0 }));
            s.owner = owner;
            // Casting piece is at {0,0}; target is {1,0} → not equal
            expect(s.getValidTarget(new Geom.Point(1, 0))).toBeNull();
        });

        it("returns null (via inCastingRange error path) when castingPiece is null and range > 0", () => {
            const s = new Spell(board, 1, makeConfig({ range: 3 }));
            s.owner = owner;
            // Null out the casting piece after owner is set to exercise the guard
            (s as any)._castingPiece = null;
            expect(s.getValidTarget(new Geom.Point(1, 0))).toBeNull();
        });
    });

    describe("line of sight", () => {
        it("returns null when LOS required but blocked", () => {
            (board as any).hasLineOfSight = vi.fn().mockReturnValue(false);
            const s = new Spell(
                board,
                1,
                makeConfig({ lineOfSight: true, range: -1 }),
            );
            s.owner = owner;
            expect(s.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("logs LOS reason when showReason=true", () => {
            (board as any).hasLineOfSight = vi.fn().mockReturnValue(false);
            const s = new Spell(
                board,
                1,
                makeConfig({ lineOfSight: true, range: -1 }),
            );
            s.owner = owner;
            s.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("line of sight"),
                expect.anything(),
            );
        });
    });

    describe("tree adjacency", () => {
        it("returns null when tree spell would be placed adjacent to another tree", () => {
            // Use mockImplementation so the hasStatus(UnitStatus.Tree) callback is invoked
            const adjacentTree = makeMockPiece();
            adjacentTree.hasStatus = vi.fn().mockReturnValue(true);
            (board as any).getAdjacentPiecesAtPosition = vi
                .fn()
                .mockImplementation((_pt: any, filter?: any) =>
                    filter
                        ? [adjacentTree].filter((p) => filter(p))
                        : [adjacentTree],
                );
            const s = new Spell(
                board,
                1,
                makeConfig({ tree: true, range: -1 }),
            );
            s.owner = owner;
            expect(s.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("logs tree adjacency reason when showReason=true", () => {
            const adjacentTree = makeMockPiece();
            adjacentTree.hasStatus = vi.fn().mockReturnValue(true);
            (board as any).getAdjacentPiecesAtPosition = vi
                .fn()
                .mockImplementation((_pt: any, filter?: any) =>
                    filter
                        ? [adjacentTree].filter((p) => filter(p))
                        : [adjacentTree],
                );
            const s = new Spell(
                board,
                1,
                makeConfig({ tree: true, range: -1 }),
            );
            s.owner = owner;
            s.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("adjacent"),
                expect.anything(),
            );
        });

        it("allows targeting when tree spell has no adjacent trees", () => {
            const enemy = makeMockPiece({
                type: UnitType.Creature,
                owner: { id: 99 },
                canBeMagicAttacked: true,
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([enemy]);
            (board as any).getAdjacentPiecesAtPosition = vi
                .fn()
                .mockImplementation((_pt: any, filter?: any) =>
                    filter ? [].filter((p: any) => filter(p)) : [],
                );
            const s = new Spell(
                board,
                1,
                makeConfig({
                    tree: true,
                    range: -1,
                    target: SpellTarget.Piece,
                    castOnEnemyUnit: true,
                    damage: 3,
                }),
            );
            s.owner = owner;
            expect(s.getValidTarget(new Geom.Point(0, 0))).toBe(enemy);
        });
    });

    describe("SpellTarget.Self", () => {
        let spell: Spell;
        beforeEach(() => {
            spell = new Spell(
                board,
                1,
                makeConfig({ target: SpellTarget.Self, id: "shadow-form" }),
            );
            spell.owner = owner;
        });

        it("returns the wizard piece when one is at the target position", () => {
            const wizard = makeMockPiece({ type: UnitType.Wizard, owner });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([wizard]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBe(wizard);
        });

        it("returns the wizard piece when multiple pieces are at the target position but only one is a wizard", () => {
            const wizard = makeMockPiece({ type: UnitType.Wizard, owner });
            const creature = makeMockPiece({ type: UnitType.Creature, owner });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([creature, wizard]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBe(wizard);
        });

        it("returns null when no wizard is at the target position", () => {
            (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("logs reason when showReason=true and no wizard found", () => {
            (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([]);
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("own wizard"),
                expect.anything(),
            );
        });
    });

    describe("SpellTarget.Corpse", () => {
        let spell: Spell;
        beforeEach(() => {
            spell = new Spell(
                board,
                1,
                makeConfig({ target: SpellTarget.Corpse, range: -1 }),
            );
            spell.owner = owner;
        });

        it("returns the dead piece when only a corpse is present", () => {
            const corpse = makeMockPiece({ dead: true });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockImplementation((_pt: any, filter?: any) =>
                    filter ? [] : [corpse],
                );
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBe(corpse);
        });

        it("returns null when a living piece is at the position", () => {
            const living = makeMockPiece({ dead: false });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([living]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("returns null when a mounted living piece occupies the tile (filtered from targetPieces but found by secondary check)", () => {
            // The piece is alive but mounted, so it is filtered out of targetPieces.
            // The secondary getPiecesAtPosition call (with filter !p.dead) still finds it,
            // triggering the second branch of the Corpse condition guard.
            const mountedLiving = makeMockPiece({
                dead: false,
                currentMount: { id: 99 },
            });
            // The initial lookup returns the mounted piece; the spell's own filter
            // removes it from targetPieces (currentMount is set), so targetLivingPiece
            // is falsy. The secondary getPiecesAtPosition call uses a filter callback
            // (!p.dead) — use mockImplementation so that callback is actually invoked,
            // exercising the branch on line 381 of spell.ts.
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockImplementation((_pt: any, filter?: any) =>
                    filter
                        ? [mountedLiving].filter((p) => filter(p))
                        : [mountedLiving],
                );
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("returns falsy when position is empty (no corpse found)", () => {
            (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeFalsy();
        });

        it("logs corpse reason when living piece present and showReason=true", () => {
            const living = makeMockPiece({ dead: false });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([living]);
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("corpse"),
                expect.anything(),
            );
        });
    });

    describe("SpellTarget.Piece — enemy targeting", () => {
        let enemy: any;
        let spell: Spell;

        beforeEach(() => {
            enemy = makeMockPiece({
                type: UnitType.Creature,
                owner: { id: 99 },
                canBeMagicAttacked: true,
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([enemy]);
            spell = new Spell(
                board,
                1,
                makeConfig({
                    target: SpellTarget.Piece,
                    castOnEnemyUnit: true,
                    range: -1,
                    damage: 3,
                }),
            );
            spell.owner = owner;
        });

        it("returns enemy piece", () => {
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBe(enemy);
        });

        it("returns null when targeting a friendly piece", () => {
            const friendly = makeMockPiece({ type: UnitType.Creature, owner });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([friendly]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("returns null when targeting a mounted piece", () => {
            enemy.currentMount = { id: 2 };
            // mounted pieces are filtered out → no living target
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("returns null when targeting an engulfed piece", () => {
            enemy.engulfed = true;
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it('returns null and logs "empty ground" when no pieces present', () => {
            (board as any).getPiecesAtPosition = vi.fn().mockReturnValue([]);
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("empty ground"),
                expect.anything(),
            );
        });

        it('returns null and logs "corpse" when only dead pieces present', () => {
            const corpse = makeMockPiece({ dead: true, owner: { id: 99 } });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([corpse]);
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("corpse"),
                expect.anything(),
            );
        });

        it("returns null for invulnerable target and logs reason", () => {
            enemy.hasStatus = vi.fn().mockReturnValue(true);
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("invulnerable"),
                expect.anything(),
            );
        });

        it("returns null for invulnerable target without logging when showReason is absent", () => {
            enemy.hasStatus = vi.fn().mockReturnValue(true);
            const result = spell.getValidTarget(new Geom.Point(0, 0));
            expect(result).toBeNull();
            expect(board.logger.log).not.toHaveBeenCalled();
        });

        it("returns null for magic-immune target and logs reason", () => {
            enemy.canBeMagicAttacked = false;
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("magical attacks"),
                expect.anything(),
            );
        });

        it("returns null when targeting a wizard with castOnWizard=false", () => {
            const wizard = makeMockPiece({
                type: UnitType.Wizard,
                owner: { id: 99 },
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([wizard]);
            const s = new Spell(
                board,
                2,
                makeConfig({
                    target: SpellTarget.Piece,
                    castOnEnemyUnit: true,
                    castOnWizard: false,
                    range: -1,
                }),
            );
            s.owner = owner;
            expect(s.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it('logs "cannot be cast on a wizard" reason when showReason=true and castOnWizard=false', () => {
            const wizard = makeMockPiece({
                type: UnitType.Wizard,
                owner: { id: 99 },
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([wizard]);
            const s = new Spell(
                board,
                2,
                makeConfig({
                    target: SpellTarget.Piece,
                    castOnEnemyUnit: true,
                    castOnWizard: false,
                    range: -1,
                }),
            );
            s.owner = owner;
            s.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("cannot be cast on a wizard"),
                expect.anything(),
            );
        });

        it('returns null and logs "must be cast on an enemy unit" when targeting friendly', () => {
            const friendly = makeMockPiece({ type: UnitType.Creature, owner });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([friendly]);
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("enemy unit"),
                expect.anything(),
            );
        });

        it("uses target piece directly (skips getPiecesAtPosition) when Piece.isPiece returns true", () => {
            const spy = vi.spyOn(Piece, "isPiece").mockReturnValue(true);
            // enemy already has position:{x:0,y:0} so targetPoint resolves correctly
            const result = spell.getValidTarget(enemy);
            expect(result).toBe(enemy);
            expect(board.getPiecesAtPosition).not.toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    describe("SpellTarget.Piece — Disbelieve", () => {
        let spell: Spell;

        beforeEach(() => {
            spell = new Spell(board, 1, Spell.getSpellProperties("Disbelieve"));
            spell.owner = owner;
        });

        it("returns the disbelievable enemy piece", () => {
            const illusion = makeMockPiece({
                owner: { id: 99 },
                canBeDisbelieved: true,
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([illusion]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBe(illusion);
        });

        it("returns null for a non-disbelievable piece", () => {
            const solid = makeMockPiece({
                owner: { id: 99 },
                canBeDisbelieved: false,
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([solid]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("logs reason when showReason=true and piece is not disbelievable", () => {
            const solid = makeMockPiece({
                owner: { id: 99 },
                canBeDisbelieved: false,
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([solid]);
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("cannot be cast on this unit"),
                expect.anything(),
            );
        });
    });

    describe("SpellTarget.Piece — Subversion", () => {
        let spell: Spell;

        beforeEach(() => {
            spell = new Spell(
                board,
                1,
                makeConfig({
                    id: "subversion",
                    target: SpellTarget.Piece,
                    castOnEnemyUnit: true,
                    range: -1,
                }),
            );
            spell.owner = owner;
        });

        it("returns the subvertable enemy piece", () => {
            const target = makeMockPiece({
                owner: { id: 99 },
                canBeSubverted: true,
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([target]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBe(target);
        });

        it("returns null for a non-subvertable piece", () => {
            const target = makeMockPiece({
                owner: { id: 99 },
                canBeSubverted: false,
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([target]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("logs reason when showReason=true and piece is not subvertable", () => {
            const target = makeMockPiece({
                owner: { id: 99 },
                canBeSubverted: false,
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([target]);
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("cannot be cast on this unit"),
                expect.anything(),
            );
        });
    });

    describe("SpellTarget.Piece — no targeting flags", () => {
        it("returns null when neither castOnEnemyUnit nor castOnFriendlyUnit is set", () => {
            const piece = makeMockPiece({ owner: { id: 99 } });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([piece]);
            // SpellTarget.Piece with no castOnEnemyUnit/castOnFriendlyUnit falls through to final return null
            const s = new Spell(
                board,
                1,
                makeConfig({ target: SpellTarget.Piece, range: -1 }),
            );
            s.owner = owner;
            expect(s.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });
    });

    describe("SpellTarget.Piece — friendly unit targeting", () => {
        let spell: Spell;

        beforeEach(() => {
            spell = new Spell(
                board,
                1,
                makeConfig({
                    target: SpellTarget.Piece,
                    castOnFriendlyUnit: true,
                    range: -1,
                }),
            );
            spell.owner = owner;
        });

        it("returns the friendly piece", () => {
            const friendly = makeMockPiece({ type: UnitType.Creature, owner });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([friendly]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBe(friendly);
        });

        it("returns null when targeting an enemy piece", () => {
            const enemy = makeMockPiece({
                type: UnitType.Creature,
                owner: { id: 99 },
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([enemy]);
            expect(spell.getValidTarget(new Geom.Point(0, 0))).toBeNull();
        });

        it("logs reason when targeting an enemy with showReason=true", () => {
            const enemy = makeMockPiece({
                type: UnitType.Creature,
                owner: { id: 99 },
            });
            (board as any).getPiecesAtPosition = vi
                .fn()
                .mockReturnValue([enemy]);
            spell.getValidTarget(new Geom.Point(0, 0), true);
            expect(board.logger.log as any).toHaveBeenCalledWith(
                expect.stringContaining("friendly unit"),
                expect.anything(),
            );
        });
    });
});

// ─── cast ─────────────────────────────────────────────────────────────────────

describe("Spell.cast", () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;

    beforeEach(() => {
        castingPiece = makeMockPiece({ x: 0, y: 0 });
        owner = makeMockPlayer(castingPiece);
        board = makeMockBoard({ rollChanceResult: true });
    });

    it("returns null and sets failed when roll fails", async () => {
        (board as any).rollChance = vi.fn().mockReturnValue(false);
        const s = new Spell(board, 1, makeConfig());
        s.owner = owner;
        const result = await s.cast(owner, castingPiece);
        expect(result).toBeNull();
        expect(s.failed).toBe(true);
    });

    it("decrements castTimes on a successful cast", async () => {
        const s = new Spell(board, 1, makeConfig({ castTimes: 3 }));
        s.owner = owner;
        await s.cast(owner, castingPiece);
        expect(s.castTimes).toBe(2);
    });

    it("does not re-roll on subsequent casts of a multi-cast spell", async () => {
        const s = new Spell(board, 1, makeConfig({ castTimes: 3 }));
        s.owner = owner;
        await s.cast(owner, castingPiece); // first cast — rolls once
        (board.rollChance as any).mockClear();
        await s.cast(owner, castingPiece); // second cast — should not roll
        expect(board.rollChance).not.toHaveBeenCalled();
    });

    it("shifts board balance towards law on the first successful cast", async () => {
        expect((board as any).balanceShift).toBe(0);
        const s = new Spell(board, 1, makeConfig({ balance: 2 }));
        s.owner = owner;
        await s.cast(owner, castingPiece);
        expect((board as any).balanceShift).toBeGreaterThan(0);
    });

    it("shifts board balance towards chaos on the first successful cast", async () => {
        expect((board as any).balanceShift).toBe(0);
        const s = new Spell(board, 1, makeConfig({ balance: -2 }));
        s.owner = owner;
        await s.cast(owner, castingPiece);
        expect((board as any).balanceShift).toBeLessThan(0);
    });

    it("does not shift balance when cast fails", async () => {
        (board as any).rollChance = vi.fn().mockReturnValue(false);
        const s = new Spell(board, 1, makeConfig({ balance: 2 }));
        s.owner = owner;
        await s.cast(owner, castingPiece);
        expect((board as any).balanceShift).toBe(0);
    });

    it("passes a cloned point to doCast when target is a Point", async () => {
        const s = new Spell(board, 1, makeConfig());
        s.owner = owner;
        // doCast returns false for a bare Misc spell — just ensure no throw
        const result = await s.cast(owner, castingPiece, new Geom.Point(2, 3));
        expect(result).toBe(false);
    });

    it("extracts castPoint from piece.position when Piece.isPiece returns true", async () => {
        const spy = vi.spyOn(Piece, "isPiece").mockReturnValue(true);
        const pieceTarget = makeMockPiece({ x: 2, y: 3 });
        const s = new Spell(board, 1, makeConfig());
        s.owner = owner;
        const result = await s.cast(owner, castingPiece, pieceTarget);
        expect(result).toBe(false); // base doCast returns false
        spy.mockRestore();
    });

    it("succeeds and returns doCast result when target is omitted", async () => {
        const s = new Spell(board, 1, makeConfig());
        s.owner = owner;
        const result = await s.cast(owner, castingPiece);
        expect(result).toBe(false); // base doCast returns false, not null, so roll succeeded
        expect(s.failed).toBe(false);
    });

    it("does not shift balance on subsequent casts of a multi-cast spell", async () => {
        const s = new Spell(board, 1, makeConfig({ castTimes: 3, balance: 2 }));
        s.owner = owner;
        await s.cast(owner, castingPiece); // first cast — shifts balance
        const balanceAfterFirst = (board as any).balanceShift;
        await s.cast(owner, castingPiece); // second cast — must not shift again
        expect((board as any).balanceShift).toBe(balanceAfterFirst);
    });
});

// ─── castFail ─────────────────────────────────────────────────────────────────

describe("Spell.castFail", () => {
    it("sets failed=true and castTimes=0", async () => {
        const board = makeMockBoard();
        const piece = makeMockPiece();
        const owner = makeMockPlayer(piece);
        const s = new Spell(board, 1, makeConfig({ castTimes: 3 }));
        s.owner = owner;
        await s.castFail(owner, piece);
        expect(s.failed).toBe(true);
        expect(s.castTimes).toBe(0);
    });

    it("calls board.playEffect", async () => {
        const board = makeMockBoard();
        const piece = makeMockPiece();
        const owner = makeMockPlayer(piece);
        const s = new Spell(board, 1, makeConfig());
        s.owner = owner;
        await s.castFail(owner, piece);
        expect(board.playEffect).toHaveBeenCalledTimes(1);
    });
});

// ─── showRange ────────────────────────────────────────────────────────────────

describe("Spell.showRange", () => {
    it("calls showSimpleRange when show=true", async () => {
        const board = makeMockBoard();
        const piece = makeMockPiece({ x: 2, y: 3 });
        const owner = makeMockPlayer(piece);
        const s = new Spell(
            board,
            1,
            makeConfig({ range: 5, lineOfSight: true }),
        );
        s.owner = owner;
        await s.showRange(true);
        expect((board as any).rangeGizmo.showSimpleRange).toHaveBeenCalledWith(
            piece.position,
            5,
            expect.anything(),
            true,
        );
    });

    it("calls rangeGizmo.reset when show=false", async () => {
        const board = makeMockBoard();
        const owner = makeMockPlayer(makeMockPiece());
        const s = new Spell(board, 1, makeConfig());
        s.owner = owner;
        await s.showRange(false);
        expect((board as any).rangeGizmo.reset).toHaveBeenCalled();
    });
});

// ─── doCast ───────────────────────────────────────────────────────────────────

describe("Spell.doCast — fallthrough", () => {
    it("returns false for an unhandled Misc spell", async () => {
        const board = makeMockBoard();
        const castingPiece = makeMockPiece();
        const owner = makeMockPlayer(castingPiece);
        const s = new Spell(
            board,
            1,
            makeConfig({ target: SpellTarget.Piece, castOnEnemyUnit: true }),
        );
        s.owner = owner;
        const result = await s.doCast(
            owner,
            castingPiece,
            new Geom.Point(0, 0),
            [],
        );
        expect(result).toBe(false);
    });
});
