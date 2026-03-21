import { t, StateMachine } from "typescript-fsm";
import { Board } from "./board";

export enum States {
    Idle,

    StartCastingPhase,
    ChooseSpell,
    ChooseIllusion,

    SelectSpellTargetAllyPiece,
    SelectSpellTargetEnemyPiece,
    SelectSpellTargetBoardTile,

    CastSpell,
    ApplySpellEffect,

    NextTurn,

    StartMovementPhase,
}

export enum Events {
    StartGame,

    NoSpellsAvailable,
    SpellsAvailable,

    StartCastingTurn,
    EndCastingTurn,

    SelectSpellTargetNone,
    SelectSpellTargetSelf,
    SelectSpellTargetAllyPiece,
    SelectSpellTargetEnemyPiece,
    SelectSpellTargetBoardTile,
    SelectSpellAllowIllusion,

    SelectIllusion,

    CancelSpellCasting,
    CompleteSpellCasting,

    CastSpell,
    CastSucceeded,
    CastFailed,

    SkipTurn,
    PlayersStillHaveTurns,
    AllPlayersTurnsComplete,
}

/**
 * A finite state machine to manage all of the game states and transitions.
 */
export class StateManager {
    /**
     * The board that this state manager is managing states for.
     */
    private board: Board;

    private fsm: StateMachine<States, Events>;

    private callback?: (newState: States) => void;

    /**
     * Creates a new state manager for the given board.
     *
     * @param board The board to manage states for.
     */
    constructor(board: Board, callback?: (newState: States) => void) {
        this.board = board;
        this.callback = callback;

        this.fsm = new StateMachine<States, Events>(States.Idle, [
            // # Spell casting phase
            // Starting a player's casting phase.
            t(
                States.Idle,
                Events.StartGame,
                States.StartCastingPhase,
                this.onStateChange.bind(this),
            ),
            t(
                States.StartCastingPhase,
                Events.NoSpellsAvailable,
                States.NextTurn,
                this.onStateChange.bind(this),
            ),
            t(
                States.StartCastingPhase,
                Events.SpellsAvailable,
                States.ChooseSpell,
                this.onStateChange.bind(this),
            ),

            // Skipping a turn.
            t(
                States.ChooseSpell,
                Events.SkipTurn,
                States.NextTurn,
                this.onStateChange.bind(this),
            ),
            t(
                States.SelectSpellTargetAllyPiece,
                Events.SkipTurn,
                States.NextTurn,
                this.onStateChange.bind(this),
            ),
            t(
                States.SelectSpellTargetEnemyPiece,
                Events.SkipTurn,
                States.NextTurn,
                this.onStateChange.bind(this),
            ),
            t(
                States.SelectSpellTargetBoardTile,
                Events.SkipTurn,
                States.NextTurn,
                this.onStateChange.bind(this),
            ),

            // Spells which cast immediately, either on the caster or the
            // board in general.
            t(
                States.ChooseSpell,
                Events.SelectSpellTargetNone,
                States.CastSpell,
                this.onStateChange.bind(this),
            ),
            t(
                States.ChooseSpell,
                Events.SelectSpellTargetSelf,
                States.CastSpell,
                this.onStateChange.bind(this),
            ),

            // Spells which require target selection.
            t(
                States.ChooseSpell,
                Events.SelectSpellTargetAllyPiece,
                States.SelectSpellTargetAllyPiece,
                this.onStateChange.bind(this),
            ),
            t(
                States.ChooseSpell,
                Events.SelectSpellTargetEnemyPiece,
                States.SelectSpellTargetEnemyPiece,
                this.onStateChange.bind(this),
            ),
            t(
                States.ChooseSpell,
                Events.SelectSpellTargetBoardTile,
                States.SelectSpellTargetBoardTile,
                this.onStateChange.bind(this),
            ),

            // Summon spells usually allow illusions, so we have additional
            // transitions for those.
            t(
                States.ChooseSpell,
                Events.SelectSpellAllowIllusion,
                States.ChooseIllusion,
                this.onStateChange.bind(this),
            ),
            t(
                States.ChooseIllusion,
                Events.SelectIllusion,
                States.SelectSpellTargetBoardTile,
                this.onStateChange.bind(this),
            ),

            // Casting the spell.
            t(
                States.SelectSpellTargetAllyPiece,
                Events.SelectSpellTargetAllyPiece,
                States.CastSpell,
                this.onStateChange.bind(this),
            ),
            t(
                States.SelectSpellTargetEnemyPiece,
                Events.SelectSpellTargetEnemyPiece,
                States.CastSpell,
                this.onStateChange.bind(this),
            ),
            t(
                States.SelectSpellTargetBoardTile,
                Events.SelectSpellTargetBoardTile,
                States.CastSpell,
                this.onStateChange.bind(this),
            ),

            // Select the target for the spell, or cancel back to choosing a spell.
            t(
                States.SelectSpellTargetAllyPiece,
                Events.CancelSpellCasting,
                States.ChooseSpell,
                this.onStateChange.bind(this),
            ),
            t(
                States.SelectSpellTargetEnemyPiece,
                Events.CancelSpellCasting,
                States.ChooseSpell,
                this.onStateChange.bind(this),
            ),
            t(
                States.SelectSpellTargetBoardTile,
                Events.CancelSpellCasting,
                States.ChooseSpell,
                this.onStateChange.bind(this),
            ),

            // Completing the spell casting.
            t(
                States.CastSpell,
                Events.CastSucceeded,
                States.ApplySpellEffect,
                this.onStateChange.bind(this),
            ),
            t(
                States.ApplySpellEffect,
                Events.CompleteSpellCasting,
                States.NextTurn,
                this.onStateChange.bind(this),
            ),
            t(
                States.CastSpell,
                Events.CastFailed,
                States.NextTurn,
                this.onStateChange.bind(this),
            ),

            // Ending turns and phases.
            t(
                States.NextTurn,
                Events.PlayersStillHaveTurns,
                States.ChooseSpell,
                this.onStateChange.bind(this),
            ),
            t(
                States.NextTurn,
                Events.AllPlayersTurnsComplete,
                States.StartMovementPhase,
                this.onStateChange.bind(this),
            ),

            // # TODO: Movement phase
        ]);
    }

    /**
     * Checks if the given event can be sent in the current state.
     *
     * @param event The event to check.
     * @returns True if the event can be sent, false otherwise.
     */
    public canSendEvent(event: Events): boolean {
        return this.fsm.can(event);
    }

    /**
     * Sends an event to the state machine to trigger a state transition.
     *
     * @param event The event to send.
     * @returns True if the event caused a state transition, false otherwise.
     */
    public async sendEvent(event: Events): Promise<boolean> {
        if (!this.fsm.can(event)) {
            console.warn(
                `StateManager: Cannot transition from state '${States[this.fsm.getState()]}' via event '${Events[event]}'`,
            );
            return false;
        }
        const oldState = this.fsm.getState();
        await this.fsm.dispatch(event);
        console.debug(
            `StateManager: Transitioning from state '${States[oldState]}' to state '${States[this.fsm.getState()]}' via event '${Events[event]}'`,
        );
        if (this.fsm.isFinal()) {
            console.log(
                `StateManager: Reached final state '${States[this.fsm.getState()]}'`,
            );
        }
        return true;
    }

    /**
     * Registers a callback to be called whenever the state changes.
     *
     * @param callback
     */
    public onStateChange(): void {
        if (this.callback) {
            this.callback(this.fsm.getState());
        }
    }
}
