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
