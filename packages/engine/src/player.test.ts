import { describe, it, expect, vi } from "vitest";
import { Player } from "./player";
import { Board } from "./board";
import { TestRNG } from "./rng";
import { Logger } from "./logger";
import { Rules } from "./rules";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { GameSetupPlayerType } from "./interfaces/ui";
import type { PieceConfig } from "./configs/piececonfig";
import type { Spell } from "./spells/spell";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Create a piece owned by the given player. */
async function addPiece(
    board: Board,
    player: Player,
    status: UnitStatus[] = [],
): Promise<ReturnType<typeof board.addPiece>> {
    return board.addPiece({
        type: UnitType.Creature,
        x: 0,
        y: 0,
        properties: {
            movement: 1,
            combat: 1,
            rangedCombat: 0,
            range: 0,
            defence: 1,
            manoeuvrability: 1,
            magicResistance: 0,
            status,
        },
        owner: player as any,
    } as PieceConfig);
}

/** Minimal mock spell factory. */
function makeSpell(id: number, persist = false, castTimes = 1): Spell {
    return {
        id,
        persist,
        castTimes,
        owner: null,
        resetCastTimes: vi.fn(),
    } as unknown as Spell;
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe("Player constructor", () => {
    it("assigns the given name", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "Alice",
            type: GameSetupPlayerType.Local,
        });
        expect(player.name).toBe("Alice");
    });

    it("trims whitespace from the name", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "  Bob  ",
            type: GameSetupPlayerType.Local,
        });
        expect(player.name).toBe("Bob");
    });

    it("falls back to 'Player <id>' when name is empty", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "",
            type: GameSetupPlayerType.Local,
        });
        expect(player.name).toMatch(/^Player \d+$/);
    });

    it("throws when no config is provided", () => {
        const board = makeBoard();
        expect(() => new Player(board, 1, undefined as any, Player.PLAYER_COLOURS[0])).toThrow(
            "Player must be given a config",
        );
    });

    it("stores the wizCode from config", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
            wizCode: "aabbccddee",
        } as any);
        expect(player.wizCode).toBe("aabbccddee");
    });

    it("assigns a colour from PLAYER_COLOURS by slot", () => {
        const board = makeBoard();
        const p1 = board.addPlayer({
            name: "P1",
            type: GameSetupPlayerType.Local,
        });
        const p2 = board.addPlayer({
            name: "P2",
            type: GameSetupPlayerType.Local,
        });
        expect(p1.colour).toBe(Player.PLAYER_COLOURS[0]);
        expect(p2.colour).toBe(Player.PLAYER_COLOURS[1]);
    });

    it("stores the remote player controller", () => {
        const board = makeBoard();
        const remote = {
            selectSpell: vi.fn(),
            castSpell: vi.fn(),
            moveAllUnits: vi.fn(),
        } as any;
        const player = board.addPlayer({ name: "Remote", type: GameSetupPlayerType.Computer }, remote);
        expect(player.remote).toBe(remote);
    });

    it("remote is null when not provided", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        expect(player.remote).toBeNull();
    });

    it("isRemote defaults to false when no remote and no override", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        expect(player.isRemote).toBe(false);
    });

    it("isRemote defaults to true when a remote is provided", () => {
        const board = makeBoard();
        const remote = {
            moveAllUnits: vi.fn(),
        } as any;
        const player = board.addPlayer(
            { name: "AI", type: GameSetupPlayerType.Computer },
            remote,
        );
        expect(player.isRemote).toBe(true);
    });

    it("isRemote can be explicitly overridden to true with no remote", () => {
        const board = makeBoard();
        const player = board.addPlayer(
            { name: "Net", type: GameSetupPlayerType.Local },
            null,
            true,
        );
        expect(player.isRemote).toBe(true);
        expect(player.remote).toBeNull();
    });

    it("isRemote can be explicitly overridden to false even with a remote", () => {
        const board = makeBoard();
        const remote = {
            moveAllUnits: vi.fn(),
        } as any;
        const player = board.addPlayer(
            { name: "AI", type: GameSetupPlayerType.Computer },
            remote,
            false,
        );
        expect(player.isRemote).toBe(false);
    });

    it("initialises forceHit from config", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
            forceHit: true,
        } as any);
        expect(player.forceHit).toBe(true);
    });

    it("initialises forceCast from config", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
            forceCast: false,
        } as any);
        expect(player.forceCast).toBe(false);
    });
});

// ── forceHit / forceCast setters ──────────────────────────────────────────────

describe("Player.forceHit / forceCast setters", () => {
    it("forceHit can be set to true, false, or null", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        player.forceHit = true;
        expect(player.forceHit).toBe(true);
        player.forceHit = false;
        expect(player.forceHit).toBe(false);
        player.forceHit = null;
        expect(player.forceHit).toBeNull();
    });

    it("forceCast can be set to true, false, or null", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        player.forceCast = true;
        expect(player.forceCast).toBe(true);
        player.forceCast = null;
        expect(player.forceCast).toBeNull();
    });
});

// ── castingPiece setter validation ───────────────────────────────────────────

describe("Player.castingPiece", () => {
    it("throws when setting a piece not owned by this player", async () => {
        const board = makeBoard();
        const p1 = board.addPlayer({
            name: "P1",
            type: GameSetupPlayerType.Local,
        });
        const p2 = board.addPlayer({
            name: "P2",
            type: GameSetupPlayerType.Local,
        });
        const piece = await addPiece(board, p2);
        expect(() => {
            p1.castingPiece = piece as any;
        }).toThrow("Cannot set casting piece");
    });

    it("accepts null", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        expect(() => {
            player.castingPiece = null;
        }).not.toThrow();
        expect(player.castingPiece).toBeNull();
    });
});

// ── ai getter ─────────────────────────────────────────────────────────────────

describe("Player.ai", () => {
    it("returns null when there is no remote controller", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        expect(player.ai).toBeNull();
    });

    it("returns the remote controller cast as PlayerAI", () => {
        const board = makeBoard();
        const remote = {
            selectSpell: vi.fn(),
            castSpell: vi.fn(),
            moveAllUnits: vi.fn(),
            difficulty: 5,
            preferredTargetId: null,
        } as any;
        const player = board.addPlayer({ name: "AI", type: GameSetupPlayerType.Computer }, remote);
        expect(player.ai).toBe(remote);
    });
});

// ── toString ──────────────────────────────────────────────────────────────────

describe("Player.toString", () => {
    it("returns the player name", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "Charlie",
            type: GameSetupPlayerType.Local,
        });
        expect(player.toString()).toBe("Charlie");
    });
});

// ── addSpell / spells / pickSpell ─────────────────────────────────────────────

describe("Player spells", () => {
    it("addSpell adds a spell to the player's spell list", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const spell = makeSpell(1);
        player.addSpell(spell);
        expect(player.spells).toHaveLength(1);
        expect(player.spells[0]).toBe(spell);
    });

    it("addSpell sets spell.owner to this player", () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const spell = makeSpell(1);
        player.addSpell(spell);
        expect((spell as any).owner).toBe(player);
    });

    it("pickSpell selects the spell and returns it", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const spell = makeSpell(5);
        player.addSpell(spell);
        const picked = await player.pickSpell(5);
        expect(picked).toBe(spell);
        expect(player.selectedSpell).toBe(spell);
    });

    it("pickSpell throws for an unknown spell id", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        await expect(player.pickSpell(999)).rejects.toThrow("This player does not have that spell");
    });
});

// ── useSpell ──────────────────────────────────────────────────────────────────

describe("Player.useSpell", () => {
    it("returns the selected spell when castTimes > 0", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const spell = makeSpell(1, false, 1);
        player.addSpell(spell);
        await player.pickSpell(1);
        const result = await player.useSpell();
        expect(result).toBe(spell);
    });

    it("discards the spell and returns null when castTimes <= 0", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const spell = makeSpell(1, false, 0);
        player.addSpell(spell);
        await player.pickSpell(1);
        const result = await player.useSpell();
        expect(result).toBeNull();
        expect(player.selectedSpell).toBeNull();
    });

    it("returns null when no spell is selected", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const result = await player.useSpell();
        expect(result).toBeNull();
    });
});

// ── discardSpell ──────────────────────────────────────────────────────────────

describe("Player.discardSpell", () => {
    it("removes a non-persistent spell from the spell list", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const spell = makeSpell(3, false);
        player.addSpell(spell);
        await player.pickSpell(3);
        await player.discardSpell();
        expect(player.spells).toHaveLength(0);
        expect(player.selectedSpell).toBeNull();
    });

    it("resets a persistent spell and keeps it in the spell list", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const spell = makeSpell(7, true);
        player.addSpell(spell);
        await player.pickSpell(7);
        await player.discardSpell();
        expect(player.spells).toHaveLength(1);
        expect((spell as any).resetCastTimes).toHaveBeenCalled();
        expect(player.selectedSpell).toBeNull();
    });

    it("returns null when no spell is selected", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const result = await player.discardSpell();
        expect(result).toBeNull();
    });

    it("returns the discarded spell", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const spell = makeSpell(2, false);
        player.addSpell(spell);
        await player.pickSpell(2);
        const result = await player.discardSpell();
        expect(result).toBe(spell);
    });
});

// ── defeat / destroyCreations ──────────────────────────────────────────────────

describe("Player.defeat", () => {
    it("marks the player as defeated", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        expect(player.defeated).toBe(false);
        await player.defeat();
        expect(player.defeated).toBe(true);
    });

    it("destroys non-wizard creations on defeat", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        // Add a regular creature piece
        const piece = await addPiece(board, player);
        expect(board.pieces).toContain(piece);
        await player.defeat();
        // The piece should have been destroyed (removed from the board)
        expect(board.pieces).not.toContain(piece);
    });

    it("does not destroy wizard pieces on defeat", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const wizard = await addPiece(board, player, [UnitStatus.Wizard]);
        await player.defeat();
        // Wizard should still exist (defeat only destroys non-wizard pieces)
        expect(board.pieces).toContain(wizard);
    });
});

describe("Player.destroyCreations", () => {
    it("destroys all non-wizard pieces owned by this player", async () => {
        const board = makeBoard();
        const player = board.addPlayer({
            name: "P",
            type: GameSetupPlayerType.Local,
        });
        const creature1 = await addPiece(board, player);
        const creature2 = await addPiece(board, player);
        const wizard = await addPiece(board, player, [UnitStatus.Wizard]);

        await player.destroyCreations();

        expect(board.pieces).not.toContain(creature1);
        expect(board.pieces).not.toContain(creature2);
        expect(board.pieces).toContain(wizard);
    });
});
