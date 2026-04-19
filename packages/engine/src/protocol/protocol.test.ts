import { describe, test } from "vitest";
import type { CommandMessage, Outcome, PrivateEventMessage, ServerToClientMessage } from "./index";
import { expectJsonSafe } from "./testing";

/**
 * The representative PieceState used by several fixtures.
 */
const samplePiece = {
    id: 101,
    typeId: "wizard",
    wizCode: "1a2b3c",
    ownerId: 1,
    position: { x: 6, y: 6 },
    stats: { mov: 1, com: 5, rcm: 0, rng: 0, def: 4, mnv: 2, res: 6 },
    statuses: ["wizard"],
    flags: {
        turn: {
            moved: false,
            attacked: false,
            rangedAttacked: false,
            engaged: false,
            turnOver: false,
        },
        persistent: { dead: false, raisedDead: false },
    },
    currentMountId: null,
    mountedById: null,
} as const;

describe("server \u2192 client messages round-trip through JSON", () => {
    test("snapshot", () => {
        const msg: ServerToClientMessage = {
            type: "snapshot",
            sequence: 42,
            recipient: 3,
            state: {
                scenario: { boardWidth: 13, boardHeight: 13, weather: {} },
                phase: {
                    kind: "movement",
                    currentPlayerId: 1,
                    turnNumber: 7,
                },
                board: { alignment: { value: 4, accumulatedValue: 2 } },
                players: [
                    {
                        id: 1,
                        name: "Merlin",
                        colour: "ff0000",
                        castingPieceId: 101,
                        defeated: false,
                        pickedSpell: null,
                    },
                ],
                pieces: [samplePiece],
                self: {
                    spells: [{ spellTypeId: "magic-fire", id: 10 }],
                    pickedSpell: { id: 10, castsLeft: 1 },
                },
            },
        };
        expectJsonSafe(msg);
    });

    test("broadcast event (command-triggered)", () => {
        const msg: ServerToClientMessage = {
            type: "event",
            sequence: 43,
            commandId: "c_27",
            actorId: 3,
            outcomes: [
                {
                    kind: "spell-cast-succeeded",
                    playerId: 3,
                    spellId: 10,
                    spellTypeId: "magic-fire",
                },
            ],
        };
        expectJsonSafe(msg);
    });

    test("broadcast event (spontaneous)", () => {
        const msg: ServerToClientMessage = {
            type: "event",
            sequence: 50,
            outcomes: [
                { kind: "phase-changed", phase: "spreading", turnNumber: 7 },
                {
                    kind: "weather-changed",
                    weather: { type: "gooey-blob-storm", intensity: 3 },
                },
            ],
        };
        expectJsonSafe(msg);
    });

    test("private event: spellbook-delivered", () => {
        const msg: ServerToClientMessage = {
            type: "private-event",
            sequenceRef: 1,
            recipient: 1,
            kind: "spellbook-delivered",
            spells: [
                { spellTypeId: "magic-fire", id: 10 },
                { spellTypeId: "disbelieve", id: 11 },
            ],
        };
        expectJsonSafe(msg);
    });

    test("private event: spell-gained", () => {
        const msg: ServerToClientMessage = {
            type: "private-event",
            sequenceRef: 17,
            recipient: 2,
            kind: "spell-gained",
            spellId: 99,
            spellTypeId: "turmoil",
        };
        expectJsonSafe(msg);
    });

    test("private event: command-rejected", () => {
        const msg: ServerToClientMessage = {
            type: "private-event",
            recipient: 3,
            kind: "command-rejected",
            commandId: "c_27",
            reason: "spell-not-in-book",
        };
        expectJsonSafe(msg);
    });
});

describe("every outcome kind round-trips", () => {
    const outcomes: Outcome[] = [
        // 4.1 Game lifecycle
        {
            kind: "game-started",
            scenario: { boardWidth: 13, boardHeight: 13, weather: {} },
            players: [],
            initialPieces: [samplePiece],
        },
        {
            kind: "phase-changed",
            phase: "casting",
            turnNumber: 1,
            currentPlayerId: 1,
        },
        { kind: "phase-changed", phase: "spellbook", turnNumber: 1 },
        { kind: "player-defeated", playerId: 3 },
        { kind: "game-over", winnerId: 1 },
        { kind: "game-over", winnerId: "draw" },
        // 4.2 Spells
        { kind: "player-picked-spell", playerId: 1 },
        {
            kind: "spell-revealed",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
        },
        {
            kind: "spell-cast-attempted",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
            target: { pieceId: 5 },
        },
        {
            kind: "spell-cast-succeeded",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
        },
        {
            kind: "spell-cast-succeeded",
            playerId: 1,
            spellId: 10,
            spellTypeId: "shadow-wood",
            castsLeft: 2,
        },
        {
            kind: "spell-cast-cancelled",
            playerId: 1,
            spellId: 10,
            spellTypeId: "shadow-wood",
        },
        {
            kind: "spell-cast-failed",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
        },
        {
            kind: "spell-removed-from-book",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
        },
        { kind: "player-ended-spell-pick", playerId: 3 },
        // 4.3 Pieces
        { kind: "piece-spawned", piece: samplePiece },
        {
            kind: "piece-moved",
            pieceId: 101,
            from: { x: 0, y: 0 },
            to: { x: 1, y: 0 },
            path: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
            ],
        },
        {
            kind: "piece-attacked",
            attackerId: 101,
            targetId: 102,
            succeeded: true,
        },
        {
            kind: "piece-ranged-attacked",
            attackerId: 101,
            targetId: 102,
            succeeded: false,
        },
        { kind: "piece-died", pieceId: 102, cause: "combat" },
        { kind: "piece-died", pieceId: 103, cause: "spread" },
        { kind: "piece-mounted", mountId: 50, riderId: 1 },
        { kind: "piece-dismounted", mountId: 50, riderId: 1 },
        { kind: "piece-stats-changed", pieceId: 1, stats: { def: 8 } },
        {
            kind: "piece-statuses-changed",
            pieceId: 1,
            added: ["shadow-form"],
            removed: [],
        },
        { kind: "piece-owner-changed", pieceId: 1, newOwnerId: 2 },
        { kind: "piece-turn-flag-changed", pieceId: 1, flags: { turnOver: true } },
        {
            kind: "piece-persistent-flag-changed",
            pieceId: 1,
            flags: { raisedDead: true },
        },
        { kind: "piece-action-cancelled", pieceId: 1, action: "move" },
        {
            kind: "piece-resisted-spell",
            pieceId: 1,
            spellId: 11,
            spellTypeId: "disbelieve",
        },
        // 4.4 World
        {
            kind: "alignment-changed",
            delta: -1,
            newAlignment: { value: 3, accumulatedValue: 2 },
        },
        { kind: "weather-changed", weather: { type: "clear" } },
        // 4.5 Communication
        { kind: "chat-sent", playerId: 1, message: "hi" },
        { kind: "position-pinged", playerId: 1, point: { x: 5, y: 5 } },
        // 4.6 Connection lifecycle
        { kind: "player-disconnected", playerId: 1 },
        { kind: "player-reconnected", playerId: 1 },
        { kind: "player-replaced-by-ai", playerId: 1 },
    ];

    outcomes.forEach((outcome) => {
        test(`outcome: ${outcome.kind}`, () => {
            expectJsonSafe(outcome);
        });
    });
});

describe("every private event kind round-trips", () => {
    const events: PrivateEventMessage[] = [
        {
            type: "private-event",
            sequenceRef: 1,
            recipient: 1,
            kind: "spellbook-delivered",
            spells: [],
        },
        {
            type: "private-event",
            sequenceRef: 5,
            recipient: 1,
            kind: "spell-gained",
            spellId: 99,
            spellTypeId: "turmoil",
        },
        {
            type: "private-event",
            recipient: 1,
            kind: "command-rejected",
            commandId: "c_1",
            reason: "unauthorised",
        },
    ];
    events.forEach((e) => {
        test(`private event: ${e.kind}`, () => {
            expectJsonSafe(e);
        });
    });
});

describe("every command kind round-trips", () => {
    const commands: CommandMessage[] = [
        // 6.1 Spellbook
        {
            type: "command",
            commandId: "c_1",
            token: "t",
            kind: "pick-spell",
            spellId: 10,
            illusion: true,
        },
        {
            type: "command",
            commandId: "c_2",
            token: "t",
            kind: "end-spell-pick",
        },
        // 6.2 Casting
        {
            type: "command",
            commandId: "c_3",
            token: "t",
            kind: "cast-spell",
            target: { self: true },
        },
        {
            type: "command",
            commandId: "c_4",
            token: "t",
            kind: "cancel-cast",
        },
        // 6.3 Movement
        {
            type: "command",
            commandId: "c_5",
            token: "t",
            kind: "select-piece",
            pieceId: 101,
        },
        {
            type: "command",
            commandId: "c_6",
            token: "t",
            kind: "move-piece",
            pieceId: 101,
            to: { x: 1, y: 1 },
        },
        {
            type: "command",
            commandId: "c_7",
            token: "t",
            kind: "attack-piece",
            attackerId: 101,
            targetId: 102,
        },
        {
            type: "command",
            commandId: "c_8",
            token: "t",
            kind: "ranged-attack-piece",
            attackerId: 101,
            targetId: 102,
        },
        {
            type: "command",
            commandId: "c_9",
            token: "t",
            kind: "mount-piece",
            wizardId: 1,
            mountId: 50,
        },
        {
            type: "command",
            commandId: "c_10",
            token: "t",
            kind: "dismount-piece",
            wizardId: 1,
        },
        {
            type: "command",
            commandId: "c_11",
            token: "t",
            kind: "cancel-piece-action",
            pieceId: 101,
        },
        {
            type: "command",
            commandId: "c_12",
            token: "t",
            kind: "end-piece-turn",
            pieceId: 101,
        },
        {
            type: "command",
            commandId: "c_13",
            token: "t",
            kind: "end-movement-phase",
        },
        // 6.4 Communication
        {
            type: "command",
            commandId: "c_14",
            token: "t",
            kind: "chat",
            message: "gg",
        },
        {
            type: "command",
            commandId: "c_15",
            token: "t",
            kind: "ping-position",
            point: { x: 3, y: 3 },
        },
        // 6.5 History and recovery
        {
            type: "command",
            commandId: "c_16",
            token: "t",
            kind: "request-snapshot",
        },
        {
            type: "command",
            commandId: "c_17",
            token: "t",
            kind: "request-history",
            fromSequence: 10,
            toSequence: 42,
        },
        {
            type: "command",
            commandId: "c_18",
            token: "t",
            kind: "request-private-resend",
            commandIdRef: "c_x",
        },
        {
            type: "command",
            commandId: "c_19",
            token: "abc",
            kind: "reconnect",
            lastAppliedSequence: 30,
        },
    ];
    commands.forEach((c) => {
        test(`command: ${c.kind}`, () => {
            expectJsonSafe(c);
        });
    });
});
