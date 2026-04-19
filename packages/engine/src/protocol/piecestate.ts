import type { PieceId, PlayerId, Point } from "./primitives";

/**
 * Current effective stats for a piece. Includes buff/debuff modifications —
 * these are not derived from the typeId at client side. See spec section
 * "Snapshot properties" for the authoritative sourcing rule.
 */
export interface PieceStats {
    /** Movement range. */
    mov: number;
    /** Melee combat. */
    com: number;
    /** Ranged combat. */
    rcm: number;
    /** Ranged combat range. */
    rng: number;
    /** Defence. */
    def: number;
    /** Manoeuvrability. */
    mnv: number;
    /** Magic resistance. */
    res: number;
}

/**
 * A subset of {@link PieceStats} used in piece-stats-changed outcomes to
 * express only the fields that changed.
 */
export type PartialStats = Partial<PieceStats>;

/**
 * Per-turn flags that reset at the start of each movement turn.
 */
export interface TurnFlags {
    /** The piece has moved this turn. */
    moved: boolean;
    /** The piece has made a melee attack this turn. */
    attacked: boolean;
    /** The piece has made a ranged attack this turn. */
    rangedAttacked: boolean;
    /** The piece was rolled engaged at select time this turn. */
    engaged: boolean;
    /**
     * The piece's entire turn is over — no further actions are possible
     * for it this turn. Set by end-piece-turn and by implicit completion.
     */
    turnOver: boolean;
}

/**
 * A subset of {@link TurnFlags} for piece-turn-flag-changed outcomes.
 */
export type PartialTurnFlags = Partial<TurnFlags>;

/**
 * Flags that persist across turns.
 */
export interface PersistentFlags {
    /** The piece is dead (a corpse). */
    dead: boolean;
    /** The piece was previously dead and has been raised (Raise Dead). */
    raisedDead: boolean;
}

/**
 * A subset of {@link PersistentFlags} for piece-persistent-flag-changed
 * outcomes.
 */
export type PartialPersistentFlags = Partial<PersistentFlags>;

/**
 * Combined flag groups on a piece.
 */
export interface PieceFlags {
    turn: TurnFlags;
    persistent: PersistentFlags;
}

/**
 * Full public state for a single piece. Used in snapshots and
 * piece-spawned outcomes.
 *
 * Notably excludes any illusion field — illusion status is server-private
 * and never appears in protocol messages.
 */
export interface PieceState {
    id: PieceId;
    /** Canonical type id for graphics / animation lookup. */
    typeId: string;
    /**
     * Visual identity for wizard-type pieces only. Travels with the piece
     * across ownership changes (e.g. subversion).
     */
    wizCode?: string;
    ownerId: PlayerId;
    position: Point;
    /** Current effective stats (base plus any modifiers). */
    stats: PieceStats;
    /**
     * Current effective statuses, serialised from the UnitStatus enum's
     * string values.
     */
    statuses: string[];
    flags: PieceFlags;
    /** Id of the mount this piece is currently riding, or null. */
    currentMountId: PieceId | null;
    /** Id of the rider currently mounted on this piece, or null. */
    mountedById: PieceId | null;
}
