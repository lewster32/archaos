import { describe, it, expect, vi } from "vitest";
import type { EndSpellPickCommand, PickSpellCommand } from "../protocol/commands";
import { SpellbookBarrier } from "./spellbookbarrier";

const pick = (commandId: string, spellId = 1): PickSpellCommand => ({
    type: "command",
    commandId,
    token: "",
    kind: "pick-spell",
    spellId,
});

const skip = (commandId: string): EndSpellPickCommand => ({
    type: "command",
    commandId,
    token: "",
    kind: "end-spell-pick",
});

interface FakeScheduler {
    setTimeout: ReturnType<typeof vi.fn>;
    clearTimeout: ReturnType<typeof vi.fn>;
    fire: (handle: unknown) => void;
    handles: Map<symbol, () => void>;
}

const makeFakeScheduler = (): FakeScheduler => {
    const handles = new Map<symbol, () => void>();
    const setTimeout = vi.fn((cb: () => void, _ms: number) => {
        const h = Symbol("timer");
        handles.set(h, cb);
        return h;
    });
    const clearTimeout = vi.fn((h: unknown) => {
        handles.delete(h as symbol);
    });
    const fire = (h: unknown) => {
        const cb = handles.get(h as symbol);
        if (!cb) throw new Error("Timer not scheduled");
        handles.delete(h as symbol);
        cb();
    };
    return { setTimeout, clearTimeout, fire, handles };
};

describe("SpellbookBarrier", () => {
    it("closes when every player has submitted", async () => {
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1, 2, 3], 5000, sched.setTimeout, sched.clearTimeout);
        const done = b.untilComplete();

        b.submit(1, pick("c1"));
        b.submit(2, skip("c2"));
        b.submit(3, pick("c3"));

        await done;
        expect(b.results().map((r) => r.playerId)).toEqual([1, 2, 3]);
        expect(b.results().every((r) => !r.timedOut)).toBe(true);
        expect(b.isClosed).toBe(true);
    });

    it("preserves arrival order across scrambled submissions", async () => {
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1, 2, 3], 5000, sched.setTimeout, sched.clearTimeout);
        const done = b.untilComplete();

        b.submit(2, pick("c2"));
        b.submit(3, skip("c3"));
        b.submit(1, pick("c1"));

        await done;
        expect(b.results().map((r) => r.playerId)).toEqual([2, 3, 1]);
    });

    it("auto-skips remaining players on timeout", async () => {
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1, 2, 3], 5000, sched.setTimeout, sched.clearTimeout);
        const done = b.untilComplete();

        b.submit(1, pick("c1"));

        const handle = [...sched.handles.keys()][0];
        sched.fire(handle);

        await done;
        const r = b.results();
        expect(r).toHaveLength(3);
        expect(r[0]).toMatchObject({ playerId: 1, outcome: "pick", timedOut: false });
        expect(r.slice(1).every((x) => x.outcome === "skip" && x.timedOut === true)).toBe(true);
    });

    it("clears the timer when closing naturally", async () => {
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1, 2], 5000, sched.setTimeout, sched.clearTimeout);
        const done = b.untilComplete();

        b.submit(1, pick("c1"));
        b.submit(2, pick("c2"));

        await done;
        expect(sched.clearTimeout).toHaveBeenCalledTimes(1);
    });

    it("does not clear the timer on its own firing path", async () => {
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1, 2], 5000, sched.setTimeout, sched.clearTimeout);
        const done = b.untilComplete();

        const handle = [...sched.handles.keys()][0];
        sched.fire(handle);

        await done;
        // The timer fired and removed itself; clearTimeout should not
        // have been called by the barrier (the handle is already gone).
        expect(sched.clearTimeout).not.toHaveBeenCalled();
    });

    it("canAccept reports submission state", () => {
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1, 2], 5000, sched.setTimeout, sched.clearTimeout);
        expect(b.canAccept(1)).toBe(true);
        expect(b.canAccept(2)).toBe(true);
        expect(b.canAccept(99)).toBe(false);

        b.submit(1, pick("c1"));
        expect(b.canAccept(1)).toBe(false);
        expect(b.canAccept(2)).toBe(true);
    });

    it("isExpected reflects roster regardless of submission state", () => {
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1, 2], 5000, sched.setTimeout, sched.clearTimeout);
        expect(b.isExpected(1)).toBe(true);
        expect(b.isExpected(99)).toBe(false);

        b.submit(1, pick("c1"));
        expect(b.isExpected(1)).toBe(true);
    });

    it("returns already-submitted on duplicate submissions while barrier still open", () => {
        // Two-player roster so the barrier is still open after the first submit.
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1, 2], 5000, sched.setTimeout, sched.clearTimeout);
        const first = b.submit(1, pick("c1"));
        const second = b.submit(1, pick("c2"));
        expect(first).toBe("accepted");
        expect(second).toBe("already-submitted");
    });

    it("returns not-in-barrier for players not in the roster", () => {
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1, 2], 5000, sched.setTimeout, sched.clearTimeout);
        const result = b.submit(99, pick("c-bogus"));
        expect(result).toBe("not-in-barrier");
    });

    it("returns closed once the barrier has finished", async () => {
        const sched = makeFakeScheduler();
        const b = new SpellbookBarrier([1], 5000, sched.setTimeout, sched.clearTimeout);
        b.submit(1, pick("c1"));
        await b.untilComplete();
        const result = b.submit(1, pick("c2"));
        expect(result).toBe("closed");
    });

    it("throws when constructed with an empty roster", () => {
        const sched = makeFakeScheduler();
        expect(() => new SpellbookBarrier([], 5000, sched.setTimeout, sched.clearTimeout)).toThrow(
            /at least one player/i,
        );
    });

    it("throws when timeoutMs is zero or negative", () => {
        const sched = makeFakeScheduler();
        expect(() => new SpellbookBarrier([1], 0, sched.setTimeout, sched.clearTimeout)).toThrow(/positive timeoutMs/i);
        expect(() => new SpellbookBarrier([1], -1, sched.setTimeout, sched.clearTimeout)).toThrow(
            /positive timeoutMs/i,
        );
    });
});
