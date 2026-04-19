import { State, PseudoState, PseudoStateKind, Instance } from "@steelbreeze/state";

/* ------------------------------------------------------------------ */
/*  Event classes                                                      */
/* ------------------------------------------------------------------ */

/**
 * Base class for phase machine events. The `type` discriminant ensures each
 * event class is structurally unique (satisfies the linter and enables
 * runtime type checking by @steelbreeze/state).
 */
abstract class PhaseEvent {
    abstract readonly type: string;
}

/** Fired to start a new game. Transitions from Idle → Playing. */
export class StartGame extends PhaseEvent {
    readonly type = "StartGame";
}

/** Fired when the game ends. Transitions from any Playing substate → GameOver. */
export class GameEnd extends PhaseEvent {
    readonly type = "GameEnd";
}

/** Fired when the spellbook phase setup is complete and players are ready. */
export class SpellbookReady extends PhaseEvent {
    readonly type = "SpellbookReady";
}

/** Fired to skip the spellbook phase entirely (e.g., tutorial with no spells). */
export class SkipSpellbook extends PhaseEvent {
    readonly type = "SkipSpellbook";
}

/** Fired when all players have selected spells and at least one spell was chosen. */
export class SpellsDone extends PhaseEvent {
    readonly type = "SpellsDone";
}

/** Fired when no player selected a spell, skipping the casting phase. */
export class NoSpellsCast extends PhaseEvent {
    readonly type = "NoSpellsCast";
}

/** Fired when the casting phase setup is complete and players are ready. */
export class CastingReady extends PhaseEvent {
    readonly type = "CastingReady";
}

/** Fired when all players have finished casting. */
export class CastingDone extends PhaseEvent {
    readonly type = "CastingDone";
}

/** Fired when spreading and expiry effects have completed. */
export class SpreadingDone extends PhaseEvent {
    readonly type = "SpreadingDone";
}

/** Fired when the movement phase setup is complete and players are ready. */
export class MovingReady extends PhaseEvent {
    readonly type = "MovingReady";
}

/** Fired when all players have finished moving, ending the turn. */
export class MovingDone extends PhaseEvent {
    readonly type = "MovingDone";
}

/** Fired to advance to the next player within a phase. */
export class NextPlayer extends PhaseEvent {
    readonly type = "NextPlayer";
}

/* -- Piece interaction events (within movingPlayer) -- */

/** Fired when a player selects a piece to move. */
export class SelectPiece extends PhaseEvent {
    readonly type = "SelectPiece";
}

/** Fired when a piece has moved and can melee attack. */
export class AdvanceToAttack extends PhaseEvent {
    readonly type = "AdvanceToAttack";
}

/** Fired when a piece advances to ranged attack (skipping or after melee). */
export class AdvanceToRangedAttack extends PhaseEvent {
    readonly type = "AdvanceToRangedAttack";
}

/** Fired when a piece is deselected (turn over, cancel, or no actions). */
export class PieceDeselected extends PhaseEvent {
    readonly type = "PieceDeselected";
}

/** Fired when a mounted wizard requests to dismount. */
export class RequestDismount extends PhaseEvent {
    readonly type = "RequestDismount";
}

/** Fired when a dismount is confirmed. */
export class CompleteDismount extends PhaseEvent {
    readonly type = "CompleteDismount";
}

/** Fired when a dismount is cancelled. */
export class CancelDismount extends PhaseEvent {
    readonly type = "CancelDismount";
}

/* -- Casting interaction events (within castingPlayer) -- */

/** Fired when a wizard is selected and a spell is ready to target. */
export class SpellTargeting extends PhaseEvent {
    readonly type = "SpellTargeting";
}

/** Fired when a spell cast completes (or is cancelled/discarded). */
export class SpellCastComplete extends PhaseEvent {
    readonly type = "SpellCastComplete";
}

/* ------------------------------------------------------------------ */
/*  State model                                                        */
/* ------------------------------------------------------------------ */

/**
 * Creates the hierarchical state model for the game's phase machine.
 *
 * Hierarchy:
 * ```
 * game (root)
 * ├── idle
 * ├── playing
 * │   ├── spellbook
 * │   │   ├── spellbookSetup
 * │   │   └── spellbookPlayer
 * │   ├── casting
 * │   │   ├── castingSetup
 * │   │   └── castingPlayer
 * │   │       ├── castIdle
 * │   │       └── castTargeting
 * │   ├── spreading
 * │   └── moving
 * │       ├── movingSetup
 * │       └── movingPlayer
 * │           ├── pieceIdle
 * │           ├── pieceMoving
 * │           ├── pieceAttacking
 * │           ├── pieceRangedAttacking
 * │           └── pieceDismounting
 * └── gameOver
 * ```
 */
function createModel(): {
    model: State;
    states: PhaseMachineStates;
} {
    // Root state
    const game = new State("game");

    // Top-level states
    const idle = new State("idle", game);
    const playing = new State("playing", game);
    const gameOver = new State("gameOver", game);

    // Spellbook phase (compound, child of playing)
    const spellbook = new State("spellbook", playing);
    const spellbookSetup = new State("spellbookSetup", spellbook);
    const spellbookPlayer = new State("spellbookPlayer", spellbook);

    // Casting phase (compound, child of playing)
    const casting = new State("casting", playing);
    const castingSetup = new State("castingSetup", casting);
    const castingPlayer = new State("castingPlayer", casting);

    // Casting interaction states (compound, children of castingPlayer)
    const castIdle = new State("castIdle", castingPlayer);
    const castTargeting = new State("castTargeting", castingPlayer);

    // Spreading phase (simple, child of playing)
    const spreading = new State("spreading", playing);

    // Moving phase (compound, child of playing)
    const moving = new State("moving", playing);
    const movingSetup = new State("movingSetup", moving);
    const movingPlayer = new State("movingPlayer", moving);

    // Piece interaction states (compound, children of movingPlayer)
    const pieceIdle = new State("pieceIdle", movingPlayer);
    const pieceMoving = new State("pieceMoving", movingPlayer);
    const pieceAttacking = new State("pieceAttacking", movingPlayer);
    const pieceRangedAttacking = new State("pieceRangedAttacking", movingPlayer);
    const pieceDismounting = new State("pieceDismounting", movingPlayer);

    // --- Initial pseudo-states ---
    new PseudoState("initial", game, PseudoStateKind.Initial).to(idle);
    new PseudoState("initial", playing, PseudoStateKind.Initial).to(spellbook);
    new PseudoState("initial", spellbook, PseudoStateKind.Initial).to(spellbookSetup);
    new PseudoState("initial", casting, PseudoStateKind.Initial).to(castingSetup);
    new PseudoState("initial", castingPlayer, PseudoStateKind.Initial).to(castIdle);
    new PseudoState("initial", moving, PseudoStateKind.Initial).to(movingSetup);
    new PseudoState("initial", movingPlayer, PseudoStateKind.Initial).to(pieceIdle);

    // --- Transitions ---

    // Game lifecycle
    idle.on(StartGame).to(playing);
    idle.on(GameEnd).to(gameOver);
    playing.on(GameEnd).to(gameOver);

    // Spellbook phase
    spellbookSetup.on(SpellbookReady).to(spellbookPlayer);
    spellbookSetup.on(SkipSpellbook).to(moving);
    spellbookPlayer.on(NextPlayer).to(spellbookPlayer);
    spellbookPlayer.on(SpellsDone).to(casting);
    spellbookPlayer.on(NoSpellsCast).to(spreading);

    // Casting phase
    castingSetup.on(CastingReady).to(castingPlayer);
    castingPlayer.on(NextPlayer).to(castingPlayer);
    castingPlayer.on(CastingDone).to(spreading);

    // Casting interaction (within castingPlayer)
    castIdle.on(SpellTargeting).to(castTargeting);
    castTargeting.on(SpellCastComplete).to(castIdle);
    castTargeting.on(SpellTargeting).to(castTargeting);

    // Spreading phase
    spreading.on(SpreadingDone).to(moving);

    // Moving phase
    movingSetup.on(MovingReady).to(movingPlayer);
    movingPlayer.on(NextPlayer).to(movingPlayer);
    movingPlayer.on(MovingDone).to(spellbook);

    // Piece interaction (within movingPlayer)
    pieceIdle.on(SelectPiece).to(pieceMoving);
    pieceMoving.on(SelectPiece).to(pieceMoving);
    pieceMoving.on(AdvanceToAttack).to(pieceAttacking);
    pieceMoving.on(AdvanceToRangedAttack).to(pieceRangedAttacking);
    pieceMoving.on(PieceDeselected).to(pieceIdle);
    pieceMoving.on(RequestDismount).to(pieceDismounting);
    pieceAttacking.on(AdvanceToRangedAttack).to(pieceRangedAttacking);
    pieceAttacking.on(PieceDeselected).to(pieceIdle);
    pieceRangedAttacking.on(PieceDeselected).to(pieceIdle);
    pieceDismounting.on(CompleteDismount).to(pieceMoving);
    pieceDismounting.on(CancelDismount).to(pieceMoving);
    pieceDismounting.on(PieceDeselected).to(pieceIdle);

    return {
        model: game,
        states: {
            game,
            idle,
            playing,
            gameOver,
            spellbook,
            spellbookSetup,
            spellbookPlayer,
            casting,
            castingSetup,
            castingPlayer,
            castIdle,
            castTargeting,
            spreading,
            moving,
            movingSetup,
            movingPlayer,
            pieceIdle,
            pieceMoving,
            pieceAttacking,
            pieceRangedAttacking,
            pieceDismounting,
        },
    };
}

/* ------------------------------------------------------------------ */
/*  PhaseMachine                                                       */
/* ------------------------------------------------------------------ */

/**
 * All named states in the phase machine, exposed for `isActive` checks.
 */
export interface PhaseMachineStates {
    game: State;
    idle: State;
    playing: State;
    gameOver: State;
    spellbook: State;
    spellbookSetup: State;
    spellbookPlayer: State;
    casting: State;
    castingSetup: State;
    castingPlayer: State;
    castIdle: State;
    castTargeting: State;
    spreading: State;
    moving: State;
    movingSetup: State;
    movingPlayer: State;
    pieceIdle: State;
    pieceMoving: State;
    pieceAttacking: State;
    pieceRangedAttacking: State;
    pieceDismounting: State;
}

/**
 * Wraps the @steelbreeze/state model and instance to provide a clean API
 * for the game's phase-level state machine.
 *
 * The PhaseMachine manages the high-level game loop:
 *   Idle → Spellbook → Casting → Spreading → Moving → (repeat)
 *
 * Within MovingPlayer, it also models piece interaction states:
 *   PieceIdle → PieceMoving → PieceAttacking → PieceRangedAttacking → PieceIdle
 */
export class PhaseMachine {
    private _instance: Instance;
    private readonly _model: State;

    /**
     * All named states, exposed for external `isActive` queries.
     */
    readonly states: PhaseMachineStates;

    /**
     * The leaf states in order, used by `activeLeafState` to find the
     * deepest active state without accessing internal library properties.
     */
    private readonly _leafStates: Array<[string, State]>;

    constructor(callback?: (activeState: string) => void) {
        const { model, states } = createModel();
        this._model = model;
        this.states = states;

        // Leaf states are simple states (no children). We check them in
        // order to find the deepest active one.
        this._leafStates = Object.entries(states).filter(([, state]) => state.isSimple());

        // Wire up entry actions for callback notification
        if (callback) {
            for (const [name, state] of Object.entries(states)) {
                if (name === "game") continue; // skip root
                state.entry(() => {
                    callback(name);
                });
            }
        }

        this._instance = new Instance("phase", this._model);
    }

    /**
     * Send an event to the state machine.
     *
     * @param event An instance of an event class (e.g., `new StartGame()`).
     * @returns True if the event caused a state transition.
     */
    evaluate(event: object): boolean {
        return this._instance.evaluate(event);
    }

    /**
     * Check whether a given state is currently active.
     * For compound states, returns true if any substate is active.
     *
     * @param state The state to check.
     * @returns True if the state is active.
     */
    isActive(state: State): boolean {
        if (!state.parent) {
            // Root state is always active
            return true;
        }
        if (this._instance.get(state.parent) !== state) {
            return false;
        }
        // Walk up: the parent region's parent state must also be active
        return this.isActive(state.parent.parent);
    }

    /**
     * Get the name of the deepest active leaf state.
     */
    get activeLeafState(): string {
        for (const [name, state] of this._leafStates) {
            if (this.isActive(state)) {
                return name;
            }
        }
        return "game";
    }

    /**
     * Reset the state machine by creating a new instance.
     * The new instance starts at the initial state (Idle).
     */
    reset(): void {
        this._instance = new Instance("phase", this._model);
    }
}
