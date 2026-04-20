import type { BroadcastEventMessage, Sequence } from "./protocol";

/**
 * Owns the monotonic sequence counter and the ordered broadcast-event
 * history for a single game. JSON-serialisable for persistence / replay.
 *
 * The log does not enforce any schema beyond `BroadcastEventMessage` —
 * append-time validation of outcomes is the caller's responsibility.
 */
export class EventLog {
    private readonly _events: BroadcastEventMessage[] = [];
    private _nextSequence: Sequence = 1;

    /**
     * Append an event. The caller supplies every field except `sequence`;
     * the log assigns the next sequence atomically and returns the
     * event as appended.
     *
     * @param event All fields of {@link BroadcastEventMessage} except `sequence`.
     * @returns The stored event with its assigned `sequence`.
     */
    append(event: Omit<BroadcastEventMessage, "sequence">): BroadcastEventMessage {
        const appended: BroadcastEventMessage = {
            ...event,
            sequence: this._nextSequence,
        };
        this._events.push(appended);
        this._nextSequence += 1;
        return appended;
    }

    /**
     * Retrieve events in an inclusive sequence range. Omit `toSequence`
     * to read from `fromSequence` to the head.
     *
     * @param fromSequence First sequence to include (inclusive).
     * @param toSequence Last sequence to include (inclusive). Defaults to
     *     {@link head}.
     * @returns Ordered array of matching events.
     */
    range(fromSequence: Sequence, toSequence?: Sequence): BroadcastEventMessage[] {
        const end: Sequence = toSequence ?? this.head();
        return this._events.filter((e) => e.sequence >= fromSequence && e.sequence <= end);
    }

    /** The highest sequence currently in the log, or 0 if empty. */
    head(): Sequence {
        return this._nextSequence - 1;
    }

    /** JSON-safe serialisation for persistence / replay. */
    toJSON(): { events: BroadcastEventMessage[] } {
        return { events: [...this._events] };
    }

    /**
     * Reconstruct an `EventLog` from a previously-serialised payload.
     * `_nextSequence` resumes at `head + 1` (or 1 for an empty payload).
     *
     * @param data The serialised payload produced by {@link toJSON}.
     * @returns A new `EventLog` with history and counter restored.
     */
    static fromJSON(data: { events: BroadcastEventMessage[] }): EventLog {
        const log = new EventLog();
        for (const event of data.events) {
            log._events.push(event);
        }
        log._nextSequence = data.events.length === 0 ? 1 : data.events[data.events.length - 1].sequence + 1;
        return log;
    }
}
