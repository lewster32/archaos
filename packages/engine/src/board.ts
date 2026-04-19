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
     * @returns The newly created player.
     */
    addPlayer(config: PlayerConfig, remote?: RemotePlayer | null): Player<P> {
        const player = new Player<P>(
            this,
            this._idCounter++,
            config,
            Player.PLAYER_COLOURS[this._players.size],
            remote,
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
     * Move a piece to a new position. Synchronous
     * state update with event emission.
     */
    async movePiece(id: number, position: Point): Promise<P> {
        const piece: P | null = this.getPiece(id);
        if (!piece) {
            throw new Error(`Could not find piece with ID ${id}`);
        }
        piece.position.setTo(position.x, position.y);
        piece.moved = true;
        this._boardEvents.emit(BoardEvent.PieceMoved, piece);
        this.emitBoardUpdateEvent();
        return piece;
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
