import { describe, it, expect, vi } from "vitest";
import { Wizard } from "./wizard";
import { Piece } from "./piece";
import { Board } from "./board";
import { TestRNG } from "./rng";
import { Logger } from "./logger";
import { Rules } from "./rules";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { GameSetupPlayerType } from "./interfaces/ui";

// ── Shared board factory ────────────────────────────────────────────────────

function makeRules(): Rules {
    return {
        doSpread: vi.fn().mockResolvedValue(undefined),
        doExpire: vi.fn().mockResolvedValue(undefined),
        doAutoCastSpell: vi.fn().mockResolvedValue(false),
        doCastSpell: vi.fn().mockResolvedValue(false),
    } as unknown as Rules;
}

function makeBoard(): Board {
    return new Board(1, 13, 13, false, undefined, {
        rng: new TestRNG(),
        logger: { log: vi.fn() } as unknown as Logger,
        rules: makeRules(),
    });
}

/**
 * Create a wizard on a real Board so we get a fully-functional
 * instance with an owner.  Returns [board, wizard].
 */
function makeWizard(wizCode = "0000000000"): [Board, Wizard] {
    const board = makeBoard();
    const player = board.addPlayer({
        name: "TestPlayer",
        type: GameSetupPlayerType.Local,
    });
    // addWizard is async but resolves synchronously in the engine.
    // We use a synchronous approach via direct construction.
    const wizard = new Wizard(board, 99, {
        owner: player,
        x: 0,
        y: 0,
        wizCode,
    });
    return [board, wizard];
}

// ── Wizard.parseWizCode ─────────────────────────────────────────────────────

describe("Wizard.parseWizCode", () => {
    it("parses a valid 10-digit hex WizCode", () => {
        const result = Wizard.parseWizCode("0102030405");
        expect(result.code).toBe("0102030405");
        expect(result.wiz).toBe(1);
        expect(result.pri).toBe(2);
        expect(result.sec).toBe(3);
        expect(result.skin).toBe(4);
        expect(result.hat).toBe(5);
    });

    it("normalises the WizCode to lowercase", () => {
        const result = Wizard.parseWizCode("AABBCCDDEE");
        expect(result.code).toBe("aabbccddee");
    });

    it("clamps wiz to wizcodeMax.wiz", () => {
        // wizcodeMax.wiz = 15; 0xff = 255 → clamped to 15
        const result = Wizard.parseWizCode("ff00000000");
        expect(result.wiz).toBe(Wizard.wizcodeMax.wiz);
    });

    it("clamps pri to wizcodeMax.pri", () => {
        // wizcodeMax.pri = 35; 0xff = 255 → clamped to 35
        const result = Wizard.parseWizCode("00ff000000");
        expect(result.pri).toBe(Wizard.wizcodeMax.pri);
    });

    it("clamps sec to wizcodeMax.sec", () => {
        const result = Wizard.parseWizCode("0000ff0000");
        expect(result.sec).toBe(Wizard.wizcodeMax.sec);
    });

    it("clamps skin to wizcodeMax.skin", () => {
        const result = Wizard.parseWizCode("000000ff00");
        expect(result.skin).toBe(Wizard.wizcodeMax.skin);
    });

    it("clamps hat to wizcodeMax.hat", () => {
        const result = Wizard.parseWizCode("00000000ff");
        expect(result.hat).toBe(Wizard.wizcodeMax.hat);
    });

    it("throws for an empty string", () => {
        expect(() => Wizard.parseWizCode("")).toThrow("WizCode cannot be empty");
    });

    it("throws for a whitespace-only string", () => {
        expect(() => Wizard.parseWizCode("   ")).toThrow("WizCode cannot be empty");
    });

    it("throws for a non-hex string", () => {
        expect(() => Wizard.parseWizCode("zzzzzzzzzz")).toThrow("Invalid WizCode");
    });

    it("throws for a WizCode that is too short", () => {
        expect(() => Wizard.parseWizCode("01020304")).toThrow("Invalid WizCode");
    });

    it("throws for a WizCode that is too long", () => {
        expect(() => Wizard.parseWizCode("010203040506")).toThrow("Invalid WizCode");
    });
});

// ── Wizard.randomWizCode ────────────────────────────────────────────────────

describe("Wizard.randomWizCode", () => {
    it("returns a 10-character lowercase hex string", () => {
        const code = Wizard.randomWizCode();
        expect(code).toMatch(/^[0-9a-f]{10}$/);
    });

    it("returns different values on repeated calls", () => {
        const codes = new Set<string>();
        for (let i = 0; i < 20; i++) {
            codes.add(Wizard.randomWizCode());
        }
        // At least two distinct codes among 20 random ones
        expect(codes.size).toBeGreaterThan(1);
    });
});

// ── Wizard constructor ───────────────────────────────────────────────────────

describe("Wizard constructor", () => {
    it("creates a wizard with the given WizCode", () => {
        const [, wizard] = makeWizard("0102030405");
        expect(wizard.wizCode).toBe("0102030405");
    });

    it("sets the owner's castingPiece to the wizard", () => {
        const [, wizard] = makeWizard();
        expect(wizard.owner?.castingPiece).toBe(wizard);
    });

    it("throws when no owner is provided", () => {
        const board = makeBoard();
        expect(
            () =>
                new Wizard(board, 99, {
                    owner: undefined,
                    x: 0,
                    y: 0,
                    wizCode: "0000000000",
                }),
        ).toThrow("Wizard must have an owner");
    });

    it("generates a random WizCode when none provided", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const wizard = new Wizard(board, 99, {
            owner: player,
            x: 0,
            y: 0,
            wizCode: "",
        });
        // randomWizCode() is called on empty string — result should
        // be a valid 10-char hex WizCode.
        expect(wizard.wizCode).toMatch(/^[0-9a-f]{10}$/);
    });

    it("has UnitType.Wizard type via DEFAULT_WIZARD_CONFIG", () => {
        const [, wizard] = makeWizard();
        expect(wizard.type).toBe(UnitType.Wizard);
    });

    it("has the Wizard status via DEFAULT_WIZARD_CONFIG", () => {
        const [, wizard] = makeWizard();
        expect(wizard.hasStatus(UnitStatus.Wizard)).toBe(true);
    });
});

// ── Wizard getters ───────────────────────────────────────────────────────────

describe("Wizard getters", () => {
    it("name returns the owner's name", () => {
        const [, wizard] = makeWizard();
        expect(wizard.name).toBe("TestPlayer");
    });

    it("name returns 'Unnamed wizard' when owner has no name", () => {
        const [board] = makeWizard();
        // Add a player with an empty name to get a valid owner reference
        const owner = board.players[0];
        (owner as any)._name = "";
        // Re-read name through the wizard to exercise the || fallback
        const [, wizard] = makeWizard();
        // Directly set owner name to empty string on the wizard's owner
        (wizard as any)._owner._name = "";
        expect(wizard.name).toBe("Unnamed wizard");
    });

    it("fullName returns the same as name for wizards", () => {
        const [, wizard] = makeWizard();
        expect(wizard.fullName).toBe(wizard.name);
    });

    it("wizCodeParsed returns the full WizCode object", () => {
        const [, wizard] = makeWizard("0102030405");
        const parsed = wizard.wizCodeParsed;
        expect(parsed.code).toBe("0102030405");
        expect(parsed.wiz).toBe(1);
        expect(parsed.hat).toBe(5);
    });
});

// ── Wizard.addStatus (mutual exclusion) ─────────────────────────────────────

describe("Wizard.addStatus – mutual exclusion", () => {
    it("adding MagicShield removes MagicArmour", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicArmour);
        expect(wizard.hasStatus(UnitStatus.MagicArmour)).toBe(true);
        wizard.addStatus(UnitStatus.MagicShield);
        expect(wizard.hasStatus(UnitStatus.MagicShield)).toBe(true);
        expect(wizard.hasStatus(UnitStatus.MagicArmour)).toBe(false);
    });

    it("adding MagicArmour removes MagicShield", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicShield);
        wizard.addStatus(UnitStatus.MagicArmour);
        expect(wizard.hasStatus(UnitStatus.MagicArmour)).toBe(true);
        expect(wizard.hasStatus(UnitStatus.MagicShield)).toBe(false);
    });

    it("adding MagicKnife removes MagicSword", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicSword);
        wizard.addStatus(UnitStatus.MagicKnife);
        expect(wizard.hasStatus(UnitStatus.MagicKnife)).toBe(true);
        expect(wizard.hasStatus(UnitStatus.MagicSword)).toBe(false);
    });

    it("adding MagicSword removes MagicKnife", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicKnife);
        wizard.addStatus(UnitStatus.MagicSword);
        expect(wizard.hasStatus(UnitStatus.MagicSword)).toBe(true);
        expect(wizard.hasStatus(UnitStatus.MagicKnife)).toBe(false);
    });

    it("adding MagicWings also adds Flying", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicWings);
        expect(wizard.hasStatus(UnitStatus.MagicWings)).toBe(true);
        expect(wizard.hasStatus(UnitStatus.Flying)).toBe(true);
    });

    it("adding MagicKnife also adds AttackUndead", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicKnife);
        expect(wizard.hasStatus(UnitStatus.AttackUndead)).toBe(true);
    });

    it("adding MagicSword also adds AttackUndead", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicSword);
        expect(wizard.hasStatus(UnitStatus.AttackUndead)).toBe(true);
    });

    it("adding MagicBow also adds AttackUndead", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicBow);
        expect(wizard.hasStatus(UnitStatus.AttackUndead)).toBe(true);
    });

    it("returns false and changes nothing when status already present", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicShield);
        const result = wizard.addStatus(UnitStatus.MagicShield);
        expect(result).toBe(false);
    });
});

// ── Wizard.removeStatus (side effects) ──────────────────────────────────────

describe("Wizard.removeStatus – side effects", () => {
    it("removing MagicWings also removes Flying", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicWings);
        expect(wizard.hasStatus(UnitStatus.Flying)).toBe(true);
        wizard.removeStatus(UnitStatus.MagicWings);
        expect(wizard.hasStatus(UnitStatus.MagicWings)).toBe(false);
        expect(wizard.hasStatus(UnitStatus.Flying)).toBe(false);
    });

    it("removing the last magic weapon removes AttackUndead", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicKnife);
        expect(wizard.hasStatus(UnitStatus.AttackUndead)).toBe(true);
        wizard.removeStatus(UnitStatus.MagicKnife);
        expect(wizard.hasStatus(UnitStatus.AttackUndead)).toBe(false);
    });

    it("removing one magic weapon keeps AttackUndead when another remains", () => {
        const [, wizard] = makeWizard();
        wizard.addStatus(UnitStatus.MagicKnife);
        // MagicKnife removes MagicSword and vice versa, so use MagicBow
        // as a second weapon that does not conflict.
        wizard.addStatus(UnitStatus.MagicBow);
        expect(wizard.hasStatus(UnitStatus.AttackUndead)).toBe(true);
        // Remove MagicKnife — MagicBow is still there.
        wizard.removeStatus(UnitStatus.MagicKnife);
        expect(wizard.hasStatus(UnitStatus.AttackUndead)).toBe(true);
    });

    it("returns false when status is not present", () => {
        const [, wizard] = makeWizard();
        const result = wizard.removeStatus(UnitStatus.MagicShield);
        expect(result).toBe(false);
    });
});

// ── Wizard.DEFAULT_WIZARD_CONFIG ─────────────────────────────────────────────

describe("Wizard.DEFAULT_WIZARD_CONFIG", () => {
    it("returns an object with UnitType.Wizard type", () => {
        const config = Wizard.DEFAULT_WIZARD_CONFIG;
        expect(config.type).toBe(UnitType.Wizard);
    });

    it("includes Wizard status in properties", () => {
        const config = Wizard.DEFAULT_WIZARD_CONFIG;
        expect(config.properties?.status).toContain(UnitStatus.Wizard);
    });

    it("falls back to defaults when Piece.units['wizard'] is undefined", () => {
        // Temporarily remove wizard unit data
        const saved = Piece.units["wizard"];
        delete Piece.units["wizard"];
        const config = Wizard.DEFAULT_WIZARD_CONFIG;
        expect(config.properties?.movement).toBe(1);
        expect(config.properties?.combat).toBe(3);
        expect(config.properties?.defence).toBe(3);
        // Restore
        if (saved !== undefined) {
            Piece.units["wizard"] = saved;
        }
    });
});

// ── Wizard.createAll ─────────────────────────────────────────────────────────

describe("Wizard.createAll – player placement", () => {
    /**
     * Build a board with N human players and call createAll().
     * Returns the board and list of created wizards.
     */
    async function setup(n: number): Promise<[Board, Piece[]]> {
        const board = makeBoard();
        const players = Array.from({ length: n }, (_, i) =>
            board.addPlayer({
                name: `Player ${i + 1}`,
                type: GameSetupPlayerType.Local,
            }),
        );
        Wizard.createAll(board, players);
        return [board, board.pieces];
    }

    it("places 2 wizards for 2 players", async () => {
        const [, pieces] = await setup(2);
        expect(pieces).toHaveLength(2);
    });

    it("places 3 wizards for 3 players", async () => {
        const [, pieces] = await setup(3);
        expect(pieces).toHaveLength(3);
    });

    it("places 4 wizards for 4 players", async () => {
        const [, pieces] = await setup(4);
        expect(pieces).toHaveLength(4);
    });

    it("places 5 wizards for 5 players", async () => {
        const [, pieces] = await setup(5);
        expect(pieces).toHaveLength(5);
    });

    it("places 6 wizards for 6 players", async () => {
        const [, pieces] = await setup(6);
        expect(pieces).toHaveLength(6);
    });

    it("places 7 wizards for 7 players", async () => {
        const [, pieces] = await setup(7);
        expect(pieces).toHaveLength(7);
    });

    it("places 8 wizards for 8 players", async () => {
        const [, pieces] = await setup(8);
        expect(pieces).toHaveLength(8);
    });

    it("places 9 wizards for 9 players (farthest-point fallback)", async () => {
        const [, pieces] = await setup(9);
        expect(pieces).toHaveLength(9);
    });

    it("all wizards are placed within board bounds", async () => {
        const [board, pieces] = await setup(4);
        for (const piece of pieces) {
            expect(piece.position.x).toBeGreaterThanOrEqual(0);
            expect(piece.position.x).toBeLessThan(board.width);
            expect(piece.position.y).toBeGreaterThanOrEqual(0);
            expect(piece.position.y).toBeLessThan(board.height);
        }
    });

    it("each wizard has a different owner", async () => {
        const [, pieces] = await setup(4);
        const owners = pieces.map((p) => p.owner?.id);
        const uniqueOwners = new Set(owners);
        expect(uniqueOwners.size).toBe(4);
    });
});
