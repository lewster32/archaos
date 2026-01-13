import { PieceConfig, WizardConfig } from "./configs/piececonfig";
import { PlayerConfig } from "./configs/playerconfig";
import { SpellConfig } from "./configs/spellconfig";
import { Cursor } from "./cursor";
import { EffectEmitter, EffectType } from "./effectemitter";
import { BoardLayer } from "./enums/boardlayer";
import { BoardPhase } from "./enums/boardphase";
import { BoardState } from "./enums/boardstate";
import { Colour } from "./enums/colour";
import { CursorType } from "./enums/cursortype";
import { InputType } from "./enums/inputtype";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { BoardUpdateEventData, Box, SpellbookOpenEventData } from "./interfaces/ui";
import { Model } from "./model";
import { Piece } from "./piece";
import { Player } from "./player";
import { Path, RangeGizmo } from "./rangegizmo";
import { Logger } from "./services/logger";
import { Rules } from "./services/rules";
import { SoundEffects } from "./soundeffects";
import { AttackSpell } from "./spells/attackspell";
import { Spell } from "./spells/spell";
import { SummonSpell } from "./spells/summonspell";
import { Wizard } from "./wizard";
import { Display, Geom, GameObjects, Scene, Math as PMath, Cameras } from "phaser";

/**
 * Simple point type without all the baggage of Phaser's `Geom.Point`.
 */
type SimplePoint = { x: number; y: number };

/**
 * The main game board. This is where the magic (literally) happens.
 * 
 * @param scene The Phaser scene the board will be present in.
 * @param id The unique ID of this board.
 * @param width The width of the board in cells.
 * @param height The height of the board in cells.
 */
export class Board extends Model implements Box {
    public static CHEAT_FORCE_HIT: boolean | null = null;
    public static CHEAT_FORCE_CAST: boolean | null = null;
    public static CHEAT_SHORT_DELAY: boolean = false;

    static get NEW_TURN_HIGHLIGHT_DURATION(): number {
        return Board.CHEAT_SHORT_DELAY ? 10 : 700;
    }
    static readonly NEW_TURN_HIGHLIGHT_STEPS: number = 7;
    static readonly SPREAD_ITERATIONS: number = 2;

    private readonly _scene: Scene;
    private readonly _width: number;
    private readonly _height: number;

    private readonly _layers: Map<BoardLayer, GameObjects.Layer>;
    private _particles: GameObjects.Particles.ParticleEmitterManager;

    static readonly DEFAULT_WIDTH: number = 13;
    static readonly DEFAULT_HEIGHT: number = 13;
    static readonly DEFAULT_CELLSIZE: number = 14;

    static get DEFAULT_DELAY(): number {
        return Board.CHEAT_SHORT_DELAY ? 10 : 750;
    }
    static get END_TURN_DELAY(): number {
        return Board.CHEAT_SHORT_DELAY ? 10 : 1500;
    }
    static get SPREAD_DELAY(): number {
        return Board.CHEAT_SHORT_DELAY ? 10 : 250;
    }

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

    private _phase: BoardPhase;

    private _state: BoardState;
    private _balance: number;
    private _balanceShift: number;
    private readonly _cursor: Cursor;
    private readonly _moveGizmo: RangeGizmo;
    private readonly _pieces: Map<number, Piece>;
    private _selected: Piece | null;

    private readonly _players: Map<number, Player>;
    private _currentPlayer: Player | null;
    private _currentPlayerIndex: number = -1;

    private _idCounter: number = 1;

    private readonly _rules: Rules;
    private readonly _logger: Logger;
    private readonly _sound: SoundEffects;

    constructor(
        scene: Scene,
        id: number,
        width: number = Board.DEFAULT_WIDTH,
        height: number = Board.DEFAULT_HEIGHT
    ) {
        super(id);
        this._scene = scene;
        this._layers = new Map();

        this._width = width;
        this._height = height;

        this.createFloor();
        this._layers.set(BoardLayer.FloorCursors, this.scene.add.layer());
        this._layers.set(BoardLayer.PathCursors, this.scene.add.layer());
        this._layers.set(BoardLayer.Shadows, this.scene.add.layer());
        this._layers.set(BoardLayer.Pieces, this.scene.add.layer());

        this._scene.game.scale.resize(
            this._width * Board.DEFAULT_CELLSIZE * 2 +
                Board.DEFAULT_CELLSIZE * 6,
            this._height * Board.DEFAULT_CELLSIZE + (Board.DEFAULT_CELLSIZE * 6)
        );

        this._scene.cameras.main.setBounds(
            this._scene.game.scale.width / -2,
            Board.DEFAULT_CELLSIZE * -3,
            this._scene.game.scale.width,
            this._scene.game.scale.height
        );

        this._pieces = new Map<number, Piece>();
        this._players = new Map<number, Player>();
        this._state = BoardState.Idle;
        this._phase = BoardPhase.Idle;
        this._balance = 0;
        this._balanceShift = 0;

        this._cursor = new Cursor(this);
        this._moveGizmo = new RangeGizmo(this);

        this._selected = null;
        this._currentPlayer = null;

        this._rules = Rules.getInstance();
        this._logger = Logger.getInstance(this.scene.game.events);

        this.scene.game.events.on("end-turn", async () => {
            await this.nextPlayer();
        });

        this.createEffects();

        this._sound = SoundEffects.getInstance(this.scene);

        this._sound.play("screenactive");

        window["currentBoard"] = this;
    }

    /* #region State */

    /**
     * Get the current state of the board. The state is the specific mode the
     * board is in within a phase, such as moving or casting a spell. It mostly
     * affects what user inputs are valid.
     */
    get state(): BoardState {
        return this._state;
    }

    /**
     * Set the current state of the board.
     */
    set state(state: BoardState) {
        if (this._state === BoardState.GameOver) {
            return;
        }
        this._state = state;
        switch (state) {
            case BoardState.Idle:
            case BoardState.GameOver:
            case BoardState.View:
                this.scene.game.events.emit("cancel-available", false);
                this.scene.game.events.emit("end-turn-available", false);
                break;
            case BoardState.Move:
            case BoardState.SelectSpell:
                if (!this.currentPlayer?.ai) {
                    this.scene.game.events.emit("end-turn-available", true);
                }
                break;
            default:
                if (this.currentPlayer && !this.currentPlayer.ai) {
                    this.scene.game.events.emit("cancel-available", true);
                }
                this.scene.game.events.emit("end-turn-available", false);
                break;
        }
    }

    /**
     * Get the current phase of the board. The phase is the broader stage of
     * the game, such as spell selection or movement.
     */
    get phase(): BoardPhase {
        return this._phase;
    }

    /**
     * Set the current phase of the board.
     */
    set phase(phase: BoardPhase) {
        this._phase = phase;
        switch (this._phase) {
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
    }

    /**
     * Get the current world balance. A positive value indicates a shift
     * towards law, while a negative value indicates a shift towards chaos.
     */
    get balance(): number {
        return this._balance;
    }

    /**
     * Get how much the world balance will shift at the end of the turn.
     */
    get balanceShift(): number {
        return this._balanceShift;
    }

    /**
     * Set how much the world balance will shift at the end of the turn. This
     * is reset to 0 at the end of each turn.
     */
    set balanceShift(balance: number) {
        this._balanceShift = balance;
    }

    /**
     * Get the cursor for this board.
     */
    get cursor(): Cursor {
        return this._cursor;
    }

    /**
     * Get the movement gizmo for this board. This handles things like range
     * and paths.
     */
    get moveGizmo(): RangeGizmo {
        return this._moveGizmo;
    }

    /**
     * Get the rules service for this board. The rules apply most of the logic
     * of the game.
     */
    get rules(): Rules {
        return this._rules;
    }

    /**
     * Get the logger for this board. The logger handles logging alerts to the
     * game's UI.
     */
    get logger(): Logger {
        return this._logger;
    }

    /**
     * Start a new turn on the board. This advances the phase and state as
     * appropriate.
     * 
     * @returns A promise that resolves when the new turn has been fully processed.
     */
    async newTurn(): Promise<void> {
        this._selected = null;

        if (this.state === BoardState.GameOver) {
            return;
        }

        if (
            this.phase === BoardPhase.Idle ||
            this.phase === BoardPhase.Moving
        ) {
            this.pieces.forEach((piece) => {
                piece.reset();
            });
            this._logger.log(`New turn`, Colour.Green);
            if (this._balanceShift !== 0) {
                this._balance += this._balanceShift;
                this._logger.log(
                    `World balance shifts towards ${
                        this._balanceShift < 0 ? "chaos" : "law"
                    } by ${Number.parseInt(
                        Math.abs(this._balanceShift * 100).toFixed(2),
                        10
                    )}%`,
                    this._balanceShift < 0 ? Colour.Magenta : Colour.Cyan
                );
                this._balanceShift = 0;
                await this.idleDelay(Board.DEFAULT_DELAY);
            }
            this.phase = BoardPhase.Spellbook;
            this.state = BoardState.SelectSpell;
            await this.idleDelay(Board.END_TURN_DELAY);
        } else if (this.phase === BoardPhase.Spellbook) {
            this.phase = BoardPhase.Casting;
            this.state = BoardState.CastSpell;
            await this.idleDelay(Board.END_TURN_DELAY);
        } else if (this.phase === BoardPhase.Casting) {
            this.phase = BoardPhase.Spreading;
            this.state = BoardState.Idle;

            const previousPlayer: Player = this._currentPlayer;
            this._currentPlayer = null;
            this.updateBackgroundColour();

            await this.doSpread();
            await this.doExpire();

            this._currentPlayer = previousPlayer;
            this.emitBoardUpdateEvent();
        } else if (this.phase === BoardPhase.Spreading) {
            this.phase = BoardPhase.Moving;
            this.state = BoardState.Move;
            await this.idleDelay(Board.END_TURN_DELAY);
        }
        this.emitBoardUpdateEvent();
    }

    /* #endregion */

    /* #region Pieces */

    /**
     * Get all pieces on the board.
     */
    get pieces(): Piece[] {
        return Array.from(this._pieces.values());
    }

    /**
     * Get the currently selected piece, or null if no piece is selected.
     */
    get selected(): Piece | null {
        return this._selected;
    }

    /**
     * Debounce emission of board update events to avoid flooding listeners.
     */
    private _emitTimeout: any;

    /**
     * Emit a board update event to notify listeners that the board state has
     * changed. This is mainly used by the UI, such as the minimap.
     */
    emitBoardUpdateEvent(): void {
        if (this._emitTimeout) {
            clearTimeout(this._emitTimeout);
        }
        this._emitTimeout = setTimeout(() => {
            this.scene.game.events.emit("board-update", <BoardUpdateEventData> {
                pieces: this.pieces,
                board: {
                    width: this._width,
                    height: this._height,
                },
            });
        }, 500);
    }

    /**
     * Add a piece to the board.
     * 
     * @param config The configuration for the piece to add.
     * @returns The newly added piece.
     */
    async addPiece(config: PieceConfig): Promise<Piece> {
        const piece: Piece = new Piece(this, this._idCounter++, config);
        this._pieces.set(piece.id, piece);
        this.emitBoardUpdateEvent();
        return piece;
    }

    /**
     * Create and place wizards for all players at the start of the game.
     */
    createWizards(): void {
        if (
            this.state === BoardState.GameOver ||
            this.state !== BoardState.Idle ||
            this.phase !== BoardPhase.Idle ||
            this.pieces.some((piece: Piece) =>
                piece.hasStatus(UnitStatus.Wizard)
            )
        ) {
            throw new Error(
                "Cannot create wizards - game not in initialising state"
            );
        }
        switch (this.players.length) {
            // Face-to-face
            case 2:
                this.addWizard({
                    owner: this.players[0],
                    x: Math.floor(this.width / 2),
                    y: this.height - 2,
                    wizCode: this.players[0].wizcode,
                });
                this.addWizard({
                    owner: this.players[1],
                    x: Math.floor(this.width / 2),
                    y: 1,
                    wizCode: this.players[1].wizcode,
                });
                break;
            case 3:
                // Triangle
                this.addWizard({
                    owner: this.players[0],
                    x: this.width - 2,
                    y: this.height - 2,
                    wizCode: this.players[0].wizcode,
                });
                this.addWizard({
                    owner: this.players[1],
                    x: this.width - 2,
                    y: 1,
                    wizCode: this.players[1].wizcode,
                });
                this.addWizard({
                    owner: this.players[2],
                    x: 1,
                    y: Math.floor(this.height / 2),
                    wizCode: this.players[2].wizcode,
                });
                break;
            case 4:
                // Corners
                this.addWizard({
                    owner: this.players[0],
                    x: this.width - 2,
                    y: this.height - 2,
                    wizCode: this.players[0].wizcode,
                });
                this.addWizard({
                    owner: this.players[1],
                    x: this.width - 2,
                    y: 1,
                    wizCode: this.players[1].wizcode,
                });
                this.addWizard({
                    owner: this.players[2],
                    x: 1,
                    y: 1,
                    wizCode: this.players[2].wizcode,
                });
                this.addWizard({
                    owner: this.players[3],
                    x: 1,
                    y: this.height - 2,
                    wizCode: this.players[3].wizcode,
                });
                break;
            case 5:
                // Evenly spaced in a pentagon
                for (let i: number = 0; i < 5; i++) {
                    const angle: number = (i / 5) * Math.PI * 2 - Math.PI / 2;
                    const x: number = Math.round(
                        -0.5 + this.width / 2 +
                            (this.width / 2) * Math.cos(angle)
                    );
                    const y: number = Math.round(
                        -0.5 + this.height / 2 +
                            (this.height / 2) * Math.sin(angle)
                    );
                    this.addWizard({
                        owner: this.players[i],
                        x: x,
                        y: y,
                        wizCode: this.players[i].wizcode,
                    });
                }
                break;             
            case 6:
                // Evenly spaced in a hexagon
                for (let i: number = 0; i < 6; i++) {
                    const angle: number = (i / 6) * Math.PI * 2 - Math.PI / 2;
                    const x: number = Math.round(
                        -0.6 + this.width / 2 +
                            (this.width / 2 + 0.5) * Math.cos(angle)
                    );
                    const y: number = Math.round(
                        -0.5 + this.height / 2 +
                            (this.height / 2 - 0.5) * Math.sin(angle)
                    );
                    this.addWizard({
                        owner: this.players[i],
                        x: x,
                        y: y,
                        wizCode: this.players[i].wizcode,
                    });
                }
                break;
            case 7:
                // One in the centre, six in a hexagon around (possibly a bit
                // more fair in terms of spacing than a heptagon?)
                this.addWizard({
                    owner: this.players[0],
                    x: Math.floor(this.width / 2),
                    y: Math.floor(this.height / 2),
                    wizCode: this.players[0].wizcode,
                });

                for (let i: number = 1; i < 7; i++) {
                    const angle: number = (i / 6) * Math.PI * 2 - Math.PI / 2;
                    const x: number = Math.round(
                        -0.6 + this.width / 2 +
                            (this.width / 2 + 0.5) * Math.cos(angle)
                    );
                    const y: number = Math.round(
                        -0.5 + this.height / 2 +
                            (this.height / 2 - 0.5) * Math.sin(angle)
                    );
                    this.addWizard({
                        owner: this.players[i],
                        x: x,
                        y: y,
                        wizCode: this.players[i].wizcode,
                    });
                }
                break
            case 8:
                // All corners and middles
                {
                    let playerIndex: number = 0;
                    for (let xx of [this.width - 1, Math.floor(this.width / 2), 0]) {
                        for (let yy of [this.height - 1, Math.floor(this.height / 2), 0]) {
                            if (xx === Math.floor(this.width / 2) && yy === Math.floor(this.height / 2)) {
                                continue;
                            }
                            this.addWizard({
                                owner: this.players[playerIndex],
                                x: xx,
                                y: yy,
                                wizCode: this.players[playerIndex].wizcode,
                            });
                            playerIndex++;
                        }
                    }
                }
                break;
            default:
                // If more than 8 players, place randomly. First get all of the
                // tiles as a list, shuffle it, then assign starting positions.
                // This could be better - perhaps some kind of Poisson-disc
                // sampling to ensure even distribution, but this will do for
                // now, since it's not possible from the menu to have more than
                // 8 players anyway.
                {
                    const availablePositions: SimplePoint[] = [];
                    for (let x: number = 1; x < this.width - 1; x++) {
                        for (let y: number = 1; y < this.height - 1; y++) {
                            availablePositions.push({ x: x, y: y });
                        }
                    }
                    // Shuffle available positions.
                    for (let i = availablePositions.length - 1; i > 0; i--) {
                        const j = Math.floor(PMath.RND.frac() * (i + 1));
                        [availablePositions[i], availablePositions[j]] = [availablePositions[j], availablePositions[i]];
                    }
                    // Assign positions to players.
                    this.players.forEach((player, index) => {
                        const pos = availablePositions[index];
                        this.addWizard({
                            owner: player,
                            x: pos.x,
                            y: pos.y,
                            wizCode: player.wizcode,
                        });
                    });
                }
                break;
        }
    }

    /**
     * Add a wizard to the board.
     * 
     * @param config The configuration for the wizard to add.
     * @returns The newly added wizard.
     */
    addWizard(config: WizardConfig): Wizard {
        const wizard: Wizard = new Wizard(this, this._idCounter++, config);
        this._pieces.set(wizard.id, wizard);
        this.emitBoardUpdateEvent();
        return wizard;
    }

    /**
     * Get a piece by its ID.
     * 
     * @param id The ID of the piece to get.
     * @returns The piece with the given ID, or null if no such piece exists.
     */
    getPiece(id: number): Piece | null {
        if (this._pieces.has(id)) {
            return this._pieces.get(id);
        }
        return null;
    }

    /**
     * Get all pieces owned by a given player. This includes everything, such as
     * wizards and non-controllable pieces.
     * 
     * @param owner The player who owns the pieces.
     * @returns An array of pieces owned by the given player.
     */
    getPiecesByOwner(owner: Player): Piece[] {
        return this.pieces.filter((piece) => piece.owner === owner);
    }

    /**
     * Select a piece by its ID. If the piece is already selected, does nothing.
     * 
     * @param id The ID of the piece to select.
     * @returns A promise that resolves when the piece has been selected.
     */
    async selectPiece(id: number): Promise<void> {
        if (!id || this.state === BoardState.GameOver) {
            return;
        }
        if (this._selected?.id === id) {
            console.warn(`Piece with ID ${id} is already selected`);
            return;
        }
        this._selected = this.getPiece(id);
        if (!this._selected) {
            throw new Error(`No piece with ID ${id} found to select`);
        }

        if (this.phase === BoardPhase.Moving) {
            this.sound.play("select");
            if (this._selected.currentMount) {
                await this.moveGizmo.generate(this._selected);
                return;
            }

            const firstEngagingPiece: Piece | null =
                this._selected.getFirstEngagingPiece();

            if (firstEngagingPiece) {
                if (
                    this._selected.engaged ||
                    this.roll(
                        firstEngagingPiece.stats.maneuverability,
                        this._selected.stats.maneuverability
                    )
                ) {
                    await this._selected.engage(firstEngagingPiece);
                    await this.moveGizmo.reset();
                } else {
                    this.logger.log(
                        `${this._selected.name} disengaged from ${firstEngagingPiece.name}`,
                        Colour.Green
                    );
                    if (!this._selected.moved) {
                        await this.moveGizmo.generate(this._selected);
                    }
                }
            } else if (!this._selected.moved) {
                await this.moveGizmo.generate(this._selected);
            }
        }

        switch (this.state) {
            case BoardState.Move:
            case BoardState.Dismount:
            case BoardState.Attack:
            case BoardState.RangedAttack:
                if (this.currentPlayer && !this.currentPlayer.ai) {
                    this.scene.game.events.emit("cancel-available", true);
                }
                break;
        }
    }

    /**
     * Deselect the currently selected piece. If no piece is selected, does
     * nothing.
     * 
     * @returns A promise that resolves when the piece has been deselected.
     */
    async deselectPiece(): Promise<void> {
        if (!this._selected) {
            console.warn("No piece selected to deselect");
            return;
        }
        if (this.phase === BoardPhase.Moving) {
            const previousSelected: Piece = this._selected;
            this._selected = null;

            if (previousSelected.currentRider?.canSelect) {
                await this.selectPiece(previousSelected.currentRider.id);
                await this.cursor.action(InputType.None);
                return;
            } else if (previousSelected.currentMount?.canSelect) {
                await this.selectPiece(previousSelected.currentMount.id);
                await this.cursor.action(InputType.None);
                return;
            }
        }
        this.scene.game.events.emit("cancel-available", false);

        const turnOver: boolean =
            this.getPiecesByOwner(this.currentPlayer).every(
                (piece) => piece.turnOver
            ) || this.phase === BoardPhase.Casting;

        if (turnOver) {
            this.deselectPlayer();
        }
        await this.moveGizmo.reset();

        return new Promise((resolve) => {
            setTimeout(async () => {
                if (turnOver) {
                    await this.nextPlayer();
                }
                resolve();
            }, Board.END_TURN_DELAY);
        });
    }

    /**
     * Select the wizard owned by the given player.
     * 
     * @param player The player whose wizard to select.
     * @returns The selected wizard, or null if no player is given or the game is over.
     */
    async selectWizard(player: Player): Promise<Wizard | null> {
        if (!player || this.state === BoardState.GameOver) {
            return null;
        }
        const ownedPieces: Piece[] = this.getPiecesByOwner(player);
        for (const piece of ownedPieces) {
            if (piece.type === UnitType.Wizard) {
                await this.selectPiece(piece.id);
                return piece as Wizard;
            }
        }
        throw new Error(`Player '${player.name}' does not own a wizard`);
    }

    /**
     * Remove a piece from the board by its ID.
     * 
     * @param id The ID of the piece to remove.
     */
    removePiece(id: number): void {
        if (!id || !this.getPiece(id)) {
            console.warn(`No piece with ID ${id} found to remove`);
            return;
        }
        this._pieces.delete(id);
    }

    /**
     * Get all adjacent points to a given point. Handles board edges.
     * 
     * @param point The point to get adjacent points for.
     * @returns An array of adjacent points.
     */
    getAdjacentPoints(point: Geom.Point, includeCentre?: boolean): Geom.Point[] {
        const points: Geom.Point[] = [];

        for (let x: number = point.x - 1; x <= point.x + 1; x++) {
            for (let y: number = point.y - 1; y <= point.y + 1; y++) {
                if (
                    // Not the origin
                    (x !== point.x || y !== point.y) &&
                    // Not off the board
                    x >= 0 &&
                    y >= 0 &&
                    x < this.width &&
                    y < this.height
                ) {
                    if (!includeCentre && x === point.x && y === point.y) {
                        continue;
                    }
                    points.push(new Geom.Point(x, y));
                }
            }
        }

        return points;
    }

    /**
     * Get all points within a given range of a point. Handles board edges.
     * 
     * @param point The point to get points around.
     * @param range The range to get points within.
     * @param includeCentre Whether to include the centre point (default: false)
     * @param moving Whether to use moving distance (default: false)
     * @returns An array of points within the given range.
     */
    getPointsInRange(point: Geom.Point, range: number, includeCentre?: boolean, rangeType?: RangeType): Geom.Point[] {
        const points: Geom.Point[] = [];
        for (let x: number = point.x - range; x <= point.x + range; x++) {
            for (let y: number = point.y - range; y <= point.y + range; y++) {
                if (
                    // Not off the board
                    x >= 0 &&
                    y >= 0 &&
                    x < this.width &&
                    y < this.height &&
                    // Within range
                    Board.distance(point, new Geom.Point(x, y), rangeType) <= range + (rangeType === RangeType.Fly ? 0.5 : 0)
                ) {
                    if (!includeCentre && x === point.x && y === point.y) {
                        continue;
                    }
                    points.push(new Geom.Point(x, y));
                }
            }
        }
        return points;
    }

    /**
     * Get all pieces adjacent to a given position, optionally filtered.
     * 
     * @param point The position to check around.
     * @param filter A filter function to apply to pieces found.
     * @param includeCentre Whether to include pieces at the centre point (default: false)
     * @returns An array of pieces found adjacent to the position.
     */
    getAdjacentPiecesAtPosition(
        point: Geom.Point,
        filter?: (piece: Piece) => boolean,
        includeCentre?: boolean
    ): Piece[] {
        // Use a set to avoid duplicates
        const neighbours: Set<Piece> = new Set();
        const position: Geom.Point = Geom.Point.Clone(point);
        for (const direction of Board.NEIGHBOUR_DIRECTIONS) {
            const directionNeighbours: Piece[] = this.getPiecesAtPosition(
                new Geom.Point(
                    position.x + direction.x,
                    position.y + direction.y
                ),
                filter
            );
            if (directionNeighbours) {
                directionNeighbours.forEach(piece => neighbours.add(piece));
            }
        }
        if (includeCentre) {
            const centreNeighbours: Piece[] = this.getPiecesAtPosition(
                position,
                filter
            );
            if (centreNeighbours) {
                centreNeighbours.forEach(piece => neighbours.add(piece));
            }
        }
        return Array.from(neighbours);
    }

    /**
     * Get all pieces at a given position, optionally filtered.
     * 
     * @param point The position to check.
     * @param filter A filter function to apply to pieces found.
     * @returns An array of pieces found at the position.
     */
    getPiecesAtPosition(point: Geom.Point, filter?: (piece: Piece) => boolean): Piece[] {
        return Array.from(
            this.pieces.filter((piece: Piece) => {
                return (
                    Geom.Point.Equals(piece.position, point) &&
                    (filter ? filter(piece) : true)
                );
            })
        );
    }

    /**
     * Check if a given point is a LoS blocker.
     * 
     * @param point The point to check.
     * @returns True if the point is visibly blocked, false otherwise.
     */
    isBlocker(point: Geom.Point): boolean {
        const pieces: Piece[] = this.getPiecesAtPosition(point, (piece) => {
            return !piece.hasStatus(UnitStatus.Transparent) && !piece.dead;
        });
        if (!pieces?.length) {
            return false;
        }
        return true;
    }

    /**
     * Recursively move a piece along a given path.
     * 
     * @param piece The piece to move.
     * @param path The path to move along.
     * @returns A promise that resolves when the piece has finished moving.
     */
    async movePath(piece: Piece, path: Path) {
        if (!path?.nodes?.length || path.nodes[0].terminal) {
            return;
        }
        this.sound.play("move");
        await piece.moveTo(
            path.nodes.shift().pos,
            Piece.DEFAULT_STEP_MOVE_DURATION
        );
        if (path.nodes.length > 0) {
            await this.movePath(piece, path);
        }
    }

    /**
     * Move a piece to a given position, handling pathfinding and movement
     * rules.
     * 
     * @param id The ID of the piece to move.
     * @param position The position to move the piece to.
     * @returns A promise that resolves to the moved piece.
     */
    async movePiece(id: number, position: Geom.Point): Promise<Piece> {
        const piece: Piece | null = this.getPiece(id);
        if (!piece) {
            throw new Error(`Could not find piece with ID ${id}`);
        }
        this.cursor.enabled = false;
        const path: Path = this.moveGizmo.getPathTo(position);
        const isFlying: boolean = piece.hasStatus(UnitStatus.Flying);
        if (isFlying || Board.distance(piece.position, position) <= 1.5) {
            this.sound.play(isFlying ? "fly" : "move");
            await piece.moveTo(position);
        } else if (path && path.nodes?.length > 1) {
            // Remove first step, as that's the piece's current position
            path.nodes.shift();
            await this.movePath(piece, path);
        } else {
            throw new Error(`No path to ${position.x}, ${position.y}`);
        }
        await this.moveGizmo.reset();
        piece.moved = true;
        this.cursor.enabled = true;

        if (!piece.currentMount && !piece.engaged) {
            const firstEngagingPiece: Piece | null =
                piece.getFirstEngagingPiece();

            if (firstEngagingPiece) {
                await piece.engage(firstEngagingPiece);
            } else {
                piece.attacked = true;
            }
        } else {
            piece.attacked = true;
        }

        setTimeout(async () => {
            await this.cursor.update(true);
            this.emitBoardUpdateEvent();
        }, 10);

        return piece;
    }

    /**
     * Perform an attack from one piece to another.
     * 
     * @param attackingPieceId The ID of the attacking piece.
     * @param defendingPieceId The ID of the defending piece.
     * @returns 
     */
    async attackPiece(
        attackingPieceId: number,
        defendingPieceId: number
    ): Promise<Piece | null> {
        const attackingPiece: Piece | null = this.getPiece(attackingPieceId);
        const defendingPiece: Piece | null = this.getPiece(defendingPieceId);
        if (!attackingPiece) {
            throw new Error(`Could not find piece with ID ${attackingPieceId}`);
        }
        if (!defendingPiece) {
            throw new Error(`Could not find piece with ID ${defendingPieceId}`);
        }
        const oldState: BoardState = this.state;
        this.state = BoardState.Busy;
        if (attackingPiece && defendingPiece) {
            const attackResult: boolean = await attackingPiece.attack(
                defendingPiece
            );
            this.state = oldState;
            if (attackResult) {
                await this.moveGizmo.reset();
            }
            return attackingPiece;
        }
        return null;
    }

    /**
     * Perform a ranged attack from one piece to another.
     * 
     * @param attackingPieceId The ID of the attacking piece.
     * @param defendingPieceId The ID of the defending piece.
     * @returns 
     */
    async rangedAttackPiece(
        attackingPieceId: number,
        defendingPieceId: number
    ): Promise<Piece | null> {
        const attackingPiece: Piece | null = this.getPiece(attackingPieceId);
        const defendingPiece: Piece | null = this.getPiece(defendingPieceId);
        if (!attackingPiece) {
            throw new Error(`Could not find piece with ID ${attackingPieceId}`);
        }
        if (!defendingPiece) {
            throw new Error(`Could not find piece with ID ${defendingPieceId}`);
        }
        const oldState: BoardState = this.state;
        this.state = BoardState.Busy;
        if (attackingPiece && defendingPiece) {
            const attackResult: boolean = await attackingPiece.rangedAttack(
                defendingPiece
            );
            this.state = oldState;
            if (attackResult) {
                await this.moveGizmo.reset();
            }
            return attackingPiece;
        }
        return null;
    }

    /**
     * Mount one piece onto another.
     * 
     * @param mountingPieceId The ID of the piece that will mount.
     * @param mountedPieceId The ID of the piece to be mounted.
     * @returns The mounting piece, or null if the mount failed.
     */
    async mountPiece(
        mountingPieceId: number,
        mountedPieceId: number
    ): Promise<Piece | null> {
        await this.moveGizmo.reset();
        const mountingPiece: Piece | null = this.getPiece(mountingPieceId);
        const mountedPiece: Piece | null = this.getPiece(mountedPieceId);
        if (!mountingPiece) {
            throw new Error(`Could not find piece with ID ${mountingPieceId}`);
        }
        if (!mountedPiece) {
            throw new Error(`Could not find piece with ID ${mountedPieceId}`);
        }
        if (mountingPiece && mountedPiece) {
            // If mounting piece is already mounted, dismount first
            if (mountingPiece.currentMount) {
                await mountingPiece.dismount();
                mountingPiece.moved = false
            }
            this.sound.play("move");
            await mountingPiece.mount(mountedPiece);
            this.emitBoardUpdateEvent();
            return mountingPiece;
        }
        return null;
    }

    /**
     * Dismount a piece from its current mount. If the piece is not mounted,
     * throws an error.
     * 
     * @param dismountingPieceId The ID of the piece to be dismounted.
     * @returns The dismounting piece, or null if the dismount failed.
     */
    async dismountPiece(dismountingPieceId: number): Promise<Piece | null> {
        const dismountingPiece: Piece | null =
            this.getPiece(dismountingPieceId);
        if (!dismountingPiece) {
            console.error(`Could not find piece with ID ${dismountingPieceId}`);
            return null;
        }
        this.sound.play("move");
        await dismountingPiece.dismount();
        this.emitBoardUpdateEvent();
        return dismountingPiece;
    }

    /**
     * Handle spreading effects on the board - called during the spreading phase
     * and recursively spreads pieces with the 'spreads' status.
     * 
     * @returns A promise that resolves when spreading is complete.
     */
    async doSpread(): Promise<void> {
        for (let i: number = 0; i < Board.SPREAD_ITERATIONS; i++) {
            const spreadPieces: Piece[] = this.pieces.filter((piece) =>
                piece.hasStatus(UnitStatus.Spreads)
            );
            for (const piece of spreadPieces) {
                await piece.spread();
            }
            this.emitBoardUpdateEvent();
            await this.idleDelay(Board.SPREAD_DELAY);
        }
    }

    /**
     * Handle expiring effects on the board - called at the end of the turn
     * to expire pieces with the 'expires' status.
     * 
     * @returns A promise that resolves when expiring is complete.
     */
    async doExpire(): Promise<void> {
        const expirePieces: Piece[] = this.pieces.filter((piece: Piece) =>
            piece.hasStatus(UnitStatus.Expires)
        );

        for (const piece of expirePieces) {
            if (piece.hasStatus(UnitStatus.Structure)) {
                if (this.roll(2, 10)) {
                    await this.playEffect(
                        EffectType.DisbelieveHit,
                        piece.sprite.getCenter(),
                        null,
                        piece
                    );
                    await piece.kill();
                    this.sound.play("disbelieve");
                    this.logger.log(
                        `${piece.name} has expired`,
                        Colour.Magenta
                    );
                }
            } else if (
                piece.hasStatus(UnitStatus.ExpiresGivesSpell) &&
                piece.currentRider &&
                this.roll(4, 10)
            ) {
                // TODO: This sound seems to be missing
                // this.sound.play("giftspell");
                await this.playEffect(
                    EffectType.GiveSpell,
                    piece.sprite.getCenter(),
                    null,
                    piece
                );
                const owner: Player = piece.currentRider.owner;
                this.addSpell(
                    piece.currentRider.owner,
                    Spell.getRandomSpell(true)
                );
                await piece.kill();
                this.logger.log(
                    `${piece.name} has expired and gifted ${owner.name} a new spell`,
                    Colour.Cyan
                );
                await this.idleDelay(Board.DEFAULT_DELAY);
            }
        }
        this.emitBoardUpdateEvent();
        await this.newTurn();
    }

    /* #endregion */

    /* #region Players */

    /**
     * Get all players in the game.
     */
    get players(): Player[] {
        return Array.from(this._players.values());
    }

    /**
     * Get the current player whose turn it is.
     */
    get currentPlayer(): Player | null {
        return this._currentPlayer;
    }

    /**
     * Add a new player to the game.
     * 
     * @param config The configuration for the player to add.
     * @returns The newly added player.
     */
    addPlayer(config: PlayerConfig): Player {
        const player: Player = new Player(this, this._idCounter++, config);
        this._players.set(player.id, player);
        player.colour = Player.PLAYER_COLOURS[this._players.size - 1];
        return player;
    }

    /**
     * Add a new spell to a player's spellbook.
     * 
     * @param player The player to add the spell to.
     * @param config The configuration for the spell to add.
     * @returns The newly added spell.
     */
    addSpell(player: Player, config: SpellConfig): Spell {
        if (!config || !player) {
            throw new Error("No player or config provided");
        }
        let spell: Spell;
        if (config.unitId) {
            spell = new SummonSpell(this, this._idCounter++, config);
        } else if (config.damage) {
            spell = new AttackSpell(this, this._idCounter++, config);
        } else {
            spell = new Spell(this, this._idCounter++, config);
        }
        player.addSpell(spell);
        return spell;
    }

    /**
     * Get a player by their ID.
     * 
     * @param id The ID of the player to retrieve.
     * @returns The player with the specified ID, or null if not found.
     */
    getPlayer(id: number): Player | null {
        if (this._players.has(id)) {
            return this._players.get(id);
        }
        return null;
    }

    /**
     * Update the background colour based on the current player's colour.
     * 
     * @returns A promise that resolves when the background colour has been updated.
     */
    private async updateBackgroundColour(): Promise<void> {
        return new Promise((resolve) => {
            if (this._currentPlayer?.colour) {
                document.body.style.setProperty(
                    "--bg-colour",
                    `${
                        Display.Color.ValueToColor(
                            this._currentPlayer.colour
                        ).rgba
                    }`
                );
                this.getLayer(BoardLayer.Floor)
                    .getChildren()
                    .forEach((child) => {
                        const tintColour: Display.Color =
                            Display.Color.ValueToColor(
                                this._currentPlayer.colour
                            );
                        (child as GameObjects.Sprite).setTint(
                            tintColour.brighten(80).color
                        );
                    });
            } else {
                this.getLayer(BoardLayer.Floor)
                    .getChildren()
                    .forEach((child) => {
                        (child as GameObjects.Sprite).clearTint();
                    });
                document.body.style.removeProperty("--bg-colour");
            }
            setTimeout(() => {
                resolve();
            }, 100);
        });
    }

    /**
     * Select a player by their ID.
     * 
     * @param id The ID of the player to select.
     * @returns A promise that resolves when the player has been selected.
     */
    async selectPlayer(id: number): Promise<void> {
        // De-highlight all pieces
        this.pieces.forEach((piece: Piece) => {
            piece.highlighted = false;
        });

        // Set current player
        this._currentPlayer = this.getPlayer(id);

        if (!this._currentPlayer) {
            console.trace("No current player to select");
            return;
        }

        // If the current player is defeated, skip their turn
        if (this._currentPlayer.defeated) {
            return;
        }

        const units: Piece[] = this.pieces.filter(
            (piece: Piece) =>
                piece.owner === this._currentPlayer ||
                piece.currentRider?.owner === this._currentPlayer
        );

        await this.updateBackgroundColour();

        let previousVal = 0;

        switch (this.phase) {
            case BoardPhase.Spellbook:
                this.sound.play("endturn");
                this.logger.log(
                    `${this.currentPlayer?.name}'s turn to select a spell`
                );
                // this.centreOnPieces([this.currentPlayer.castingPiece]);
                break;
            case BoardPhase.Casting:
                if (this.currentPlayer?.selectedSpell) {
                    this.logger.log(
                        `${this.currentPlayer?.name}'s turn to cast '${this.currentPlayer.selectedSpell.name}'`
                    );
                    // this.centreOnPieces([this.currentPlayer.castingPiece]);
                } else {
                    this.sound.play("cancel");
                    this.logger.log(
                        `Skipping ${this.currentPlayer?.name}'s casting turn (no spell selected)`,
                        Colour.Magenta
                    );
                }
                break;
            case BoardPhase.Moving:
                this.sound.play("endturn");
                this.logger.log(
                    `${this.currentPlayer?.name}'s turn to move`
                );
                // this.centreOnPieces(units);
                break;
        }

        return new Promise<void>((resolve) => {
            this.scene.tweens.addCounter({
                from: 0,
                to: Board.NEW_TURN_HIGHLIGHT_STEPS,
                onUpdate: (tween) => {
                    const currentVal = Math.round(tween.getValue()) % 2;
                    if (currentVal !== previousVal) {
                        previousVal = currentVal;
                        units.forEach((piece: Piece) => {
                            const target: GameObjects.Sprite =
                                piece.sprite;
                            currentVal === 0
                                ? target.setTintFill(
                                    this._currentPlayer?.colour ||
                                        0xffffff
                                )
                                : target.setTint(piece.defaultTint);
                        });
                    }
                },
                onComplete: () => {
                    units.forEach((piece: Piece) => {
                        const target: GameObjects.Sprite =
                            piece.sprite;
                        target.setTint(piece.defaultTint);
                        piece.turnOver = false;
                        piece.highlighted = true;
                    });
                    resolve();
                },
                duration: Board.NEW_TURN_HIGHLIGHT_DURATION,
            });

            // Beep beep beep for casting phase
            if (this.phase === BoardPhase.Casting) {
                this.sound.playAsync("chaoskeypress2", {
                    repeat: 3,
                    delay: 175
                });
            }
        });
    }

    /**
     * Highlight all units owned by the player at the given index.
     * 
     * @param playerIndex The index of the player whose units to highlight.
     * @param silent Whether to suppress logging output (default: false).
     */
    async highlightOwnedUnitsForPlayerIndex(playerIndex: number, silent?: boolean): Promise<void> {
        const playerId: number = Array.from(this._players.keys())[playerIndex];
        const player: Player | null = this.getPlayer(playerId);
        if (!player) {
            return;
        }
        const units: Piece[] = this.pieces.filter(
            (piece: Piece) =>
                piece.owner === player ||
                piece.currentRider?.owner === player
        );
        if (!silent) {
            this.logger.log(
                `Highlighting ${player.name}'s units`,
                Colour.Yellow
            );
        }
        await Promise.all(
            units.map(async (piece: Piece) => {
                await piece.flashHighlight();
            })
        );
    }

    /**
     * Centre the camera on a given piece.
     * 
     * @param piece The piece to centre the camera on.
     * @returns A promise that resolves when the camera has centred.
     */
    async centreOnPieces(pieces: Piece[]): Promise<void> {
        if (!pieces?.length) {
            return;
        }

        // Get the centroid of all pieces
        const camera: Cameras.Scene2D.Camera = this.scene.cameras.main;
        const avgX: number = pieces.reduce((sum, piece) => sum + piece.position.x, 0) / pieces.length;
        const avgY: number = pieces.reduce((sum, piece) => sum + piece.position.y, 0) / pieces.length;
        const targetPosition: Geom.Point = this.getScreenPosition(new Geom.Point(avgX, avgY));
        console.log(`Centring camera on pieces at ${targetPosition.x}, ${targetPosition.y}`);

        return new Promise<void>((resolve) => {
            this.scene.tweens.add({
                targets: camera,
                x: -targetPosition.x - (camera.width / 2),
                duration: Board.DEFAULT_DELAY,
                ease: "Power2",
                onComplete: () => {
                    resolve();
                }
            });
        });
    }            

    /**
     * Deselect the current player.
     */
    deselectPlayer(): void {
        this._currentPlayer = null;
        this.moveGizmo.reset();
        this._selected = null;
        this.scene.game.events.emit("end-turn-available", false);
    }

    /**
     * Start a new game.
     */
    async startGame(): Promise<void> {
        this._currentPlayerIndex = -1;
        this._currentPlayer = null;
        this.state = BoardState.Idle;
        this.phase = BoardPhase.Idle;
        await this.nextPlayer();
    }

    /**
     * Resume a scenario.
     * 
     * @param playerIndex The index of the player whose turn it is.
     * @param phase The phase to resume at.
     */
    async resumeGame(playerIndex: number, phase: BoardPhase): Promise<void> {
        this._currentPlayerIndex = playerIndex - 1;
        this._currentPlayer = null;
        this.state = BoardState.Idle;
        this.phase = phase || BoardPhase.Idle;
        console.log(`Resuming game at player index ${this._currentPlayerIndex} and phase ${BoardPhase[this.phase]}`);
        this.nextPlayer();
    }

    /**
     * Check for win conditions. If only one or zero players remain undefeated,
     * the game is over.
     * 
     * @returns True if the game is over, false otherwise.
     */
    async checkWinCondition(): Promise<boolean> {
        if (this.state === BoardState.GameOver) {
            return true;
        }
        const undefeated: Player[] = this.players.filter(
            (player) => !player.defeated
        );
        // If less than 2 players remain undefeated, the game is over
        if (undefeated?.length < 2) {
            this.state = BoardState.GameOver;
            if (undefeated.length === 1) {
                this.logger.log(
                    `Game over! ${undefeated[0].name} wins!`,
                    Colour.Yellow
                );
            } else if (undefeated.length < 1) {
                // Somehow everyone got murked, likely the blobs or magic fire
                // got out of control. Game over with no winner.
                this.logger.log(`Game over! Everybody's dead Dave.`, Colour.Yellow);
            }
            this.scene.game.events.emit("game-over");
            return true;
        }
        return false;
    }

    /**
     * Advance to the next player's turn.
     */
    async nextPlayer(): Promise<void> {
        while (true) {
            if (
                this.state == BoardState.GameOver ||
                (await this.checkWinCondition())
            ) {
                return;
            }

            this._currentPlayerIndex =
                (this._currentPlayerIndex + 1) % this._players.size;
            this.deselectPlayer();

            if (this._currentPlayerIndex === 0) {
                await this.newTurn();
            }

            await this.selectPlayer(
                Array.from(this._players.keys())[this._currentPlayerIndex]
            );

            // Skip defeated players
            if (this.currentPlayer?.defeated) {
                continue;
            }

            // Handle spellbook phase
            if (this.phase === BoardPhase.Spellbook) {
                if (this.currentPlayer?.ai) {
                    if (!await this.currentPlayer.ai.selectSpell()) {
                        console.log("AI could not select spell, skipping...");
                    }
                    continue;
                }
                else if (this.currentPlayer?.spells?.length) {
                    return new Promise<void>((resolve) => {
                        this.scene.game.events.emit("spellbook-open", <SpellbookOpenEventData>{ 
                            data: {
                                caster: this.currentPlayer?.name,
                                spells: this.currentPlayer?.spells,
                            },
                            callback: async (spell: Spell | null) => {
                                if (spell) {
                                    this.currentPlayer?.pickSpell(spell.id);
                                }
                                this.scene.game.events.emit("spellbook-close");
                                resolve();
                                await this.nextPlayer();
                            },
                        });
                    });
                }
            } else {
                this.scene.game.events.emit("spellbook-close");
            }

            // Skip if no spells available in spellbook phase
            if (this._phase === BoardPhase.Spellbook) {
                if (this.currentPlayer?.spells.length === 0) {
                    continue;
                }
            }

            // Handle casting phase
            if (this._phase === BoardPhase.Casting) {
                await this.selectWizard(this.currentPlayer);

                if (this.selected) {
                    const spell: Spell = this.currentPlayer?.selectedSpell;
                    if (spell?.range === 0) {
                        await this.rules.doCastSpell(
                            this,
                            spell,
                            this.currentPlayer.castingPiece
                        );
                        continue;
                    } else if (spell?.range > 0) {
                        await this.moveGizmo.showSimpleRange(
                            this.selected.position,
                            spell.range,
                            CursorType.RangeCast,
                            spell.lineOfSight
                        );
                        if (this.currentPlayer?.ai) {
                            if (!await this.currentPlayer.ai.castSpell()) {
                                console.log("AI could not cast spell, skipping...");
                            }
                            continue;
                        }
                    } else if (spell?.range === -1) {
                        if (this.currentPlayer?.ai) {
                            if (!await this.currentPlayer.ai.castSpell()) {
                                console.log("AI could not cast spell, skipping...");
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

            if (this.phase === BoardPhase.Moving && this.currentPlayer?.ai) {
                await this.currentPlayer.ai.moveAllUnits();
                await this.nextPlayer();
            }

            // Exit loop - player's turn is ready
            break;
        }
        // Update cursor after a short delay to allow any UI changes to settle
        setTimeout(() => {
            this.cursor.update(true);
        }, 100);
    }
    /* #endregion */

    /* #region Initialisation */

    /**
     * Create the floor layer of the board.
     */
    createFloor() {
        const floorLayer: GameObjects.Layer = this.scene.add.layer();

        for (let x: number = 0; x < this.width; x++) {
            for (let y: number = 0; y < this.height; y++) {
                const isoPos: Geom.Point = this.getIsoPosition(
                    new Geom.Point(x, y)
                );

                const tile: GameObjects.Image = this.scene.add.image(
                    isoPos.x,
                    isoPos.y,
                    "board",
                    "empty"
                );

                tile.setDisplayOrigin(14, 1);
                tile.setActive(false);

                floorLayer.add(tile);
            }
        }

        floorLayer.setActive(false);

        this._layers.set(BoardLayer.Floor, floorLayer);
    }

    /**
     * Play a board effect.
     * 
     * @param type The type of effect to play.
     * @param startPosition The starting position of the effect.
     * @param endPosition The ending position of the effect (if applicable).
     * @param target The target piece of the effect (if applicable).
     * @returns A promise that resolves when the effect is complete.
     */
    async playEffect(
        type: EffectType,
        startPosition: PMath.Vector2 | Geom.Point,
        endPosition?: PMath.Vector2 | Geom.Point,
        target?: Piece
    ): Promise<void> {
        return new Promise((resolve) => {
            this._particles.addEmitter(
                new EffectEmitter(
                    this._particles,
                    type,
                    startPosition,
                    endPosition,
                    target,
                    resolve
                )
            );
        });
    }

    /**
     * Set up the effects layer. This includes pre-Phaser 3.6 particle system
     * shenanigans which will need to be refactored eventually.
     */
    createEffects() {
        const effectsLayer: GameObjects.Layer = this.scene.add.layer();

        this._particles = this.scene.add.particles("effects");

        this._layers.set(BoardLayer.Effects, effectsLayer);
    }

    /* #endregion */

    /* #region Utils */

    /**
     * Get the Phaser scene the board is in.
     */
    get scene(): Scene {
        return this._scene;
    }

    /**
     * Get the sound effects manager.
     */
    get sound(): SoundEffects {
        return this._sound;
    }

    /**
     * Get the width of the board in tiles.
     */
    get width(): number {
        return this._width;
    }

    /**
     * Get the height of the board in tiles.
     */
    get height(): number {
        return this._height;
    }

    /**
     * Get a specific layer of the board.
     * 
     * @param layer The layer to get.
     * @returns The requested layer.
     */
    getLayer(layer: BoardLayer): GameObjects.Layer {
        return this._layers.get(layer);
    }

    /**
     * Convert a point to isometric coordinates.
     * 
     * @param point The point to convert.
     * @returns The isometric coordinates of the point.
     */
    getIsoPosition(point: Geom.Point): Geom.Point {
        const newPoint: Geom.Point = Geom.Point.Clone(point);

        newPoint.x *= Board.DEFAULT_CELLSIZE;
        newPoint.y *= Board.DEFAULT_CELLSIZE;

        const isoPos: Geom.Point = Board.toIsometric(newPoint);

        isoPos.y += Board.DEFAULT_CELLSIZE / 2;

        return isoPos;
    }

    /**
     * Get the screen position of a point on the board.
     * 
     * @param point The point to get the screen position for.
     * @returns The screen position of the point.
     */
    getScreenPosition(point: Geom.Point): Geom.Point {
        const isoPos: Geom.Point = this.getIsoPosition(point);

        const screenPos: Geom.Point = new Geom.Point(
            isoPos.x + this.scene.cameras.main.scrollX,
            isoPos.y + this.scene.cameras.main.scrollY
        );

        return screenPos;
    }

    /**
     * Roll an attack vs defense check.
     * 
     * @param attack the attack value
     * @param defense the defense value
     * @returns true if the attack is greater than the defense, false otherwise
     */
    roll(attack: number, defense: number): boolean {
        if (Board.CHEAT_FORCE_HIT !== null) {
            return Board.CHEAT_FORCE_HIT;
        }
        const attackRoll: number = PMath.Between(0, 10 + attack);
        const defenseRoll: number = PMath.Between(0, 10 + defense);
        console.debug(`Rolled ${attackRoll} vs ${defenseRoll}; attack ${
            attackRoll > defenseRoll ? "succeeds" : "fails"
        }`);
        return attackRoll > defenseRoll;
    }

    /**
     * Roll a chance check for spell casting.
     * 
     * @param attack the chance value (0 to 1)
     * @returns true if the chance check succeeds, false otherwise
     */
    rollChance(attack: number): boolean {
        if (Board.CHEAT_FORCE_CAST !== null) {
            return Board.CHEAT_FORCE_CAST;
        }
        const defenseRoll: number = PMath.RND.frac();
        if (attack < 0 || attack > 1) {
            console.warn(`Chance value ${attack} is out of bounds, clamping to 0-1`);
            attack = Math.max(0, Math.min(1, attack));
        }
        console.debug(`Rolled ${attack} vs ${defenseRoll}; chance ${
            attack > defenseRoll ? "succeeds" : "fails"
        }`);
        return attack > defenseRoll;
    }

    /**
     * Check if there is line of sight between two positions on the board.
     * 
     * @param startPosition the starting position
     * @param endPosition the ending position
     * @returns true if there is line of sight, false otherwise
     */
    hasLineOfSight(
        startPosition: Geom.Point | PMath.Vector2,
        endPosition: Geom.Point | PMath.Vector2
    ): boolean {
        let xDiff: number = endPosition.x - startPosition.x;
        let yDiff: number = endPosition.y - startPosition.y;

        let xDir: number, yDir: number;

        let a: number = 1;

        let xVal: number, yVal: number;

        let numChecks: number;

        xDir = xDiff < 0 ? -1 : 1;
        yDir = yDiff < 0 ? -1 : 1;

        if (xDiff === 0 || yDiff === 0) {
            if (yDiff === 0) {
                for (a = 1; a < Math.abs(xDiff); a++) {
                    xVal = a * xDir + startPosition.x;
                    if (
                        this.isBlocker(
                            new Geom.Point(xVal, startPosition.y)
                        )
                    ) {
                        return false;
                    }
                }
            } else {
                for (a = 1; a < Math.abs(yDiff); a++) {
                    yVal = a * yDir + startPosition.y;
                    if (
                        this.isBlocker(
                            new Geom.Point(startPosition.x, yVal)
                        )
                    ) {
                        return false;
                    }
                }
            }
        } else {
            numChecks = Math.max(Math.abs(xDiff), Math.abs(yDiff));
            let yInc = yDiff / numChecks,
                xInc = xDiff / numChecks;

            for (a = 1; a < numChecks; a++) {
                xVal = startPosition.x + Math.round(xInc * a);
                yVal = startPosition.y + Math.round(yInc * a);
                if (this.isBlocker(new Geom.Point(xVal, yVal))) {
                    return false;
                }
            }
        }

        return true;
    }



    /**
     * Calculate distance between two points on the board.
     * 
     * @param startPosition the starting position
     * @param endPosition the ending position
     * @param moving whether the distance is for movement (default: false)
     * @returns the distance between the two points
     */
    static distance(startPosition: Geom.Point, endPosition: Geom.Point, rangeType: RangeType = RangeType.Fly): number {
        if (Geom.Point.Equals(startPosition, endPosition)) {
            return 0;
        }
        // Calculate the difference in x and y coordinates
        const difference: Geom.Point = new Geom.Point(
            Math.abs(startPosition.x - endPosition.x),
            Math.abs(startPosition.y - endPosition.y)
        );

        // If on foot, just use max distance, as the pathfinding will handle the
        // actual movement cost
        if (rangeType === RangeType.Foot) {
            return Math.max(difference.x, difference.y);
        }

        // Otherwise (for ranged attacks), use modified distance calculation
        return (
            Math.max(difference.x, difference.y) -
            Math.min(difference.x, difference.y) +
            Math.min(difference.x, difference.y) * 1.5
        );
    }

    /**
     * Convert a point to isometric coordinates.
     * 
     * @param point The point to convert.
     * @returns The converted point.
     */
    static toIsometric(point: Geom.Point): Geom.Point {
        return new Geom.Point(
            point.x - point.y,
            (point.x + point.y) / 2
        );
    }

    /**
     * Convert a point from isometric coordinates to cartesian.
     * 
     * @param point The point to convert.
     * @returns The converted point.
     */
    static fromIsometric(point: Geom.Point): Geom.Point {
        return new Geom.Point(
            point.x + point.y / 2,
            point.y - point.x / 2
        );
    }

    /**
     * Delay the board state to Idle for a given time.
     * 
     * @param time The delay time in milliseconds.
     */
    async idleDelay(time: number = Board.DEFAULT_DELAY): Promise<void> {
        const oldState: BoardState = this.state;
        this.state = BoardState.Idle;
        await Board.delay(time);
        this.state = oldState;
    }

    /**
     * Delay the board state to Busy for a given time.
     * 
     * @param time The delay time in milliseconds.
     */
    async busyDelay(time: number = Board.DEFAULT_DELAY): Promise<void> {
        const oldState: BoardState = this.state;
        this.state = BoardState.Busy;
        await Board.delay(time);
        this.state = oldState;
    }

    /**
     * Delay for a given time.
     * 
     * @param time The delay time in milliseconds.
     */
    static async delay(time: number = Board.DEFAULT_DELAY): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, time);
        });
    }

    /* #endregion */

    /* #region Dev helpers */

    /**
     * Get a random empty space on the board.
     * @returns 
     */
    getRandomEmptySpace(): Geom.Point {
        // First find where all the occupied spaces are
        const occupiedSpaces: Set<string> = new Set();
        this.pieces
            .filter((piece: Piece) => !piece.dead)
            .forEach((piece: Piece) => {
                occupiedSpaces.add(`${piece.position.x},${piece.position.y}`);
            });

        // Now build a list of all empty spaces
        const emptySpaces: Geom.Point[] = [];
        for (let x: number = 0; x < this.width; x++) {
            for (let y: number = 0; y < this.height; y++) {
                const key: string = `${x},${y}`;
                if (!occupiedSpaces.has(key)) {
                    emptySpaces.push(new Geom.Point(x, y));
                }
            }
        }
        if (emptySpaces.length === 0) {
            console.warn("No empty spaces available on the board!");
            return null;
        }
        // Return a random empty space
        return PMath.RND.pick(emptySpaces);
    }

    /**
     * Destroy the board and all its pieces and layers.
     */
    destroy() {
        this.pieces?.forEach((piece: Piece) => {
            piece.destroy();
        });

        this._layers?.forEach((layer: GameObjects.Layer) => {
            layer.destroy();
        });
        this._particles?.destroy();
        // this._sound.destroy();
    }

    /* #endregion */
}

/**
 * Types of range calculations.
 */
export enum RangeType {
    /**
     * Foot range.
     */
    Foot,

    /**
     * Flying range.
     */
    Fly,

    /**
     * Ranged attack range.
     */
    RangedAttack
}