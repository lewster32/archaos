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
