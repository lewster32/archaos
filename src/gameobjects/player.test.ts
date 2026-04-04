import { GameSetupPlayerType, Colour, ComputerWizard } from "@archaos/engine";
import type { Board } from "./board";
import type { Spell } from "@archaos/engine";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Player } from "./player";
/**
 * A minimal Board-shaped mock object. We only include the properties and
 * methods that are actually used by the Player class.
 */
const mockBoard = vi.mocked({
    logger: {
        log: vi.fn(),
    },
    sound: {
        play: vi.fn(),
        playAsync: vi.fn(),
    },
    getPiecesByOwner: vi.fn().mockReturnValue([]),
    idleDelay: vi.fn().mockResolvedValue(undefined),
    playEffect: vi.fn().mockResolvedValue(undefined),
    boardEvents: {
        emit: vi.fn(),
    },
} as unknown as Board);

/**
 * Creates a minimal Spell-shaped mock object. We use a plain object rather
 * than a real Spell instance to avoid the real owner setter throwing when
 * castingPiece is null (which it always is in unit tests).
 */
function makeSpell(
    id: number,
    opts: { persist?: boolean; castTimes?: number } = {},
): Spell {
    const { persist = false, castTimes = 1 } = opts;
    let _castTimes = castTimes;
    return {
        id,
        persist,
        get castTimes() {
            return _castTimes;
        },
        set castTimes(v) {
            _castTimes = v;
        },
        resetCastTimes: vi.fn(),
        get owner() {
            return undefined as any;
        },
        set owner(_: any) {
            /* no-op — avoids the real Spell.owner validation */
        },
    } as unknown as Spell;
}

function makeMockPiece(id: number, owner: Player, isWizard = false) {
    return {
        id,
        owner,
        isWizard,
        destroy: vi.fn(),
        // should return true if UnitStatus.Wizard is passed
        hasStatus: vi.fn().mockImplementation(() => isWizard),
        sprite: {
            getCenter: vi.fn().mockReturnValue({ x: 0, y: 0 }),
        },
    } as any;
}

describe("Player", () => {
    describe("constructor validation", () => {
        it("throws when no config is provided", () => {
            expect(
                () => new Player(mockBoard, 1, null as any, 0x0000ff),
            ).toThrow("Player must be given a config");
        });
    });

    describe("local player basics", () => {
        let player: Player;

        beforeEach(() => {
            player = new Player(
                mockBoard,
                1,
                { name: "Alice", type: GameSetupPlayerType.Local },
                0x0000ff,
            );
        });

        it("returns the configured name", () => {
            expect(player.name).toBe("Alice");
        });

        it("returns a default name when none is provided", () => {
            const p = new Player(
                mockBoard,
                3,
                { type: GameSetupPlayerType.Local },
                0x0000ff,
            );
            expect(p.name).toBe("Player 3");
        });

        it("returns a default name when a blank name is provided", () => {
            const p = new Player(
                mockBoard,
                4,
                { name: "   ", type: GameSetupPlayerType.Local },
                0x0000ff,
            );
            expect(p.name).toBe("Player 4");
        });

        it("returns a default name when none is provided", () => {
            const p = new Player(
                mockBoard,
                3,
                { type: GameSetupPlayerType.Local },
                0x0000ff,
            );
            expect(p.name).toBe("Player 3");
        });

        it("starts with the configured colour", () => {
            expect(player.colour).toBe(0x0000ff);
        });

        it("has no AI controller (ai returns null)", () => {
            expect(player.ai).toBeNull();
        });

        it("starts with no selected spell", () => {
            expect(player.selectedSpell).toBeNull();
        });

        it("starts with an empty spell list", () => {
            expect(player.spells).toHaveLength(0);
        });

        it("toString returns the player name", () => {
            expect(player.toString()).toBe("Alice");
        });

        it("has a wizcode from the config", () => {
            const p = new Player(
                mockBoard,
                5,
                {
                    name: "Charlie",
                    type: GameSetupPlayerType.Local,
                    wizcode: "0000000000",
                },
                0x0000ff,
            );
            expect(p.wizcode).toBe("0000000000");
        });

        it("generates a random wizcode when not provided", () => {
            const p = new Player(
                mockBoard,
                6,
                { name: "Dana", type: GameSetupPlayerType.Local },
                0x0000ff,
            );
            expect(p.wizcode).toMatch(/^[0-9a-f]{10}$/);
        });
    });

    describe("spell management", () => {
        let player: Player;

        beforeEach(() => {
            player = new Player(
                mockBoard,
                1,
                { name: "Bob", type: GameSetupPlayerType.Local },
                0x0000ff,
            );
            // castingPiece must be set so that addSpell can set spell.owner
            // (with our mock spells this is not needed, but real Spell would need it)
        });

        describe("addSpell / spells getter", () => {
            it("adds a spell and returns it in the spells list", () => {
                const spell = makeSpell(10);
                player.addSpell(spell);
                expect(player.spells).toHaveLength(1);
                expect(player.spells[0].id).toBe(10);
            });

            it("adds multiple spells independently", () => {
                player.addSpell(makeSpell(10));
                player.addSpell(makeSpell(20));
                const ids = player.spells.map((s) => s.id);
                expect(ids).toContain(10);
                expect(ids).toContain(20);
                expect(player.spells).toHaveLength(2);
            });
        });

        describe("pickSpell", () => {
            it("selects a spell by ID and returns it", async () => {
                const spell = makeSpell(10);
                player.addSpell(spell);
                const picked = await player.pickSpell(10);
                expect(picked).toBe(spell);
                expect(player.selectedSpell).toBe(spell);
            });

            it("throws when the player does not have the requested spell", async () => {
                await expect(player.pickSpell(999)).rejects.toThrow(
                    "This player does not have that spell",
                );
            });
        });

        describe("useSpell", () => {
            it("returns null when no spell is selected", async () => {
                expect(await player.useSpell()).toBeNull();
            });

            it("returns the selected spell when castTimes > 0", async () => {
                const spell = makeSpell(10, { castTimes: 2 });
                player.addSpell(spell);
                await player.pickSpell(10);
                const used = await player.useSpell();
                expect(used).toBe(spell);
            });

            it("discards and returns null when castTimes is 0", async () => {
                const spell = makeSpell(10, { castTimes: 0 });
                player.addSpell(spell);
                await player.pickSpell(10);
                const result = await player.useSpell();
                expect(result).toBeNull();
                expect(player.selectedSpell).toBeNull();
            });
        });

        describe("discardSpell", () => {
            it("returns null when no spell is selected", async () => {
                expect(await player.discardSpell()).toBeNull();
            });

            it("removes a non-persistent spell from the spell list", async () => {
                const spell = makeSpell(10, { persist: false });
                player.addSpell(spell);
                await player.pickSpell(10);
                await player.discardSpell();
                expect(player.spells).toHaveLength(0);
                expect(player.selectedSpell).toBeNull();
            });

            it("retains a persistent spell in the spell list and resets its cast times", async () => {
                const spell = makeSpell(10, { persist: true });
                player.addSpell(spell);
                await player.pickSpell(10);
                await player.discardSpell();
                expect(player.spells).toHaveLength(1);
                expect(player.selectedSpell).toBeNull();
                expect(spell.resetCastTimes).toHaveBeenCalledTimes(1);
            });

            it("returns the discarded spell", async () => {
                const spell = makeSpell(10);
                player.addSpell(spell);
                await player.pickSpell(10);
                const discarded = await player.discardSpell();
                expect(discarded).toBe(spell);
            });
        });

        describe("casting piece interaction", () => {
            it("sets the casting piece", () => {
                const piece = { id: 1, owner: player } as any;
                player.castingPiece = piece;
                expect(player.castingPiece).toBe(piece);
            });

            it("throws if the piece owner is not this player", () => {
                const otherPlayer = new Player(
                    mockBoard,
                    2,
                    { name: "Eve", type: GameSetupPlayerType.Local },
                    0x0000ff,
                );
                const piece = { id: 1, owner: otherPlayer } as any;
                expect(() => (player.castingPiece = piece)).toThrow(
                    "Cannot set casting piece to a piece not owned by this player",
                );
            });

            it("allows setting casting piece to null", () => {
                player.castingPiece = null;
                expect(player.castingPiece).toBeNull();
            });

            it("sets the casting piece, then unsets it by setting to null", () => {
                const piece = { id: 1, owner: player } as any;
                player.castingPiece = piece;
                expect(player.castingPiece).toBe(piece);
                player.castingPiece = null;
                expect(player.castingPiece).toBeNull();
            });
        });
    });

    describe("computer player", () => {
        it("creates an AI controller when type is Computer", () => {
            const player = new Player(
                mockBoard,
                2,
                {
                    name: "CPU",
                    type: GameSetupPlayerType.Computer,
                    difficulty: 0.8,
                },
                0xff0000,
            );
            expect(player.ai).toBeInstanceOf(ComputerWizard);
        });

        it("has a value for remote when type is Computer", () => {
            const player = new Player(
                mockBoard,
                2,
                {
                    name: "CPU",
                    type: GameSetupPlayerType.Computer,
                    difficulty: 0.8,
                },
                0xff0000,
            );
            expect(player.remote).not.toBeNull();
        });

        it("passes the configured difficulty to the AI controller", () => {
            const player = new Player(
                mockBoard,
                2,
                {
                    name: "CPU",
                    type: GameSetupPlayerType.Computer,
                    difficulty: 0.8,
                },
                0xff0000,
            );
            expect(player.ai!.difficulty).toBe(0.8);
        });

        it("uses the default difficulty of 0.5 when not specified", () => {
            const player = new Player(
                mockBoard,
                2,
                {
                    name: "CPU",
                    type: GameSetupPlayerType.Computer,
                },
                0xff0000,
            );
            expect(player.ai!.difficulty).toBe(0.5);
        });
    });

    describe("player defeat", () => {
        let player: Player;

        beforeEach(() => {
            player = new Player(
                mockBoard,
                1,
                { name: "Bob", type: GameSetupPlayerType.Local },
                0x0000ff,
            );
        });

        it("starts as not defeated", () => {
            expect(player.defeated).toBe(false);
        });

        it("marks the player as defeated", () => {
            player.defeat();
            expect(player.defeated).toBe(true);
        });

        it("destroys all non-wizard pieces owned by the player", async () => {
            const wizardPiece = makeMockPiece(1, player, true);
            const piece1 = makeMockPiece(2, player, false);
            const piece2 = makeMockPiece(3, player, false);
            mockBoard.getPiecesByOwner.mockReturnValue([
                wizardPiece,
                piece1,
                piece2,
            ]);
            await player.defeat();
            expect(piece1.destroy).toHaveBeenCalledTimes(1);
            expect(piece2.destroy).toHaveBeenCalledTimes(1);
            expect(wizardPiece.destroy).not.toHaveBeenCalled();
        });

        it("logs a defeat message", () => {
            player.defeat();
            expect(mockBoard.logger.log).toHaveBeenCalledWith(
                `Game over for ${player.name}`,
                Colour.Red,
            );
        });
    });
});
