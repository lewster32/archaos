import { describe, it, expect, vi } from "vitest";
import { Board } from "../board";
import type { BoardDeps } from "../board";
import type { CommandMessage, PickSpellCommand } from "../protocol/commands";
import { Logger } from "../logger";
import { TestRNG } from "../rng";
import { Rules } from "../rules";
import { roundTrip } from "../protocol/wiresafety.test";

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
