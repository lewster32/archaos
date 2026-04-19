import type { SpellTarget } from "./outcomes";
import type { CommandId, PieceId, Point, Sequence, SequenceRef, SpellId, Token } from "./primitives";

/**
 * Shared envelope for every command. Token validation runs before any
 * other command processing.
 */
export interface BaseCommand {
    /** Discriminant for the message category. */
    type: "command";
    /** Client-generated unique id, echoed back on the resulting event. */
    commandId: CommandId;
    /** Per-player session token. */
    token: Token;
}

// ---------------------------------------------------------------------------
// 6.1 Spellbook phase
// ---------------------------------------------------------------------------

/**
 * Pick a spell from the player's spellbook. The `illusion` field is
 * absent if the chosen spell does not allow illusion form. The client
 * forgets the illusion flag immediately after sending; the server holds
 * it privately for the rest of the game.
 */
export interface PickSpellCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "pick-spell";
    /** The unique instance id of the spell being picked. */
    spellId: SpellId;
    /** Whether to cast the spell as an illusion, if the spell permits. */
    illusion?: boolean;
}

/**
 * End the player's pick for this spellbook phase without selecting a
 * spell. Server timeouts emit an equivalent private server-side action.
 */
export interface EndSpellPickCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "end-spell-pick";
}

// ---------------------------------------------------------------------------
// 6.2 Casting phase
// ---------------------------------------------------------------------------

/**
 * Cast the previously-picked spell on the given target.
 */
export interface CastSpellCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "cast-spell";
    /** The target of the cast — piece, point, or self. */
    target: SpellTarget;
}

/**
 * Cancel casting — discards the picked spell from the spellbook
 * regardless of whether it was uncast or partially cast via multi-cast.
 */
export interface CancelCastCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "cancel-cast";
}

// ---------------------------------------------------------------------------
// 6.3 Movement phase
// ---------------------------------------------------------------------------

/**
 * Select a piece for potential action. Triggers a server-side engagement
 * roll against the piece's current adjacency; the outcome (if any) is
 * emitted as a piece-turn-flag-changed outcome with `engaged: true`.
 */
export interface SelectPieceCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "select-piece";
    /** The piece being selected. */
    pieceId: PieceId;
}

/**
 * Move a piece to a target tile. The server authoritatively validates
 * the move and may emit reconciliation outcomes (e.g. engagement on the
 * path).
 */
export interface MovePieceCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "move-piece";
    /** The piece being moved. */
    pieceId: PieceId;
    /** Destination tile. */
    to: Point;
}

/**
 * Perform a melee attack from one piece against another.
 */
export interface AttackPieceCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "attack-piece";
    /** The attacking piece. */
    attackerId: PieceId;
    /** The target of the attack. */
    targetId: PieceId;
}

/**
 * Perform a ranged attack from one piece against another.
 */
export interface RangedAttackPieceCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "ranged-attack-piece";
    /** The attacking piece. */
    attackerId: PieceId;
    /** The target of the ranged attack. */
    targetId: PieceId;
}

/**
 * Mount a wizard onto a mountable piece adjacent to the wizard.
 */
export interface MountPieceCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "mount-piece";
    /** The wizard doing the mounting. */
    wizardId: PieceId;
    /** The mountable piece to ride. */
    mountId: PieceId;
}

/**
 * Dismount a wizard from their current mount. The destination tile is
 * resolved by the server; a follow-up piece-moved or piece-mounted
 * outcome is emitted in the same outcomes array.
 */
export interface DismountPieceCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "dismount-piece";
    /** The wizard dismounting. */
    wizardId: PieceId;
}

/**
 * Cancel the currently pending action on a piece without ending the
 * piece's turn — e.g. backing out of an engaged-piece attack choice, or
 * declining a ranged-attack opportunity.
 */
export interface CancelPieceActionCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "cancel-piece-action";
    /** The piece whose pending action is being cancelled. */
    pieceId: PieceId;
}

/**
 * Flag the piece's turn as over. The piece cannot make any further
 * actions in the current movement phase.
 */
export interface EndPieceTurnCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "end-piece-turn";
    /** The piece whose turn is being ended. */
    pieceId: PieceId;
}

/**
 * End the player's movement phase turn early, skipping any remaining
 * actions and advancing to the next player.
 */
export interface EndMovementPhaseCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "end-movement-phase";
}

// ---------------------------------------------------------------------------
// 6.4 Communication (non-gameplay)
// ---------------------------------------------------------------------------

/**
 * Send a chat message to all players. Not gated on turn or phase;
 * subject to server rate-limiting only.
 */
export interface ChatCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "chat";
    /** The chat message body. */
    message: string;
}

/**
 * Place a tactical attention-ping on a board tile. Not gated on turn or
 * phase.
 */
export interface PingPositionCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "ping-position";
    /** The board tile being pinged. */
    point: Point;
}

// ---------------------------------------------------------------------------
// 6.5 History and recovery
// ---------------------------------------------------------------------------

/**
 * Request a fresh recipient snapshot from the server — typically after a
 * desync or as a last-resort recovery action.
 */
export interface RequestSnapshotCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "request-snapshot";
}

/**
 * Request a range of historic broadcast events. `toSequence` is optional;
 * absent means "from fromSequence to current".
 */
export interface RequestHistoryCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "request-history";
    /** Inclusive start of the history range. */
    fromSequence: Sequence;
    /** Inclusive end of the history range, or absent for "to current". */
    toSequence?: Sequence;
}

/**
 * Request resend of a missed private event. Exactly one of `commandIdRef`
 * or `sequenceRef` is provided, identifying which missed private event
 * to retrieve.
 *
 * The field is named `commandIdRef` (not `commandId`) so the envelope's
 * own `commandId` is not shadowed.
 */
export interface RequestPrivateResendCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "request-private-resend";
    /** The commandId of a missed command-rejected private event. */
    commandIdRef?: CommandId;
    /** The broadcast sequence a missed private event accompanies. */
    sequenceRef?: SequenceRef;
}

/**
 * Establish identity after a disconnect. The one command the server
 * accepts from a transport whose identity is not yet confirmed — token
 * validation is how identity becomes confirmed. The session token
 * arrives via the standard `BaseCommand.token` field.
 *
 * `lastAppliedSequence` is optional and enables the server to resume
 * with events from that point rather than sending a full snapshot.
 */
export interface ReconnectCommand extends BaseCommand {
    /** Discriminant for this command kind. */
    kind: "reconnect";
    /** The highest broadcast sequence the client has already applied. */
    lastAppliedSequence?: Sequence;
}

// ---------------------------------------------------------------------------
// Discriminated union of every command kind
// ---------------------------------------------------------------------------

/**
 * Any command a client may send to the server. The discriminator is
 * `kind` within the outer `type: "command"` envelope.
 */
export type CommandMessage =
    // 6.1 Spellbook
    | PickSpellCommand
    | EndSpellPickCommand
    // 6.2 Casting
    | CastSpellCommand
    | CancelCastCommand
    // 6.3 Movement
    | SelectPieceCommand
    | MovePieceCommand
    | AttackPieceCommand
    | RangedAttackPieceCommand
    | MountPieceCommand
    | DismountPieceCommand
    | CancelPieceActionCommand
    | EndPieceTurnCommand
    | EndMovementPhaseCommand
    // 6.4 Communication
    | ChatCommand
    | PingPositionCommand
    // 6.5 History and recovery
    | RequestSnapshotCommand
    | RequestHistoryCommand
    | RequestPrivateResendCommand
    | ReconnectCommand;
