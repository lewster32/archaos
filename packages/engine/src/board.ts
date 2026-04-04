import { Model } from "./models/model";
import { Point } from "./point";
import { EventEmitter } from "./events";
import { Piece } from "./piece";
import { Wizard } from "./wizard";
import { Player } from "./player";
import type { Spell } from "./spells/spell";
import { Logger } from "./logger";
import { PhaseMachine, GameEnd } from "./phasemachine";
import { BoardEvent } from "./enums/boardevent";
import { BoardPhase } from "./enums/boardphase";
import { BoardState } from "./enums/boardstate";
import { Colour } from "./enums/colour";
import { EventType } from "./enums/eventtype";
import { RangeType } from "./enums/rangetype";
import { UnitStatus } from "./enums/unitstatus";
import type { IRNG } from "./rng";
import { GameRNG } from "./rng";
import type {
    PieceConfig,
    WizardConfig,
} from "./configs/piececonfig";
import type { SpellConfig } from "./configs/spellconfig";
import type { Box } from "./interfaces/ui";

/**
 * Simple point type without all the baggage of
 * Phaser's `Geom.Point`.
 */
type SimplePoint = { x: number; y: number };

/**
 * The engine Board: pure game state, turn orchestration,
 * and geometry queries. No Phaser imports.
 *
 * The client Board extends this and adds rendering,
 * sound, camera, cursor, and visual effects.
 */
export class Board extends Model implements Box {
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

    /**
     * Cheat to use short animation delays for actions.
     */
    public static CHEAT_SHORT_DELAY: boolean = false;

    /* ── Timing constants ────────────────────────── */

    static get DEFAULT_DELAY(): number {
        return Board.CHEAT_SHORT_DELAY ? 10 : 750;
    }

    static get END_TURN_DELAY(): number {
        return Board.CHEAT_SHORT_DELAY ? 10 : 1500;
    }

    static get SPREAD_DELAY(): number {
        return Board.CHEAT_SHORT_DELAY ? 10 : 250;
    }

    static get NEW_TURN_HIGHLIGHT_DURATION(): number {
        return Board.CHEAT_SHORT_DELAY ? 10 : 700;
    }

    static readonly NEW_TURN_HIGHLIGHT_STEPS: number = 7;

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

    private readonly _width: number;
    private readonly _height: number;

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

    protected _balance: number;
    protected _balanceShift: number;

    protected readonly _pieces: Map<number, Piece>;
    protected _selected: Piece | null;
    protected _cursorPosition: Point = new Point(0, 0);

    protected readonly _players: Map<number, Player>;
    protected _currentPlayer: Player | null;
    protected _currentPlayerIndex: number = -1;
    protected _idCounter: number = 1;

    protected readonly _stateManager: PhaseMachine;
    protected readonly _logger: Logger;
    protected readonly _rng: IRNG;

    protected _spellFilter: (
        spell: SpellConfig,
    ) => boolean = () => true;
    protected _disableIllusions: boolean = false;
    protected _disableCancelSpell: boolean = false;
    protected _disableCancelAction: boolean = false;
    protected _disableEndTurn: boolean = false;

    /**
     * Event emitter for board game events.
     */
    protected readonly _boardEvents: EventEmitter =
        new EventEmitter();

    constructor(
        id: number,
        width: number = Board.DEFAULT_WIDTH,
        height: number = Board.DEFAULT_HEIGHT,
        seed?: string,
    ) {
        super(id);
        this._rng = new GameRNG(seed);

        this._width = width;
        this._height = height;

        this._pieces = new Map<number, Piece>();
        this._players = new Map<number, Player>();
        this._state = BoardState.Idle;
        this._lastPhase = BoardPhase.Idle;
        this._lastState = BoardState.Idle;
        this._balance = 0;
        this._balanceShift = 0;

        this._selected = null;
        this._currentPlayer = null;

        this._logger = Logger.getInstance();
        this._stateManager = new PhaseMachine(
            (activeState: string) => {
                this.onPhaseTransition(activeState);
            },
        );
    }

    /* ── Phase transition handler ────────────────��─ */

    /**
     * Handle phase/state change side-effects from
     * the FSM. Called on every state transition.
     * Subclasses can override to add rendering.
     */
    protected onPhaseTransition(
        activeState: string,
    ): void {
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
        if (
            newPhase !== null &&
            newPhase !== this._lastPhase
        ) {
            this._lastPhase = newPhase;
            switch (newPhase) {
                case BoardPhase.Spellbook:
                    this._logger.log(
                        `Spell selection phase`,
                        Colour.Green,
                    );
                    break;
                case BoardPhase.Casting:
                    this._logger.log(
                        `Spell casting phase`,
                        Colour.Green,
                    );
                    break;
                case BoardPhase.Moving:
                    this._logger.log(
                        `Movement phase`,
                        Colour.Green,
                    );
                    break;
            }
            this._boardEvents.emit(
                BoardEvent.PhaseChange,
                newPhase,
            );
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
        if (
            newState !== null &&
            newState !== this._lastState
        ) {
            this._lastState = newState;
            this._boardEvents.emit(
                BoardEvent.StateChange,
                newState,
            );
            this.onStateChange(newState);
        }
    }

    /**
     * Called when the board state changes. Override in
     * client to emit UI events (end turn, cancel, etc).
     */
    protected onStateChange(
        _newState: BoardState,
    ): void {
        // no-op in engine; client adds UI event emission
    }

    /* ── Getters / setters ───────────────────────── */

    get stateManager(): PhaseMachine {
        return this._stateManager;
    }

    get state(): BoardState {
        if (this._state === BoardState.GameOver)
            return BoardState.GameOver;

        const pm = this._stateManager;
        if (pm.isActive(pm.states.movingPlayer)) {
            if (pm.isActive(pm.states.pieceAttacking))
                return BoardState.Attack;
            if (
                pm.isActive(
                    pm.states.pieceRangedAttacking,
                )
            )
                return BoardState.RangedAttack;
            if (pm.isActive(pm.states.pieceDismounting))
                return BoardState.Dismount;
            return BoardState.Move;
        }
        if (pm.isActive(pm.states.castingPlayer))
            return BoardState.CastSpell;
        if (pm.isActive(pm.states.spellbookPlayer))
            return BoardState.SelectSpell;
        if (pm.isActive(pm.states.spreading))
            return BoardState.Idle;

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
        if (pm.isActive(pm.states.spellbook))
            return BoardPhase.Spellbook;
        if (pm.isActive(pm.states.casting))
            return BoardPhase.Casting;
        if (pm.isActive(pm.states.spreading))
            return BoardPhase.Spreading;
        if (pm.isActive(pm.states.moving))
            return BoardPhase.Moving;
        return BoardPhase.Idle;
    }

    get busy(): boolean {
        return this._busy;
    }

    get balance(): number {
        return this._balance;
    }

    get balanceShift(): number {
        return this._balanceShift;
    }

    set balanceShift(balance: number) {
        this._balanceShift = balance;
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

    get pieces(): Piece[] {
        return Array.from(this._pieces.values());
    }

    get selected(): Piece | null {
        return this._selected;
    }

    getPiece(id: number): Piece | null {
        if (this._pieces.has(id)) {
            return this._pieces.get(id);
        }
        return null;
    }

    getPiecesByOwner(owner: Player): Piece[] {
        return this.pieces.filter(
            (piece) => piece.owner === owner,
        );
    }

    removePiece(id: number): void {
        const piece = this.getPiece(id);
        if (!id || !piece) {
            return;
        }
        this._pieces.delete(id);
        this._boardEvents.emit(
            BoardEvent.PieceDestroyed,
            piece,
        );
    }

    /* ── Players ─────────────────────────────────── */

    get players(): Player[] {
        return Array.from(this._players.values());
    }

    get currentPlayer(): Player | null {
        return this._currentPlayer;
    }

    set currentPlayer(player: Player | null) {
        this._currentPlayer = player;
    }

    getPlayer(id: number): Player | null {
        if (this._players.has(id)) {
            return this._players.get(id);
        }
        return null;
    }

    /* ── Spells ──────────────────────────────────── */

    /**
     * Cached spell factory, loaded lazily to avoid a
     * circular dependency (board → spellfactory →
     * attackspell → board).
     */
    private static _spellFactory:
        | ((
              board: Board,
              id: number,
              config: SpellConfig,
          ) => Spell)
        | null = null;

    /**
     * Register the spell factory function. Must be
     * called once before `addSpell` is used.
     */
    static registerSpellFactory(
        factory: (
            board: Board,
            id: number,
            config: SpellConfig,
        ) => Spell,
    ): void {
        Board._spellFactory = factory;
    }

    /**
     * Add a spell to a player's spellbook.
     */
    addSpell(
        player: Player,
        config: SpellConfig,
    ): Spell {
        if (!config || !player) {
            throw new Error(
                "No player or config provided",
            );
        }
        if (!Board._spellFactory) {
            throw new Error(
                "Spell factory not registered. " +
                    "Import spellfactory and call " +
                    "Board.registerSpellFactory() " +
                    "first.",
            );
        }
        const spell = Board._spellFactory(
            this,
            this._idCounter++,
            config,
        );
        player.addSpell(spell);
        return spell;
    }

    get spellFilter(): (config: SpellConfig) => boolean {
        return this._spellFilter ?? (() => true);
    }

    set spellFilter(
        filter: (config: SpellConfig) => boolean,
    ) {
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

    getAdjacentPoints(
        point: Point,
        includeCentre?: boolean,
    ): Point[] {
        const points: Point[] = [];

        for (
            let x: number = point.x - 1;
            x <= point.x + 1;
            x++
        ) {
            for (
                let y: number = point.y - 1;
                y <= point.y + 1;
                y++
            ) {
                if (
                    (x !== point.x || y !== point.y) &&
                    x >= 0 &&
                    y >= 0 &&
                    x < this.width &&
                    y < this.height
                ) {
                    if (
                        !includeCentre &&
                        x === point.x &&
                        y === point.y
                    ) {
                        continue;
                    }
                    points.push(new Point(x, y));
                }
            }
        }

        return points;
    }

    getPointsInRange(
        point: Point,
        range: number,
        includeCentre?: boolean,
        rangeType?: RangeType,
    ): Point[] {
        const points: Point[] = [];
        for (
            let x: number = point.x - range;
            x <= point.x + range;
            x++
        ) {
            for (
                let y: number = point.y - range;
                y <= point.y + range;
                y++
            ) {
                if (
                    x >= 0 &&
                    y >= 0 &&
                    x < this.width &&
                    y < this.height &&
                    Board.distance(
                        point,
                        new Point(x, y),
                        rangeType,
                    ) <=
                        range +
                            (rangeType === RangeType.Fly
                                ? 0.5
                                : 0)
                ) {
                    if (
                        !includeCentre &&
                        x === point.x &&
                        y === point.y
                    ) {
                        continue;
                    }
                    points.push(new Point(x, y));
                }
            }
        }
        return points;
    }

    getAdjacentPiecesAtPosition(
        point: Point,
        filter?: (piece: Piece) => boolean,
        includeCentre?: boolean,
    ): Piece[] {
        const neighbours: Set<Piece> = new Set();
        const position: Point = Point.clone(point);
        for (const direction of Board.NEIGHBOUR_DIRECTIONS) {
            const directionNeighbours: Piece[] =
                this.getPiecesAtPosition(
                    new Point(
                        position.x + direction.x,
                        position.y + direction.y,
                    ),
                    filter,
                );
            if (directionNeighbours) {
                directionNeighbours.forEach((piece) =>
                    neighbours.add(piece),
                );
            }
        }
        if (includeCentre) {
            const centreNeighbours: Piece[] =
                this.getPiecesAtPosition(position, filter);
            if (centreNeighbours) {
                centreNeighbours.forEach((piece) =>
                    neighbours.add(piece),
                );
            }
        }
        return Array.from(neighbours);
    }

    getPiecesAtPosition(
        point: Point,
        filter?: (piece: Piece) => boolean,
    ): Piece[] {
        return Array.from(
            this.pieces.filter((piece: Piece) => {
                return (
                    Point.equals(piece.position, point) &&
                    (filter ? filter(piece) : true)
                );
            }),
        );
    }

    isBlocker(point: Point): boolean {
        const pieces: Piece[] = this.getPiecesAtPosition(
            point,
            (piece) => {
                return (
                    !piece.hasStatus(UnitStatus.Transparent) &&
                    !piece.dead
                );
            },
        );
        if (!pieces?.length) {
            return false;
        }
        return true;
    }

    hasLineOfSight(
        startPosition: Point,
        endPosition: Point,
    ): boolean {
        let xDiff: number =
            endPosition.x - startPosition.x;
        let yDiff: number =
            endPosition.y - startPosition.y;

        let xDir: number, yDir: number;
        let xVal: number, yVal: number;
        let numChecks: number;

        xDir = xDiff < 0 ? -1 : 1;
        yDir = yDiff < 0 ? -1 : 1;

        if (xDiff === 0 || yDiff === 0) {
            if (yDiff === 0) {
                for (
                    let a = 1;
                    a < Math.abs(xDiff);
                    a++
                ) {
                    xVal = a * xDir + startPosition.x;
                    if (
                        this.isBlocker(
                            new Point(
                                xVal,
                                startPosition.y,
                            ),
                        )
                    ) {
                        return false;
                    }
                }
            } else {
                for (
                    let a = 1;
                    a < Math.abs(yDiff);
                    a++
                ) {
                    yVal = a * yDir + startPosition.y;
                    if (
                        this.isBlocker(
                            new Point(
                                startPosition.x,
                                yVal,
                            ),
                        )
                    ) {
                        return false;
                    }
                }
            }
        } else {
            numChecks = Math.max(
                Math.abs(xDiff),
                Math.abs(yDiff),
            );
            let yInc = yDiff / numChecks,
                xInc = xDiff / numChecks;

            for (let a = 1; a < numChecks; a++) {
                xVal =
                    startPosition.x +
                    Math.round(xInc * a);
                yVal =
                    startPosition.y +
                    Math.round(yInc * a);
                if (
                    this.isBlocker(new Point(xVal, yVal))
                ) {
                    return false;
                }
            }
        }

        return true;
    }

    /* ── Distance / coordinate calculations ──────── */

    static distance(
        startPosition: Point,
        endPosition: Point,
        rangeType: RangeType = RangeType.Fly,
    ): number {
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
        return new Point(
            point.x - point.y,
            (point.x + point.y) / 2,
        );
    }

    static fromIsometric(point: Point): Point {
        return new Point(
            point.x + point.y / 2,
            point.y - point.x / 2,
        );
    }

    /* ── Piece actions ───────────────────────────── */

    /**
     * Add a piece to the board.
     */
    addPiece(config: PieceConfig): Piece {
        const piece: Piece = new Piece(
            this,
            this._idCounter++,
            config,
        );
        this._pieces.set(piece.id, piece);
        this.emitBoardUpdateEvent();
        return piece;
    }

    /**
     * Add a wizard piece to the board.
     */
    addWizard(config: WizardConfig): Wizard {
        const wizard: Wizard = new Wizard(
            this,
            this._idCounter++,
            config,
        );
        this._pieces.set(wizard.id, wizard);
        this.emitBoardUpdateEvent();
        return wizard;
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
            this.pieces.some((piece: Piece) =>
                piece.hasStatus(UnitStatus.Wizard),
            )
        ) {
            throw new Error(
                "Cannot create wizards - " +
                    "game not in initialising state",
            );
        }
        Wizard.createAll(this, this.players);
    }

    /**
     * Select a piece by ID. Sets `_selected` and
     * emits `BoardEvent.PieceSelected`.
     */
    selectPiece(id: number): void {
        if (!id || this._state === BoardState.GameOver) {
            return;
        }
        this._selected = this.getPiece(id);
        if (!this._selected) {
            throw new Error(
                `No piece with ID ${id} found ` +
                    `to select`,
            );
        }
        this._boardEvents.emit(
            BoardEvent.PieceSelected,
            this._selected,
        );
    }

    /**
     * Clear the current piece selection.
     */
    deselectPiece(): void {
        this._selected = null;
    }

    /**
     * Find the player's wizard piece and select it.
     *
     * @returns The wizard piece, or null if not found.
     */
    selectWizard(player: Player): Piece | null {
        if (
            !player ||
            this._state === BoardState.GameOver
        ) {
            return null;
        }
        const ownedPieces: Piece[] =
            this.getPiecesByOwner(player);
        for (const piece of ownedPieces) {
            if (piece.hasStatus(UnitStatus.Wizard)) {
                this.selectPiece(piece.id);
                return piece;
            }
        }
        return null;
    }

    /**
     * Move a piece to a new position. Synchronous
     * state update with event emission.
     */
    movePiece(id: number, position: Point): Piece {
        const piece: Piece | null = this.getPiece(id);
        if (!piece) {
            throw new Error(
                `Could not find piece with ID ${id}`,
            );
        }
        piece.position.setTo(position.x, position.y);
        piece.moved = true;
        this._boardEvents.emit(
            BoardEvent.PieceMoved,
            piece,
        );
        this.emitBoardUpdateEvent();
        return piece;
    }

    /**
     * Resolve a melee attack between two pieces.
     * Rolls combat, emits event, and kills the
     * defender on success.
     */
    attackPiece(
        attackingPieceId: number,
        defendingPieceId: number,
    ): Piece | null {
        const attackingPiece =
            this.getPiece(attackingPieceId);
        const defendingPiece =
            this.getPiece(defendingPieceId);
        if (!attackingPiece) {
            throw new Error(
                `Could not find piece with ` +
                    `ID ${attackingPieceId}`,
            );
        }
        if (!defendingPiece) {
            throw new Error(
                `Could not find piece with ` +
                    `ID ${defendingPieceId}`,
            );
        }

        this._busy = true;
        const attackResult: boolean =
            attackingPiece.attack(defendingPiece);
        this._boardEvents.emit(
            BoardEvent.PieceAttacked,
            attackingPiece,
            defendingPiece,
            attackResult,
        );
        this._busy = false;
        return attackingPiece;
    }

    /**
     * Resolve a ranged attack between two pieces.
     * Rolls ranged combat, emits event, and kills the
     * defender on success.
     */
    rangedAttackPiece(
        attackingPieceId: number,
        defendingPieceId: number,
    ): Piece | null {
        const attackingPiece =
            this.getPiece(attackingPieceId);
        const defendingPiece =
            this.getPiece(defendingPieceId);
        if (!attackingPiece) {
            throw new Error(
                `Could not find piece with ` +
                    `ID ${attackingPieceId}`,
            );
        }
        if (!defendingPiece) {
            throw new Error(
                `Could not find piece with ` +
                    `ID ${defendingPieceId}`,
            );
        }

        this._busy = true;
        const attackResult: boolean =
            attackingPiece.rangedAttack(defendingPiece);
        this._boardEvents.emit(
            BoardEvent.PieceRangedAttacked,
            attackingPiece,
            defendingPiece,
            attackResult,
        );
        this._busy = false;
        return attackingPiece;
    }

    /**
     * Mount a piece upon another piece. If the
     * mounting piece is already mounted, dismount
     * first.
     */
    mountPiece(
        mountingPieceId: number,
        mountedPieceId: number,
    ): Piece | null {
        const mountingPiece =
            this.getPiece(mountingPieceId);
        const mountedPiece =
            this.getPiece(mountedPieceId);
        if (!mountingPiece) {
            throw new Error(
                `Could not find piece with ` +
                    `ID ${mountingPieceId}`,
            );
        }
        if (!mountedPiece) {
            throw new Error(
                `Could not find piece with ` +
                    `ID ${mountedPieceId}`,
            );
        }

        // Dismount first if already mounted
        if (mountingPiece.currentMount) {
            mountingPiece.dismount();
            mountingPiece.moved = false;
        }

        mountingPiece.mount(mountedPiece);

        mountingPiece.position.setTo(
            mountedPiece.position.x,
            mountedPiece.position.y,
        );

        this.emitBoardUpdateEvent();
        return mountingPiece;
    }

    /**
     * Dismount a piece from its current mount.
     */
    dismountPiece(
        dismountingPieceId: number,
    ): Piece | null {
        const piece =
            this.getPiece(dismountingPieceId);
        if (!piece) {
            throw new Error(
                `Could not find piece with ` +
                    `ID ${dismountingPieceId}`,
            );
        }
        piece.dismount();
        this.emitBoardUpdateEvent();
        return piece;
    }

    /* ── Game flow ───────────────────────────────── */

    /**
     * Roll an attack vs defence check.
     */
    roll(
        attack: number,
        defence: number,
        attackingPlayer?: Player,
    ): boolean {
        if (attackingPlayer?.forceHit != null) {
            return attackingPlayer.forceHit;
        }
        if (Board.CHEAT_FORCE_HIT !== null) {
            return Board.CHEAT_FORCE_HIT;
        }
        const attackRoll: number = this._rng.between(
            0,
            10 + attack,
        );
        const defenceRoll: number = this._rng.between(
            0,
            10 + defence,
        );
        console.debug(
            `Rolled ${attackRoll} vs ${defenceRoll}; attack ${
                attackRoll > defenceRoll
                    ? "succeeds"
                    : "fails"
            }`,
        );
        return attackRoll > defenceRoll;
    }

    /**
     * Roll a chance check for spell casting.
     */
    rollChance(
        attack: number,
        castingPlayer?: Player,
    ): boolean {
        if (castingPlayer?.forceCast != null) {
            return castingPlayer.forceCast;
        }
        if (Board.CHEAT_FORCE_CAST !== null) {
            return Board.CHEAT_FORCE_CAST;
        }
        const defenceRoll: number = this._rng.frac();
        if (attack < 0 || attack > 1) {
            console.warn(
                `Chance value ${attack} is out of bounds, clamping to 0-1`,
            );
            attack = Math.max(0, Math.min(1, attack));
        }
        console.debug(
            `Rolled ${attack} vs ${defenceRoll}; chance ${
                attack > defenceRoll
                    ? "succeeds"
                    : "fails"
            }`,
        );
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
        const undefeated: Player[] = this.players.filter(
            (player) => !player.defeated,
        );
        if (undefeated?.length < 2) {
            this.state = BoardState.GameOver;
            this.stateManager.evaluate(new GameEnd());
            if (undefeated.length === 1) {
                this._logger.log(
                    `Game over! ${undefeated[0].name} wins!`,
                    Colour.Yellow,
                );
            } else if (undefeated.length < 1) {
                this._logger.log(
                    `Game over! Everybody's dead Dave.`,
                    Colour.Yellow,
                );
            }
            await Board.delay(2000);
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
            .filter((piece: Piece) => !piece.dead)
            .forEach((piece: Piece) => {
                occupiedSpaces.add(
                    `${piece.position.x},${piece.position.y}`,
                );
            });

        const emptySpaces: Point[] = [];
        for (
            let x: number = 0;
            x < this.width;
            x++
        ) {
            for (
                let y: number = 0;
                y < this.height;
                y++
            ) {
                const key: string = `${x},${y}`;
                if (!occupiedSpaces.has(key)) {
                    emptySpaces.push(new Point(x, y));
                }
            }
        }
        if (emptySpaces.length === 0) {
            console.warn(
                "No empty spaces available on the board!",
            );
            return null;
        }
        return this._rng.pick(emptySpaces);
    }

    /**
     * Delay for a given time.
     */
    static async delay(
        time: number = Board.DEFAULT_DELAY,
    ): Promise<void> {
        return new Promise((resolve) =>
            setTimeout(resolve, time),
        );
    }

    /**
     * Delay with an idle state then restore.
     */
    async idleDelay(
        time: number = Board.DEFAULT_DELAY,
    ): Promise<void> {
        const oldState: BoardState = this.state;
        this.state = BoardState.Idle;
        await Board.delay(time);
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
    emitUIEvent(
        _eventType: EventType,
        _data: any,
    ): void {
        // no-op in engine; client overrides
    }

    /**
     * Deselect the current player.
     */
    deselectPlayer(): void {
        this.currentPlayer = null;
        this._selected = null;
        this.emitUIEvent(
            EventType.EndTurnAvailable,
            false,
        );
    }
}
