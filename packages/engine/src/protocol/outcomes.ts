import type { PieceState } from "./piecestate";
import type { PieceId, Point, PlayerId, SpellId, SpellTypeId } from "./primitives";
import type { PhaseKind, PlayerPublicState, ScenarioState } from "./snapshot";

// ---------------------------------------------------------------------------
// Common sub-types
// ---------------------------------------------------------------------------

/**
 * Target of a spell cast. Covers piece-targeted, position-targeted, and
 * self-targeted spells.
 */
export type SpellTarget = { pieceId: PieceId } | { point: Point } | { self: true };

// ---------------------------------------------------------------------------
// 4.1 Game lifecycle
// ---------------------------------------------------------------------------

/**
 * Always at sequence 1. Carries scenario config, player public records,
 * and initial piece placements.
 */
export interface GameStartedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "game-started";
    /** Static scenario configuration. */
    scenario: ScenarioState;
    /** Public records for every player at game start. */
    players: PlayerPublicState[];
    /** Initial piece placements with full stats, statuses, and wizCode. */
    initialPieces: PieceState[];
}

/**
 * Emitted at every phase or player transition.
 */
export interface PhaseChangedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "phase-changed";
    /** The phase the game is transitioning into. */
    phase: PhaseKind;
    /** The current full turn cycle number. */
    turnNumber: number;
    /** Absent during the simultaneous spellbook phase. */
    currentPlayerId?: PlayerId;
}

/**
 * A player's wizard has been eliminated from the game.
 */
export interface PlayerDefeatedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "player-defeated";
    /** The player whose wizard has been eliminated. */
    playerId: PlayerId;
}

/**
 * The game has ended.
 */
export interface GameOverOutcome {
    /** Discriminant for this outcome kind. */
    kind: "game-over";
    /**
     * The winning player's id, or the literal string `"draw"` when no
     * wizard remains (e.g. simultaneous defeat via spread).
     */
    winnerId: PlayerId | "draw";
}

// ---------------------------------------------------------------------------
// 4.2 Spells
// ---------------------------------------------------------------------------

/**
 * A player has picked a spell during the spellbook phase. Spell identity
 * is withheld from this outcome — only the picker knows the choice until
 * the reveal at cast time.
 */
export interface PlayerPickedSpellOutcome {
    /** Discriminant for this outcome kind. */
    kind: "player-picked-spell";
    /** The player who picked. */
    playerId: PlayerId;
}

/**
 * A player's chosen spell is revealed at cast time. Carries no illusion
 * bit — the server never reveals the illusion state.
 */
export interface SpellRevealedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "spell-revealed";
    /** The player whose spell is being revealed. */
    playerId: PlayerId;
    /** The unique instance id of the revealed spell. */
    spellId: SpellId;
    /** The type reference for the spell (for name, graphics, etc.). */
    spellTypeId: SpellTypeId;
}

/**
 * A player has directed their chosen spell at a target. Precedes
 * spell-cast-succeeded or spell-cast-failed.
 */
export interface SpellCastAttemptedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "spell-cast-attempted";
    /** The player casting. */
    playerId: PlayerId;
    /** The unique instance id of the spell being cast. */
    spellId: SpellId;
    /** The type reference for the spell. */
    spellTypeId: SpellTypeId;
    /** The target of the cast — piece, point, or self. */
    target: SpellTarget;
}

/**
 * The spell successfully manifested (cast chance passed). The resulting
 * state-change outcomes follow in the same `outcomes` array. For
 * multi-cast spells this fires once per cast; `castsLeft` reflects how
 * many further casts remain.
 *
 * Note: Disbelieve always succeeds (it never fizzles); its effect on the
 * target is expressed as either `piece-died` (illusion) or
 * `piece-resisted-spell` (real).
 */
export interface SpellCastSucceededOutcome {
    /** Discriminant for this outcome kind. */
    kind: "spell-cast-succeeded";
    /** The player whose cast succeeded. */
    playerId: PlayerId;
    /** The unique instance id of the successfully cast spell. */
    spellId: SpellId;
    /** The type reference for the spell. */
    spellTypeId: SpellTypeId;
    /**
     * Remaining casts for multi-cast spells (Shadow Wood, Wall, etc.).
     * Absent for single-cast spells.
     */
    castsLeft?: number;
}

/**
 * The player cancelled their spell — either before any cast-attempt, or
 * mid-way through a multi-cast session, abandoning remaining casts.
 */
export interface SpellCastCancelledOutcome {
    /** Discriminant for this outcome kind. */
    kind: "spell-cast-cancelled";
    /** The player who cancelled. */
    playerId: PlayerId;
    /** The unique instance id of the cancelled spell. */
    spellId: SpellId;
    /** The type reference for the spell. */
    spellTypeId: SpellTypeId;
}

/**
 * The cast chance roll failed ('fizzled'). The spell never manifested.
 * Resistance outcomes are expressed via piece-resisted-spell on an
 * otherwise-successful cast — they do not appear here.
 */
export interface SpellCastFailedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "spell-cast-failed";
    /** The player whose cast fizzled. */
    playerId: PlayerId;
    /** The unique instance id of the fizzled spell. */
    spellId: SpellId;
    /** The type reference for the spell. */
    spellTypeId: SpellTypeId;
}

/**
 * Public book-keeping: the spell is no longer in the player's spellbook.
 * Fires on full cast resolution (single-cast success/failure, or
 * multi-cast exhaustion) and on cancel-cast. Spells with the `persist`
 * flag (notably Disbelieve) never trigger this outcome.
 */
export interface SpellRemovedFromBookOutcome {
    /** Discriminant for this outcome kind. */
    kind: "spell-removed-from-book";
    /** The owner of the spellbook. */
    playerId: PlayerId;
    /** The unique instance id of the removed spell. */
    spellId: SpellId;
    /** The type reference for the spell. */
    spellTypeId: SpellTypeId;
}

/**
 * Fires on an explicit end-spell-pick command and on server-timer-forced
 * timeout during the spellbook phase.
 */
export interface PlayerEndedSpellPickOutcome {
    /** Discriminant for this outcome kind. */
    kind: "player-ended-spell-pick";
    /** The player whose spellbook pick has ended. */
    playerId: PlayerId;
}

// ---------------------------------------------------------------------------
// 4.3 Pieces
// ---------------------------------------------------------------------------

/**
 * A piece has been spawned on the board — typically via a summon spell,
 * Raise Dead, or a scenario's initial placement when emitted inside the
 * `game-started` outcome.
 */
export interface PieceSpawnedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-spawned";
    /** The newly-spawned piece's full state. */
    piece: PieceState;
}

/**
 * A piece has moved from one tile to another.
 *
 * If the moved piece has a `mountedById`, the rider identified by that id
 * has its position synchronised to the same destination without a
 * separate outcome.
 */
export interface PieceMovedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-moved";
    /** The piece being moved. */
    pieceId: PieceId;
    /** Tile the piece moved from. */
    from: Point;
    /** Tile the piece moved to. */
    to: Point;
    /** Optional full path for animated traversal. */
    path?: Point[];
}

/**
 * A melee attack resolution between two pieces. `succeeded` is the public
 * outcome bit; any resulting `piece-died` / `piece-moved` outcomes follow
 * in the same `outcomes` array.
 */
export interface PieceAttackedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-attacked";
    /** The attacking piece. */
    attackerId: PieceId;
    /** The defending piece. */
    targetId: PieceId;
    /** Whether the attack succeeded (killed the defender). */
    succeeded: boolean;
}

/**
 * A ranged attack resolution between two pieces. Unlike melee, a successful
 * ranged attack does not move the attacker; the dead defender is the only
 * state change.
 */
export interface PieceRangedAttackedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-ranged-attacked";
    /** The attacking piece. */
    attackerId: PieceId;
    /** The defending piece. */
    targetId: PieceId;
    /** Whether the ranged attack succeeded. */
    succeeded: boolean;
}

/**
 * Canonical cause strings for piece deaths. The string is open-ended so
 * new content can add causes; consumers should treat unknown values
 * gracefully.
 */
export type PieceDiedCause =
    | "combat"
    | "ranged"
    | "spell"
    | "disbelieve"
    | "expired"
    | "spread"
    | "subverted-away"
    | string;

/**
 * A piece has died. The `cause` field records how — see
 * {@link PieceDiedCause} for canonical causes.
 */
export interface PieceDiedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-died";
    /** The piece that died. */
    pieceId: PieceId;
    /** What killed it. */
    cause: PieceDiedCause;
}

/**
 * A rider has mounted a mountable piece. The rider's position is now
 * synchronised with the mount; subsequent `piece-moved` outcomes on the
 * mount implicitly move the rider too.
 */
export interface PieceMountedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-mounted";
    /** The mount (e.g. horse). */
    mountId: PieceId;
    /** The rider now sitting on the mount. */
    riderId: PieceId;
}

/**
 * A rider has dismounted from a mount.
 *
 * If the rider dismounts to an adjacent tile or piece, a separate
 * piece-moved or piece-mounted outcome follows within the same event's
 * `outcomes` array.
 */
export interface PieceDismountedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-dismounted";
    /** The mount the rider is leaving. */
    mountId: PieceId;
    /** The rider dismounting. */
    riderId: PieceId;
}

/**
 * A subset of a piece's effective stats has changed (e.g. buff, debuff,
 * transformation).
 */
export interface PieceStatsChangedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-stats-changed";
    /** The piece whose stats changed. */
    pieceId: PieceId;
    /** The subset of stats that changed, with their new values. */
    stats: import("./piecestate").PartialStats;
}

/**
 * A piece's status set has changed. `added` and `removed` are disjoint
 * lists of status identifiers (serialised from the `UnitStatus` enum's
 * string values).
 */
export interface PieceStatusesChangedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-statuses-changed";
    /** The piece whose status set changed. */
    pieceId: PieceId;
    /** Statuses added to the piece. */
    added: string[];
    /** Statuses removed from the piece. */
    removed: string[];
}

/**
 * Fires when a piece changes owner (e.g. Subversion).
 */
export interface PieceOwnerChangedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-owner-changed";
    /** The piece whose ownership changed. */
    pieceId: PieceId;
    /** The new owner's player id. */
    newOwnerId: PlayerId;
}

/**
 * Partial update to any of {moved, attacked, rangedAttacked, engaged,
 * turnOver}. Engagement is rolled at select time and emits this outcome
 * only if the roll succeeds.
 */
export interface PieceTurnFlagChangedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-turn-flag-changed";
    /** The piece whose turn flags changed. */
    pieceId: PieceId;
    /** The subset of turn flags that changed, with their new values. */
    flags: import("./piecestate").PartialTurnFlags;
}

/**
 * Partial update to any persistent flag (raisedDead and future
 * additions). The `dead` flag is set via piece-died rather than this
 * outcome.
 */
export interface PiecePersistentFlagChangedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-persistent-flag-changed";
    /** The piece whose persistent flags changed. */
    pieceId: PieceId;
    /** The subset of persistent flags that changed, with their new values. */
    flags: import("./piecestate").PartialPersistentFlags;
}

/**
 * Enumerated set of action categories that can be cancelled by a player.
 * `select` covers the case where a piece was selected but the player
 * backed out before committing to any action.
 */
export type PieceActionCancelledAction = "select" | "move" | "attack" | "rangedAttack" | "mount" | "dismount" | string;

/**
 * A player explicitly cancelled a pending action on a piece without ending
 * the piece's turn — e.g. backing out of an engaged-piece attack choice,
 * or declining a ranged-attack opportunity.
 */
export interface PieceActionCancelledOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-action-cancelled";
    /** The piece whose action was cancelled. */
    pieceId: PieceId;
    /** The category of action that was cancelled. */
    action: PieceActionCancelledAction;
}

/**
 * Broadcast when a target successfully resists a spell cast on it,
 * whether by magic resistance or (for Disbelieve) by not being an
 * illusion. Clients observing this outcome within a Disbelieve cast
 * commit the piece to their "confirmed real" memory.
 */
export interface PieceResistedSpellOutcome {
    /** Discriminant for this outcome kind. */
    kind: "piece-resisted-spell";
    /** The piece that resisted the spell. */
    pieceId: PieceId;
    /** The unique instance id of the spell that was resisted. */
    spellId: SpellId;
    /** The type reference for the spell. */
    spellTypeId: SpellTypeId;
}

// ---------------------------------------------------------------------------
// 4.4 World
// ---------------------------------------------------------------------------

/**
 * The board's alignment value has shifted — typically caused by casting
 * a chaos- or law-aligned spell.
 */
export interface AlignmentChangedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "alignment-changed";
    /** Signed delta applied to the alignment value (negative = towards chaos). */
    delta: number;
    /** The new alignment state after applying the delta. */
    newAlignment: import("./snapshot").AlignmentState;
}

/**
 * The board's weather has changed. Carries the full weather descriptor
 * as serialised by the engine; the shape mirrors ScenarioState.weather.
 */
export interface WeatherChangedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "weather-changed";
    /** The new weather descriptor. */
    weather: import("./primitives").JsonObject;
}

// ---------------------------------------------------------------------------
// 4.5 Communication
// ---------------------------------------------------------------------------

/**
 * A chat message sent by a player. Part of the canonical broadcast log
 * and appears in replays.
 */
export interface ChatSentOutcome {
    /** Discriminant for this outcome kind. */
    kind: "chat-sent";
    /** The player who sent the chat message. */
    playerId: PlayerId;
    /** The chat message body. */
    message: string;
}

/**
 * A tactical attention-ping placed on a board tile by a player.
 */
export interface PositionPingedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "position-pinged";
    /** The player who pinged. */
    playerId: PlayerId;
    /** The board tile that was pinged. */
    point: Point;
}

// ---------------------------------------------------------------------------
// 4.6 Connection lifecycle
// ---------------------------------------------------------------------------

/**
 * A player's transport disconnected. No immediate gameplay impact; the
 * host's timeout policy determines whether the player is replaced or
 * defeated.
 */
export interface PlayerDisconnectedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "player-disconnected";
    /** The player whose transport disconnected. */
    playerId: PlayerId;
}

/**
 * A previously-disconnected player has reconnected with a valid token.
 * The server sends a recipient snapshot to the reconnecting player in
 * the same beat.
 */
export interface PlayerReconnectedOutcome {
    /** Discriminant for this outcome kind. */
    kind: "player-reconnected";
    /** The reconnected player. */
    playerId: PlayerId;
}

/**
 * The host's timeout policy fired and the player's transport was swapped
 * for an AI instance.
 */
export interface PlayerReplacedByAiOutcome {
    /** Discriminant for this outcome kind. */
    kind: "player-replaced-by-ai";
    /** The player whose transport was replaced. */
    playerId: PlayerId;
}

// ---------------------------------------------------------------------------
// Discriminated union of every outcome kind
// ---------------------------------------------------------------------------

/**
 * Every outcome kind that can appear inside a broadcast event's
 * `outcomes` array. The discriminator is `kind`.
 */
export type Outcome =
    // 4.1 Game lifecycle
    | GameStartedOutcome
    | PhaseChangedOutcome
    | PlayerDefeatedOutcome
    | GameOverOutcome
    // 4.2 Spells
    | PlayerPickedSpellOutcome
    | SpellRevealedOutcome
    | SpellCastAttemptedOutcome
    | SpellCastSucceededOutcome
    | SpellCastCancelledOutcome
    | SpellCastFailedOutcome
    | SpellRemovedFromBookOutcome
    | PlayerEndedSpellPickOutcome
    // 4.3 Pieces
    | PieceSpawnedOutcome
    | PieceMovedOutcome
    | PieceAttackedOutcome
    | PieceRangedAttackedOutcome
    | PieceDiedOutcome
    | PieceMountedOutcome
    | PieceDismountedOutcome
    | PieceStatsChangedOutcome
    | PieceStatusesChangedOutcome
    | PieceOwnerChangedOutcome
    | PieceTurnFlagChangedOutcome
    | PiecePersistentFlagChangedOutcome
    | PieceActionCancelledOutcome
    | PieceResistedSpellOutcome
    // 4.4 World
    | AlignmentChangedOutcome
    | WeatherChangedOutcome
    // 4.5 Communication
    | ChatSentOutcome
    | PositionPingedOutcome
    // 4.6 Connection lifecycle
    | PlayerDisconnectedOutcome
    | PlayerReconnectedOutcome
    | PlayerReplacedByAiOutcome;
