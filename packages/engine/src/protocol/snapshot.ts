import type { PieceState } from "./piecestate";
import type { JsonObject, JsonValue, PieceId, PlayerId, Sequence, SpellId, SpellTypeId } from "./primitives";

/**
 * The four phases in the canonical Archaos turn cycle. Cycle order is
 * fixed and lives in the phase machine, not in the schema.
 */
export type PhaseKind = "spellbook" | "casting" | "spreading" | "movement";

/**
 * The current phase-machine state.
 */
export interface PhaseState {
    /** The phase the game is currently in. */
    kind: PhaseKind;
    /**
     * Null during the spellbook phase (players act simultaneously);
     * holds the active player's id in all other phases.
     */
    currentPlayerId: PlayerId | null;
    /** The current full turn cycle number, one-indexed. */
    turnNumber: number;
}

/**
 * The current alignment state — drives chaos / law shifts.
 */
export interface AlignmentState {
    /** The current alignment value. Negative = chaos, positive = law. */
    value: number;
    /**
     * The accumulated alignment delta for the current turn, before it is
     * applied to the board value at end-of-turn.
     */
    accumulatedValue: number;
}

/**
 * The subset of Board state that appears in a snapshot. This is public
 * state, identical for every recipient. Weather lives under `scenario`
 * since it is configured at scenario level.
 */
export interface SnapshotBoardState {
    /** Current alignment state of the board. */
    alignment: AlignmentState;
}

/**
 * Public, per-player information.
 */
export interface PlayerPublicState {
    /** Unique player identifier. */
    id: PlayerId;
    /** Display name chosen at lobby. */
    name: string;
    /** CSS-style hex colour without leading hash. */
    colour: string;
    /** Id of the wizard piece representing this player, or null if defeated. */
    castingPieceId: PieceId | null;
    /** Whether this player has been eliminated from the game. */
    defeated: boolean;
    /**
     * Tri-state for the spellbook phase.
     *  - `null`: no decision yet.
     *  - `true`: a spell has been picked.
     *  - `false`: the player ended their pick without choosing.
     */
    pickedSpell: null | boolean;
}

/**
 * A single spellbook entry. The `id` is a unique {@link SpellId} — a
 * spellbook may hold multiple entries with the same `spellTypeId`.
 */
export interface SpellbookEntry {
    /** Canonical type id referencing the spell's definition in data files. */
    spellTypeId: SpellTypeId;
    /** Unique instance id for this spell in the player's spellbook. */
    id: SpellId;
}

/**
 * State of the spell currently picked for casting. `id` is the unique
 * SpellId of the picked spellbook entry.
 */
export interface PickedSpellState {
    /** Unique instance id of the picked spellbook entry. */
    id: SpellId;
    /**
     * Remaining casts. For single-cast spells this is 1 until cast; for
     * multi-cast spells (Shadow Wood, Wall, Dark Power, etc.) this starts
     * at the spell's max and decrements. Never reaches 0 — the spell is
     * removed from the book at exhaustion.
     */
    castsLeft: number;
}

/**
 * Recipient-only state. Populated only for the player the snapshot is
 * addressed to. The illusion flag is NEVER included here — it belongs to
 * the server exclusively, and the client forgets it after sending
 * pick-spell.
 */
export interface SelfState {
    /** The recipient's full spellbook. */
    spells: SpellbookEntry[];
    /** The currently picked spell, or null if no spell has been chosen. */
    pickedSpell: PickedSpellState | null;
}

/**
 * Static scenario config. `boardWidth`, `boardHeight`, and `weather` are
 * always present; arbitrary additional fields may appear depending on the
 * engine's serialised scenario shape (an index signature accommodates
 * them).
 */
export interface ScenarioState {
    /** Width of the board in tiles. */
    boardWidth: number;
    /** Height of the board in tiles. */
    boardHeight: number;
    /** Opaque weather descriptor as serialised by the engine. */
    weather: JsonObject;
    /** Additional scenario fields serialised by the engine. */
    [key: string]: JsonValue;
}

/**
 * The full state payload inside a snapshot.
 */
export interface SnapshotState {
    /** Static scenario configuration for the current game. */
    scenario: ScenarioState;
    /** Current phase-machine state. */
    phase: PhaseState;
    /** Public board state. */
    board: SnapshotBoardState;
    /** Public state for all players, in turn order. */
    players: PlayerPublicState[];
    /** Full public state for all pieces currently on the board. */
    pieces: PieceState[];
    /** Recipient-private state. */
    self: SelfState;
}

/**
 * A recipient snapshot envelope. Sent to one player; contains the public
 * state plus that recipient's private `self` state.
 */
export interface SnapshotMessage {
    /** Discriminant for message routing. */
    type: "snapshot";
    /** The highest broadcast sequence reflected in this snapshot. */
    sequence: Sequence;
    /** The player this snapshot is addressed to. */
    recipient: PlayerId;
    /** The complete game state at the time of the snapshot. */
    state: SnapshotState;
}
