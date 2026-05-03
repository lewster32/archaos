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
    SpellTarget,
} from "./protocol";
import { buildSnapshot, toPhaseKind } from "./snapshotbuilder";
import { ExpectedCommand } from "./commands/expectedcommand";
import { SpellbookBarrier } from "./commands/spellbookbarrier";

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
            deps?.clearTimeout ??
            ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
        this._phaseTimeoutMs = deps?.phaseTimeoutMs ?? null;
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
            // has started (head >= 1). Pre-startGame transitions are silently
            // skipped. We use void because phase transitions are
            // fire-and-forget; we don't await inside this synchronous handler.
            if (this._eventLog.head() >= 1) {
                const phaseKind: PhaseKind = toPhaseKind(newPhase);
                const currentPlayerId: PlayerId | null = this._currentPlayer?.id ?? null;
                // turnNumber will be wired in a future spec; hardcoded for now.
                const turnNumber: number = 0;
                void this.recordEvent({}, () => {
                    this.pushOutcome({
                        kind: "phase-changed",
                        phase: phaseKind,
                        turnNumber,
                        ...(currentPlayerId === null ? {} : { currentPlayerId }),
                    });
                });
            }
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
    addPlayer(
        config: PlayerConfig,
        remote?: RemotePlayer | null,
        isRemote?: boolean,
    ): Player<P> {
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
            await callback();
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
        return await this.recordEvent({}, () => {
            const snapshot = buildSnapshot(this, firstPlayer.id);
            this.pushOutcome({
                kind: "game-started",
                scenario: snapshot.state.scenario,
                players: snapshot.state.players,
                initialPieces: snapshot.state.pieces,
            });
        });
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
     * Public entry point for every player command. Validates phase /
     * slot / barrier / dedup, then dispatches to the per-kind handler.
     * Token validation is a transport-layer concern and is not done
     * here — callers must pass an authenticated `playerId`.
     *
     * @param playerId  The authenticated sender.
     * @param cmd       The command message; must already be wire-safe.
     */
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
            default:
                this._emitCommandRejected(playerId, cmd.commandId, "wrong-phase");
                return;
        }
    }

    /**
     * Record a `command-rejected` private event. For now this writes to
     * a test-only buffer; concrete transport wiring lands in a later
     * spec.
     */
    private _emitCommandRejected(
        playerId: PlayerId,
        commandId: CommandId,
        reason: RejectionReason,
    ): void {
        this._rejectedCommandsForTests.push({ playerId, commandId, reason });
    }

    /**
     * Validate a pick-spell or end-spell-pick command against the open
     * spellbook slot/barrier. Returns null if the command is acceptable;
     * otherwise returns the rejection reason.
     */
    private _checkSpellbookSubmission(
        playerId: PlayerId,
        cmd: PickSpellCommand | EndSpellPickCommand,
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
    }

    /** Real recordEvent + pushOutcome wiring for an accepted skip. */
    private _recordPlayerEndedSpellPick(
        playerId: PlayerId,
        commandId: CommandId,
        timedOut: boolean,
    ): void {
        void this.recordEvent({ commandId, actorId: playerId }, () => {
            const outcome: Outcome = timedOut
                ? { kind: "player-ended-spell-pick", playerId, timedOut: true }
                : { kind: "player-ended-spell-pick", playerId };
            this.pushOutcome(outcome);
        });
    }

    /**
     * Resolve the protocol-level {@link SpellTarget} into the engine
     * Point or Piece form expected by `Spell.getValidTarget` / `cast`.
     * Returns null when the referenced piece does not exist or the
     * envelope is malformed.
     */
    private _resolveCastTarget(
        player: Player<P>,
        target: SpellTarget,
    ): Point | P | null {
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
        //    spell-cast-attempted, then delegate to the existing
        //    Spell.cast pipeline. Outcomes are buffered onto a
        //    test-only field; broadcast-event emission is wired up
        //    when the casting phase loop is rewritten.
        if (!this._spellRevealedSpellIds.has(spell.id)) {
            this._spellRevealedSpellIds.add(spell.id);
            this._castOutcomesForTests.push({ kind: "spell-revealed", playerId });
        }
        this._castOutcomesForTests.push({
            kind: "spell-cast-attempted",
            playerId,
            target: cmd.target,
        });

        const result = await spell.cast(player, player.castingPiece, resolved);

        if (result !== null && spell.failed === false) {
            this._castOutcomesForTests.push({
                kind: "spell-cast-succeeded",
                playerId,
                castsLeft: spell.castTimes,
            });
        } else {
            this._castOutcomesForTests.push({
                kind: "spell-cast-failed",
                playerId,
            });
        }

        // 6. Hand the slot off so the casting phase loop can advance.
        slot.submit(playerId, cmd);
    }

    private async _handleCancelCast(playerId: PlayerId, cmd: CancelCastCommand): Promise<void> {
        this._emitCommandRejected(playerId, cmd.commandId, "wrong-phase");
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
     * Select a piece by ID. Sets `_selected` and
     * emits `BoardEvent.PieceSelected`.
     */
    async selectPiece(id: number): Promise<void> {
        if (!id || this._state === BoardState.GameOver) {
            return;
        }
        this._selected = this.getPiece(id);
        if (!this._selected) {
            throw new Error(`No piece with ID ${id} found to select`);
        }
        this._boardEvents.emit(BoardEvent.PieceSelected, this._selected);
    }

    /**
     * Clear the current piece selection.
     */
    async deselectPiece(): Promise<void> {
        this._selected = null;
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
                await this.selectPiece(piece.id);
                return piece;
            }
        }
        return null;
    }

    /**
     * Move a piece to a new position. Records a broadcast event
     * carrying `piece-moved` and `piece-turn-flag-changed` outcomes
     * for the piece (and its current rider, if any), then emits the
     * rendering-side `BoardEvent.PieceMoved` event.
     *
     * @param id The id of the piece to move.
     * @param to The target tile.
     * @param commandId Correlation id from the originating command.
     * @param actorId The player responsible for the move.
     * @param path Optional full path for animated traversal; included
     *     in the `piece-moved` outcome when supplied.
     * @returns The appended broadcast event.
     */
    async movePiece(
        id: number,
        to: Point,
        commandId: CommandId,
        actorId: PlayerId,
        path?: Point[],
    ): Promise<BroadcastEventMessage> {
        const piece: P | null = this.getPiece(id);
        if (!piece) {
            throw new Error(`Could not find piece with ID ${id}`);
        }
        const rider: P | null = piece.currentRider as P | null;
        const event = await this.recordEvent({ commandId, actorId }, () => {
            piece.setPosition(to, path === undefined ? undefined : { path });
            piece.setTurnFlags({ moved: true });
            if (rider) {
                // Orchestrator composition: rider follows the mount AND
                // inherits the moved flag.
                rider.setPosition(to);
                rider.setTurnFlags({ moved: true });
            }
        });
        // Rendering-side event stays for the client.
        this._boardEvents.emit(BoardEvent.PieceMoved, piece);
        this.emitBoardUpdateEvent();
        return event;
    }

    /**
     * Resolve a melee attack between two pieces.
     * Rolls combat, emits event, and kills the
     * defender on success.
     */
    async attackPiece(attackingPieceId: number, defendingPieceId: number): Promise<P | null> {
        const attackingPiece = this.getPiece(attackingPieceId);
        const defendingPiece = this.getPiece(defendingPieceId);
        if (!attackingPiece) {
            throw new Error(`Could not find piece with ID ${attackingPieceId}`);
        }
        if (!defendingPiece) {
            throw new Error(`Could not find piece with ID ${defendingPieceId}`);
        }

        this._busy = true;
        const attackResult: boolean = await attackingPiece.attack(defendingPiece);
        this._boardEvents.emit(BoardEvent.PieceAttacked, attackingPiece, defendingPiece, attackResult);
        this._busy = false;
        return attackingPiece;
    }

    /**
     * Resolve a ranged attack between two pieces.
     * Rolls ranged combat, emits event, and kills the
     * defender on success.
     */
    async rangedAttackPiece(attackingPieceId: number, defendingPieceId: number): Promise<P | null> {
        const attackingPiece = this.getPiece(attackingPieceId);
        const defendingPiece = this.getPiece(defendingPieceId);
        if (!attackingPiece) {
            throw new Error(`Could not find piece with ID ${attackingPieceId}`);
        }
        if (!defendingPiece) {
            throw new Error(`Could not find piece with ID ${defendingPieceId}`);
        }

        this._busy = true;
        const attackResult: boolean = await attackingPiece.rangedAttack(defendingPiece);
        this._boardEvents.emit(BoardEvent.PieceRangedAttacked, attackingPiece, defendingPiece, attackResult);
        this._busy = false;
        return attackingPiece;
    }

    /**
     * Mount a piece upon another piece. If the
     * mounting piece is already mounted, dismount
     * first.
     */
    async mountPiece(mountingPieceId: number, mountedPieceId: number): Promise<P | null> {
        const mountingPiece = this.getPiece(mountingPieceId);
        const mountedPiece = this.getPiece(mountedPieceId);
        if (!mountingPiece) {
            throw new Error(`Could not find piece with ID ${mountingPieceId}`);
        }
        if (!mountedPiece) {
            throw new Error(`Could not find piece with ID ${mountedPieceId}`);
        }

        // Dismount first if already mounted
        if (mountingPiece.currentMount) {
            mountingPiece.dismount();
            mountingPiece.moved = false;
        }

        mountingPiece.mount(mountedPiece);

        mountingPiece.position.setTo(mountedPiece.position.x, mountedPiece.position.y);

        this.emitBoardUpdateEvent();
        return mountingPiece;
    }

    /**
     * Dismount a piece from its current mount.
     */
    async dismountPiece(dismountingPieceId: number): Promise<P | null> {
        const piece = this.getPiece(dismountingPieceId);
        if (!piece) {
            throw new Error(`Could not find piece with ID ${dismountingPieceId}`);
        }
        piece.dismount();
        this.emitBoardUpdateEvent();
        return piece;
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
                    if (await this.currentPlayer.remote.selectSpell()) {
                        this._boardEvents.emit(
                            BoardEvent.SpellSelected,
                            this.currentPlayer,
                            this.currentPlayer.selectedSpell,
                        );
                    } else {
                        console.log("Remote player could not select spell, skipping...");
                    }
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
                            if (!(await this.currentPlayer.remote.castSpell())) {
                                console.log("Remote player could not cast spell, skipping...");
                            }
                            continue;
                        }
                    } else if (spell?.range === -1) {
                        if (this.currentPlayer?.remote) {
                            if (!(await this.currentPlayer.remote.castSpell())) {
                                console.log("Remote player could not cast spell, skipping...");
                            }
                            continue;
                        }
                    }
                }

                // Skip if no spell selected in casting phase
                if (!this.currentPlayer?.selectedSpell) {
                    continue;
                }
            }

            if (this.phase === BoardPhase.Moving && this.currentPlayer?.remote) {
                await this.currentPlayer.remote.moveAllUnits();
                continue;
            }

            // Exit loop — player's turn is ready
            break;
        }
    }
}
