import type { SpellTarget } from "./outcomes";
import type { CommandId, PieceId, Point, SpellId, Token } from "./primitives";

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
