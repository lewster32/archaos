import type { Outcome } from "./outcomes";
import type { CommandId, PlayerId, Sequence, SequenceRef, SpellId, SpellTypeId } from "./primitives";
import type { SpellbookEntry } from "./snapshot";

// ---------------------------------------------------------------------------
// Broadcast event
// ---------------------------------------------------------------------------

/**
 * The broadcast event envelope. Sent to every connected player. Carries
 * an ordered array of {@link Outcome} records describing the state
 * changes produced by this event.
 *
 * - `commandId` is present when the event was triggered by a client
 *   command; absent for spontaneous events (spread, turmoil,
 *   phase-tick, expirations, etc.).
 * - `actorId` is the player who caused the event when applicable; absent
 *   for spontaneous events with no originating player.
 */
export interface BroadcastEventMessage {
    /** Discriminant for this message category. */
    type: "event";
    /** The monotonic sequence number assigned by the server. */
    sequence: Sequence;
    /**
     * Milliseconds elapsed since `Board.startGame()`. The `game-started`
     * event at sequence 1 carries `elapsedMs: 0` by convention.
     */
    elapsedMs: number;
    /** The client-generated id of the triggering command, if any. */
    commandId?: CommandId;
    /** The player responsible for this event, if any. */
    actorId?: PlayerId;
    /** Ordered list of state-change outcomes produced by this event. */
    outcomes: Outcome[];
}

// ---------------------------------------------------------------------------
// Private events
// ---------------------------------------------------------------------------

/**
 * The initial spellbook delivery — sent once at game start with
 * sequenceRef pointing at the game-started broadcast. This is the only
 * time spellbook state is transmitted outside a recipient snapshot.
 */
export interface SpellbookDeliveredPrivateEvent {
    /** Discriminant for the message category. */
    type: "private-event";
    /** The broadcast sequence this delivery accompanies. */
    sequenceRef: SequenceRef;
    /** Milliseconds elapsed since `Board.startGame()`. */
    elapsedMs: number;
    /** The recipient player. */
    recipient: PlayerId;
    /** Discriminant for this private event kind. */
    kind: "spellbook-delivered";
    /** The recipient's starting spellbook. */
    spells: SpellbookEntry[];
    /**
     * Per-game spellbook barrier timeout in milliseconds. Present only
     * when the game is running in barrier mode; omitted in serial-mode
     * games. Clients may use this to display a countdown; the server
     * remains authoritative for actual timeout enforcement.
     */
    timeoutMs?: number;
}

/**
 * A spell gift from an ExpiresGivesSpell piece (Magic Wood etc.). Ships
 * alongside the broadcast that expires the source piece.
 */
export interface SpellGainedPrivateEvent {
    /** Discriminant for the message category. */
    type: "private-event";
    /** The broadcast sequence this private event accompanies. */
    sequenceRef: SequenceRef;
    /** Milliseconds elapsed since `Board.startGame()`. */
    elapsedMs: number;
    /** The recipient player. */
    recipient: PlayerId;
    /** Discriminant for this private event kind. */
    kind: "spell-gained";
    /** The unique instance id of the gifted spell. */
    spellId: SpellId;
    /** The type reference for the gifted spell. */
    spellTypeId: SpellTypeId;
}

/**
 * Canonical reasons a command may be rejected. Deliberately coarse — the
 * server does not reveal specific state through rejections.
 */
export type RejectionReason =
    | "unauthorised"
    | "not-your-turn"
    | "wrong-phase"
    | "spell-not-in-book"
    | "piece-already-moved"
    | "invalid-target"
    | "invalid-move"
    | "spell-pick-already-ended";

/**
 * Notifies the commanding player that their command was invalid. Carries
 * the offending commandId, not a sequenceRef — no broadcast was emitted.
 */
export interface CommandRejectedPrivateEvent {
    /** Discriminant for the message category. */
    type: "private-event";
    /** The recipient player (the command's sender). */
    recipient: PlayerId;
    /** Milliseconds elapsed since `Board.startGame()`. */
    elapsedMs: number;
    /** Discriminant for this private event kind. */
    kind: "command-rejected";
    /** The client-generated id of the rejected command. */
    commandId: CommandId;
    /** The reason the command was rejected. */
    reason: RejectionReason;
}

/**
 * Any private event sent from the server to a single recipient. The
 * outer discriminant is `type: "private-event"`; narrow further on the
 * `kind` field to reach the specific variant.
 */
export type PrivateEventMessage =
    | SpellbookDeliveredPrivateEvent
    | SpellGainedPrivateEvent
    | CommandRejectedPrivateEvent;
