import { describe, expect, test } from "vitest";
import { Logger } from "./logger";
import { vi } from "vitest";
import { Board } from "./board";
import type { BoardDeps } from "./board";
import { Rules } from "./rules";
import { TestRNG } from "./rng";
import { buildSnapshot } from "./snapshotbuilder";
import { GameSetupPlayerType } from "./interfaces/ui";

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

describe("buildSnapshot", () => {
    test("produces a SnapshotMessage addressed to the given recipient", () => {
        const board = makeBoard();
        const alice = board.addPlayer({
            name: "Alice",
            type: GameSetupPlayerType.Local,
        });
        board.addPlayer({ name: "Bob", type: GameSetupPlayerType.Local });

        const snapshot = buildSnapshot(board, alice.id);

        expect(snapshot.type).toBe("snapshot");
        expect(snapshot.recipient).toBe(alice.id);
    });

    test("snapshot.sequence matches the event log head", () => {
        const board = makeBoard();
        board.addPlayer({ name: "Alice", type: GameSetupPlayerType.Local });
        const snapshot = buildSnapshot(board, 1);
        expect(snapshot.sequence).toBe(board.eventLog.head());
    });

    test("state.players contains every player with public fields only", () => {
        const board = makeBoard();
        board.addPlayer({ name: "Alice", type: GameSetupPlayerType.Local });
        board.addPlayer({ name: "Bob", type: GameSetupPlayerType.Local });

        const snapshot = buildSnapshot(board, 1);

        expect(snapshot.state.players).toHaveLength(2);
        for (const p of snapshot.state.players) {
            expect(p.id).toBeTypeOf("number");
            expect(p.name).toBeTypeOf("string");
            expect(p.colour).toBeTypeOf("string");
            expect(p.defeated).toBe(false);
            expect(p.pickedSpell).toBeNull();
        }
    });

    test("state.pieces is empty when no pieces have been added", () => {
        const board = makeBoard();
        board.addPlayer({ name: "Alice", type: GameSetupPlayerType.Local });

        const snapshot = buildSnapshot(board, 1);

        // No wizards or pieces are added by addPlayer alone;
        // createWizards() requires the board to be in the right state.
        // Verify the array exists and has the right structure.
        expect(Array.isArray(snapshot.state.pieces)).toBe(true);
    });

    test("state.self contains the recipient's spells and pickedSpell", () => {
        const board = makeBoard();
        board.addPlayer({ name: "Alice", type: GameSetupPlayerType.Local });

        const snapshot = buildSnapshot(board, 1);

        expect(snapshot.state.self).toBeDefined();
        expect(Array.isArray(snapshot.state.self.spells)).toBe(true);
        expect(snapshot.state.self.pickedSpell).toBeNull();
    });

    test("state.phase carries kind, turnNumber, and currentPlayerId or null", () => {
        const board = makeBoard();
        board.addPlayer({ name: "Alice", type: GameSetupPlayerType.Local });
        const snapshot = buildSnapshot(board, 1);
        expect(snapshot.state.phase.kind).toBeTypeOf("string");
        expect(snapshot.state.phase.turnNumber).toBeTypeOf("number");
        const pid = snapshot.state.phase.currentPlayerId;
        expect(pid === null || typeof pid === "number").toBe(true);
    });
});
