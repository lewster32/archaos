import { describe, it, expect, vi } from "vitest";
import { Board } from "../board";
import type { BoardDeps } from "../board";
import { ExpectedCommand } from "./expectedcommand";
import { SpellbookBarrier } from "./spellbookbarrier";
import { GameSetupPlayerType } from "../interfaces/ui";
import type { Spell } from "../spells/spell";
import type { Player } from "../player";
import type { CommandMessage, PickSpellCommand } from "../protocol/commands";
import { Logger } from "../logger";
import { TestRNG } from "../rng";
import { Rules } from "../rules";
import { roundTrip } from "../protocol/wiresafety.testhelpers";

function makeRules(): Rules {
    return {
        doSpread: vi.fn().mockResolvedValue(undefined),
        doExpire: vi.fn().mockResolvedValue(undefined),
        doAutoCastSpell: vi.fn().mockResolvedValue(false),
        doCastSpell: vi.fn().mockResolvedValue(false),
    } as unknown as Rules;
}

function makeBoard(overrides: Partial<BoardDeps> = {}): Board {
    return new Board(1, 13, 13, false, undefined, {
        rng: new TestRNG(),
        logger: { log: vi.fn() } as unknown as Logger,
        rules: makeRules(),
        ...overrides,
    });
}

function makeMockSpell(overrides: Record<string, any> = {}): Spell {
    return {
        id: 99,
        range: -1,
        lineOfSight: false,
        castTimes: 1,
        persist: false,
        properties: { autoPlace: false },
        resetCastTimes: () => {},
        ...overrides,
    } as unknown as Spell;
}

function addLocalPlayer(board: Board, name: string): Player {
    return board.addPlayer({ name, type: GameSetupPlayerType.Local });
}

function openSerialSlotFor(board: Board, playerId: number): void {
    (board as any)._expectedCommand = new ExpectedCommand(
        playerId,
        ["pick-spell", "end-spell-pick"],
    );
}

function openCastSlotFor(board: Board, playerId: number): void {
    (board as any)._expectedCommand = new ExpectedCommand(
        playerId,
        ["cast-spell", "cancel-cast"],
    );
    (board as any)._currentCastingPlayerId = playerId;
}

const noopSetTimeout = (_cb: () => void, _ms: number): unknown => Symbol("noop");
const noopClearTimeout = (_: unknown): void => {};

function openBarrierFor(board: Board, playerIds: number[]): SpellbookBarrier {
    const barrier = new SpellbookBarrier(playerIds, 5000, noopSetTimeout, noopClearTimeout);
    (board as any)._spellbookBarrier = barrier;
    return barrier;
}

function makeTestBoard(): Board {
    const board = makeBoard();
    addLocalPlayer(board, "P1");
    return board;
}

/**
 * Build a board where player `playerId` holds a single-cast spell whose
 * `getValidTarget` always returns null (i.e. the spell rejects every
 * target). Used to drive the cast handler's invalid-target path
 * irrespective of board geometry.
 */
function makeTestBoardWithRangedSpell(playerId: number, range: number): Board {
    const board = makeTestBoard();
    const player = board.getPlayer(playerId);
    const spell = makeMockSpell({
        id: 100,
        range,
        castTimes: 1,
        totalCastTimes: 1,
        failed: false,
        getValidTarget: vi.fn().mockReturnValue(null),
        cast: vi.fn().mockResolvedValue(true),
    });
    (player as any)._spells.set(spell.id, spell);
    (player as any)._selectedSpell = spell;
    (player as any)._castingPiece = { id: 50, position: { x: 5, y: 5 } };
    return board;
}

/**
 * Build a board where player `playerId` holds a single-cast summon-style
 * spell whose `getValidTarget` accepts the target unmodified and whose
 * `cast` resolves true. Used to drive the cast handler's happy-path
 * outcome buffering.
 */
function makeTestBoardWithSummonSpell(playerId: number): Board {
    const board = makeTestBoard();
    const player = board.getPlayer(playerId);
    const spell = makeMockSpell({
        id: 100,
        range: 1.5,
        castTimes: 1,
        totalCastTimes: 1,
        failed: false,
        getValidTarget: vi.fn().mockImplementation((target) => target),
        cast: vi.fn().mockResolvedValue(true),
    });
    (player as any)._spells.set(spell.id, spell);
    (player as any)._selectedSpell = spell;
    (player as any)._castingPiece = { id: 50, position: { x: 4, y: 5 } };
    return board;
}

/**
 * Build a board where player `playerId` holds a multi-cast spell with
 * the given remaining cast count. The mock `cast` decrements
 * `castTimes` on each invocation so the handler observes a falling
 * counter across iterations, matching real Spell.cast semantics.
 */
function makeTestBoardWithMultiCastSpell(playerId: number, castTimes: number): Board {
    const board = makeTestBoard();
    const player = board.getPlayer(playerId);
    const spell = makeMockSpell({
        id: 100,
        range: 1.5,
        castTimes,
        totalCastTimes: castTimes,
        failed: false,
        persist: false,
        getValidTarget: vi.fn().mockImplementation((target) => target),
    });
    (spell as any).cast = vi.fn().mockImplementation(async () => {
        (spell as any).castTimes -= 1;
        return true;
    });
    (player as any)._spells.set(spell.id, spell);
    (player as any)._selectedSpell = spell;
    (player as any)._castingPiece = { id: 50, position: { x: 4, y: 5 } };
    return board;
}

const pick = (commandId: string, spellId = 1): PickSpellCommand => ({
    type: "command",
    commandId,
    token: "",
    kind: "pick-spell",
    spellId,
});

describe("Board.handleCommand: dispatcher + dedup", () => {
    it("silently ignores a duplicate commandId", async () => {
        const board = makeBoard();
        const cmd = roundTrip(pick("dup-1"));

        await board.handleCommand(1, cmd);
        const rejectionsAfterFirst = board._rejectedCommandsForTests.length;
        await board.handleCommand(1, cmd);

        // Second invocation must NOT produce another rejection.
        expect(board._rejectedCommandsForTests.length).toBe(rejectionsAfterFirst);
    });

    it("rejects unknown command kinds with wrong-phase", async () => {
        const board = makeBoard();
        const bogus = roundTrip({
            type: "command",
            commandId: "bogus-1",
            token: "",
            kind: "no-such-kind",
        }) as unknown as CommandMessage;

        await board.handleCommand(1, bogus);
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "bogus-1",
            reason: "wrong-phase",
        });
    });

    it("routes pick-spell to the pick-spell handler (which currently rejects)", async () => {
        const board = makeBoard();
        const cmd = roundTrip(pick("p-1"));

        await board.handleCommand(1, cmd);
        // Stub handler currently emits wrong-phase since no slot is open.
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "p-1",
            reason: "wrong-phase",
        });
    });

    it("dispatches end-spell-pick, cast-spell, cancel-cast through the right routes (stub-rejection)", async () => {
        const board = makeBoard();
        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "e-1", token: "", kind: "end-spell-pick",
        }));
        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "c-1", token: "", kind: "cast-spell",
            target: { self: true },
        }));
        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "x-1", token: "", kind: "cancel-cast",
        }));

        const reasons = board._rejectedCommandsForTests.map((r) => r.commandId);
        expect(reasons).toContain("e-1");
        expect(reasons).toContain("c-1");
        expect(reasons).toContain("x-1");
        expect(board._rejectedCommandsForTests.every((r) => r.reason === "wrong-phase")).toBe(true);
    });

    it("processed commandIds set is per-game (does not bleed across boards)", async () => {
        const a = makeBoard();
        const b = makeBoard();
        const cmd = roundTrip(pick("shared-id"));

        await a.handleCommand(1, cmd);
        await b.handleCommand(1, cmd);

        // Both boards must have processed the command (no silent skip).
        expect(a._rejectedCommandsForTests).toContainEqual({
            playerId: 1, commandId: "shared-id", reason: "wrong-phase",
        });
        expect(b._rejectedCommandsForTests).toContainEqual({
            playerId: 1, commandId: "shared-id", reason: "wrong-phase",
        });
    });
});

describe("pick-spell handler", () => {
    it("rejects with wrong-phase when no spellbook slot/barrier is open", async () => {
        const board = makeBoard();
        addLocalPlayer(board, "P1");
        await board.handleCommand(1, roundTrip(pick("c1", 99)));
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1, commandId: "c1", reason: "wrong-phase",
        });
    });

    it("rejects with not-your-turn in serial mode for the wrong player", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        p1.addSpell(makeMockSpell({ id: 10 }));
        p2.addSpell(makeMockSpell({ id: 20 }));
        openSerialSlotFor(board, p1.id);

        await board.handleCommand(p2.id, roundTrip(pick("c2", 20)));
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: p2.id, commandId: "c2", reason: "not-your-turn",
        });
    });

    it("rejects with spell-pick-already-ended when the player has already submitted to the barrier", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        p1.addSpell(makeMockSpell({ id: 10 }));
        p2.addSpell(makeMockSpell({ id: 20 }));
        openBarrierFor(board, [p1.id, p2.id]);

        await board.handleCommand(p1.id, roundTrip(pick("c1", 10)));
        await board.handleCommand(p1.id, roundTrip(pick("c2", 10)));

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: p1.id, commandId: "c2", reason: "spell-pick-already-ended",
        });
    });

    it("rejects with spell-not-in-book when spellId is not in the player's spellbook", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        p1.addSpell(makeMockSpell({ id: 10 }));
        openBarrierFor(board, [p1.id]);

        await board.handleCommand(p1.id, roundTrip(pick("c1", 999_999)));
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: p1.id, commandId: "c1", reason: "spell-not-in-book",
        });
    });

    it("on success records the player's pick in authoritative state", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        const spell10 = makeMockSpell({ id: 10 });
        p1.addSpell(spell10);
        p2.addSpell(makeMockSpell({ id: 20 }));
        openBarrierFor(board, [p1.id, p2.id]);

        await board.handleCommand(p1.id, roundTrip(pick("c1", 10)));

        expect(p1.selectedSpell?.id).toBe(10);
    });

    it("on success closes the slot/barrier participation for that player", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        p1.addSpell(makeMockSpell({ id: 10 }));
        p2.addSpell(makeMockSpell({ id: 20 }));
        const barrier = openBarrierFor(board, [p1.id, p2.id]);

        await board.handleCommand(p1.id, roundTrip(pick("c1", 10)));
        expect(barrier.canAccept(p1.id)).toBe(false);
        expect(barrier.canAccept(p2.id)).toBe(true);
    });
});

describe("end-spell-pick handler", () => {
    it("succeeds and discards any previously selected spell", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        p1.addSpell(makeMockSpell({ id: 10 }));
        p2.addSpell(makeMockSpell({ id: 20 }));
        openBarrierFor(board, [p1.id, p2.id]);

        await board.handleCommand(p1.id, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "end-spell-pick",
        }));

        expect(p1.selectedSpell).toBeNull();
    });

    it("rejects with wrong-phase when no slot/barrier is open", async () => {
        const board = makeBoard();
        addLocalPlayer(board, "P1");
        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "end-spell-pick",
        }));
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1, commandId: "c1", reason: "wrong-phase",
        });
    });

    it("rejects with not-your-turn in serial mode for the wrong player", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        addLocalPlayer(board, "P2");
        openSerialSlotFor(board, p1.id);

        await board.handleCommand(2, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "end-spell-pick",
        }));
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 2, commandId: "c1", reason: "not-your-turn",
        });
    });
});

describe("cast-spell handler", () => {
    it("rejects with wrong-phase when no casting slot is open", async () => {
        const board = makeTestBoard();
        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "cast-spell",
            target: { self: true },
        }));
        expect(board._rejectedCommandsForTests).toContainEqual(
            { playerId: 1, commandId: "c1", reason: "wrong-phase" },
        );
    });

    it("rejects with not-your-turn when the slot is for another player", async () => {
        const board = makeTestBoard();
        addLocalPlayer(board, "P2");
        openCastSlotFor(board, 1);

        await board.handleCommand(2, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "cast-spell",
            target: { self: true },
        }));
        expect(board._rejectedCommandsForTests).toContainEqual(
            { playerId: 2, commandId: "c1", reason: "not-your-turn" },
        );
    });

    it("rejects with wrong-phase when player has no selected spell", async () => {
        const board = makeTestBoard();
        openCastSlotFor(board, 1);

        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "cast-spell",
            target: { self: true },
        }));
        expect(board._rejectedCommandsForTests).toContainEqual(
            { playerId: 1, commandId: "c1", reason: "wrong-phase" },
        );
    });

    it("rejects with invalid-target when target is out of range", async () => {
        const board = makeTestBoardWithRangedSpell(1, 3);
        openCastSlotFor(board, 1);

        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "cast-spell",
            target: { point: { x: 99, y: 99 } },
        }));
        expect(board._rejectedCommandsForTests).toContainEqual(
            { playerId: 1, commandId: "c1", reason: "invalid-target" },
        );
    });

    it("happy path: emits spell-revealed + spell-cast-attempted via cast pipeline", async () => {
        const board = makeTestBoardWithSummonSpell(1);
        openCastSlotFor(board, 1);

        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "cast-spell",
            target: { point: { x: 5, y: 5 } },
        }));

        expect(board._castOutcomesForTests).toEqual(
            expect.arrayContaining([
                { kind: "spell-revealed", playerId: 1 },
                { kind: "spell-cast-attempted", playerId: 1, target: { point: { x: 5, y: 5 } } },
            ]),
        );
    });
});

describe("cast-spell multi-cast", () => {
    it("submits the slot after each cast and decrements castsLeft", async () => {
        const board = makeTestBoardWithMultiCastSpell(1, 3);
        openCastSlotFor(board, 1);

        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "cast-spell",
            target: { point: { x: 5, y: 5 } },
        }));

        // The handler always submits — the casting phase loop is what
        // re-opens a fresh slot for the next cast and re-emits
        // phase-changed so the AI dispatches again. Leaving the slot
        // open here would starve the loop of its trigger and hang
        // multi-cast forever.
        expect((board as any)._expectedCommand?.isOpen).toBe(false);
        const succeeded = board._castOutcomesForTests.find(
            (o: any) => o.kind === "spell-cast-succeeded",
        ) as { castsLeft?: number } | undefined;
        expect(succeeded?.castsLeft).toBe(2);
    });

    it("closes the slot on the final cast", async () => {
        const board = makeTestBoardWithMultiCastSpell(1, 1);
        openCastSlotFor(board, 1);

        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "cast-spell",
            target: { point: { x: 5, y: 5 } },
        }));

        expect((board as any)._expectedCommand?.isOpen).toBe(false);
    });
});

describe("cancel-cast handler", () => {
    it("emits spell-cast-cancelled + spell-removed-from-book and closes the slot", async () => {
        const board = makeTestBoardWithMultiCastSpell(1, 3);
        openCastSlotFor(board, 1);
        const player = board.getPlayer(1);
        const spellId = player.selectedSpell.id;

        await board.handleCommand(1, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "cancel-cast",
        }));

        expect(board._castOutcomesForTests).toEqual(
            expect.arrayContaining([
                { kind: "spell-cast-cancelled", playerId: 1, spellId },
                { kind: "spell-removed-from-book", playerId: 1, spellId },
            ]),
        );
        expect((board as any)._expectedCommand?.isOpen).toBe(false);
        expect(player.selectedSpell).toBeNull();
        expect(player.spells.find((s) => s.id === spellId)).toBeUndefined();
    });

    it("rejects with not-your-turn for a different player", async () => {
        const board = makeTestBoardWithMultiCastSpell(1, 3);
        addLocalPlayer(board, "P2");
        openCastSlotFor(board, 1);

        await board.handleCommand(2, roundTrip({
            type: "command", commandId: "c1", token: "", kind: "cancel-cast",
        }));

        expect(board._rejectedCommandsForTests).toContainEqual(
            { playerId: 2, commandId: "c1", reason: "not-your-turn" },
        );
    });
});
