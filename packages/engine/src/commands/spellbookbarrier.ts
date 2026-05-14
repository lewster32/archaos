import type { EndSpellPickCommand, PickSpellCommand } from "../protocol/commands";
import type { PlayerId } from "../protocol/primitives";

/**
 * Disposition returned from `SpellbookBarrier.submit`. Each value maps
 * onto a rejection reason (or, in the `accepted` case, no rejection).
 *
 * - `accepted` — the command was the player's first submission to the
 *   barrier and has been recorded.
 * - `not-in-barrier` — the player was not in the alive roster at
 *   barrier construction; the engine should reject with `wrong-phase`.
 * - `already-submitted` — the player has already submitted; the
 *   engine should reject with `spell-pick-already-ended`.
 * - `closed` — the barrier has already finished (every player either
 *   submitted or was timed out); the engine should reject with
 *   `wrong-phase`.
 */
export type BarrierResult = "accepted" | "not-in-barrier" | "already-submitted" | "closed";

/** Final per-player record produced by the barrier on close. */
export interface BarrierEntry {
    playerId: PlayerId;
    outcome: "pick" | "skip";
    /** True only when the barrier auto-filled this slot due to timeout. */
    timedOut: boolean;
    /** The accepted command, or a synthesised end-spell-pick on timeout. */
    command: PickSpellCommand | EndSpellPickCommand;
}

/**
 * Barrier orchestrator for the spellbook phase. Tracks per-player
 * submission state, owns the timeout timer, and resolves once every
 * slot is filled (by submit or timeout). Outcomes are recorded in
 * arrival order; on timeout, any unfilled slots are appended in the
 * roster's iteration order with `timedOut: true`.
 *
 * Single-use: do not reuse across phases. Construct fresh on each
 * spellbook entry.
 */
export class SpellbookBarrier {
    private readonly _expected: ReadonlySet<PlayerId>;
    private readonly _setTimeout: (cb: () => void, ms: number) => unknown;
    private readonly _clearTimeout: (handle: unknown) => void;
    private readonly _entries: BarrierEntry[] = [];
    private readonly _submittedBy: Set<PlayerId> = new Set();
    private _timer: unknown = null;
    private _resolve: (() => void) | null = null;
    private _closed: boolean = false;

    /**
     * @param alivePlayerIds  Players expected to submit. Must be non-empty.
     * @param timeoutMs       Milliseconds before unsubmitted slots are
     *                        auto-filled with synthetic end-spell-pick.
     *                        Must be greater than zero; callers should
     *                        gate on `phaseTimeoutMs > 0` before
     *                        constructing.
     * @param setTimeoutFn    Injectable scheduler.
     * @param clearTimeoutFn  Injectable scheduler cancel.
     */
    constructor(
        alivePlayerIds: ReadonlyArray<PlayerId>,
        timeoutMs: number,
        setTimeoutFn: (cb: () => void, ms: number) => unknown,
        clearTimeoutFn: (handle: unknown) => void,
    ) {
        if (alivePlayerIds.length === 0) {
            throw new Error("SpellbookBarrier requires at least one player.");
        }
        if (timeoutMs <= 0) {
            throw new Error("SpellbookBarrier requires a positive timeoutMs.");
        }
        this._expected = new Set(alivePlayerIds);
        this._setTimeout = setTimeoutFn;
        this._clearTimeout = clearTimeoutFn;
        this._timer = this._setTimeout(() => this._onTimeout(), timeoutMs);
    }

    /** True if this player is in the expected roster regardless of submission state. */
    isExpected(playerId: PlayerId): boolean {
        return this._expected.has(playerId);
    }

    /** True if this player can still submit (in roster, not yet submitted, barrier open). */
    canAccept(playerId: PlayerId): boolean {
        return !this._closed && this._expected.has(playerId) && !this._submittedBy.has(playerId);
    }

    /**
     * Offer a command to the barrier. Returns the disposition; the
     * engine maps the result onto an accept-or-reject path.
     */
    submit(playerId: PlayerId, cmd: PickSpellCommand | EndSpellPickCommand): BarrierResult {
        if (this._closed) return "closed";
        if (!this._expected.has(playerId)) return "not-in-barrier";
        if (this._submittedBy.has(playerId)) return "already-submitted";

        this._submittedBy.add(playerId);
        this._entries.push({
            playerId,
            outcome: cmd.kind === "pick-spell" ? "pick" : "skip",
            timedOut: false,
            command: cmd,
        });

        if (this._submittedBy.size === this._expected.size) {
            this._close();
        }
        return "accepted";
    }

    /** Resolves once every slot is filled. Idempotent. */
    untilComplete(): Promise<void> {
        if (this._closed) return Promise.resolve();
        return new Promise<void>((resolve) => {
            this._resolve = resolve;
        });
    }

    /** Final per-player records, in arrival order with timed-out entries appended. */
    results(): ReadonlyArray<BarrierEntry> {
        return this._entries;
    }

    /** True if the barrier has closed (every slot filled or timed out). */
    get isClosed(): boolean {
        return this._closed;
    }

    private _onTimeout(): void {
        if (this._closed) return;
        this._timer = null;
        for (const playerId of this._expected) {
            if (!this._submittedBy.has(playerId)) {
                this._submittedBy.add(playerId);
                this._entries.push({
                    playerId,
                    outcome: "skip",
                    timedOut: true,
                    command: {
                        type: "command",
                        commandId: `synthetic-timeout-${playerId}`,
                        token: "",
                        kind: "end-spell-pick",
                    },
                });
            }
        }
        this._close();
    }

    private _close(): void {
        if (this._closed) return;
        this._closed = true;
        if (this._timer != null) {
            this._clearTimeout(this._timer);
            this._timer = null;
        }
        this._resolve?.();
    }
}
