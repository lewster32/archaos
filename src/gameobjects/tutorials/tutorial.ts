import type { Board } from "../board";
import { BoardEvent } from "../enums/boardevent";
import { EventType } from "../enums/eventtype";
import { GameScenarioData, GameScenarioPlayer } from "../interfaces/ui";
import { Logger } from "../services/logger";
import * as storage from "../storage";

/**
 * A player in a tutorial. This extends the GameScenarioPlayer with any
 * additional fields or methods that are specific to tutorial players. Per-player
 * cheat overrides (forceHit, forceCast) are inherited from GameScenarioPlayer.
 */
export interface TutorialPlayer extends GameScenarioPlayer {}

export interface TutorialData extends GameScenarioData {
    /**
     * A machine-readable identifier for this tutorial. Used for routing,
     * progression tracking and save state.
     */
    id: string;

    /**
     * A brief description of the tutorial. Can be rich HTML.
     */
    description: string;

    /**
     * The introduction text for the tutorial. Shown at the beginning of the
     * tutorial to onboard the player. Can be rich HTML.
     */
    intro: string;

    /**
     * The outro text for the tutorial. Shown at the end of the tutorial once
     * all steps are complete. Can be rich HTML.
     */
    outro: string;

    /**
     * The array of tutorial steps for this tutorial.
     */
    steps: TutorialStep[];

    /**
     * The players in this tutorial, with tutorial-specific overrides.
     */
    players: TutorialPlayer[];

    /**
     * Sort order for displaying tutorials in the menu. Lower values appear
     * first.
     */
    order?: number;

    /**
     * The ID of the next tutorial in the progression. Shown as a "try next"
     * prompt at the end of this tutorial.
     */
    nextTutorialId?: string;

    /**
     * If true, the illusion casting option is suppressed for all summon spells
     * in this tutorial.
     */
    disableIllusions?: boolean;

    /**
     * If true, the cancel button is suppressed for all spells in this tutorial.
     */
    disableCancelSpell?: boolean;

    /**
     * If true, the cancel button is suppressed for all move/attack/ranged
     * attack actions in this tutorial.
     */
    disableCancelAction?: boolean;

    /**
     * If true, the player is not allowed to end their turn.
     */
    disableEndTurn?: boolean;
}

// ─── Tutorial message events ────────────────────────────────────────────────

/**
 * The type of tutorial message to display.
 */
export type TutorialMessageType = "intro" | "hint" | "outro";

/**
 * The position for tutorial messages.
 */
export type TutorialMessagePosition =
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "center";

/**
 * Event payload emitted via Logger's global emitter when the tutorial needs
 * to show a modal dialog. The Vue UI layer listens for
 * {@link EventType.TutorialMessage} events and renders the appropriate modal.
 *
 * The `resolve` callback MUST be called when the user dismisses the dialog;
 * the tutorial awaits it before continuing.
 */
export interface TutorialMessageEvent {
    /** Which kind of tutorial modal to show. */
    type: TutorialMessageType;
    /** The tutorial's display name, used as the modal title. */
    title: string;
    /** Rich HTML content to display in the modal body. */
    text: string;
    /** Optional position hint for the modal. */
    position?: TutorialMessagePosition;
    /** Optional z-index override for the modal. */
    zIndex?: number;
    /** Call this when the user dismisses the modal. */
    resolve: () => void;
}

// ─── TutorialStep ───────────────────────────────────────────────────────────

export abstract class TutorialStep {
    /**
     * The hint associated with this tutorial step. Shown in the UI once the
     * step becomes the current step. Not all steps will have hints.
     */
    private readonly _hint: string;

    /**
     * The name associated with this tutorial step. Shown in the UI as the title
     * of the hint modal. Not all steps will have names; if absent, the
     * tutorial's name will be used instead.
     */
    private readonly _name?: string;

    /**
     * Where to position the hint modal for this step.
     */
    private readonly _position: TutorialMessagePosition;

    /**
     * Optional z-index override for the hint modal shown for this step.
     */
    private readonly _zIndex?: number;

    constructor(
        hint?: string,
        name?: string,
        position: TutorialMessagePosition = "center",
        zIndex?: number,
    ) {
        this._hint = hint ?? "";
        this._name = name ?? "";
        this._position = position;
        this._zIndex = zIndex;
    }

    /**
     * The hint associated with this tutorial step. Shown in the UI once the
     * step becomes the current step. Returns an empty string if no hint was
     * provided.
     */
    get hint(): string {
        return this._hint;
    }

    /**
     * The name associated with this tutorial step. Shown in the UI once the
     * step becomes the current step. Returns an empty string if no name was
     * provided.
     */
    get name(): string {
        return this._name;
    }

    /**
     * Where to position the hint modal for this step. Defaults to "center" if
     * not provided.
     */
    get position(): TutorialMessagePosition {
        return this._position;
    }

    /**
     * Optional z-index override for the hint modal shown for this step. If not
     * provided, the modal will be displayed on top of all other UI elements.
     */
    get zIndex(): number | undefined {
        return this._zIndex;
    }

    /**
     * Checks whether the condition for this tutorial step has been met.
     * Called whenever a {@link BoardEvent} fires on the board.
     *
     * @param board The game board, providing access to the current game state.
     * @param event The board event that triggered this check, if any.
     * @param args  The arguments emitted with the board event (e.g. the
     *              piece that died, the spell that was cast, etc.).
     * @returns true if the step's completion condition is satisfied.
     */
    abstract checkCondition(
        board: Board,
        event?: BoardEvent,
        ...args: any[]
    ): boolean;

    /**
     * Called when this step becomes the current active step. Override to
     * perform setup such as highlighting UI elements or panning the camera.
     */
    onEnter?(board: Board): void;

    /**
     * Called when this step's condition has been met and it is about to be
     * superseded by the next step (or the tutorial ends). Override to clean
     * up any step-specific state.
     */
    onComplete?(board: Board): void;
}

// ─── Tutorial ───────────────────────────────────────────────────────────────

/**
 * The main Tutorial class. This manages the state of the tutorial, including
 * the current step, and provides methods for checking step conditions and
 * advancing through the tutorial.
 *
 * Lifecycle:
 *  1. `start(board)` — sets the board, shows the intro modal, fires the first
 *     step's `onEnter` hook, shows the first step's hint, then calls
 *     `onStart()` for subclass-specific setup.
 *  2. `advance()` — checks the current step's condition; on success fires
 *     `onComplete`, advances, fires `onEnter`, and shows the next hint. When
 *     the last step completes, shows the outro instead.
 *  3. `end()` — calls `onEnd()` for subclass cleanup.
 */
export abstract class Tutorial {
    /**
     * The configuration data for this tutorial. This is a fairly comprehensive
     * setup of the board, players, pieces, spells and so on. It uses the same
     * underlying data structures as the game scenarios, but with some
     * additional fields for tutorial-specific features like hints and step
     * conditions.
     */
    private readonly _config: TutorialData;

    /**
     * The ordered list of tutorial steps. Each step has an associated hint
     * that is shown in the UI when the step becomes the current step.
     */
    private readonly _steps: TutorialStep[];

    /**
     * A reference to the game board. Set when the tutorial starts.
     */
    protected _board: Board | null = null;

    /**
     * Per-event listener references so we can unsubscribe the exact same
     * functions in `end()`.
     */
    private readonly _eventListeners: Map<string, (...args: any[]) => void> =
        new Map();

    /**
     * Where are we currently at in the tutorial steps?
     */
    private _currentStepIndex: number = 0;

    /**
     * Has the tutorial been completed by the player?
     */
    private _done: boolean = false;

    constructor(config: TutorialData) {
        if (!config?.steps?.length) {
            throw new Error("Tutorial config must include at least one step.");
        }
        this._config = config;
        this._steps = [...config.steps];
        this._currentStepIndex = 0;
    }

    /**
     * Get the unique identifier for this tutorial.
     */
    get id(): string {
        return this._config.id;
    }

    /**
     * Get the configuration data for this tutorial.
     */
    get config(): TutorialData {
        return this._config;
    }

    /**
     * Get the title of this tutorial.
     *
     * @see TutorialData.name
     */
    get name(): string {
        return this._config.name;
    }

    /**
     * Get the description of this tutorial. This is a brief summary of the
     * tutorial. Can be rich HTML.
     *
     * @see TutorialData.description
     */
    get description(): string {
        return this._config.description;
    }

    /**
     * Get the introduction text for this tutorial. Shown at the beginning of
     * the tutorial to onboard the player. Can be rich HTML.
     *
     * @see TutorialData.intro
     */
    get intro(): string {
        return this._config.intro;
    }

    /**
     * Get the outro text for the tutorial. Shown at the end of the tutorial
     * once all steps are complete. Can be rich HTML.
     *
     * @see TutorialData.outro
     */
    get outro(): string {
        return this._config.outro;
    }

    /**
     * Get the ordered list of tutorial steps.
     */
    get steps(): readonly TutorialStep[] {
        return this._steps;
    }

    /**
     * Get the index of the current step.
     */
    get currentStepIndex(): number {
        return this._currentStepIndex;
    }

    /**
     * Get the current tutorial step, or null if the tutorial is complete.
     */
    get currentStep(): TutorialStep | null {
        return this._steps[this._currentStepIndex] ?? null;
    }

    /**
     * Whether all steps in the tutorial have been completed.
     */
    get isComplete(): boolean {
        return this._currentStepIndex >= this._steps.length;
    }

    /**
     * Whether the player has completed this tutorial before. This is persisted
     * in localStorage, and cached once in memory for the session.
     */
    get done(): boolean {
        if (this._done) {
            return true;
        }
        try {
            const progress = JSON.parse(
                storage.getItem("tutorialProgress") || "{}",
            );
            return !!progress[this.id];
        } catch {
            return false;
        }
    }

    set done(value: boolean) {
        this._done = value;
        try {
            const progress = JSON.parse(
                storage.getItem("tutorialProgress") || "{}",
            );
            progress[this.id] = value;
            storage.setItem("tutorialProgress", JSON.stringify(progress));
        } catch {
            // Ignore storage errors
        }
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────

    /**
     * Starts the tutorial. Sets the board reference, shows the intro modal,
     * fires the first step's `onEnter` hook, shows its hint, then calls the
     * subclass `onStart()` hook.
     *
     * @param board The game board for this tutorial session.
     */
    async start(board: Board): Promise<void> {
        this._board = board;
        for (const event of Object.values(BoardEvent)) {
            const boardEvent = event as BoardEvent;
            const listener = (...args: any[]) => this.advance(boardEvent, args);
            this._eventListeners.set(boardEvent, listener);
            board.boardEvents.on(boardEvent, listener);
        }
        await this.showIntro();
        this._steps[0]?.onEnter?.(board);
        await this.showStepHint(
            this.currentStep?.position,
            this.currentStep?.zIndex,
        );
        this.onStart(board);
    }

    /**
     * Called after the intro modal is dismissed and the first step is entered.
     * Override to register event listeners or perform subclass-specific setup.
     */
    protected onStart(_board: Board): void {}

    /**
     * Ends the tutorial (completed or abandoned). Delegates to the subclass
     * `onEnd()` hook for cleanup.
     */
    end(): void {
        if (this._board) {
            for (const [event, listener] of this._eventListeners) {
                this._board.boardEvents.off(event, listener);
            }
            this._eventListeners.clear();
        }
        this.onEnd();
    }

    /**
     * Called when the tutorial ends. Override to clean up event listeners and
     * restore any overridden state.
     */
    protected onEnd(): void {}

    // ─── Step advancement ───────────────────────────────────────────────

    /**
     * Checks the current step's condition. If met, fires the step's
     * onComplete hook, advances to the next step, and either shows the outro
     * (if the tutorial just completed) or fires the new step's onEnter hook
     * and shows its hint.
     *
     * @returns true if the current step's condition was met and the tutorial
     *          advanced (or completed). false if the condition was not met or
     *          the tutorial was already complete.
     */
    async advance(event?: BoardEvent, args: any[] = []): Promise<boolean> {
        if (this.isComplete || !this._board) {
            return false;
        }
        const step = this.currentStep;
        if (!step?.checkCondition(this._board, event, ...args)) {
            return false;
        }
        step.onComplete?.(this._board);
        this._currentStepIndex++;
        if (this.isComplete) {
            await this.showOutro();
            this._board.endGame();
        } else {
            this._steps[this._currentStepIndex].onEnter?.(this._board);
            await this.showStepHint(this.currentStep?.position);
        }
        return true;
    }

    // ─── Tutorial message events ────────────────────────────────────────

    /**
     * Shows the tutorial intro modal and waits for the user to dismiss it.
     */
    showIntro(): Promise<void> {
        return this.showMessage("intro", "center", this.intro);
    }

    /**
     * Shows the tutorial outro modal and waits for the user to dismiss it.
     */
    showOutro(): Promise<void> {
        this.done = true;
        return this.showMessage("outro", "center", this.outro);
    }

    /**
     * Shows the current step's hint modal and waits for the user to dismiss
     * it. Resolves immediately if the current step has no hint text.
     */
    showStepHint(
        position: TutorialMessagePosition = "center",
        zIndex?: number,
    ): Promise<void> {
        return this.showMessage(
            "hint",
            position,
            this.currentStep?.hint ?? "",
            this.currentStep?.name ?? this.name,
            zIndex,
        );
    }

    /**
     * Emits a {@link EventType.TutorialMessage} event via Logger's global
     * emitter and returns a Promise that resolves when the UI calls the
     * event's `resolve` callback (i.e. the user dismisses the modal).
     *
     * Resolves immediately if `text` is empty.
     *
     * @param type  The kind of tutorial modal to show.
     * @param text  Rich HTML content for the modal body.
     * @param zIndex Optional z-index override for the modal. If not provided, the default z-index will be used.
     */
    protected showMessage(
        type: TutorialMessageType,
        position: TutorialMessagePosition = "center",
        text: string = "",
        title: string = this.name,
        zIndex?: number,
    ): Promise<void> {
        if (!text) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            Logger.getEventEmitter().emit(EventType.TutorialMessage, {
                type,
                title,
                text,
                position,
                zIndex,
                resolve,
            } as TutorialMessageEvent);
        });
    }
}
