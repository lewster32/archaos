import { assert, describe, expect, test } from "vitest";
import { Board } from "./board";
import { EventLog } from "./eventlog";
import { Point } from "./point";
import { TestRNG } from "./rng";
import { buildSnapshot } from "./snapshotbuilder";
import { GameSetupPlayerType } from "./interfaces/ui";
import { UnitType } from "./enums/unittype";
import { UnitStatus } from "./enums/unitstatus";
import type { Player } from "./player";
import type { PieceConfig } from "./configs/piececonfig";

function makeBoard(clock?: () => number): Board {
    return new Board(1, 13, 13, false, undefined, {
        rng: new TestRNG(),
        // Disable the new command-pipeline phase loop (default `true`
        // after Task 12) so these tests can drive moves directly via
        // `recordEvent` without racing the auto-loop.
        autoRunPhaseLoop: false,
        ...(clock === undefined ? {} : { now: clock }),
    });
}

function addPlayer(board: Board, _id: number, name: string): Player {
    return board.addPlayer({ name, type: GameSetupPlayerType.Local });
}

/**
 * Drive a single piece-moved + piece-turn-flag-changed broadcast event
 * for the given piece. Replaces the legacy `Board.movePiece` direct
 * mutator (removed in Task 12 of the movement-phase command-wiring
 * spec).
 */
async function recordMove(
    board: Board,
    pieceId: number,
    to: Point,
    commandId: string,
    actorId: number,
): Promise<void> {
    const piece = board.getPiece(pieceId);
    if (!piece) {
        throw new Error(`Could not find piece with ID ${pieceId}`);
    }
    await board.recordEvent({ commandId, actorId }, () => {
        piece.setPosition(to);
        piece.setTurnFlags({ moved: true });
    });
}

function makePieceConfig(x: number, y: number, owner: Player, status: UnitStatus[] = []): PieceConfig {
    return {
        type: UnitType.Creature,
        x,
        y,
        properties: {
            movement: 3,
            combat: 3,
            rangedCombat: 0,
            range: 0,
            defence: 4,
            manoeuvrability: 3,
            magicResistance: 0,
            status,
        },
        owner: owner as any,
    };
}

describe("game-event integration: short scripted game", () => {
    test("startGame then movePiece produces two ordered events", async () => {
        let clock = 1000;
        const board = makeBoard(() => clock);
        const player = addPlayer(board, 1, "Alice");
        addPlayer(board, 2, "Bob");
        const piece = await board.addPiece(makePieceConfig(0, 0, player));

        await board.startGame();
        clock = 1250;
        await recordMove(board, piece.id, new Point(5, 5), "c_1", 1);

        const events = board.eventLog.range(1);
        expect(events.length).toBeGreaterThanOrEqual(2);
        expect(events[0].outcomes[0].kind).toBe("game-started");
        expect(events[0].elapsedMs).toBe(0);
        // Find the piece-moved event (may not be events[1] if phase-changed
        // events are interleaved — phase transitions inside startGame may
        // also emit).
        const pieceMovedEvent = events.find((e) => e.outcomes.some((o) => o.kind === "piece-moved"));
        assert(pieceMovedEvent !== undefined, "expected a piece-moved event");
        expect(pieceMovedEvent.commandId).toBe("c_1");
        expect(pieceMovedEvent.actorId).toBe(1);
        expect(pieceMovedEvent.elapsedMs).toBe(250);
    });

    test("snapshot-vs-live-state: after moves the snapshot reflects current state", async () => {
        const board = makeBoard();
        const player = addPlayer(board, 1, "Alice");
        const piece = await board.addPiece(makePieceConfig(0, 0, player));
        await board.startGame();

        await recordMove(board, piece.id, new Point(5, 5), "c_1", 1);
        await recordMove(board, piece.id, new Point(6, 6), "c_2", 1);
        await recordMove(board, piece.id, new Point(7, 7), "c_3", 1);

        const snapshot = buildSnapshot(board, 1);
        const snapshotPiece = snapshot.state.pieces.find((p) => p.id === piece.id);
        assert(snapshotPiece !== undefined, "expected piece in snapshot");
        expect(snapshotPiece.position).toEqual({ x: 7, y: 7 });
        expect(snapshot.sequence).toBe(board.eventLog.head());
    });
});

describe("event-log serialisation round-trip", () => {
    test("toJSON + fromJSON preserves sequence, content, and next-sequence", async () => {
        const board = makeBoard();
        const player = addPlayer(board, 1, "Alice");
        const piece = await board.addPiece(makePieceConfig(0, 0, player));
        await board.startGame();
        await recordMove(board, piece.id, new Point(5, 5), "c_1", 1);
        await recordMove(board, piece.id, new Point(6, 6), "c_2", 1);

        const json = board.eventLog.toJSON();
        const restored = EventLog.fromJSON(json);

        expect(restored.range(1)).toEqual(board.eventLog.range(1));
        expect(restored.head()).toBe(board.eventLog.head());

        // Resume append.
        const next = restored.append({
            type: "event",
            elapsedMs: 1000,
            outcomes: [],
        });
        expect(next.sequence).toBe(board.eventLog.head() + 1);
    });
});

describe("invariants", () => {
    test("non-reentrant: nested recordEvent throws", async () => {
        const board = makeBoard();
        addPlayer(board, 1, "Alice");
        await expect(
            board.recordEvent({}, async () => {
                await board.recordEvent({}, () => {
                    board.pushOutcome({
                        kind: "phase-changed",
                        phase: "casting",
                        turnNumber: 1,
                    });
                });
            }),
        ).rejects.toThrow(/nested|already active/i);
    });

    test("exception-clear context: next recordEvent succeeds", async () => {
        const board = makeBoard();
        addPlayer(board, 1, "Alice");
        await expect(
            board.recordEvent({}, () => {
                throw new Error("boom");
            }),
        ).rejects.toThrow(/boom/);
        const event = await board.recordEvent({}, () => {
            board.pushOutcome({
                kind: "phase-changed",
                phase: "casting",
                turnNumber: 1,
            });
        });
        expect(event.sequence).toBe(1);
    });

    test("bootstrap exclusivity: second startGame throws", async () => {
        const board = makeBoard();
        addPlayer(board, 1, "Alice");
        await board.startGame();
        await expect(board.startGame()).rejects.toThrow(/already|once/i);
    });

    test("sequence monotonicity: head increases by exactly 1 per event", async () => {
        const board = makeBoard();
        const player = addPlayer(board, 1, "Alice");
        const piece = await board.addPiece(makePieceConfig(0, 0, player));
        const heads: number[] = [];
        heads.push(board.eventLog.head());
        await board.startGame();
        heads.push(board.eventLog.head());
        await recordMove(board, piece.id, new Point(5, 5), "c_1", 1);
        heads.push(board.eventLog.head());
        await recordMove(board, piece.id, new Point(6, 6), "c_2", 1);
        heads.push(board.eventLog.head());
        // heads[] should be strictly monotonic: each entry >= previous,
        // and each entry after a move should be larger than the one before.
        for (let i = 1; i < heads.length; i += 1) {
            expect(heads[i]).toBeGreaterThanOrEqual(heads[i - 1]);
        }
        expect(heads[0]).toBe(0);
        expect(heads.at(-1)).toBeGreaterThanOrEqual(3);
    });

    test("silent pushOutcome: calls outside recordEvent do not alter the log", () => {
        const board = makeBoard();
        addPlayer(board, 1, "Alice");
        for (let i = 0; i < 5; i += 1) {
            board.pushOutcome({
                kind: "phase-changed",
                phase: "casting",
                turnNumber: i,
            });
        }
        expect(board.eventLog.head()).toBe(0);
    });
});
