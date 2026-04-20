import { describe, expect, test } from "vitest";
import { EventLog } from "./eventlog";
import type { BroadcastEventMessage, Outcome } from "./protocol";

function makeEvent(
    overrides: Partial<Omit<BroadcastEventMessage, "sequence">> = {},
): Omit<BroadcastEventMessage, "sequence"> {
    return {
        type: "event",
        elapsedMs: 0,
        outcomes: [],
        ...overrides,
    };
}

describe("EventLog", () => {
    test("starts empty with head() of 0", () => {
        const log = new EventLog();
        expect(log.head()).toBe(0);
    });

    test("append assigns sequence 1 to the first event", () => {
        const log = new EventLog();
        const appended = log.append(makeEvent());
        expect(appended.sequence).toBe(1);
        expect(log.head()).toBe(1);
    });

    test("subsequent appends increment sequence by 1", () => {
        const log = new EventLog();
        const a = log.append(makeEvent());
        const b = log.append(makeEvent());
        const c = log.append(makeEvent());
        expect(a.sequence).toBe(1);
        expect(b.sequence).toBe(2);
        expect(c.sequence).toBe(3);
        expect(log.head()).toBe(3);
    });

    test("range returns events in the inclusive window", () => {
        const log = new EventLog();
        log.append(
            makeEvent({
                outcomes: [{ kind: "game-over", winnerId: "draw" }] satisfies Outcome[],
            }),
        );
        log.append(makeEvent());
        log.append(makeEvent());
        log.append(makeEvent());
        expect(log.range(2, 3).map((e) => e.sequence)).toEqual([2, 3]);
    });

    test("range without toSequence reads to head", () => {
        const log = new EventLog();
        log.append(makeEvent());
        log.append(makeEvent());
        log.append(makeEvent());
        expect(log.range(2).map((e) => e.sequence)).toEqual([2, 3]);
    });

    test("toJSON round-trips through fromJSON with identical events and resumed counter", () => {
        const log = new EventLog();
        log.append(makeEvent({ elapsedMs: 100 }));
        log.append(makeEvent({ elapsedMs: 250 }));

        const json = log.toJSON();
        const restored = EventLog.fromJSON(json);

        expect(restored.head()).toBe(2);
        expect(restored.range(1)).toEqual(log.range(1));

        const next = restored.append(makeEvent({ elapsedMs: 400 }));
        expect(next.sequence).toBe(3);
    });

    test("fromJSON on empty data produces an empty log at sequence 0", () => {
        const restored = EventLog.fromJSON({ events: [] });
        expect(restored.head()).toBe(0);
        const first = restored.append(makeEvent());
        expect(first.sequence).toBe(1);
    });
});
