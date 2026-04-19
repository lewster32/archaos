import { describe, expect, test } from "vitest";
import type {
    BroadcastEventMessage,
    CommandRejectedPrivateEvent,
    PrivateEventMessage,
    RejectionReason,
    SpellGainedPrivateEvent,
    SpellbookDeliveredPrivateEvent,
} from "./events";

describe("BroadcastEventMessage", () => {
    test("a command-triggered event carries commandId and actorId", () => {
        const msg: BroadcastEventMessage = {
            type: "event",
            sequence: 43,
            commandId: "c_27",
            actorId: 3,
            outcomes: [{ kind: "player-picked-spell", playerId: 3 }],
        };
        expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
    });

    test("a spontaneous event omits commandId and actorId", () => {
        const msg: BroadcastEventMessage = {
            type: "event",
            sequence: 99,
            outcomes: [
                {
                    kind: "weather-changed",
                    weather: { type: "clear" },
                },
            ],
        };
        expect(msg.commandId).toBeUndefined();
        expect(msg.actorId).toBeUndefined();
    });

    test("outcomes may be empty", () => {
        const msg: BroadcastEventMessage = {
            type: "event",
            sequence: 1,
            outcomes: [],
        };
        expect(msg.outcomes).toHaveLength(0);
    });
});

describe("PrivateEventMessage", () => {
    test("spellbook-delivered carries sequenceRef and spells", () => {
        const msg: SpellbookDeliveredPrivateEvent = {
            type: "private-event",
            sequenceRef: 1,
            recipient: 3,
            kind: "spellbook-delivered",
            spells: [{ spellTypeId: "magic-fire", id: 10 }],
        };
        expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
    });

    test("spell-gained carries sequenceRef, spellId, spellTypeId", () => {
        const msg: SpellGainedPrivateEvent = {
            type: "private-event",
            sequenceRef: 17,
            recipient: 3,
            kind: "spell-gained",
            spellId: 42,
            spellTypeId: "turmoil",
        };
        expect(msg.spellTypeId).toBe("turmoil");
    });

    test("command-rejected carries commandId and reason, not sequenceRef", () => {
        const msg: CommandRejectedPrivateEvent = {
            type: "private-event",
            recipient: 3,
            kind: "command-rejected",
            commandId: "c_27",
            reason: "spell-not-in-book",
        };
        expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
        // sequenceRef is absent
        expect((msg as unknown as { sequenceRef?: number }).sequenceRef).toBeUndefined();
    });

    test("RejectionReason covers the canonical set", () => {
        const reasons: RejectionReason[] = [
            "unauthorised",
            "not-your-turn",
            "wrong-phase",
            "spell-not-in-book",
            "piece-already-moved",
            "invalid-target",
            "spell-pick-already-ended",
        ];
        expect(reasons).toHaveLength(7);
    });

    test("PrivateEventMessage is a discriminated union on kind", () => {
        const msgs: PrivateEventMessage[] = [
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
                recipient: 2,
                kind: "spell-gained",
                spellId: 3,
                spellTypeId: "magic-wood",
            },
            {
                type: "private-event",
                recipient: 1,
                kind: "command-rejected",
                commandId: "c_1",
                reason: "unauthorised",
            },
        ];
        expect(msgs.map((m) => m.kind)).toEqual(["spellbook-delivered", "spell-gained", "command-rejected"]);
    });
});
