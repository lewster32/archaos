import { Model } from "./models/model";
import { Point } from "./point";
import { EventEmitter } from "./events";
import { Piece } from "./piece";
import { Wizard } from "./wizard";
import { Player } from "./player";
import type { Spell } from "./spells/spell";
import { Logger } from "./logger";
import {
    PhaseMachine,
    GameEnd,
    StartGame,
    MovingDone,
    SkipSpellbook,
    MovingReady,
    SpellbookReady,
    NoSpellsCast,
    SpellsDone,
    CastingReady,
    CastingDone,
    SpreadingDone,
    SpellTargeting,
} from "./phasemachine";
import { EngineEvent } from "./enums/engineevent";
import { BoardEvent } from "./enums/boardevent";
import { BoardPhase } from "./enums/boardphase";
import { BoardState } from "./enums/boardstate";
import { Colour } from "./enums/colour";
import { EventType } from "./enums/eventtype";
import { RangeType } from "./enums/rangetype";
import { UnitStatus } from "./enums/unitstatus";
import type { IRNG } from "./rng";
import { GameRNG } from "./rng";
import type { PieceConfig, WizardConfig } from "./configs/piececonfig";
import type { PlayerConfig } from "./configs/playerconfig";
import type { SpellConfig } from "./configs/spellconfig";
import type { Box } from "./interfaces/ui";
import type { RemotePlayer } from "./interfaces/remoteplayer";
import { Rules } from "./rules";
import { RangeGizmo } from "./rangegizmo";
import { Alignment } from "./alignment";
import { EventLog } from "./eventlog";
import type {
    BroadcastEventMessage,
    CancelCastCommand,
    CastSpellCommand,
    CommandId,
    CommandMessage,
    EndSpellPickCommand,
    Outcome,
    PhaseKind,
    PickSpellCommand,
    PlayerId,
    RejectionReason,
    SpellId,
    SpellTarget,
    SpellTypeId,
} from "./protocol";
import type { PieceDiedCause } from "./protocol/outcomes";
import type {
    AttackPieceCommand,
    CancelPieceActionCommand,
    DismountPieceCommand,
    EndMovementPhaseCommand,
    EndPieceTurnCommand,
    MountPieceCommand,
    MovePieceCommand,
    RangedAttackPieceCommand,
    SelectPieceCommand,
} from "./protocol/commands";
import { buildSnapshot, toPhaseKind } from "./snapshotbuilder";
import { ExpectedCommand } from "./commands/expectedcommand";
import { SpellbookBarrier } from "./commands/spellbookbarrier";
import { flyingPathCost, isStepTraversable, movementBudget, stepCost } from "./pathrules";
import type {
    AttackPieceBatchPayload,
    CancelPieceActionVisualPayload,
    DismountPieceBatchPayload,
    MountPieceBatchPayload,
    MovePieceBatchPayload,
    RangedAttackPieceBatchPayload,
    SelectPieceVisualPayload,
} from "./actions";

/**
 * Simple point type without all the baggage of
 * Phaser's `Geom.Point`.
 */
export type SimplePoint = { x: number; y: number };

/**
 * Optional dependency overrides for the engine Board.
 * Pass in tests to inject deterministic RNG, a mock Logger,
 * and/or a mock Rules instance instead of the production singletons.
 */
export interface BoardDeps {
    rng?: IRNG;
    logger?: Logger;
    rules?: Rules;
    /**
     * Monotonic clock for computing `elapsedMs` on events. Defaults to
     * `Date.now`. Tests inject a controlled counter for deterministic
     * timing.
     */
    now?: () => number;
    /**
     * Injectable scheduler used by the spellbook barrier to enforce its
     * per-game timeout. Whatever value this returns is the same value
     * the matching `clearTimeout` will receive back. Defaults to the
     * global `setTimeout`.
     */
    setTimeout?: (cb: () => void, ms: number) => unknown;
    /**
     * Cancels a previously-scheduled timer. Defaults to global
     * `clearTimeout`.
     */
    clearTimeout?: (handle: unknown) => void;
    /**
     * Per-game spellbook barrier timeout in milliseconds. When greater
     * than 0 AND any player is remote, the spellbook phase runs in
     * barrier mode; otherwise the phase runs serially in turn order.
     * Default null (serial mode regardless of remote players).
     */
    phaseTimeoutMs?: number | null;
    /**
     * Transitional flag. When true, `Board.startGame()` fires the new
     * command-pipeline-driven phase loop in the background. Default
     * false so the live game continues to use the legacy
     * `nextPlayer()`-driven flow until the client is wired through to
     * emit commands (see Task 14 of the command-intake-pipeline plan).
     * Tests opt in via the integration test helper.
     */
    autoRunPhaseLoop?: boolean;
}

/**
 * Internal builder collecting outcomes during a `recordEvent` callback.
 * Not exported — callers interact through `Board.recordEvent` and
 * `Board.pushOutcome`.
 */
class EventBuilder {
    readonly outcomes: Outcome[] = [];

    push(outcome: Outcome): void {
        this.outcomes.push(outcome);
    }

    finalise(
        correlation: { commandId?: CommandId; actorId?: PlayerId },
        elapsedMs: number,
    ): Omit<BroadcastEventMessage, "sequence"> {
        return {
            type: "event",
            elapsedMs,
            ...(correlation.commandId === undefined ? {} : { commandId: correlation.commandId }),
            ...(correlation.actorId === undefined ? {} : { actorId: correlation.actorId }),
            outcomes: [...this.outcomes],
        };
    }
}

/**
 * The engine Board: pure game state, turn orchestration,
 * and geometry queries. No Phaser imports.
 *
 * The client Board extends this and adds rendering,
 * sound, camera, cursor, and visual effects.
 */
export class Board<P extends Piece = Piece> extends Model implements Box {
    /* ── Cheat flags ─────────────────────────────── */

    /**
     * Cheat to force all attacks to hit (true),
     * miss (false), or normal (null).
     */
    public static CHEAT_FORCE_HIT: boolean | null = null;

    /**
     * Cheat to force all spells to cast successfully
     * (true), fail (false), or normal (null).
     */
    public static CHEAT_FORCE_CAST: boolean | null = null;

    /* ── Board geometry constants ─────────────────── */

    static readonly DEFAULT_WIDTH: number = 13;
    static readonly DEFAULT_HEIGHT: number = 13;
    static readonly DEFAULT_CELLSIZE: number = 14;
    static readonly HORIZONTAL_PAD_CELLS: number = 6;
    static readonly VERTICAL_PAD_CELLS: number = 9;
    static readonly SPREAD_ITERATIONS: number = 2;

    /**
     * Hard-coded neighbour direction offsets.
     */
    static readonly NEIGHBOUR_DIRECTIONS: SimplePoint[] = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: -1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
        { x: 1, y: -1 },
    ];

    /* ── State fields ────────────────────────────── */

    protected readonly _width: number;
    protected readonly _height: number;

    /**
     * Tracks the last emitted phase to avoid
     * duplicate BoardEvent.PhaseChange emissions.
     */
    protected _lastPhase: BoardPhase;

    /**
     * Tracks the last emitted state to avoid
     * duplicate BoardEvent.StateChange emissions
     * during the movement phase.
     */
    protected _lastState: BoardState;

    /**
     * Whether the board is busy (e.g. during
     * attack animations). When true, cursor input
     * is blocked.
     */
    protected _busy = false;

    /**
     * The current state of the board within a
     * phase.
     */
    protected _state: BoardState;

    /**
     * Tracks the universe's alignment balance and applies the spell alignment
     * bias to casting chances. Owns both the current balance and per-turn
     * accumulator.
     */
    protected readonly _alignment: Alignment;

    protected readonly _pieces: Map<number, P>;
    protected _selected: P | null;
    protected _cursorPosition: Point = new Point(0, 0);

    protected readonly _players: Map<number, Player<P>>;
    protected _currentPlayer: Player<P> | null;
    protected _currentPlayerIndex: number = -1;
    protected _idCounter: number = 1;

    protected readonly _stateManager: PhaseMachine;
    protected readonly _logger: Logger;
    protected readonly _rng: IRNG;
    protected readonly _rules: Rules;
    protected _rangeGizmo: RangeGizmo;

    protected _spellFilter: (spell: SpellConfig) => boolean = () => true;
    protected _disableIllusions: boolean = false;
    protected _disableCancelSpell: boolean = false;
    protected _disableCancelAction: boolean = false;
    protected _disableEndTurn: boolean = false;

    /**
     * Event emitter for board game events.
     */
    protected readonly _boardEvents: EventEmitter = new EventEmitter();

    /**
     * Authoritative event log for this game. Owns the monotonic sequence
     * counter and ordered broadcast-event history.
     */
    private readonly _eventLog: EventLog = new EventLog();

    /**
     * The event builder currently open inside a `recordEvent` callback,
     * or `null` when no context is active.
     */
    private _activeEvent: EventBuilder | null = null;

    /**
     * Monotonic clock used to compute `elapsedMs` on broadcast events.
     * Defaults to `Date.now`; tests inject a controlled counter.
     */
    private readonly _now: () => number;

    /**
     * Injectable scheduler used by the spellbook barrier. Defaults to
     * the global `setTimeout`.
     */
    private readonly _setTimeout: (cb: () => void, ms: number) => unknown;

    /**
     * Cancels a previously-scheduled timer. Defaults to global
     * `clearTimeout`.
     */
    private readonly _clearTimeout: (handle: unknown) => void;

    /**
     * Per-game spellbook barrier timeout in milliseconds. Null or
     * non-positive means barrier mode is disabled and the spellbook
     * phase always runs serially.
     */
    private readonly _phaseTimeoutMs: number | null;

    /**
     * Transitional flag — see {@link BoardDeps.autoRunPhaseLoop}.
     */
    private readonly _autoRunPhaseLoop: boolean;

    /**
     * Whether this Board's `startGame()` will fire `_runGameFlow()` to
     * drive the FSM and per-player slot loops. Exposed as protected so
     * the client subclass can gate its legacy `nextPlayer()` driver on
     * `!autoRunPhaseLoop` and avoid the dual-driver race.
     */
    protected get autoRunPhaseLoop(): boolean {
        return this._autoRunPhaseLoop;
    }

    /**
     * The currently-running phase loop promise, or null when no loop is
     * active. Tests await this to flush pending phase work.
     */
    private _phaseFlow: Promise<void> | null = null;

    /**
     * Milliseconds recorded when `startGame()` is called.
     * Zero until the game has started.
     */
    private _gameStartMs: number = 0;

    constructor(
        id: number,
        width: number = Board.DEFAULT_WIDTH,
        height: number = Board.DEFAULT_HEIGHT,
        classicBalance: boolean = false,
        seed?: string,
        deps?: BoardDeps,
    ) {
        super(id);
        this._rng = deps?.rng ?? new GameRNG(seed);
        this._now = deps?.now ?? Date.now;
        this._setTimeout = deps?.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
        this._clearTimeout =
            deps?.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
        this._phaseTimeoutMs = deps?.phaseTimeoutMs ?? null;
        this._autoRunPhaseLoop = deps?.autoRunPhaseLoop ?? true;
        this._logger = deps?.logger ?? Logger.getInstance();
        this._rules = deps?.rules ?? Rules.getInstance();
        this._alignment = new Alignment(classicBalance);

        this._width = width;
        this._height = height;

        this._pieces = new Map<number, P>();
        this._players = new Map<number, Player<P>>();
        this._state = BoardState.Idle;
        this._lastPhase = BoardPhase.Idle;
        this._lastState = BoardState.Idle;

        this._selected = null;
        this._currentPlayer = null;

        this._rangeGizmo = new RangeGizmo(this);
        this._stateManager = new PhaseMachine((activeState: string) => {
            this.onPhaseTransition(activeState);
        });
    }

    /* ── Phase transition handler ────────────────��─ */

    /**
     * Handle phase/state change side-effects from
     * the FSM. Called on every state transition.
     * Subclasses can override to add rendering.
     */
    protected onPhaseTransition(activeState: string): void {
        let newPhase: BoardPhase | null = null;
        switch (activeState) {
            case "spellbookSetup":
            case "spellbookPlayer":
                newPhase = BoardPhase.Spellbook;
                break;
            case "castingSetup":
            case "castingPlayer":
                newPhase = BoardPhase.Casting;
                break;
            case "spreading":
                newPhase = BoardPhase.Spreading;
                break;
            case "movingSetup":
            case "movingPlayer":
            case "pieceIdle":
            case "pieceMoving":
            case "pieceAttacking":
            case "pieceRangedAttacking":
            case "pieceDismounting":
                newPhase = BoardPhase.Moving;
                break;
        }
        if (newPhase !== null && newPhase !== this._lastPhase) {
            this._lastPhase = newPhase;
            switch (newPhase) {
                case BoardPhase.Spellbook:
                    this._logger.log(`Spell selection phase`, Colour.Green);
                    break;
                case BoardPhase.Casting:
                    this._logger.log(`Spell casting phase`, Colour.Green);
                    break;
                case BoardPhase.Moving:
                    this._logger.log(`Movement phase`, Colour.Green);
                    break;
            }
            this._boardEvents.emit(BoardEvent.PhaseChange, newPhase);
            // Emit a spontaneous phase-changed broadcast event once the game
            // has started. Pre-startGame transitions are silently skipped
            // by `_emitPhaseChanged`.
            this._emitPhaseChanged(newPhase, this._currentPlayer?.id ?? undefined);
        }

        let newState: BoardState | null = null;
        switch (activeState) {
            case "pieceIdle":
            case "pieceMoving":
                newState = BoardState.Move;
                break;
            case "pieceAttacking":
                newState = BoardState.Attack;
                break;
            case "pieceRangedAttacking":
                newState = BoardState.RangedAttack;
                break;
            case "pieceDismounting":
                newState = BoardState.Dismount;
                break;
            case "castIdle":
            case "castTargeting":
                newState = BoardState.CastSpell;
                break;
            case "spellbookPlayer":
                newState = BoardState.SelectSpell;
                break;
            case "spreading":
                newState = BoardState.Idle;
                break;
        }
        if (newState !== null && newState !== this._lastState) {
            this._lastState = newState;
            this._boardEvents.emit(BoardEvent.StateChange, newState);
            this.onStateChange(newState);
        }
    }

    /**
     * Called when the board state changes. Override in
     * client to emit UI events (end turn, cancel, etc).
     */
    protected onStateChange(_newState: BoardState): void {
        // no-op in engine; client adds UI event emission
    }

    /* ── Getters / setters ───────────────────────── */

    get stateManager(): PhaseMachine {
        return this._stateManager;
    }

    get state(): BoardState {
        if (this._state === BoardState.GameOver) return BoardState.GameOver;

        const pm = this._stateManager;
        if (pm.isActive(pm.states.movingPlayer)) {
            if (pm.isActive(pm.states.pieceAttacking)) return BoardState.Attack;
            if (pm.isActive(pm.states.pieceRangedAttacking)) return BoardState.RangedAttack;
            if (pm.isActive(pm.states.pieceDismounting)) return BoardState.Dismount;
            return BoardState.Move;
        }
        if (pm.isActive(pm.states.castingPlayer)) return BoardState.CastSpell;
        if (pm.isActive(pm.states.spellbookPlayer)) return BoardState.SelectSpell;
        if (pm.isActive(pm.states.spreading)) return BoardState.Idle;

        return this._state;
    }

    set state(state: BoardState) {
        if (this._state === BoardState.GameOver) {
            return;
        }
        this._state = state;
    }

    get phase(): BoardPhase {
        const pm = this._stateManager;
        if (pm.isActive(pm.states.spellbook)) return BoardPhase.Spellbook;
        if (pm.isActive(pm.states.casting)) return BoardPhase.Casting;
        if (pm.isActive(pm.states.spreading)) return BoardPhase.Spreading;
        if (pm.isActive(pm.states.moving)) return BoardPhase.Moving;
        return BoardPhase.Idle;
    }

    get busy(): boolean {
        return this._busy;
    }

    /**
     * The engine's universe alignment tracker. Owns the current balance,
     * the per-turn accumulator, and the bias-vs-balance casting-chance
     * adjustment. Exposed as read-only so client/UI code can query state.
     */
    get alignment(): Alignment {
        return this._alignment;
    }

    /**
     * Shortcut for `alignment.value` — the universe's current balance.
     * Negative values bias toward chaos, positive toward law.
     */
    get balance(): number {
        return this._alignment.value;
    }

    /**
     * Shortcut for `alignment.valueAccumulated` — the total bias
     * accumulated this turn from successful spell casts.
     */
    get balanceShift(): number {
        return this._alignment.valueAccumulated;
    }

    get rng(): IRNG {
        return this._rng;
    }

    get logger(): Logger {
        return this._logger;
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    /* ── Pieces ──────────────────────────────────── */

    get pieces(): P[] {
        return Array.from(this._pieces.values());
    }

    get selected(): P | null {
        return this._selected;
    }

    getPiece(id: number): P | null {
        if (this._pieces.has(id)) {
            return this._pieces.get(id);
        }
        return null;
    }

    getPiecesByOwner(owner: Player<P>): P[] {
        return this.pieces.filter((piece) => piece.owner === owner);
    }

    removePiece(id: number): void {
        const piece = this.getPiece(id);
        if (!id || !piece) {
            return;
        }
        this._pieces.delete(id);
        this._boardEvents.emit(BoardEvent.PieceDestroyed, piece);
    }

    /* ── Players ─────────────────────────────────── */

    get players(): Player<P>[] {
        return Array.from(this._players.values());
    }

    get currentPlayer(): Player<P> | null {
        return this._currentPlayer;
    }

    set currentPlayer(player: Player<P> | null) {
        this._currentPlayer = player;
    }

    getPlayer(id: number): Player<P> | null {
        if (this._players.has(id)) {
            return this._players.get(id);
        }
        return null;
    }

    /**
     * Create a player from config and add them to the board.
     *
     * @param config Player configuration.
     * @param remote Optional remote-player controller (AI or network).
     * @param isRemote Optional override for the player's isRemote flag.
     *                 When omitted, defaults to `remote != null`.
     * @returns The newly created player.
     */
    addPlayer(config: PlayerConfig, remote?: RemotePlayer | null, isRemote?: boolean): Player<P> {
        const player = new Player<P>(
            this,
            this._idCounter++,
            config,
            Player.PLAYER_COLOURS[this._players.size],
            remote,
            isRemote,
        );
        this._players.set(player.id, player);
        return player;
    }

    /* ── Spells ──────────────────────────────────── */

    /**
     * Cached spell factory, loaded lazily to avoid a
     * circular dependency (board → spellfactory →
     * attackspell → board).
     */
    private static _spellFactory: ((board: Board, id: number, config: SpellConfig) => Spell) | null = null;

    /**
     * Register the spell factory function. Must be
     * called once before `addSpell` is used.
     */
    static registerSpellFactory(factory: (board: Board, id: number, config: SpellConfig) => Spell): void {
        Board._spellFactory = factory;
    }

    /**
     * Add a spell to a player's spellbook.
     */
    addSpell(player: Player<P>, config: SpellConfig): Spell<P> {
        if (!config || !player) {
            throw new Error("No player or config provided");
        }
        if (!Board._spellFactory) {
            throw new Error(
                "Spell factory not registered. " +
                    "Import spellfactory and call " +
                    "Board.registerSpellFactory() " +
                    "first.",
            );
        }
        const spell = Board._spellFactory(this, this._idCounter++, config) as Spell<P>;
        player.addSpell(spell);
        return spell;
    }

    get spellFilter(): (config: SpellConfig) => boolean {
        return this._spellFilter ?? (() => true);
    }

    set spellFilter(filter: (config: SpellConfig) => boolean) {
        this._spellFilter = filter;
    }

    get disableIllusions(): boolean {
        return this._disableIllusions;
    }

    set disableIllusions(value: boolean) {
        this._disableIllusions = value;
    }

    get disableCancelSpell(): boolean {
        return this._disableCancelSpell;
    }

    set disableCancelSpell(value: boolean) {
        this._disableCancelSpell = value;
    }

    get disableCancelAction(): boolean {
        return this._disableCancelAction;
    }

    set disableCancelAction(value: boolean) {
        this._disableCancelAction = value;
    }

    get disableEndTurn(): boolean {
        return this._disableEndTurn;
    }

    set disableEndTurn(value: boolean) {
        this._disableEndTurn = value;
    }

    get boardEvents(): EventEmitter {
        return this._boardEvents;
    }

    /**
     * Alias for `boardEvents`.
     */
    get rules(): Rules {
        return this._rules;
    }

    get rangeGizmo(): RangeGizmo {
        return this._rangeGizmo;
    }

    get events(): EventEmitter {
        return this._boardEvents;
    }

    /** The authoritative game event log. */
    get eventLog(): EventLog {
        return this._eventLog;
    }

    /**
     * Record a broadcast event. Opens an ambient event context, runs the
     * callback (awaiting it if it returns a promise), then finalises and
     * appends the event to the log.
     *
     * Non-reentrant: calling `recordEvent` inside an already-active
     * callback throws. If the callback throws, the context is cleared
     * and no event is appended; the exception propagates.
     *
     * @param correlation `{ commandId?, actorId? }` — both fields absent
     *     for spontaneous events.
     * @param callback synchronous or async; mutations inside push
     *     outcomes via `pushOutcome`.
     * @returns the appended event, with sequence assigned.
     */
    async recordEvent(
        correlation: { commandId?: CommandId; actorId?: PlayerId },
        callback: () => void | Promise<void>,
    ): Promise<BroadcastEventMessage> {
        if (this._activeEvent !== null) {
            throw new Error(
                "Board.recordEvent: nested recordEvent is not permitted (an event context is already active).",
            );
        }
        const builder = new EventBuilder();
        this._activeEvent = builder;
        try {
            // Avoid `await callback()` which always yields a microtask
            // even for synchronous callbacks. The yield would leave
            // `_activeEvent` set while subsequent synchronous code (in
            // particular `emit` listeners that re-enter the engine via
            // `handleCommand`) runs, falsely tripping the re-entrancy
            // guard above.
            const result = callback();
            if (result instanceof Promise) {
                await result;
            }
        } catch (err) {
            this._activeEvent = null;
            throw err;
        }
        this._activeEvent = null;

        const elapsedMs: number = this._now() - this._gameStartMs;
        const finalised: Omit<BroadcastEventMessage, "sequence"> = builder.finalise(correlation, elapsedMs);
        return this._eventLog.append(finalised);
    }

    /**
     * Explicit bootstrap entry point. Captures `_gameStartMs`, emits the
     * sequence-1 `game-started` event built from the current board state,
     * and returns it.
     *
     * When `BoardDeps.autoRunPhaseLoop` is true, also fires the
     * command-pipeline-driven phase loop in the background (tests can
     * await it via `Board.phaseFlow`). Default false leaves the legacy
     * `nextPlayer()`-driven flow in charge — see Task 14 of the
     * command-intake-pipeline plan.
     *
     * Throws if called more than once or if no players have been added.
     *
     * @returns The sequence-1 broadcast event.
     */
    async startGame(): Promise<BroadcastEventMessage> {
        if (this._eventLog.head() !== 0) {
            throw new Error("Board.startGame() may only be called once.");
        }
        const firstPlayer = this.players[0];
        if (!firstPlayer) {
            throw new Error("Board.startGame() requires at least one player.");
        }
        this._gameStartMs = this._now();
        const event = await this.recordEvent({}, () => {
            const snapshot = buildSnapshot(this, firstPlayer.id);
            this.pushOutcome({
                kind: "game-started",
                scenario: snapshot.state.scenario,
                players: snapshot.state.players,
                initialPieces: snapshot.state.pieces,
            });
        });
        if (this._autoRunPhaseLoop) {
            this._phaseFlow = this._runGameFlow().catch((err) => {
                console.error("Board phase flow error:", err);
            });
        }
        return event;
    }

    /**
     * The currently-running phase loop promise, or null when no loop is
     * active. Tests await this to flush pending phase work after
     * sending commands or firing the barrier timer.
     */
    get phaseFlow(): Promise<void> | null {
        return this._phaseFlow;
    }

    /**
     * Push an outcome into the currently active event context. Silent
     * no-op if no context is active — this is the mode future
     * local-mirror mutations use when driven by an external event stream.
     */
    pushOutcome(outcome: Outcome): void {
        if (this._activeEvent === null) {
            return;
        }
        this._activeEvent.push(outcome);
    }

    /* ── Command pipeline ───────────────────────────── */

    /**
     * Per-game set of commandIds already dispatched. Used to silently
     * ignore duplicate commands (replay safety).
     */
    private readonly _processedCommandIds: Set<string> = new Set();

    /**
     * Active barrier when running spellbook phase in barrier mode.
     * Null when in serial mode or outside the spellbook phase.
     */
    private _spellbookBarrier: SpellbookBarrier | null = null;

    /**
     * Active single-player slot when running serial-mode spellbook or
     * casting phase. Null when no slot is open.
     */
    private _expectedCommand: ExpectedCommand | null = null;

    /**
     * The player whose casting slot is currently open, or null when no
     * casting slot is open. Distinct from `currentPlayer` because the
     * casting phase iterates explicitly via `_runCastingPhase`.
     */
    private _currentCastingPlayerId: PlayerId | null = null;

    /**
     * Set of spell ids for which `spell-revealed` has already been
     * emitted in the current casting slot. Cleared at slot boundaries.
     * Used to suppress duplicate `spell-revealed` emissions across
     * multi-cast iterations.
     */
    private readonly _spellRevealedSpellIds: Set<number> = new Set();

    /**
     * Test-only buffer of `command-rejected` private events emitted
     * during this game. Real private-event transport wiring lands with
     * the next spec; for now the engine accumulates rejections here so
     * tests can assert the emission and reasoning.
     */
    readonly _rejectedCommandsForTests: Array<{
        playerId: PlayerId;
        commandId: CommandId;
        reason: RejectionReason;
    }> = [];

    /**
     * Test-only buffer of cast-pipeline outcomes (spell-revealed,
     * spell-cast-attempted, spell-cast-succeeded, spell-cast-failed)
     * accumulated during this game. The full broadcast-event wiring
     * lands when the casting phase loop is rewritten in a later task;
     * for now tests assert against this in-memory buffer.
     */
    readonly _castOutcomesForTests: Array<unknown> = [];

    /**
     * Test-only buffer of accepted `pick-spell` outcomes recorded by
     * the spellbook phase loop. Mirrors the broadcast emission via
     * `recordEvent` so tests can assert on per-player picks without
     * crawling the full event log.
     */
    readonly _pickedSpellOutcomesForTests: Array<{
        playerId: PlayerId;
        commandId: CommandId;
    }> = [];

    /**
     * Test-only buffer of accepted `end-spell-pick` outcomes (explicit
     * skips and barrier-timer-driven synthetic skips). Mirrors the
     * broadcast emission via `recordEvent`.
     */
    readonly _endedSpellPickOutcomesForTests: Array<{
        playerId: PlayerId;
        commandId: CommandId;
        timedOut: boolean;
    }> = [];

    /**
     * Set true by `_handleEndMovementPhase` to signal the movement-phase
     * slot loop that the current player has ended their movement turn.
     * The loop checks this flag before re-opening a fresh slot for the
     * same player.
     */
    private _movementPhaseEnded: boolean = false;

    /**
     * Public entry point for every player command. Validates phase /
     * slot / barrier / dedup, then dispatches to the per-kind handler.
     * Token validation is a transport-layer concern and is not done
     * here — callers must pass an authenticated `playerId`.
     *
     * @param playerId  The authenticated sender.
     * @param cmd       The command message; must already be wire-safe.
     */
    /**
     * True when the engine has an open intake for the given player —
     * either an `ExpectedCommand` slot whose `expectedPlayerId` matches,
     * or a spellbook barrier the player is still allowed to submit to.
     *
     * Used by `ComputerWizard` (and any other authoritative dispatcher)
     * to suppress dispatching commands that would land before a slot is
     * opened. Without this check the FSM-fired phase-changed event that
     * fires inside `newTurn()` would be mistaken for a barrier-mode
     * "your turn" signal — the AI would dispatch into a closed slot,
     * get rejected, and latch its `_spellbookSubmitted` flag so the
     * subsequent legitimate per-slot phase-changed event becomes a
     * no-op.
     */
    canAcceptCommandFor(playerId: PlayerId): boolean {
        if (this._spellbookBarrier?.canAccept(playerId)) {
            return true;
        }
        const slot = this._expectedCommand;
        if (slot?.isOpen && slot.expectedPlayerId === playerId) {
            return true;
        }
        return false;
    }

    async handleCommand(playerId: PlayerId, cmd: CommandMessage): Promise<void> {
        // Silent dedup: a re-delivered commandId is a no-op.
        if (this._processedCommandIds.has(cmd.commandId)) {
            return;
        }
        this._processedCommandIds.add(cmd.commandId);

        switch (cmd.kind) {
            case "pick-spell":
                return this._handlePickSpell(playerId, cmd);
            case "end-spell-pick":
                return this._handleEndSpellPick(playerId, cmd);
            case "cast-spell":
                return this._handleCastSpell(playerId, cmd);
            case "cancel-cast":
                return this._handleCancelCast(playerId, cmd);
            case "select-piece":
                return this._handleSelectPiece(playerId, cmd);
            case "move-piece":
                return this._handleMovePiece(playerId, cmd);
            case "attack-piece":
                return this._handleAttackPiece(playerId, cmd);
            case "ranged-attack-piece":
                return this._handleRangedAttackPiece(playerId, cmd);
            case "mount-piece":
                return this._handleMountPiece(playerId, cmd);
            case "dismount-piece":
                return this._handleDismountPiece(playerId, cmd);
            case "cancel-piece-action":
                return this._handleCancelPieceAction(playerId, cmd);
            case "end-piece-turn":
                return this._handleEndPieceTurn(playerId, cmd);
            case "end-movement-phase":
                return this._handleEndMovementPhase(playerId, cmd);
            default:
                this._emitCommandRejected(playerId, cmd.commandId, "wrong-phase");
                return;
        }
    }

    /**
     * Record a `command-rejected` private event. Writes to the test-only
     * buffer and emits {@link EngineEvent.CommandRejected} on the engine
     * event bus so in-process subscribers (e.g. ComputerWizard) can react
     * without polling the buffer.
     */
    private _emitCommandRejected(playerId: PlayerId, commandId: CommandId, reason: RejectionReason): void {
        this._rejectedCommandsForTests.push({ playerId, commandId, reason });
        this._boardEvents.emit(EngineEvent.CommandRejected, {
            playerId,
            commandId,
            reason: String(reason),
        });
    }

    /**
     * Validate a pick-spell or end-spell-pick command against the open
     * spellbook slot/barrier. Returns null if the command is acceptable;
     * otherwise returns the rejection reason.
     */
    private _checkSpellbookSubmission(
        playerId: PlayerId,
        _cmd: PickSpellCommand | EndSpellPickCommand,
    ): RejectionReason | null {
        const barrier = this._spellbookBarrier;
        const slot = this._expectedCommand;

        if (barrier) {
            if (!barrier.isExpected(playerId)) {
                return "wrong-phase";
            }
            if (!barrier.canAccept(playerId)) {
                // In-roster but already submitted (or barrier closed).
                return "spell-pick-already-ended";
            }
            return null;
        }

        if (slot && slot.expectedPlayerId !== playerId) {
            // Some other player's slot is open.
            return "not-your-turn";
        }
        if (slot && !slot.isOpen) {
            return "spell-pick-already-ended";
        }
        if (!slot) {
            return "wrong-phase";
        }
        // Slot is open for this player; the command's kind is
        // separately validated by ExpectedCommand.submit.
        return null;
    }

    private async _handlePickSpell(playerId: PlayerId, cmd: PickSpellCommand): Promise<void> {
        const rejection = this._checkSpellbookSubmission(playerId, cmd);
        if (rejection) {
            this._emitCommandRejected(playerId, cmd.commandId, rejection);
            return;
        }

        const player = this.getPlayer(playerId);
        if (!player) {
            this._emitCommandRejected(playerId, cmd.commandId, "wrong-phase");
            return;
        }

        const spell = player.spells.find((s) => s.id === cmd.spellId);
        if (!spell) {
            this._emitCommandRejected(playerId, cmd.commandId, "spell-not-in-book");
            return;
        }

        // Accept: record the pick in authoritative state.
        await player.pickSpell(cmd.spellId);

        // Apply the illusion bit when the spell supports it. The spell
        // hierarchy currently exposes `illusion` only on SummonSpell.
        if (cmd.illusion === true) {
            const maybeIllusion = spell as unknown as { illusion?: boolean };
            if ("illusion" in maybeIllusion) {
                maybeIllusion.illusion = true;
            }
        }

        // Update slot/barrier state.
        const barrier = this._spellbookBarrier;
        const slot = this._expectedCommand;
        if (barrier) {
            barrier.submit(playerId, cmd);
        } else if (slot) {
            slot.submit(playerId, cmd);
        }

        // Emit broadcast outcome via recordEvent.
        this._recordPlayerPickedSpell(playerId, cmd.commandId);
    }

    private async _handleEndSpellPick(playerId: PlayerId, cmd: EndSpellPickCommand): Promise<void> {
        const rejection = this._checkSpellbookSubmission(playerId, cmd);
        if (rejection) {
            this._emitCommandRejected(playerId, cmd.commandId, rejection);
            return;
        }

        const player = this.getPlayer(playerId);
        if (player) {
            // Discard any previously-picked spell. Calling pickSpell
            // is the only public path to write selectedSpell, so we
            // route through discardSpell here for symmetry.
            if (player.selectedSpell) {
                await player.discardSpell();
            }
        }

        const barrier = this._spellbookBarrier;
        const slot = this._expectedCommand;
        if (barrier) {
            barrier.submit(playerId, cmd);
        } else if (slot) {
            slot.submit(playerId, cmd);
        }

        this._recordPlayerEndedSpellPick(playerId, cmd.commandId, /* timedOut */ false);
    }

    /** Real recordEvent + pushOutcome wiring for an accepted pick. */
    private _recordPlayerPickedSpell(playerId: PlayerId, commandId: CommandId): void {
        void this.recordEvent({ commandId, actorId: playerId }, () => {
            this.pushOutcome({ kind: "player-picked-spell", playerId });
        });
        this._pickedSpellOutcomesForTests.push({ playerId, commandId });
    }

    /** Real recordEvent + pushOutcome wiring for an accepted skip. */
    private _recordPlayerEndedSpellPick(playerId: PlayerId, commandId: CommandId, timedOut: boolean): void {
        void this.recordEvent({ commandId, actorId: playerId }, () => {
            const outcome: Outcome = timedOut
                ? { kind: "player-ended-spell-pick", playerId, timedOut: true }
                : { kind: "player-ended-spell-pick", playerId };
            this.pushOutcome(outcome);
        });
        this._endedSpellPickOutcomesForTests.push({ playerId, commandId, timedOut });
    }

    /**
     * Resolve the protocol-level {@link SpellTarget} into the engine
     * Point or Piece form expected by `Spell.getValidTarget` / `cast`.
     * Returns null when the referenced piece does not exist or the
     * envelope is malformed.
     */
    private _resolveCastTarget(player: Player<P>, target: SpellTarget): Point | P | null {
        if ("self" in target && target.self) {
            return player.castingPiece;
        }
        if ("pieceId" in target) {
            return this.getPiece(target.pieceId);
        }
        if ("point" in target) {
            return new Point(target.point.x, target.point.y);
        }
        return null;
    }

    private async _handleCastSpell(playerId: PlayerId, cmd: CastSpellCommand): Promise<void> {
        const slot = this._expectedCommand;

        // 1. Slot must be open and casting must be in progress.
        if (!slot || this._currentCastingPlayerId === null) {
            this._emitCommandRejected(playerId, cmd.commandId, "wrong-phase");
            return;
        }

        // 2. Slot ownership.
        if (slot.expectedPlayerId !== playerId || this._currentCastingPlayerId !== playerId) {
            this._emitCommandRejected(playerId, cmd.commandId, "not-your-turn");
            return;
        }

        // 3. Player must have a selected spell with casts remaining.
        const player = this.getPlayer(playerId);
        const spell = player?.selectedSpell ?? null;
        if (!player || !spell || spell.castTimes <= 0) {
            this._emitCommandRejected(playerId, cmd.commandId, "wrong-phase");
            return;
        }

        // 4. Translate the protocol target and let the spell's existing
        //    predicate decide whether it is valid.
        const resolved = this._resolveCastTarget(player, cmd.target);
        if (resolved === null || spell.getValidTarget(resolved) === null) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-target");
            return;
        }

        // 5. Accept: emit spell-revealed (first cast only) and
        //    spell-cast-attempted as a single broadcast event before
        //    delegating to the existing Spell.cast pipeline. The
        //    legacy test-only buffer is kept alongside until the
        //    broadcast event log assertions take over in a later task.
        const spellId: SpellId = spell.id;
        const spellTypeId: SpellTypeId = this._spellTypeIdOf(spell);
        const wasFirstReveal = !this._spellRevealedSpellIds.has(spell.id);
        if (wasFirstReveal) {
            this._spellRevealedSpellIds.add(spell.id);
            this._castOutcomesForTests.push({ kind: "spell-revealed", playerId });
        }
        this._castOutcomesForTests.push({
            kind: "spell-cast-attempted",
            playerId,
            target: cmd.target,
        });

        void this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, () => {
            if (wasFirstReveal) {
                this.pushOutcome({
                    kind: "spell-revealed",
                    playerId,
                    spellId,
                    spellTypeId,
                });
            }
            this.pushOutcome({
                kind: "spell-cast-attempted",
                playerId,
                spellId,
                spellTypeId,
                target: cmd.target,
            });
        });

        const result = await spell.cast(player, player.castingPiece, resolved);
        const succeeded = result !== null && spell.failed === false;
        const castsLeft: number = spell.castTimes;
        const totalCastTimes: number = (spell as unknown as { totalCastTimes?: number }).totalCastTimes ?? 1;
        const isMultiCast = totalCastTimes > 1;
        const isFinal = !succeeded || castsLeft <= 0;
        const persist = spell.persist === true;

        if (succeeded) {
            this._castOutcomesForTests.push({
                kind: "spell-cast-succeeded",
                playerId,
                castsLeft,
            });
        } else {
            this._castOutcomesForTests.push({
                kind: "spell-cast-failed",
                playerId,
            });
        }

        void this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, () => {
            if (succeeded) {
                const successOutcome: Outcome = isMultiCast
                    ? {
                          kind: "spell-cast-succeeded",
                          playerId,
                          spellId,
                          spellTypeId,
                          castsLeft,
                      }
                    : {
                          kind: "spell-cast-succeeded",
                          playerId,
                          spellId,
                          spellTypeId,
                      };
                this.pushOutcome(successOutcome);
            } else {
                this.pushOutcome({
                    kind: "spell-cast-failed",
                    playerId,
                    spellId,
                    spellTypeId,
                });
            }
            if (isFinal && !persist) {
                this.pushOutcome({
                    kind: "spell-removed-from-book",
                    playerId,
                    spellId,
                    spellTypeId,
                });
            }
        });

        // 6. Slot lifecycle.
        //    Always submit — the casting phase loop opens a fresh slot
        //    and re-emits phase-changed per iteration, which is what
        //    triggers the AI's next dispatch. Leaving an intermediate
        //    multi-cast slot open would hang the loop on
        //    `await slot.untilAccepted()` and starve the AI of the
        //    re-emit it needs to issue the next cast.
        slot.submit(playerId, cmd);
    }

    private async _handleCancelCast(playerId: PlayerId, cmd: CancelCastCommand): Promise<void> {
        const slot = this._expectedCommand;

        // 1. Slot must be open and casting must be in progress.
        if (!slot || this._currentCastingPlayerId === null) {
            this._emitCommandRejected(playerId, cmd.commandId, "wrong-phase");
            return;
        }

        // 2. Slot ownership.
        if (slot.expectedPlayerId !== playerId || this._currentCastingPlayerId !== playerId) {
            this._emitCommandRejected(playerId, cmd.commandId, "not-your-turn");
            return;
        }

        // 3. There must be a spell to cancel.
        const player = this.getPlayer(playerId);
        const spell = player?.selectedSpell ?? null;
        if (!player || !spell) {
            this._emitCommandRejected(playerId, cmd.commandId, "wrong-phase");
            return;
        }

        const spellId: SpellId = spell.id;
        const spellTypeId: SpellTypeId = this._spellTypeIdOf(spell);
        const persist = spell.persist === true;

        // 4. Discard the spell — removes non-persist spells from the
        //    spellbook and clears the player's selection. Persist spells
        //    (e.g. Disbelieve) only have their cast counter reset.
        await player.discardSpell();

        // 5. Buffer the cancellation outcomes onto the test-only field
        //    and emit the real broadcast event. The legacy buffer pushes
        //    spell-removed-from-book unconditionally; the broadcast
        //    omits it for persist spells per protocol.
        this._castOutcomesForTests.push(
            { kind: "spell-cast-cancelled", playerId, spellId },
            { kind: "spell-removed-from-book", playerId, spellId },
        );

        void this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, () => {
            this.pushOutcome({
                kind: "spell-cast-cancelled",
                playerId,
                spellId,
                spellTypeId,
            });
            if (!persist) {
                this.pushOutcome({
                    kind: "spell-removed-from-book",
                    playerId,
                    spellId,
                    spellTypeId,
                });
            }
        });

        // 6. Hand the slot off so the casting phase loop can advance.
        slot.submit(playerId, cmd);
    }

    /**
     * Derive the protocol-level {@link SpellTypeId} for a spell. The
     * spell config's `id` (e.g. "summon-orc") is preferred; falls back
     * to the unique spell instance id stringified when no config id is
     * present (typically only the case for ad-hoc test mock spells).
     */
    private _spellTypeIdOf(spell: Spell<P>): SpellTypeId {
        const properties = spell.properties as { id?: string } | undefined;
        return properties?.id ?? String(spell.id);
    }

    /**
     * Stateless server-side path validation. Walks the submitted path
     * step-by-step, accumulating cost, checking each step's
     * traversability via `pathrules`. Returns true iff every step is
     * legal and the cumulative cost fits the piece's movement budget.
     *
     * Does not perform engagement checks - those are orchestrated by
     * the handler between successive setPosition calls.
     *
     * Referentially transparent given current piece positions; mutates
     * nothing. (Invariant 12 of the movement-phase command-wiring spec.)
     *
     * @param piece The moving piece.
     * @param path The ordered sequence of step destinations.
     * @param opts Optional flags. `allowTerminalMount` relaxes the
     *        terminal-step blocker check so a wizard may end on a
     *        mountable's tile or an attacker may end on a target's tile.
     * @returns True iff the path is fully legal for `piece`.
     */
    validatePath(piece: P, path: ReadonlyArray<Point>, opts?: { allowTerminalMount?: boolean }): boolean {
        if (path.length === 0) {
            return true;
        }
        const isFlying: boolean = piece.hasStatus(UnitStatus.Flying);
        const budget: number = movementBudget(piece);

        let cumulative: number = 0;
        let from: Point = piece.position;

        for (let i: number = 0; i < path.length; i++) {
            const to: Point = path[i];
            const isTerminal: boolean = i === path.length - 1;
            const dx: number = Math.abs(to.x - from.x);
            const dy: number = Math.abs(to.y - from.y);
            if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
                return false;
            }
            if (to.x < 0 || to.y < 0 || to.x >= this.width || to.y >= this.height) {
                return false;
            }
            const allowTerminalException: boolean = isTerminal && (opts?.allowTerminalMount ?? false);
            if (!isStepTraversable(piece, from, to, this, allowTerminalException)) {
                return false;
            }
            if (!isFlying) {
                cumulative += stepCost(from, to);
                if (cumulative > budget) {
                    return false;
                }
            }
            from = to;
        }

        if (isFlying) {
            return flyingPathCost(piece.position, path) <= budget;
        }
        return true;
    }

    /**
     * Shared movement-phase precondition validator. Checks that:
     *  - The board is in the moving phase and a slot is open.
     *  - The slot's expected player matches `playerId`.
     *  - If `expectedPieceField` is provided, the selected piece's id
     *    equals the value at `cmd[expectedPieceField]`.
     *
     * On failure emits the appropriate `command-rejected` and returns
     * `null`. On success returns `{ slot, selected }`.
     *
     * Used by every movement-phase handler to share the validation
     * preamble. The reason taxonomy:
     *  - `wrong-phase` if not in Moving phase or no slot is open.
     *  - `not-your-turn` if slot belongs to another player or the
     *    pieceId in the command does not match the selected piece.
     *
     * Pass `expectedPieceField: null` for handlers that do not have a
     * single piece-id field to match against the current selection
     * (e.g. `select-piece`, where the command IS the selection, and
     * `end-movement-phase`, where there is no piece reference).
     */
    private _validateMovementSlot<C extends CommandMessage>(
        playerId: PlayerId,
        cmd: C,
        expectedPieceField: keyof C | null,
    ): { slot: ExpectedCommand; selected: P | null } | null {
        const slot = this._expectedCommand;
        if (this.phase !== BoardPhase.Moving || !slot) {
            this._emitCommandRejected(playerId, cmd.commandId, "wrong-phase");
            return null;
        }
        if (slot.expectedPlayerId !== playerId) {
            this._emitCommandRejected(playerId, cmd.commandId, "not-your-turn");
            return null;
        }
        const selected: P | null = this._selected;
        if (expectedPieceField !== null) {
            const expectedId = cmd[expectedPieceField] as unknown as number;
            if (!selected || selected.id !== expectedId) {
                this._emitCommandRejected(playerId, cmd.commandId, "not-your-turn");
                return null;
            }
        }
        return { slot, selected };
    }

    /**
     * Walk `path` step-by-step, calling `setPosition(step)` on `piece`
     * (and on `piece.currentRider` if `riderSync` is true). After each
     * step, run an engagement roll (manoeuvrability vs manoeuvrability)
     * against adjacent enemies. On a successful roll: emits paired
     * `piece-turn-flag-changed{engaged: true}` outcomes for both
     * pieces and stops the loop.
     *
     * Returns `{ walked, engagedBy }` where `walked` is the per-tile
     * prefix that was actually traversed (every step up to and
     * including the one where engagement fired, or the full path if
     * no engagement occurred) and `engagedBy` is the engaging enemy
     * or `null` if the full path was traversed.
     *
     * When `skipEngagementOnTerminal` is true, the engagement roll is
     * skipped on the final step (used by mount-piece, where the
     * terminal step IS the mount tile and engagement on arrival is
     * handled by the mount semantics, not the path-walk loop).
     *
     * Caller is responsible for any post-walk outcomes (terminal
     * setMount/setRider, attack roll, replacement-on-kill, turn-flag
     * updates) and for invoking this inside an active `recordEvent`
     * context.
     */
    private _walkPathWithEngagement(
        piece: P,
        path: ReadonlyArray<Point>,
        riderSync: boolean = true,
        skipEngagementOnTerminal: boolean = false,
    ): { walked: Point[]; engagedBy: P | null } {
        const rider: P | null = riderSync ? (piece.currentRider as P | null) : null;
        const walked: Point[] = [];
        for (let i: number = 0; i < path.length; i++) {
            const step: Point = path[i];
            const isTerminal: boolean = i === path.length - 1;
            piece.setPosition(step);
            if (rider) {
                rider.setPosition(step);
            }
            walked.push(step);
            if (skipEngagementOnTerminal && isTerminal) {
                continue;
            }
            const enemies: P[] = this.getAdjacentPiecesAtPosition(step, (p) => {
                return !p.dead && p.owner !== piece.owner && p.canEngagePiece(piece);
            });
            for (const enemy of enemies) {
                // Engagement is a manoeuvrability contest, matching the
                // original Chaos rule. canEngagePiece already gates
                // entry on both pieces having manoeuvrability > 0.
                const succeeded: boolean = this.roll(
                    enemy.stats.manoeuvrability ?? 0,
                    piece.stats.manoeuvrability ?? 0,
                );
                if (succeeded) {
                    piece.setTurnFlags({ engaged: true });
                    enemy.setTurnFlags({ engaged: true });
                    return { walked, engagedBy: enemy as P };
                }
            }
        }
        return { walked, engagedBy: null };
    }

    /**
     * Cascade-kill `target` with the given `cause`. Idempotent on
     * already-dead pieces (relies on `Piece.kill`/`setDead`'s
     * idempotency, which means broadcast outcomes are emitted exactly
     * once even if this is reached twice).
     *
     * Routes through `Piece.kill` so riders are dismounted, engulfed
     * pieces are released, and illusions/NoCorpse/Undead pieces are
     * destroyed - matching the lifecycle `Piece.kill` establishes
     * elsewhere. The primitive `setDead` only flips the dead flag and
     * deliberately omits this cleanup.
     *
     * If the target is a wizard and has an owner, sweeps the owner's
     * other living non-wizard pieces with `kill("spell")` and emits a
     * `player-defeated` outcome. When only one (or zero) surviving
     * players remain, also emits a `game-over` outcome carrying the
     * survivor's id (or `"draw"` if no survivors).
     *
     * Caller must invoke this inside an active `recordEvent` context.
     */
    private async _cascadeKill(target: P, cause: PieceDiedCause): Promise<void> {
        if (target.dead) {
            return;
        }
        const wasWizard: boolean = target.hasStatus(UnitStatus.Wizard);
        // Snapshot the owner reference now - `Piece.kill` clears
        // `target.owner` as part of its lifecycle, so reading it after
        // the kill would yield null.
        const owner: Player<P> | null = target.owner as Player<P> | null;
        await target.kill(cause);
        if (!wasWizard || !owner) {
            return;
        }
        // Sweep the wizard's other surviving pieces explicitly via
        // `Piece.kill("spell")` so each emits a `piece-died` outcome
        // with the cause we want.
        const owned: P[] = this.getPiecesByOwner(owner);
        for (const piece of owned) {
            if (piece === target || piece.dead) {
                continue;
            }
            await piece.kill("spell");
        }
        // Route through `Player.defeat` so the client override fires
        // its audio/visual side effects (sound, fade-out, etc.) and
        // `_defeated` is consistently set to true. `defeat` calls
        // `destroyCreations`, which is a no-op here because the
        // creation sweep above has already killed every non-wizard
        // piece - `Piece.kill`/`destroy` are idempotent on dead
        // pieces.
        await owner.defeat();
        this.pushOutcome({
            kind: "player-defeated",
            playerId: owner.id,
        });
        // Determine surviving players: those whose wizard is alive.
        const survivors: Player<P>[] = this.players.filter((p) => {
            const wiz = this.getPiecesByOwner(p).find(
                (piece) => piece.hasStatus(UnitStatus.Wizard) && !piece.dead,
            );
            return wiz !== undefined;
        });
        if (survivors.length <= 1) {
            const winnerId: PlayerId | "draw" = survivors.length === 1 ? survivors[0].id : "draw";
            this.pushOutcome({
                kind: "game-over",
                winnerId,
            });
        }
    }

    /**
     * Handle a `select-piece` command. Validates phase + slot ownership
     * and the target piece (must exist, be alive, owned by the player,
     * and selectable). On accept, runs an engagement roll against each
     * adjacent enemy that can engage; for each successful roll, both
     * pieces flip their `engaged` flag and emit a paired
     * `piece-turn-flag-changed` outcome inside a single broadcast event.
     * The selection itself updates `_selected` as transitional engine
     * state and is not part of the broadcast (invariant 16).
     *
     * Does not submit the slot — the player is expected to issue a
     * subsequent action command (move, attack, etc.) within the same
     * slot.
     */
    private async _handleSelectPiece(playerId: PlayerId, cmd: SelectPieceCommand): Promise<void> {
        const validated = this._validateMovementSlot(playerId, cmd, null);
        if (!validated) return;
        const piece: P | null = this.getPiece(cmd.pieceId);
        if (!piece || piece.dead) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-target");
            return;
        }
        if (piece.owner?.id !== playerId) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-target");
            return;
        }
        if (!piece.canSelect) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-target");
            return;
        }
        let engagedByOnSelect: P | null = null;
        await this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, () => {
            // Engagement rolls against adjacent enemies that can engage.
            const enemies: P[] = this.getAdjacentPiecesAtPosition(
                piece.position,
                (p) => !p.dead && p.owner !== piece.owner && p.canEngagePiece(piece),
            );
            for (const enemy of enemies) {
                // Engagement is a manoeuvrability contest, not a combat
                // contest, in the original Chaos rules. Piece.canEngagePiece
                // already gates entry on both pieces having
                // manoeuvrability > 0; using the same stat for the roll
                // matches the original game balance.
                const succeeded: boolean = this.roll(
                    enemy.stats.manoeuvrability ?? 0,
                    piece.stats.manoeuvrability ?? 0,
                );
                if (succeeded) {
                    piece.setTurnFlags({ engaged: true });
                    enemy.setTurnFlags({ engaged: true });
                    if (engagedByOnSelect === null) {
                        engagedByOnSelect = enemy as P;
                    }
                }
            }
            // _selected is transitional engine state; not in the
            // broadcast (invariant 16).
            this._selected = piece;
        });
        const selectPayload: SelectPieceVisualPayload = {
            pieceId: piece.id,
            ...(engagedByOnSelect ? { engagedBy: { pieceId: engagedByOnSelect.id } } : {}),
        };
        this._boardEvents.emit(EngineEvent.SelectPieceVisual, selectPayload);
    }

    /**
     * Handle a `move-piece` command. Validates phase + slot ownership,
     * that the moving piece is the currently selected one, that it has
     * not already moved this turn, and that the submitted path is legal
     * for the piece (`validatePath`).
     *
     * On accept, walks the submitted path step-by-step inside a single
     * `recordEvent` broadcast. Each step calls `setPosition` on the
     * piece (and on its rider, if any, for paired position sync).
     * After every step, runs an engagement roll for each adjacent
     * enemy that can engage; on success, both pieces flip their
     * `engaged` turn-flag and the path is truncated mid-move
     * (invariant 14). The piece's `moved` turn-flag is set at the end
     * of traversal, mirrored on the rider where applicable.
     *
     * Submits the slot after a successful move so the movement-phase
     * loop can advance to the next slot.
     */
    private async _handleMovePiece(playerId: PlayerId, cmd: MovePieceCommand): Promise<void> {
        const validated = this._validateMovementSlot(playerId, cmd, "pieceId");
        if (!validated) return;
        const { slot, selected } = validated;
        const piece: P = selected as P;
        if (piece.moved) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
            return;
        }
        const path: Point[] = cmd.path.map((p) => new Point(p.x, p.y));
        if (!this.validatePath(piece, path)) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
            return;
        }
        const rider: P | null = piece.currentRider as P | null;
        let walked: Point[] = [];
        let engagedBy: P | null = null;
        await this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, () => {
            const result = this._walkPathWithEngagement(piece, path);
            walked = result.walked;
            engagedBy = result.engagedBy;
            piece.setTurnFlags({ moved: true });
            if (rider) {
                rider.setTurnFlags({ moved: true });
            }
        });

        // _handleMovePiece always invokes _walkPathWithEngagement with the
        // default riderSync: true; reflect that truthfully so the client
        // knows it should sync any rider's animation in lockstep.
        const payload: MovePieceBatchPayload = {
            pieceId: piece.id,
            path: walked.map((p) => ({ x: p.x, y: p.y })),
            riderSync: true,
            ...(engagedBy ? { engagedBy: { pieceId: engagedBy.id } } : {}),
        };
        this._boardEvents.emit(EngineEvent.MovePieceBatch, payload);

        slot.submit(playerId, cmd);
    }

    /**
     * Handle an `attack-piece` command. Validates phase + slot
     * ownership, that the attacker is the currently selected piece,
     * that the target exists and is attackable, and that the path (if
     * any) is legal and terminates adjacent to the target's tile.
     *
     * For `mov === 0` attackers (e.g. Shadow Wood), the path is empty
     * and the attacker must already be adjacent. Flying attackers may
     * also submit an empty path (swoop is handled by the path-walk
     * loop's regular flying budget).
     *
     * On accept, walks the path inside a single `recordEvent`
     * broadcast. If engagement fires mid-path AND the engagement tile
     * is not adjacent to the target, the attack is forfeited and the
     * piece is flagged `moved: true` only. Otherwise, the attack roll
     * runs and emits `piece-attacked{succeeded}`. On success the
     * target is cascade-killed (a wizard kill sweeps the wizard's
     * surviving creations and emits `player-defeated` and possibly
     * `game-over`). On a successful kill by a non-flying mov > 0
     * attacker, the attacker steps onto the target's tile
     * (replacement-on-kill, chess-style); flying attackers stay where
     * the swoop took them.
     *
     * Submits the slot after a successful attack so the movement-phase
     * loop can advance to the next slot.
     */
    private async _handleAttackPiece(playerId: PlayerId, cmd: AttackPieceCommand): Promise<void> {
        const validated = this._validateMovementSlot(playerId, cmd, "attackerId");
        if (!validated) return;
        const { slot, selected } = validated;
        const attacker: P = selected as P;
        const target: P | null = this.getPiece(cmd.targetId);
        if (!target || !attacker.canAttackPiece(target)) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-target");
            return;
        }
        const path: Point[] = cmd.path.map((p) => new Point(p.x, p.y));
        const isFlying: boolean = attacker.hasStatus(UnitStatus.Flying);
        if (path.length > 0) {
            if (!this.validatePath(attacker, path)) {
                this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
                return;
            }
            const terminal: Point = path[path.length - 1];
            const dx: number = Math.abs(terminal.x - target.position.x);
            const dy: number = Math.abs(terminal.y - target.position.y);
            if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
                this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
                return;
            }
        } else {
            // Empty path: attacker must already be adjacent (or be
            // flying, in which case canAttackPiece + adjacency on
            // current position is still required - a flying piece
            // that needs to swoop must submit a path).
            const dx: number = Math.abs(attacker.position.x - target.position.x);
            const dy: number = Math.abs(attacker.position.y - target.position.y);
            if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
                this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
                return;
            }
        }
        const attackerMov: number = attacker.stats.movement ?? 0;
        let walked: Point[] = [];
        let engagedBy: P | null = null;
        let attackHit: boolean = false;
        let targetKilled: boolean = false;
        const cascadeKilledIds: number[] = [];
        await this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, async () => {
            // Walk the path; if engagement fires mid-path, the attack
            // is forfeited unless the engagement tile is still
            // adjacent to the target.
            const result = this._walkPathWithEngagement(attacker, path);
            walked = result.walked;
            engagedBy = result.engagedBy;
            if (engagedBy) {
                const dx: number = Math.abs(attacker.position.x - target.position.x);
                const dy: number = Math.abs(attacker.position.y - target.position.y);
                const stillAdjacent: boolean = dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
                if (!stillAdjacent) {
                    attacker.setTurnFlags({ moved: true });
                    return;
                }
            }
            // Resolve the attack from the (possibly engagement-truncated) tile.
            const succeeded: boolean = this.roll(
                attacker.stats.combat ?? 0,
                target.stats.defence ?? 0,
                (attacker.owner ?? undefined) as Player<P> | undefined,
            );
            this.pushOutcome({
                kind: "piece-attacked",
                attackerId: attacker.id,
                targetId: target.id,
                succeeded,
            });
            if (succeeded) {
                attackHit = true;
                // Snapshot alive pieces other than the target so we can
                // detect cascade kills (rider, mount, wizard's creations)
                // after _cascadeKill returns.
                const aliveBeforeKill: number[] = this.pieces
                    .filter((p) => p !== (target as unknown as P) && !p.dead)
                    .map((p) => p.id);
                await this._cascadeKill(target, "combat");
                targetKilled = target.dead;
                // Collect any pieces that were alive before the kill
                // but are dead now (excluding the primary target).
                for (const id of aliveBeforeKill) {
                    const p = this.getPiece(id);
                    // Either dead-with-corpse OR fully destroyed (NoCorpse/Undead/illusion
                    // pieces are removed from the map by `destroy()` inside `_cascadeKill`).
                    if (p === null || p.dead) {
                        cascadeKilledIds.push(id);
                    }
                }
                // Replacement-on-kill: non-flying attackers with
                // mov > 0 step onto the target's tile.
                if (!isFlying && attackerMov > 0) {
                    attacker.setPosition(new Point(target.position.x, target.position.y));
                }
            }
            attacker.setTurnFlags({ moved: true, attacked: true });
            const rider: P | null = attacker.currentRider as P | null;
            if (rider) {
                rider.setTurnFlags({ moved: true, attacked: true });
            }
        });

        // _handleAttackPiece walks the approach with the default
        // riderSync: true behaviour; payload reflects the approach path
        // walked plus the attack outcome flags captured during the
        // recordEvent callback above.
        const payload: AttackPieceBatchPayload = {
            attackerId: attacker.id,
            targetId: target.id,
            path: walked.map((p) => ({ x: p.x, y: p.y })),
            ...(engagedBy ? { engagedBy: { pieceId: engagedBy.id } } : {}),
            hit: attackHit,
            targetKilled,
            cascadeKilledIds: [...cascadeKilledIds],
        };
        this._boardEvents.emit(EngineEvent.AttackPieceBatch, payload);

        slot.submit(playerId, cmd);
    }

    /**
     * Handle a `ranged-attack-piece` command. Validates phase + slot
     * ownership, that the attacker is the currently selected piece,
     * and that the target is reachable via `canRangedAttackPiece`
     * (which checks LOS, range, status, and turn-flag eligibility).
     *
     * On accept, runs the ranged-attack roll inside a single
     * `recordEvent` broadcast. Emits
     * `piece-ranged-attacked{succeeded}`; on success cascade-kills the
     * target (wizard kill sweeps the wizard's surviving creations and
     * emits `player-defeated` and possibly `game-over`). The attacker
     * does NOT move - ranged attacks emit no piece-moved outcomes.
     * The attacker is finally flagged
     * `{moved: true, attacked: true, rangedAttacked: true}`.
     *
     * Submits the slot after a successful ranged attack so the
     * movement-phase loop can advance to the next slot.
     */
    private async _handleRangedAttackPiece(playerId: PlayerId, cmd: RangedAttackPieceCommand): Promise<void> {
        const validated = this._validateMovementSlot(playerId, cmd, "attackerId");
        if (!validated) return;
        const { slot, selected } = validated;
        const attacker: P = selected as P;
        const target: P | null = this.getPiece(cmd.targetId);
        if (!target || !attacker.canRangedAttackPiece(target)) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-target");
            return;
        }
        let attackHit: boolean = false;
        let targetKilled: boolean = false;
        const cascadeKilledIds: number[] = [];
        await this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, async () => {
            const succeeded: boolean = this.roll(
                attacker.stats.rangedCombat ?? 0,
                target.stats.defence ?? 0,
                (attacker.owner ?? undefined) as Player<P> | undefined,
            );
            this.pushOutcome({
                kind: "piece-ranged-attacked",
                attackerId: attacker.id,
                targetId: target.id,
                succeeded,
            });
            if (succeeded) {
                attackHit = true;
                // Snapshot alive pieces other than the target so we can
                // detect cascade kills after _cascadeKill returns.
                const aliveBeforeKill: number[] = this.pieces
                    .filter((p) => !p.dead && p !== (target as unknown as P))
                    .map((p) => p.id);
                await this._cascadeKill(target, "ranged");
                targetKilled = target.dead;
                // Collect any pieces that were alive before the kill but
                // are dead or destroyed now (null = removed by destroy()
                // for NoCorpse/Undead/illusion pieces).
                for (const id of aliveBeforeKill) {
                    const p = this.getPiece(id);
                    if (p === null || p.dead) {
                        cascadeKilledIds.push(id);
                    }
                }
            }
            attacker.setTurnFlags({ moved: true, attacked: true, rangedAttacked: true });
        });

        const payload: RangedAttackPieceBatchPayload = {
            attackerId: attacker.id,
            targetId: target.id,
            hit: attackHit,
            targetKilled,
            cascadeKilledIds: [...cascadeKilledIds],
        };
        this._boardEvents.emit(EngineEvent.RangedAttackPieceBatch, payload);

        slot.submit(playerId, cmd);
    }

    /**
     * Handle a `mount-piece` command. Validates phase + slot ownership,
     * that the mounting wizard is the currently selected piece, that the
     * named mount exists and is mountable by the wizard
     * (`canMountPiece`), and that the submitted path is legal and ends
     * on the mount's tile (or, for an empty path, that the wizard is
     * already on the mount's tile). Per the design call's Q3, "mount"
     * means "move into the mount's tile" - so the path's terminal step
     * IS the mount's position.
     *
     * On accept, walks the submitted path step-by-step inside a single
     * `recordEvent` broadcast. After every non-terminal step, runs an
     * engagement roll for each adjacent enemy that can engage; on
     * success, both pieces flip their `engaged` turn-flag, the mount is
     * forfeited, and the wizard's turn ends with `moved: true` only.
     * On the terminal step, the wizard's position is set to the mount's
     * tile, then `setMount` + `setRider` are paired (invariant 6), and
     * the wizard is flagged `moved: true, attacked: true` (a wizard
     * mounting consumes both phases) while the mount is flagged
     * `moved: true`.
     *
     * Submits the slot after a successful mount so the movement-phase
     * loop can advance to the next slot.
     */
    private async _handleMountPiece(playerId: PlayerId, cmd: MountPieceCommand): Promise<void> {
        const validated = this._validateMovementSlot(playerId, cmd, "wizardId");
        if (!validated) return;
        const { slot, selected } = validated;
        const wizard: P = selected as P;
        const mount: P | null = this.getPiece(cmd.mountId);
        if (!mount || !wizard.canMountPiece(mount)) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-target");
            return;
        }
        const path: Point[] = cmd.path.map((p) => new Point(p.x, p.y));
        if (path.length > 0) {
            if (!this.validatePath(wizard, path, { allowTerminalMount: true })) {
                this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
                return;
            }
            const terminal: Point = path[path.length - 1];
            if (terminal.x !== mount.position.x || terminal.y !== mount.position.y) {
                this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
                return;
            }
        } else if (
            wizard.position.x !== mount.position.x ||
            wizard.position.y !== mount.position.y
        ) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
            return;
        }
        let walked: Point[] = [];
        let engagedBy: P | null = null;
        await this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, () => {
            // Wizard mounting has no rider sync (the wizard becomes
            // the rider on arrival). Engagement on the terminal step
            // is also skipped: arriving on the mount's tile is the
            // mount action itself.
            const result = this._walkPathWithEngagement(wizard, path, false, true);
            walked = result.walked;
            engagedBy = result.engagedBy;
            if (engagedBy) {
                wizard.setTurnFlags({ moved: true });
                return;
            }
            wizard.setMount(mount);
            mount.setRider(wizard);
            wizard.setTurnFlags({ moved: true, attacked: true });
            mount.setTurnFlags({ moved: true });
        });

        // Payload carries the approach path so the client can animate
        // the wizard moving onto the mount before the mount visual fires.
        // engagedBy is not included: mount semantics handle terminal-step
        // engagement separately via skipEngagementOnTerminal=true.
        const payload: MountPieceBatchPayload = {
            wizardId: wizard.id,
            mountId: mount.id,
            path: walked.map((p) => ({ x: p.x, y: p.y })),
        };
        this._boardEvents.emit(EngineEvent.MountPieceBatch, payload);

        slot.submit(playerId, cmd);
    }

    /**
     * Handle a `dismount-piece` command. Validates phase + slot
     * ownership, that the dismounting wizard is the currently selected
     * piece, and that the wizard is currently mounted. The destination
     * tile must be adjacent to the mount (1 tile in any direction;
     * same-tile is rejected), in-bounds, and either empty or contain
     * another friendly mountable piece (chain-dismount).
     *
     * On accept, emits inside a single `recordEvent` broadcast (in
     * canonical order): a `piece-dismounted` outcome from the wizard's
     * `setMount(null)`, a `piece-moved` outcome from the wizard's
     * `setPosition` onto `cmd.to`, and - for chain-dismount - a
     * follow-up `piece-mounted` from the wizard's `setMount(chainMount)`
     * call. The previous mount is flagged `moved: true`, and the new
     * chain mount (if any) is flagged `moved: true`. The wizard ends
     * with `moved: true`.
     *
     * Submits the slot after a successful dismount.
     */
    private async _handleDismountPiece(playerId: PlayerId, cmd: DismountPieceCommand): Promise<void> {
        const validated = this._validateMovementSlot(playerId, cmd, "wizardId");
        if (!validated) return;
        const { slot, selected } = validated;
        const wizard: P = selected as P;
        const mount: P | null = wizard.currentMount as P | null;
        if (!mount) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-target");
            return;
        }
        const dx: number = Math.abs(cmd.to.x - mount.position.x);
        const dy: number = Math.abs(cmd.to.y - mount.position.y);
        if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
            return;
        }
        if (
            cmd.to.x < 0 ||
            cmd.to.y < 0 ||
            cmd.to.x >= this.width ||
            cmd.to.y >= this.height
        ) {
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
            return;
        }
        // Destination must be empty OR contain a friendly mountable.
        const blockers: P[] = this.getPiecesAtPosition(
            new Point(cmd.to.x, cmd.to.y),
            (p) => !p.dead,
        );
        let chainMount: P | null = null;
        for (const b of blockers) {
            if (b.owner === wizard.owner && wizard.canMountPiece(b)) {
                chainMount = b;
                continue;
            }
            this._emitCommandRejected(playerId, cmd.commandId, "invalid-move");
            return;
        }
        // Capture the mount id before the recordEvent mutation clears
        // wizard.currentMount via wizard.setMount(null).
        const mountSnapshot: P = mount;
        const toSnapshot: SimplePoint = { x: cmd.to.x, y: cmd.to.y };
        await this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, () => {
            wizard.setMount(null);
            mount.setRider(null);
            mount.setTurnFlags({ moved: true });
            wizard.setPosition(new Point(cmd.to.x, cmd.to.y));
            if (chainMount) {
                wizard.setMount(chainMount);
                chainMount.setRider(wizard);
                chainMount.setTurnFlags({ moved: true });
            }
            wizard.setTurnFlags({ moved: true });
        });
        const payload: DismountPieceBatchPayload = {
            wizardId: wizard.id,
            mountId: mountSnapshot.id,
            to: toSnapshot,
        };
        this._boardEvents.emit(EngineEvent.DismountPieceBatch, payload);
        slot.submit(playerId, cmd);
    }

    /**
     * Handle a `cancel-piece-action` command. Validates phase + slot
     * ownership and that the targeted piece is the currently selected
     * one. On accept, emits a single `piece-action-cancelled` outcome
     * carrying `action: "select"` (piece had not yet moved) or
     * `action: "move"` (piece had moved this turn). When the cancelled
     * action is `"move"`, the piece's turn is flagged over to prevent
     * it from re-acting.
     *
     * Does not submit the slot — the player can re-select another
     * piece in the same slot.
     */
    private async _handleCancelPieceAction(playerId: PlayerId, cmd: CancelPieceActionCommand): Promise<void> {
        const validated = this._validateMovementSlot(playerId, cmd, "pieceId");
        if (!validated) return;
        const piece: P = validated.selected as P;
        // Compute the action discriminator from the piece's current
        // turn-flag state. Today: a piece that has not moved is
        // "select"; one that has moved (or attacked / mounted, both of
        // which set moved: true via setTurnFlags) is "move". The
        // protocol allows finer-grained values ("attack",
        // "rangedAttack", "mount", "dismount") - the move / attack /
        // ranged / mount / dismount handlers (Tasks 7-8) may extend
        // this computation by reading other flags or a dedicated
        // last-action field. For Task 5 the two-state derivation is
        // sufficient because the upstream Rules.processCancel flow
        // that this replaces also only differentiated select vs move.
        const action: "select" | "move" = piece.moved ? "move" : "select";
        await this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, () => {
            this.pushOutcome({
                kind: "piece-action-cancelled",
                pieceId: piece.id,
                action,
            });
            if (action === "move") {
                piece.setTurnFlags({ turnOver: true });
                // Mirror the move/turnOver flags onto the rider so a
                // mounted unit's turn ends with its mount. Matches the
                // legacy Rules.processCancel fallback (rules.ts:653-656)
                // that this handler will replace once the dual-path
                // migration completes.
                if (piece.currentRider) {
                    piece.currentRider.setTurnFlags({
                        moved: true,
                        turnOver: true,
                    });
                }
            }
            this._selected = null;
        });
        const payload: CancelPieceActionVisualPayload = { pieceId: piece.id };
        this._boardEvents.emit(EngineEvent.CancelPieceActionVisual, payload);
    }

    /**
     * Handle an `end-piece-turn` command. Validates phase + slot
     * ownership and that the targeted piece is the currently selected
     * one. On accept, flags the piece's turn over, clears the
     * selection, and submits the slot so the movement-phase loop can
     * advance to the next slot.
     */
    private async _handleEndPieceTurn(playerId: PlayerId, cmd: EndPieceTurnCommand): Promise<void> {
        const validated = this._validateMovementSlot(playerId, cmd, "pieceId");
        if (!validated) return;
        const { slot, selected } = validated;
        const piece: P = selected as P;
        await this.recordEvent({ commandId: cmd.commandId, actorId: playerId }, () => {
            piece.setTurnFlags({ turnOver: true });
            this._selected = null;
        });
        slot.submit(playerId, cmd);
    }

    /**
     * Handle an `end-movement-phase` command. Validates phase + slot
     * ownership. On accept, sets the `_movementPhaseEnded` flag for
     * the movement-phase slot loop, clears any selection, and submits
     * the slot so the loop can advance.
     */
    private async _handleEndMovementPhase(playerId: PlayerId, cmd: EndMovementPhaseCommand): Promise<void> {
        const validated = this._validateMovementSlot(playerId, cmd, null);
        if (!validated) return;
        const { slot } = validated;
        this._movementPhaseEnded = true;
        this._selected = null;
        slot.submit(playerId, cmd);
    }

    /* ── Phase loop ──────────────────────────────────────────────── */

    /**
     * Top-level command-pipeline phase loop. Drives the FSM forward
     * from the initial idle state through the spellbook phase and into
     * the casting setup. The casting phase loop is wired in Task 12 of
     * the command-intake-pipeline plan.
     */
    private async _runGameFlow(): Promise<void> {
        const pm = this._stateManager;

        if (pm.isActive(pm.states.idle)) {
            pm.evaluate(new StartGame());
        }

        if (pm.isActive(pm.states.spellbook)) {
            const anySpellsAvailable = this.players.some((p) => !p.defeated && p.spells.length > 0);
            if (!anySpellsAvailable) {
                pm.evaluate(new SkipSpellbook());
                pm.evaluate(new MovingReady());
                return;
            }
            pm.evaluate(new SpellbookReady());
            await this._runSpellbookPhase();

            const anySpellSelected = this.players.some((p) => !p.defeated && p.selectedSpell);
            if (anySpellSelected) {
                pm.evaluate(new SpellsDone());
                pm.evaluate(new CastingReady());
            } else {
                pm.evaluate(new NoSpellsCast());
            }
        }

        if (pm.isActive(pm.states.casting)) {
            await this._runCastingPhase();
            pm.evaluate(new CastingDone());
        }

        if (pm.isActive(pm.states.spreading)) {
            await this.rules.doSpread(this);
            await this.rules.doExpire(this);
            pm.evaluate(new SpreadingDone());
            pm.evaluate(new MovingReady());
        }

        if (this._autoRunPhaseLoop && pm.isActive(pm.states.moving)) {
            await this._runMovementPhase();
            pm.evaluate(new MovingDone());
        }
    }

    /**
     * Emit a phase-changed broadcast outcome AND forward it onto the
     * engine event bus as `EngineEvent.PhaseChanged`. Pre-startGame
     * transitions (head < 1) are silently skipped.
     *
     * @param phase           the new phase
     * @param currentPlayerId the player whose slot is now open, or
     *                        undefined for simultaneous (barrier) phases
     */
    private _emitPhaseChanged(phase: BoardPhase, currentPlayerId?: PlayerId): void {
        const phaseKind: PhaseKind = toPhaseKind(phase);
        // turnNumber will be wired in a future spec; hardcoded for now.
        const turnNumber: number = 0;
        const outcome = {
            kind: "phase-changed" as const,
            phase: phaseKind,
            turnNumber,
            ...(currentPlayerId === undefined ? {} : { currentPlayerId }),
        };
        // Broadcast log emission is gated on the game having officially
        // started (sequence-1 game-started already recorded). Scenarios
        // that resume mid-game bypass startGame, so head can stay at 0.
        if (this._eventLog.head() >= 1) {
            // Fire-and-forget; phase transitions run synchronously from
            // the FSM listener and the phase loops, neither of which
            // await the recorded event.
            void this.recordEvent({}, () => {
                this.pushOutcome(outcome);
            });
        }
        // Always forward to the engine event bus so listeners (notably
        // ComputerWizard._onPhaseChanged) react regardless of whether
        // the broadcast log has been bootstrapped. Without this,
        // scenario loads (which call resumeGame instead of startGame)
        // would never trigger AI dispatch and openSpellbookSlot /
        // runCastingForPlayer would hang on slot.untilAccepted.
        this._boardEvents.emit(EngineEvent.PhaseChanged, outcome);
    }

    /**
     * Run the casting phase serially in turn order. For each player
     * with a selected spell, opens an ExpectedCommand slot accepting
     * `cast-spell` or `cancel-cast` and re-opens fresh slots while
     * the spell still has casts remaining (multi-cast). The loop
     * exits for the current caster when the spell is exhausted, the
     * player cancels, or the player is defeated mid-phase.
     */
    private async _runCastingPhase(): Promise<void> {
        const casters = this.players.filter((p) => !p.defeated && p.selectedSpell != null).map((p) => p.id);

        for (const playerId of casters) {
            const player = this.getPlayer(playerId);
            if (!player?.selectedSpell || player.defeated) {
                // The player may have been defeated mid-phase, either by a
                // prior caster's attack spell (player.defeated) or had
                // their selectedSpell cleared by a cascade death
                // (selectedSpell null).
                continue;
            }

            this._spellRevealedSpellIds.delete(player.selectedSpell.id);
            this._currentCastingPlayerId = playerId;

            // Multi-cast loop: keep opening fresh slots until either
            // the spell is exhausted or the player cancels.
            while (player.selectedSpell != null && player.selectedSpell.castTimes > 0) {
                console.debug(`[Board] Opening casting slot for player ${playerId}`);
                const slot = new ExpectedCommand(playerId, ["cast-spell", "cancel-cast"]);
                this._expectedCommand = slot;
                this._emitPhaseChanged(BoardPhase.Casting, playerId);
                try {
                    await slot.untilAccepted();
                } finally {
                    this._expectedCommand = null;
                }
                // If the accepted command was cancel-cast, the
                // player's selectedSpell is now null and the loop
                // exits. Otherwise we may have another cast to issue.
            }

            this._currentCastingPlayerId = null;
            this._spellRevealedSpellIds.clear();
        }
    }

    /**
     * Run the spellbook phase. Picks barrier mode when any player is
     * remote AND `phaseTimeoutMs > 0`; otherwise runs serially in
     * roster order, opening one ExpectedCommand slot per alive player.
     *
     * On barrier-driven timeout, synthesises end-spell-pick outcomes
     * for any player who failed to submit, with `timedOut: true`.
     */
    private async _runSpellbookPhase(): Promise<void> {
        const alive = this.players.filter((p) => !p.defeated);
        if (alive.length === 0) {
            return;
        }

        const timeout = this._phaseTimeoutMs;
        const useBarrier = timeout != null && timeout > 0 && this.players.some((p) => p.isRemote);

        if (useBarrier) {
            console.debug(
                `[Board] Opening spellbook barrier for players ${alive
                    .map((p) => p.id)
                    .join(", ")}`,
            );
            const barrier = new SpellbookBarrier(
                alive.map((p) => p.id),
                timeout,
                this._setTimeout,
                this._clearTimeout,
            );
            this._spellbookBarrier = barrier;
            // Barrier mode runs all picks simultaneously, so phase-changed
            // is emitted once with no current player.
            this._emitPhaseChanged(BoardPhase.Spellbook);
            try {
                await barrier.untilComplete();
                for (const r of barrier.results()) {
                    if (r.timedOut) {
                        this._recordPlayerEndedSpellPick(r.playerId, r.command.commandId, true);
                    }
                }
            } finally {
                this._spellbookBarrier = null;
            }
            return;
        }

        for (const player of alive) {
            console.debug(`[Board] Opening spellbook slot for player ${player.id}`);
            const slot = new ExpectedCommand(player.id, ["pick-spell", "end-spell-pick"]);
            this._expectedCommand = slot;
            this._emitPhaseChanged(BoardPhase.Spellbook, player.id);
            try {
                await slot.untilAccepted();
            } finally {
                this._expectedCommand = null;
            }
        }
    }

    /**
     * Open a single spellbook slot for the given player, emit a
     * phase-changed outcome that the AI listener fires off, and resolve
     * once the slot accepts a `pick-spell` or `end-spell-pick` command.
     *
     * Used by the legacy `nextPlayer()` flow to drive AI spellbook turns
     * through the command pipeline without enabling the full
     * `_runGameFlow` (which would race the legacy per-player loop).
     */
    async openSpellbookSlot(playerId: PlayerId): Promise<void> {
        console.debug(`[Board] Opening spellbook slot for player ${playerId}`);
        const slot = new ExpectedCommand(playerId, ["pick-spell", "end-spell-pick"]);
        this._expectedCommand = slot;
        this._emitPhaseChanged(BoardPhase.Spellbook, playerId);
        try {
            await slot.untilAccepted();
        } finally {
            this._expectedCommand = null;
        }
    }

    /**
     * Run the multi-cast slot loop for a single casting player. Opens a
     * fresh `ExpectedCommand` slot accepting `cast-spell` or
     * `cancel-cast` and re-opens new slots while the player's selected
     * spell still has casts remaining. Same shape as `_runCastingPhase`
     * but scoped to one player so the legacy `nextPlayer()` flow can
     * drive AI casting turns through the command pipeline.
     */
    async runCastingForPlayer(playerId: PlayerId): Promise<void> {
        const player = this.getPlayer(playerId);
        if (!player?.selectedSpell) {
            return;
        }

        this._spellRevealedSpellIds.delete(player.selectedSpell.id);
        this._currentCastingPlayerId = playerId;

        try {
            while (player.selectedSpell != null && player.selectedSpell.castTimes > 0) {
                console.debug(`[Board] Opening casting slot for player ${playerId}`);
                const slot = new ExpectedCommand(playerId, ["cast-spell", "cancel-cast"]);
                this._expectedCommand = slot;
                this._emitPhaseChanged(BoardPhase.Casting, playerId);
                try {
                    await slot.untilAccepted();
                } finally {
                    this._expectedCommand = null;
                }
            }
        } finally {
            this._currentCastingPlayerId = null;
            this._spellRevealedSpellIds.clear();
        }
    }

    /**
     * Open a movement-phase slot for the given player. Re-opens fresh
     * slots after each accepted command until either the player has no
     * remaining selectable pieces or `end-movement-phase` was accepted.
     *
     * Used by the legacy `nextPlayer()` flow to drive AI movement turns
     * through the command pipeline without enabling the full
     * `_runGameFlow`. Mirrors `openSpellbookSlot` /
     * `runCastingForPlayer`.
     */
    async openMovementSlotFor(playerId: PlayerId): Promise<void> {
        this._movementPhaseEnded = false;
        try {
            while (
                !this._movementPhaseEnded &&
                this._hasSelectablePieces(playerId)
            ) {
                console.debug(`[Board] Opening movement slot for player ${playerId}`);
                const slot = new ExpectedCommand(playerId, [
                    "select-piece",
                    "move-piece",
                    "attack-piece",
                    "ranged-attack-piece",
                    "mount-piece",
                    "dismount-piece",
                    "cancel-piece-action",
                    "end-piece-turn",
                    "end-movement-phase",
                ]);
                this._expectedCommand = slot;
                this._emitPhaseChanged(BoardPhase.Moving, playerId);
                try {
                    await slot.untilAccepted();
                } finally {
                    this._expectedCommand = null;
                }
            }
        } finally {
            this._movementPhaseEnded = false;
        }
    }

    /**
     * The full-phase movement loop (slot-loop variant). Iterates alive
     * players in roster order and runs a per-player movement slot loop
     * for each. Gated behind `BoardDeps.autoRunPhaseLoop` until the
     * legacy `nextPlayer()` movement path is removed in a later task.
     */
    private async _runMovementPhase(): Promise<void> {
        for (const player of this.players.filter((p) => !p.defeated)) {
            this._currentPlayer = player;
            // Reset per-turn action flags for every living piece owned by
            // this player. Must run synchronously (inside recordEvent but
            // before openMovementSlotFor) so the flags are cleared before
            // the AI's first command dispatch fires in the slot loop.
            await this.recordEvent({}, () => {
                for (const piece of this.getPiecesByOwner(player)) {
                    if (!piece.dead) {
                        piece.setTurnFlags({
                            moved: false,
                            attacked: false,
                            rangedAttacked: false,
                            engaged: false,
                            turnOver: false,
                        });
                    }
                }
            });
            await this.openMovementSlotFor(player.id);
            this._currentPlayer = null;
        }
    }

    /**
     * Whether `playerId` has at least one piece eligible for selection
     * during the current movement phase.
     */
    private _hasSelectablePieces(playerId: PlayerId): boolean {
        const player = this.getPlayer(playerId);
        if (!player) return false;
        return this.getPiecesByOwner(player).some(
            (p) => !p.dead && p.canSelect && !p.turnOver,
        );
    }

    /**
     * Wall-clock reading used for `elapsedMs` on events. Reads from
     * `BoardDeps.now`, defaulting to `Date.now`.
     */
    now(): number {
        return this._now();
    }

    /**
     * Milliseconds since `Board.startGame()` was called, or 0 if the
     * game has not yet started.
     */
    get gameStartMs(): number {
        return this._gameStartMs;
    }

    /**
     * The configured spellbook barrier timeout in milliseconds, or null
     * when barrier mode is disabled.
     */
    get phaseTimeoutMs(): number | null {
        return this._phaseTimeoutMs;
    }

    get cursorPosition(): Point {
        return this._cursorPosition;
    }

    set cursorPosition(point: Point) {
        this._cursorPosition = point;
    }

    /* ── Geometry / queries ───────────────────────── */

    getAdjacentPoints(point: Point, includeCentre?: boolean): Point[] {
        const points: Point[] = [];

        for (let x: number = point.x - 1; x <= point.x + 1; x++) {
            for (let y: number = point.y - 1; y <= point.y + 1; y++) {
                if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
                    if (!includeCentre && x === point.x && y === point.y) {
                        continue;
                    }
                    points.push(new Point(x, y));
                }
            }
        }

        return points;
    }

    getPointsInRange(point: Point, range: number, includeCentre?: boolean, rangeType?: RangeType): Point[] {
        const points: Point[] = [];
        for (let x: number = point.x - range; x <= point.x + range; x++) {
            for (let y: number = point.y - range; y <= point.y + range; y++) {
                if (
                    x >= 0 &&
                    y >= 0 &&
                    x < this.width &&
                    y < this.height &&
                    Board.distance(point, new Point(x, y), rangeType) <= range + (rangeType === RangeType.Fly ? 0.5 : 0)
                ) {
                    if (!includeCentre && x === point.x && y === point.y) {
                        continue;
                    }
                    points.push(new Point(x, y));
                }
            }
        }
        return points;
    }

    getAdjacentPiecesAtPosition(point: Point, filter?: (piece: P) => boolean, includeCentre?: boolean): P[] {
        const neighbours: Set<P> = new Set();
        const position: Point = Point.clone(point);
        for (const direction of Board.NEIGHBOUR_DIRECTIONS) {
            const directionNeighbours: P[] = this.getPiecesAtPosition(
                new Point(position.x + direction.x, position.y + direction.y),
                filter,
            );
            if (directionNeighbours) {
                directionNeighbours.forEach((piece) => neighbours.add(piece));
            }
        }
        if (includeCentre) {
            const centreNeighbours: P[] = this.getPiecesAtPosition(position, filter);
            if (centreNeighbours) {
                centreNeighbours.forEach((piece) => neighbours.add(piece));
            }
        }
        return Array.from(neighbours);
    }

    getPiecesAtPosition(point: Point, filter?: (piece: P) => boolean): P[] {
        return Array.from(
            this.pieces.filter((piece: P) => {
                return Point.equals(piece.position, point) && (filter ? filter(piece) : true);
            }),
        );
    }

    isBlocker(point: Point): boolean {
        const pieces: P[] = this.getPiecesAtPosition(point, (piece) => {
            return !piece.hasStatus(UnitStatus.Transparent) && !piece.dead;
        });
        if (!pieces?.length) {
            return false;
        }
        return true;
    }

    hasLineOfSight(startPosition: Point, endPosition: Point): boolean {
        let xDiff: number = endPosition.x - startPosition.x;
        let yDiff: number = endPosition.y - startPosition.y;

        let xDir: number, yDir: number;
        let xVal: number, yVal: number;
        let numChecks: number;

        xDir = xDiff < 0 ? -1 : 1;
        yDir = yDiff < 0 ? -1 : 1;

        if (xDiff === 0 || yDiff === 0) {
            if (yDiff === 0) {
                for (let a = 1; a < Math.abs(xDiff); a++) {
                    xVal = a * xDir + startPosition.x;
                    if (this.isBlocker(new Point(xVal, startPosition.y))) {
                        return false;
                    }
                }
            } else {
                for (let a = 1; a < Math.abs(yDiff); a++) {
                    yVal = a * yDir + startPosition.y;
                    if (this.isBlocker(new Point(startPosition.x, yVal))) {
                        return false;
                    }
                }
            }
        } else {
            numChecks = Math.max(Math.abs(xDiff), Math.abs(yDiff));
            let yInc = yDiff / numChecks,
                xInc = xDiff / numChecks;

            for (let a = 1; a < numChecks; a++) {
                xVal = startPosition.x + Math.round(xInc * a);
                yVal = startPosition.y + Math.round(yInc * a);
                if (this.isBlocker(new Point(xVal, yVal))) {
                    return false;
                }
            }
        }

        return true;
    }

    /* ── Distance / coordinate calculations ──────── */

    static distance(startPosition: Point, endPosition: Point, rangeType: RangeType = RangeType.Fly): number {
        if (Point.equals(startPosition, endPosition)) {
            return 0;
        }
        const difference: Point = new Point(
            Math.abs(startPosition.x - endPosition.x),
            Math.abs(startPosition.y - endPosition.y),
        );

        if (rangeType === RangeType.Foot) {
            return Math.max(difference.x, difference.y);
        }

        return (
            Math.max(difference.x, difference.y) -
            Math.min(difference.x, difference.y) +
            Math.min(difference.x, difference.y) * 1.5
        );
    }

    static toIsometric(point: Point): Point {
        return new Point(point.x - point.y, (point.x + point.y) / 2);
    }

    static fromIsometric(point: Point): Point {
        return new Point(point.x + point.y / 2, point.y - point.x / 2);
    }

    /* ── Piece actions ───────────────────────────── */

    /**
     * Add a piece to the board.
     */
    async addPiece(config: PieceConfig): Promise<P> {
        const piece: Piece = new Piece(this, this._idCounter++, config);
        this._pieces.set(piece.id, piece as P);
        this.emitBoardUpdateEvent();
        return piece as P;
    }

    /**
     * Add a wizard piece to the board.
     */
    async addWizard(config: WizardConfig): Promise<P> {
        const wizard: Wizard = new Wizard(this, this._idCounter++, config);
        this._pieces.set(wizard.id, wizard as unknown as P);
        this.emitBoardUpdateEvent();
        return wizard as unknown as P;
    }

    /**
     * Create and place wizards for all players at
     * game start.
     */
    createWizards(): void {
        if (
            this.state === BoardState.GameOver ||
            this.state !== BoardState.Idle ||
            this.phase !== BoardPhase.Idle ||
            this.pieces.some((piece: P) => piece.hasStatus(UnitStatus.Wizard))
        ) {
            throw new Error("Cannot create wizards - game not in initialising state");
        }
        Wizard.createAll(this, this.players);
    }

    /**
     * Internal piece-selection helper used by movement-phase command
     * handlers and the legacy `Rules.processCancel` cancel path. Sets
     * `_selected` and emits `BoardEvent.PieceSelected`. The public
     * `selectPiece` wrapper below is kept until the legacy cancel path
     * is migrated to the command pipeline.
     */
    private _selectPieceInternal(id: number): void {
        if (!id || this._state === BoardState.GameOver) {
            return;
        }
        const piece: P | null = this.getPiece(id);
        if (!piece) {
            throw new Error(`No piece with ID ${id} found to select`);
        }
        this._selected = piece;
        this._boardEvents.emit(BoardEvent.PieceSelected, this._selected);
    }

    /**
     * Internal piece-deselection helper used by movement-phase command
     * handlers and the legacy `Rules.processCancel` cancel path.
     */
    private _deselectPieceInternal(): void {
        this._selected = null;
    }

    /**
     * Legacy public wrapper around `_selectPieceInternal`. Retained for
     * the cancel path in `Rules.processCancel` and the client UI flows
     * (cursor / client piece) until those are ported to the command
     * pipeline. New code must dispatch a `select-piece` command via
     * `Board.handleCommand`.
     */
    async selectPiece(id: number): Promise<void> {
        this._selectPieceInternal(id);
    }

    /**
     * Legacy public wrapper around `_deselectPieceInternal`. See the
     * note on `selectPiece`.
     */
    async deselectPiece(): Promise<void> {
        this._deselectPieceInternal();
    }

    /**
     * Find the player's wizard piece and select it.
     *
     * @returns The wizard piece, or null if not found.
     */
    async selectWizard(player: Player<P>): Promise<P | null> {
        if (!player || this._state === BoardState.GameOver) {
            return null;
        }
        const ownedPieces: P[] = this.getPiecesByOwner(player);
        for (const piece of ownedPieces) {
            if (piece.hasStatus(UnitStatus.Wizard)) {
                this._selectPieceInternal(piece.id);
                return piece;
            }
        }
        return null;
    }

    /* ── Game flow ───────────────────────────────── */

    /**
     * Roll an attack vs defence check.
     */
    roll(attack: number, defence: number, attackingPlayer?: Player<P>): boolean {
        if (attackingPlayer?.forceHit != null) {
            return attackingPlayer.forceHit;
        }
        const cheatForceHit = (this.constructor as unknown as { CHEAT_FORCE_HIT: boolean | null }).CHEAT_FORCE_HIT;
        if (cheatForceHit !== null) {
            return cheatForceHit;
        }
        const attackRoll: number = this._rng.between(0, 10 + attack);
        const defenceRoll: number = this._rng.between(0, 10 + defence);
        console.debug(
            `Rolled ${attackRoll} vs ${defenceRoll}; attack ${attackRoll > defenceRoll ? "succeeds" : "fails"}`,
        );
        return attackRoll > defenceRoll;
    }

    /**
     * Roll a chance check for spell casting.
     */
    rollChance(attack: number, castingPlayer?: Player<P>): boolean {
        if (castingPlayer?.forceCast != null) {
            return castingPlayer.forceCast;
        }
        const cheatForceCast = (this.constructor as unknown as { CHEAT_FORCE_CAST: boolean | null }).CHEAT_FORCE_CAST;
        if (cheatForceCast !== null) {
            return cheatForceCast;
        }
        const defenceRoll: number = this._rng.frac();
        if (attack < 0 || attack > 1) {
            console.warn(`Chance value ${attack} is out of bounds, clamping to 0-1`);
            attack = Math.max(0, Math.min(1, attack));
        }
        console.debug(`Rolled ${attack} vs ${defenceRoll}; chance ${attack > defenceRoll ? "succeeds" : "fails"}`);
        return attack > defenceRoll;
    }

    /**
     * Check for win conditions. If fewer than 2
     * players remain undefeated, the game is over.
     */
    async checkWinCondition(): Promise<boolean> {
        if (this.state === BoardState.GameOver) {
            return true;
        }
        const undefeated: Player<P>[] = this.players.filter((player) => !player.defeated);
        if (undefeated?.length < 2) {
            this.state = BoardState.GameOver;
            this.stateManager.evaluate(new GameEnd());
            if (undefeated.length === 1) {
                this._logger.log(`Game over! ${undefeated[0].name} wins!`, Colour.Yellow);
            } else if (undefeated.length < 1) {
                this._logger.log(`Game over! Everybody's dead Dave.`, Colour.Yellow);
            }
            await this.delay(2000);
            this.emitUIEvent(EventType.GameOver, true);
            this._boardEvents.emit(BoardEvent.GameOver);
            return true;
        }
        return false;
    }

    /**
     * End the game immediately.
     */
    endGame(message?: string): void {
        if (this.state === BoardState.GameOver) {
            return;
        }
        this.state = BoardState.GameOver;
        this.stateManager.evaluate(new GameEnd());
        if (message) {
            this._logger.log(message, Colour.Yellow);
        }
        this.emitUIEvent(EventType.GameOver, true);
        this._boardEvents.emit(BoardEvent.GameOver);
    }

    /**
     * Get a random empty space on the board.
     */
    getRandomEmptySpace(): Point {
        const occupiedSpaces: Set<string> = new Set();
        this.pieces
            .filter((piece: P) => !piece.dead)
            .forEach((piece: P) => {
                occupiedSpaces.add(`${piece.position.x},${piece.position.y}`);
            });

        const emptySpaces: Point[] = [];
        for (let x: number = 0; x < this.width; x++) {
            for (let y: number = 0; y < this.height; y++) {
                const key: string = `${x},${y}`;
                if (!occupiedSpaces.has(key)) {
                    emptySpaces.push(new Point(x, y));
                }
            }
        }
        if (emptySpaces.length === 0) {
            console.warn("No empty spaces available on the board!");
            return null;
        }
        return this._rng.pick(emptySpaces);
    }

    /**
     * Delay hook. In the engine this resolves on the next event-loop
     * tick (0 ms) so game-logic tests run instantly.
     * The client Board overrides this with real timing.
     *
     * @param _time Ignored in the engine; forwarded to the client override.
     */
    async delay(_time?: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, 0));
    }

    /**
     * Briefly enter an idle state then restore.
     * Calls `this.delay()` so the client override is used automatically.
     *
     * @param _time Ignored in the engine; forwarded to the client override.
     */
    async idleDelay(_time?: number): Promise<void> {
        const oldState: BoardState = this.state;
        this.state = BoardState.Idle;
        await this.delay(_time);
        this.state = oldState;
    }

    /* ── Events (overridable) ────────────────────── */

    /**
     * Emit a board update event. Override in client
     * to debounce and send to Phaser scene events.
     */
    emitBoardUpdateEvent(): void {
        // no-op in engine; client overrides
    }

    /**
     * Emit a UI event. Override in client to dispatch
     * via Phaser scene events.
     */
    emitUIEvent(_eventType: EventType, _data: any): void {
        // no-op in engine; client overrides
    }

    /**
     * Deselect the current player.
     */
    deselectPlayer(): void {
        this.currentPlayer = null;
        this._selected = null;
        this.emitUIEvent(EventType.EndTurnAvailable, false);
    }

    /**
     * Set the current player by ID.
     *
     * @param playerId The ID of the player to select.
     */
    async selectPlayer(playerId: number): Promise<void> {
        this._currentPlayer = this.getPlayer(playerId);
    }

    /**
     * Start a new turn on the board. This advances the FSM phase
     * and resets piece state as appropriate.
     *
     * @returns A promise that resolves when the new turn has been
     *     fully processed.
     */
    async newTurn(): Promise<void> {
        this._selected = null;

        if (this.state === BoardState.GameOver) {
            return;
        }

        const pm = this._stateManager;

        if (pm.isActive(pm.states.idle) || pm.isActive(pm.states.moving)) {
            // First call: transition FSM from idle into playing
            if (pm.isActive(pm.states.idle)) {
                pm.evaluate(new StartGame());
            } else {
                // End of moving phase → new turn cycle
                pm.evaluate(new MovingDone());
            }

            this.pieces.forEach((piece) => {
                piece.reset();
            });
            this._logger.log(`New turn`, Colour.Green);
            this._boardEvents.emit(BoardEvent.NewTurn);
            const accumulated: number = this._alignment.valueAccumulated;
            if (accumulated !== 0) {
                const magnitude: number = Math.abs(accumulated);
                this._logger.log(
                    `Universe balance shifts towards ${
                        accumulated < 0 ? "chaos" : "law"
                    } by ${magnitude} point${magnitude === 1 ? "" : "s"}`,
                    accumulated < 0 ? Colour.Magenta : Colour.Cyan,
                );
                this._alignment.resetAccumulated();
                await this.idleDelay();
            }
            const anySpellsLeft = this.players.some((p) => !p.defeated && p.spells.length > 0);
            if (anySpellsLeft) {
                pm.evaluate(new SpellbookReady());
                await this.idleDelay();
            } else {
                this._logger.log(`No spells to cast, skipping to movement`, Colour.Green);
                pm.evaluate(new SkipSpellbook());
                pm.evaluate(new MovingReady());
                await this.idleDelay();
            }
        } else if (pm.isActive(pm.states.spellbook)) {
            // Skip casting phase if no player selected a spell
            const anySpellSelected = this.players.some((p) => !p.defeated && p.selectedSpell);
            if (anySpellSelected) {
                pm.evaluate(new SpellsDone());
                pm.evaluate(new CastingReady());
                await this.idleDelay();
            } else {
                this._logger.log(`No spells to cast, skipping to movement`, Colour.Green);
                pm.evaluate(new NoSpellsCast());

                const previousPlayer = this.currentPlayer;
                this.currentPlayer = null;

                await this.rules.doSpread(this);
                await this.rules.doExpire(this);

                this.currentPlayer = previousPlayer;
                this.emitBoardUpdateEvent();
            }
        } else if (pm.isActive(pm.states.casting)) {
            pm.evaluate(new CastingDone());

            const previousPlayer = this.currentPlayer;
            this.currentPlayer = null;

            await this.rules.doSpread(this);
            await this.rules.doExpire(this);

            this.currentPlayer = previousPlayer;
            this.emitBoardUpdateEvent();
        } else if (pm.isActive(pm.states.spreading)) {
            pm.evaluate(new SpreadingDone());
            pm.evaluate(new MovingReady());
            await this.idleDelay();
        }
        this.emitBoardUpdateEvent();
    }

    /**
     * Advance to the next player's turn. Loops until a human
     * player's turn is ready (remote and AI players are handled
     * inline; spellbook UI is left to the client override).
     *
     * @returns A promise that resolves when the next human
     *     player's turn starts, or when the game is over.
     */
    async nextPlayer(): Promise<void> {
        this.emitBoardUpdateEvent();
        while (true) {
            if (this.state === BoardState.GameOver || (await this.checkWinCondition())) {
                return;
            }

            this._currentPlayerIndex = (this._currentPlayerIndex + 1) % this._players.size;
            this.deselectPlayer();

            if (this._currentPlayerIndex === 0) {
                await this.newTurn();
            }

            // Skip defeated players before selecting them
            const playerId = Array.from(this._players.keys())[this._currentPlayerIndex];
            if (this.getPlayer(playerId)?.defeated) {
                continue;
            }

            await this.selectPlayer(playerId);

            // Handle spellbook phase
            if (this.phase === BoardPhase.Spellbook) {
                if (this.currentPlayer?.remote) {
                    // Drive the AI's spellbook turn through the command
                    // pipeline by opening a single per-player slot and
                    // emitting phase-changed; ComputerWizard's listener
                    // dispatches a pick-spell or end-spell-pick command
                    // that fills the slot.
                    await this.openSpellbookSlot(this.currentPlayer.id);
                    continue;
                } else if (this.currentPlayer?.spells?.length) {
                    // Return to allow the client override to
                    // open the spellbook UI.
                    return;
                }
            }

            // Skip if no spells available in spellbook phase
            if (this.phase === BoardPhase.Spellbook) {
                if (this.currentPlayer?.spells.length === 0) {
                    continue;
                }
            }

            // Handle casting phase
            if (this.phase === BoardPhase.Casting) {
                await this.selectWizard(this.currentPlayer);

                if (this.selected) {
                    const spell = this.currentPlayer?.selectedSpell;
                    if (spell?.properties?.autoPlace) {
                        this._stateManager.evaluate(new SpellTargeting());
                        await this.rules.doAutoCastSpell(this);
                        this.emitBoardUpdateEvent();
                        continue;
                    } else if (spell?.range === 0) {
                        this._stateManager.evaluate(new SpellTargeting());
                        await this.rules.doCastSpell(this, this.currentPlayer.castingPiece);
                        this.emitBoardUpdateEvent();
                        continue;
                    } else if (spell?.range > 0) {
                        this._stateManager.evaluate(new SpellTargeting());
                        this._boardEvents.emit(EngineEvent.ShowCastRange, {
                            position: this.selected.position,
                            range: spell.range,
                            lineOfSight: spell.lineOfSight,
                        });
                        if (this.currentPlayer?.remote) {
                            // Drive the AI's casting turn through the
                            // command pipeline by running the multi-cast
                            // slot loop; ComputerWizard's listener
                            // dispatches one cast-spell or cancel-cast
                            // command per slot opening.
                            await this.runCastingForPlayer(this.currentPlayer.id);
                            this.emitBoardUpdateEvent();
                            continue;
                        }
                    } else if (spell?.range === -1) {
                        if (this.currentPlayer?.remote) {
                            await this.runCastingForPlayer(this.currentPlayer.id);
                            this.emitBoardUpdateEvent();
                            continue;
                        }
                    }
                }

                // Skip if no spell selected in casting phase
                if (!this.currentPlayer?.selectedSpell) {
                    continue;
                }
            }

            // Exit loop - player's turn is ready
            break;
        }
    }
}
