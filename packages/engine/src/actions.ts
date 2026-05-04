import type { PieceConfig } from "./configs/piececonfig";

/**
 * Result of a single piece's spread action within
 * one iteration. Captures what happened so the
 * client can replay it visually.
 */
export type SpreadResult = { action: "none" } | SpreadShrinkResult | SpreadGrowResult;

export interface SpreadShrinkResult {
    action: "shrink";
    pieceId: number;
    /** ID of a piece released from engulfment. */
    releasedPieceId?: number;
}

export interface SpreadGrowResult {
    action: "spread";
    pieceId: number;
    targetPoint: { x: number; y: number };
    /** IDs of pieces destroyed by the spread. */
    destroyedPieceIds: number[];
    /** ID of a piece killed (wizard). */
    killedPieceId?: number;
    /** ID of a piece engulfed. */
    engulfedPieceId?: number;
    /** Config for the newly created piece. */
    newPieceConfig: PieceConfig;
    /** ID assigned to the new piece by the board. */
    newPieceId: number;
    /**
     * If the new piece engulfs an existing piece,
     * this is the ID of the engulfed piece.
     */
    newPieceEngulfedId?: number;
}

/**
 * One complete iteration of spreading. Contains
 * results for every spreading piece that was alive
 * at the start of the iteration.
 */
export interface SpreadIterationPayload {
    /** Piece IDs that were focused at the start. */
    focusPieceIds: number[];
    results: SpreadResult[];
}

/**
 * Full payload for all spread iterations in a turn.
 */
export interface SpreadBatchPayload {
    iterations: SpreadIterationPayload[];
}

/**
 * Result of a single piece being teleported by
 * Turmoil.
 */
export interface TurmoilMoveResult {
    pieceId: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
}

/**
 * Full payload for Turmoil spell.
 */
export interface TurmoilBatchPayload {
    castingPieceId: number;
    moves: TurmoilMoveResult[];
}

/**
 * Payload for {@link EngineEvent.MovePieceBatch}. Describes a single
 * accepted `move-piece` command. The path is the per-tile traversal the
 * engine actually walked (which may be a prefix of the submitted path if
 * engagement broke the loop early - `engagedBy` is set in that case).
 *
 * `riderSync` mirrors the engine's per-step rider position-sync flag: when
 * true, the client should animate the rider in lockstep with the carrier.
 */
export interface MovePieceBatchPayload {
    pieceId: number;
    /** Per-tile traversal exclusive of the start position; last entry is the final tile. */
    path: { x: number; y: number }[];
    riderSync: boolean;
    /** Set when an engagement roll broke the traversal mid-path. */
    engagedBy?: { pieceId: number };
}

/**
 * Payload for {@link EngineEvent.AttackPieceBatch}. Describes a single
 * accepted `attack-piece` command - the approach traversal, the attack
 * roll result, and any cascade kills (rider dismount, mount destruction,
 * wizard defeat). `path` is empty when the attacker was already adjacent.
 */
export interface AttackPieceBatchPayload {
    attackerId: number;
    targetId: number;
    /** Approach traversal up to a tile adjacent to the target; empty if no movement. */
    path: { x: number; y: number }[];
    /** Set when engagement broke the approach mid-path. */
    engagedBy?: { pieceId: number };
    /** True when the attack roll succeeded. */
    hit: boolean;
    /** True when the attack killed (or cascade-killed) the primary target. */
    targetKilled: boolean;
    /** Pieces destroyed by the attack other than the target (e.g. rider, mount cascade). */
    cascadeKilledIds: number[];
}

/**
 * Payload for {@link EngineEvent.RangedAttackPieceBatch}. No traversal -
 * ranged attacks resolve from the attacker's current tile.
 */
export interface RangedAttackPieceBatchPayload {
    attackerId: number;
    targetId: number;
    hit: boolean;
    targetKilled: boolean;
    cascadeKilledIds: number[];
}

/**
 * Payload for {@link EngineEvent.MountPieceBatch}. Describes a wizard
 * mounting a piece, optionally moving onto the mount's tile first.
 */
export interface MountPieceBatchPayload {
    wizardId: number;
    mountId: number;
    /** Approach traversal to the mount's tile; empty if already adjacent. */
    path: { x: number; y: number }[];
}

/**
 * Payload for {@link EngineEvent.DismountPieceBatch}. The wizard ends up
 * on `to`; the engine has already updated the position and dismount
 * relationship before emit.
 */
export interface DismountPieceBatchPayload {
    wizardId: number;
    mountId: number;
    to: { x: number; y: number };
}

/**
 * Payload for {@link EngineEvent.SelectPieceVisual}. Carries the result of
 * the engagement roll so the client can play the engagement sound and
 * suppress the movement gizmo when the piece is now engaged.
 */
export interface SelectPieceVisualPayload {
    pieceId: number;
    /** Set when an engagement roll succeeded; client plays "engaged" sound. */
    engagedBy?: { pieceId: number };
}

/**
 * Payload for {@link EngineEvent.CancelPieceActionVisual}. Mirrors the
 * `cancel-piece-action` command - the client should clear the gizmo and
 * deselect the piece visually.
 */
export interface CancelPieceActionVisualPayload {
    pieceId: number;
}
