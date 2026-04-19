import { describe, expect, test } from "vitest";
import type { ServerToClientMessage } from "./message";

describe("ServerToClientMessage union", () => {
    test("accepts a snapshot message", () => {
        const msg: ServerToClientMessage = {
            type: "snapshot",
            sequence: 1,
            recipient: 1,
            state: {
                scenario: { boardWidth: 1, boardHeight: 1, weather: {} },
                phase: {
                    kind: "spellbook",
                    currentPlayerId: null,
                    turnNumber: 0,
                },
                board: { alignment: { value: 0, accumulatedValue: 0 } },
                players: [],
                pieces: [],
                self: { spells: [], pickedSpell: null },
            },
        };
        expect(msg.type).toBe("snapshot");
    });

    test("accepts a broadcast event message", () => {
        const msg: ServerToClientMessage = {
            type: "event",
            sequence: 2,
            outcomes: [{ kind: "phase-changed", phase: "casting", turnNumber: 1 }],
        };
        expect(msg.type).toBe("event");
    });

    test("accepts a private event message", () => {
        const msg: ServerToClientMessage = {
            type: "private-event",
            sequenceRef: 1,
            recipient: 1,
            kind: "spellbook-delivered",
            spells: [],
        };
        expect(msg.type).toBe("private-event");
    });

    test("narrows on the `type` discriminator", () => {
        function handle(msg: ServerToClientMessage): string {
            if (msg.type === "snapshot") {
                return `snap@${msg.sequence}`;
            }
            if (msg.type === "event") {
                return `event@${msg.sequence}`;
            }
            return `private-event:${msg.kind}`;
        }
        expect(
            handle({
                type: "snapshot",
                sequence: 1,
                recipient: 1,
                state: {
                    scenario: { boardWidth: 1, boardHeight: 1, weather: {} },
                    phase: {
                        kind: "spellbook",
                        currentPlayerId: null,
                        turnNumber: 0,
                    },
                    board: { alignment: { value: 0, accumulatedValue: 0 } },
                    players: [],
                    pieces: [],
                    self: { spells: [], pickedSpell: null },
                },
            }),
        ).toBe("snap@1");
        expect(
            handle({
                type: "event",
                sequence: 2,
                outcomes: [],
            }),
        ).toBe("event@2");
        expect(
            handle({
                type: "private-event",
                sequenceRef: 1,
                recipient: 1,
                kind: "spellbook-delivered",
                spells: [],
            }),
        ).toBe("private-event:spellbook-delivered");
    });
});
