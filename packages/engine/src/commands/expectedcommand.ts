import type { CommandMessage } from "../protocol/commands";
import type { PlayerId } from "../protocol/primitives";

/**
 * Disposition returned from `ExpectedCommand.submit`. Each value maps
 * directly onto the rejection taxonomy used by the engine's
 * `handleCommand` dispatcher.
 *
 * - `accepted` — the command matched the open slot and resolved the
 *   pending `untilAccepted` promise.
 * - `not-your-turn` — the command came from a player other than the
 *   one whose slot is open.
 * - `wrong-kind` — the slot is closed (already accepted or cancelled),
 *   or the command's kind is not in the slot's allowed list.
 */
export type ExpectedCommandResult = "accepted" | "not-your-turn" | "wrong-kind";

/**
 * A single-slot awaitable for one player's command. Used by both
 * serial-mode spellbook phase (one slot per player in turn order) and
 * the casting phase (one slot per active caster). The slot resolves
 * once when a matching command arrives and rejects if `cancel()` is
 * called before that happens.
 *
 * Single-use: do not reuse across phases. Construct fresh on each
 * acceptance.
 */
export class ExpectedCommand<C extends CommandMessage = CommandMessage> {
    private readonly _expectedPlayerId: PlayerId;
    private readonly _allowedKinds: ReadonlySet<string>;
    private _state: "open" | "accepted" | "cancelled" = "open";
    private _accepted: C | null = null;
    private _resolve: ((cmd: C) => void) | null = null;
    private _reject: ((err: Error) => void) | null = null;

    /**
     * @param expectedPlayerId  The player whose command is expected.
     * @param allowedKinds      The acceptable command kinds.
     */
    constructor(expectedPlayerId: PlayerId, allowedKinds: ReadonlyArray<C["kind"]>) {
        this._expectedPlayerId = expectedPlayerId;
        this._allowedKinds = new Set<string>(allowedKinds);
    }

    /** True when the slot is still waiting for input. */
    get isOpen(): boolean {
        return this._state === "open";
    }

    /** The player this slot is waiting for. */
    get expectedPlayerId(): PlayerId {
        return this._expectedPlayerId;
    }

    /**
     * Offer a command to this slot. The slot is consumed only on
     * "accepted"; "not-your-turn" and "wrong-kind" leave the slot open
     * for a subsequent submission.
     */
    submit(playerId: PlayerId, cmd: CommandMessage): ExpectedCommandResult {
        if (this._state !== "open") {
            return "wrong-kind";
        }
        if (playerId !== this._expectedPlayerId) {
            return "not-your-turn";
        }
        if (!this._allowedKinds.has(cmd.kind)) {
            return "wrong-kind";
        }
        this._state = "accepted";
        this._accepted = cmd as C;
        this._resolve?.(cmd as C);
        return "accepted";
    }

    /**
     * Resolves with the accepted command. Rejects if the slot is
     * cancelled before acceptance. Calling repeatedly is safe — the
     * promise resolves with the same command each time once accepted.
     */
    untilAccepted(): Promise<C> {
        if (this._state === "accepted") {
            return Promise.resolve(this._accepted as C);
        }
        if (this._state === "cancelled") {
            return Promise.reject(new Error("ExpectedCommand was cancelled."));
        }
        return new Promise<C>((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    /**
     * Forcibly close the slot. Rejects any pending `untilAccepted`.
     * Subsequent submit() calls return "wrong-kind". No-op if the slot
     * is already closed.
     */
    cancel(): void {
        if (this._state !== "open") {
            return;
        }
        this._state = "cancelled";
        this._reject?.(new Error("ExpectedCommand was cancelled."));
    }
}
