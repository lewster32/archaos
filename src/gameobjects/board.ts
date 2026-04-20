import {
    Board as EngineBoard,
    BoardEvent,
    EngineEvent,
    BoardLayer,
    SimplePoint,
    BoardPhase,
    BoardState,
    Colour,
    CursorType,
    EventType,
    InputType,
    UnitStatus,
    UnitType,
    Path,
    Point,
    Spell,
    createSpell,
    StartGame,
    SpellbookReady,
    SkipSpellbook,
    SpellsDone,
    NoSpellsCast,
    CastingReady,
    CastingDone,
    SpreadingDone,
    MovingReady,
    MovingDone,
    SelectPiece,
    PieceDeselected,
    RequestDismount,
    CompleteDismount,
    SpellTargeting,
} from "@archaos/engine";
import type {
    BoardDeps,
    PieceConfig,
    WizardConfig,
    PlayerConfig,
    SpellConfig,
    BoardUpdateEventData,
    SpellbookOpenEventData,
    SpreadBatchPayload,
    TurmoilBatchPayload,
    RemotePlayer,
} from "@archaos/engine";
import { Cursor } from "./cursor";
import { createEffect, EffectType } from "./effectemitter";
import { Piece } from "./piece";
import { Player } from "./player";
import { RangeGizmo } from "./rangegizmo";
import { Rules } from "./services/rules";
import { SoundEffects } from "./soundeffects";
import { Wizard } from "./wizard";
import type { Tutorial } from "./tutorials/tutorial";
import { Display, GameObjects, Scene, Math as PMath, Cameras, TintModes } from "phaser";

// Weather
import { RainEffect, SnowEffect, WeatherEffect, WeatherType } from "./boardeffects/weather";

/**
 * The main game board. This is where the magic (literally) happens.
 *
 * @param scene The Phaser scene the board will be present in.
 * @param id The unique ID of this board.
 * @param width The width of the board in cells.
 * @param height The height of the board in cells.
 */
export class Board extends EngineBoard<Piece> {
    public static CHEAT_SHORT_DELAY: boolean = false;

    static get DEFAULT_DELAY(): number {
        return this.CHEAT_SHORT_DELAY ? 10 : 750;
    }

    static get END_TURN_DELAY(): number {
        return this.CHEAT_SHORT_DELAY ? 10 : 1500;
    }

    static get SPREAD_DELAY(): number {
        return this.CHEAT_SHORT_DELAY ? 10 : 250;
    }

    static get NEW_TURN_HIGHLIGHT_DURATION(): number {
        return this.CHEAT_SHORT_DELAY ? 10 : 700;
    }

    static readonly NEW_TURN_HIGHLIGHT_STEPS: number = 7;

    /**
     * The Phaser scene the board is present in.
     */
    private readonly _scene: Scene;

    /**
     * The different visual layers of the board.
     */
    private readonly _layers: Map<BoardLayer, GameObjects.Layer>;

    /**
     * The cursor for this board.
     */
    private readonly _cursor: Cursor;

    /**
     * The sound effects manager for this board.
     */
    private _sound: SoundEffects;

    /**
     * The active tutorial, if any.
     */
    private _tutorial: Tutorial | null = null;

    /**
     * Abort controller for the viewport media query listener.
     */
    private readonly _viewportListenerAbort: AbortController = new AbortController();

    constructor(
        scene: Scene,
        id: number,
        width: number = Board.DEFAULT_WIDTH,
        height: number = Board.DEFAULT_HEIGHT,
        classicBalance: boolean = false,
        seed?: string,
        deps?: BoardDeps,
    ) {
        super(id, width, height, classicBalance, seed, deps);
        this._scene = scene;
        this._layers = new Map();

        this.createFloor();
        this._layers.set(BoardLayer.FloorCursors, this.scene.add.layer());
        this._layers.set(BoardLayer.PathCursors, this.scene.add.layer());
        this._layers.set(BoardLayer.Shadows, this.scene.add.layer());
        this._layers.set(BoardLayer.Pieces, this.scene.add.layer());

        this._scene.game.scale.resize(
            this.width * Board.DEFAULT_CELLSIZE * 2 + Board.DEFAULT_CELLSIZE * Board.HORIZONTAL_PAD_CELLS * 2,
            this.height * Board.DEFAULT_CELLSIZE + Board.DEFAULT_CELLSIZE * Board.VERTICAL_PAD_CELLS * 2,
        );

        // Camera bounds cover the full board regardless of viewport size.
        const boardPixelWidth: number = this._scene.game.scale.width;
        const boardPixelHeight: number = this._scene.game.scale.height;
        this._scene.cameras.main.setBounds(
            boardPixelWidth / -2,
            Board.DEFAULT_CELLSIZE * -Board.VERTICAL_PAD_CELLS,
            boardPixelWidth,
            boardPixelHeight,
        );

        this.setupViewportResizing(boardPixelWidth, boardPixelHeight);

        this._cursor = new Cursor(this);
        this._rangeGizmo = new RangeGizmo(this);

        this.scene.game.events.on(EventType.EndTurn, async () => {
            if (!this.cursor.enabled || this.state === BoardState.GameOver) {
                return;
            }
            await this.nextPlayer();
        });

        this.scene.game.events.on(EventType.Dismount, async () => {
            if (
                !this.cursor.enabled ||
                !this.selected ||
                this.state === BoardState.GameOver ||
                this.state === BoardState.Dismount
            ) {
                return;
            }
            if ((!this.selected.moved || this.selected.stats.movement === 0) && this.selected.currentRider) {
                this.logger.log(
                    `Dismount ${this.selected.currentRider.owner.name}? (${Cursor.CANCEL_KEY} to cancel)`,
                    Colour.Yellow,
                );
                await this.selectPiece(this.selected.currentRider.id);
                this.stateManager.evaluate(new RequestDismount());
                await this.rangeGizmo.generate(this.selected);
            }
        });

        this.createEffects();

        this._sound = SoundEffects.getInstance(this.scene);

        this._sound.play("screenactive", false);

        document.addEventListener("highlight-owned-units", (event: CustomEvent) => {
            const owner: Player = event.detail;
            this.highlightOwnedUnitsForPlayer(this.getPlayer(owner.id));
        });

        // Engine event subscriptions — the engine
        // emits these; the client handles rendering.
        this.events.on(EngineEvent.AiThinking, () => {
            this.cursor.enabled = false;
        });
        this.events.on(EngineEvent.AiActing, () => {
            this.cursor.enabled = false;
        });
        this.events.on(EngineEvent.FocusPieces, (data: { pieceIds: number[] }) => {
            const pieces = data.pieceIds.map((pid) => this.getPiece(pid)).filter(Boolean) as Piece[];
            this.centreOnPieces(pieces);
        });
        this.events.on(EngineEvent.FocusPosition, (data: { position: SimplePoint }) => {
            this.centreOnPosition(new PMath.Vector2(data.position.x, data.position.y));
        });
        this.events.on(
            EngineEvent.EffectRequested,
            async (data: {
                type?: EffectType;
                pieceId?: number;
                startPieceId?: number;
                startPosition?: SimplePoint;
                targetPosition?: SimplePoint;
                sound?: string;
                soundOptions?: {
                    repeat?: number;
                    delay?: number;
                };
            }) => {
                if (data.sound) {
                    if (data.soundOptions) {
                        await this.sound.playAsync(data.sound, data.soundOptions);
                    } else {
                        this.sound.play(data.sound);
                    }
                }
                if (data.type) {
                    const piece = data.pieceId ? this.getPiece(data.pieceId) : null;
                    const startPiece = data.startPieceId ? this.getPiece(data.startPieceId) : null;
                    const startPos = startPiece
                        ? startPiece.sprite.getCenter()
                        : data.startPosition
                          ? this.getIsoPosition(new PMath.Vector2(data.startPosition.x, data.startPosition.y))
                          : null;
                    const targetPos = data.targetPosition
                        ? this.getIsoPosition(new PMath.Vector2(data.targetPosition.x, data.targetPosition.y))
                        : piece
                          ? piece.sprite.getCenter()
                          : null;
                    await this.playEffect(
                        data.type,
                        (startPos ?? targetPos) as PMath.Vector2,
                        targetPos as PMath.Vector2,
                        piece,
                    );
                }
            },
        );
        this.events.on(
            EngineEvent.ShowCastRange,
            async (data: { position: SimplePoint; range: number; lineOfSight: boolean }) => {
                await this.rangeGizmo.showSimpleRange(
                    data.position,
                    data.range,
                    CursorType.RangeCast,
                    data.lineOfSight,
                );
            },
        );
        this.events.on(EngineEvent.ResetCastRange, () => {
            this.rangeGizmo.reset();
        });
        this.events.on(EngineEvent.SpreadBatch, async (payload: SpreadBatchPayload) => {
            for (const iteration of payload.iterations) {
                const focusPieces = iteration.focusPieceIds.map((pid) => this.getPiece(pid)).filter(Boolean) as Piece[];
                if (focusPieces.length) {
                    this.centreOnPieces(focusPieces);
                }
                for (const result of iteration.results) {
                    if (result.action === "none") continue;
                    if (result.action === "shrink") {
                        // Shrink animation is spread-specific
                        // visual — not handled by kill()/destroy()
                        const piece = this.getPiece(result.pieceId);
                        if (piece) {
                            await piece.playShrinkAnimation();
                        }
                        continue;
                    }
                    // result.action === "spread"
                    // Kill/destroy visuals already fired via
                    // polymorphic overrides during engine
                    // spread(). Only handle spread-specific
                    // visuals here: new piece sprites and
                    // blob sounds.
                    const newPiece = this.getPiece(result.newPieceId);
                    if (newPiece && !newPiece.sprite) {
                        newPiece.initSprites();
                    }
                    this.sound.play(`blob${Math.random() < 0.5 ? 1 : 2}`, false);
                    if (
                        result.killedPieceId != null ||
                        result.destroyedPieceIds.length > 0 ||
                        result.newPieceEngulfedId != null
                    ) {
                        await this.idleDelay(Piece.DEFAULT_MOVE_DURATION);
                    }
                }
                this.emitBoardUpdateEvent();
                await this.idleDelay(Board.SPREAD_DELAY);
            }
        });
        this.events.on(EngineEvent.TurmoilBatch, async (payload: TurmoilBatchPayload) => {
            const caster = this.getPiece(payload.castingPieceId);
            if (caster) {
                this.sound.play("die");
                await this.playEffect(EffectType.WizardCasting, caster.sprite.getCenter());
            }
            for (const move of payload.moves) {
                const piece = this.getPiece(move.pieceId);
                if (!piece) continue;
                this.sound.play("die");
                const startPos = this.getIsoPosition(new PMath.Vector2(move.from.x, move.from.y));
                const endPos = this.getIsoPosition(new PMath.Vector2(move.to.x, move.to.y));
                await this.playEffect(EffectType.TurmoilBeam, startPos, endPos, piece);
                await piece.updatePosition(500);
            }
            await this.idleDelay(Board.DEFAULT_DELAY);
        });
        this.events.on(EventType.PieceInfo, (data: any) => {
            globalThis.dispatchEvent(new CustomEvent(EventType.PieceInfo, { detail: data }));
        });

        // 30% chance of weather on a fresh board. Scenarios can override
        // this by calling `startWeather` explicitly with options.
        if (Math.random() <= 0.3) {
            // Earlier on today, apparently, a woman rung the BBC and said
            // she heard there was a hurricane on the way... well, if you're
            // watching, don't worry, there isn't!
            // ~ Michael Fish
            this.startWeather();
        }

        // Debugging aid
        globalThis["currentBoard"] = this;
    }

    /* #region Timing */

    override async delay(time: number = (this.constructor as typeof Board).DEFAULT_DELAY): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, time));
    }

    /* #endregion */

    /* #region State */

    /**
     * Override FSM state-change to emit UI button events.
     */
    protected override onStateChange(newState: BoardState): void {
        if (newState === BoardState.Move || newState === BoardState.SelectSpell) {
            setTimeout(() => {
                if (this.currentPlayer && !this.currentPlayer.remote && !this.tutorial?.config.disableEndTurn) {
                    this.emitUIEvent(EventType.EndTurnAvailable, true);
                } else {
                    this.emitUIEvent(EventType.EndTurnAvailable, false);
                }
            });
        } else {
            setTimeout(() => {
                if (this.currentPlayer && !this.currentPlayer.remote && !this.tutorial?.config.disableCancelSpell) {
                    this.emitUIEvent(EventType.CancelAvailable, true);
                } else {
                    this.emitUIEvent(EventType.CancelAvailable, false);
                }
                this.emitUIEvent(EventType.EndTurnAvailable, false);
            });
        }
    }

    /**
     * Override state setter to emit UI events for
     * button availability.
     */
    override set state(state: BoardState) {
        super.state = state;
        this._boardEvents.emit(BoardEvent.StateChange, state);
        switch (state) {
            case BoardState.Idle:
            case BoardState.GameOver:
            case BoardState.View:
                this.emitUIEvent(EventType.CancelAvailable, false);
                this.emitUIEvent(EventType.EndTurnAvailable, false);
                break;
            case BoardState.Move:
            case BoardState.SelectSpell:
                setTimeout(() => {
                    if (this.currentPlayer && !this.currentPlayer.remote && !this.tutorial?.config.disableEndTurn) {
                        this.emitUIEvent(EventType.EndTurnAvailable, true);
                    } else {
                        this.emitUIEvent(EventType.EndTurnAvailable, false);
                    }
                });
                break;
            default:
                setTimeout(() => {
                    if (this.currentPlayer && !this.currentPlayer.remote && !this.tutorial?.config.disableCancelSpell) {
                        this.emitUIEvent(EventType.CancelAvailable, true);
                    } else {
                        this.emitUIEvent(EventType.CancelAvailable, false);
                    }
                    this.emitUIEvent(EventType.EndTurnAvailable, false);
                });
                break;
        }
    }

    override get state(): BoardState {
        return super.state;
    }

    get cursor(): Cursor {
        return this._cursor;
    }

    override get cursorPosition() {
        return this.cursor.position;
    }

    override get rangeGizmo(): RangeGizmo {
        return this._rangeGizmo as RangeGizmo;
    }

    override get rules(): Rules {
        return this._rules;
    }

    /**
     * Start a new turn on the board. This advances the phase and state as
     * appropriate.
     *
     * @returns A promise that resolves when the new turn has been fully processed.
     */
    async newTurn(): Promise<void> {
        this._selected = null;
        this.rules.dispatchEvent(EventType.PieceInfo, null, this);

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
                await this.idleDelay(Board.DEFAULT_DELAY);
            }
            const anySpellsLeft = this.players.some((p) => !p.defeated && p.spells.length > 0);
            // Skip spell selection phase if no player has a spell to cast and
            // we're in a tutorial, for brevity.
            if (!anySpellsLeft && this.tutorial != null) {
                this._logger.log(`No spells to cast, skipping to movement`, Colour.Green);
                pm.evaluate(new SkipSpellbook());
                pm.evaluate(new MovingReady());
                await this.idleDelay(Board.END_TURN_DELAY);
            } else {
                pm.evaluate(new SpellbookReady());
                await this.idleDelay(Board.END_TURN_DELAY);
            }
        } else if (pm.isActive(pm.states.spellbook)) {
            // Skip casting phase if no player has a spell to cast
            const anySpellSelected = this.players.some((p) => !p.defeated && p.selectedSpell);
            if (!anySpellSelected) {
                this._logger.log(`No spells to cast, skipping to movement`, Colour.Green);
                pm.evaluate(new NoSpellsCast());

                const previousPlayer: Player = this.currentPlayer;
                this.currentPlayer = null;
                this.updateBackgroundColour();

                await this.rules.doSpread(this as any);
                await this.rules.doExpire(this as any);

                this.currentPlayer = previousPlayer;
                this.emitBoardUpdateEvent();
            } else {
                pm.evaluate(new SpellsDone());
                pm.evaluate(new CastingReady());
                await this.idleDelay(Board.END_TURN_DELAY);
            }
        } else if (pm.isActive(pm.states.casting)) {
            pm.evaluate(new CastingDone());

            const previousPlayer: Player = this.currentPlayer;
            this.currentPlayer = null;
            this.updateBackgroundColour();

            await this.rules.doSpread(this as any);
            await this.rules.doExpire(this as any);

            this.currentPlayer = previousPlayer;
            this.emitBoardUpdateEvent();
        } else if (pm.isActive(pm.states.spreading)) {
            pm.evaluate(new SpreadingDone());
            pm.evaluate(new MovingReady());
            await this.idleDelay(Board.END_TURN_DELAY);
        }
        this.emitBoardUpdateEvent();
    }

    /* #endregion */

    /* #region Pieces */

    override get pieces(): Piece[] {
        return super.pieces as Piece[];
    }

    override get selected(): Piece | null {
        return super.selected as Piece | null;
    }

    /**
     * Debounce emission of board update events to avoid flooding listeners.
     */
    private _emitTimeout: any;

    /**
     * Emit a board update event to notify listeners that the board state has
     * changed. This is mainly used by the UI, such as the minimap. It's also
     * debounced to avoid flooding listeners with too many events, as it always
     * contains a snapshot of the board state.
     */
    override emitBoardUpdateEvent(): void {
        if (this._emitTimeout) {
            clearTimeout(this._emitTimeout);
        }
        this._emitTimeout = setTimeout(() => {
            this.emitUIEvent(EventType.BoardUpdate, {
                pieces: this.pieces,
                board: {
                    width: this.width,
                    height: this.height,
                },
                balance: this.balance,
                balanceShift: this.balanceShift,
            } as BoardUpdateEventData);
        }, 500);
    }

    /**
     * Emit a UI event, such as enabling or disabling buttons.
     *
     * @param eventType
     * @param data
     */
    override emitUIEvent(eventType: EventType, data: any): void {
        if (this._disableEndTurn && eventType === EventType.EndTurnAvailable) {
            console.log("End turn disabled, ignoring event");
            return;
        }
        if (
            this._disableCancelSpell &&
            eventType === EventType.CancelAvailable &&
            (this._state === BoardState.CastSpell || this._state === BoardState.SelectSpell)
        ) {
            console.log("Cancel spell disabled, ignoring event");
            return;
        }
        if (
            this._disableCancelAction &&
            eventType === EventType.CancelAvailable &&
            (this._state === BoardState.Move ||
                this._state === BoardState.Attack ||
                this._state === BoardState.RangedAttack ||
                this._state === BoardState.Dismount)
        ) {
            console.log("Cancel action disabled, ignoring event");
            return;
        }
        this.scene.game.events.emit(eventType, data);
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
        piece.initSprites();
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
            this.pieces.some((piece: Piece) => piece.hasStatus(UnitStatus.Wizard))
        ) {
            throw new Error("Cannot create wizards - game not in initialising state");
        }
        Wizard.createAll(this, this.players);
    }

    /**
     * Add a wizard to the board.
     *
     * @param config The configuration for the wizard to add.
     * @returns The newly added wizard.
     */
    async addWizard(config: WizardConfig): Promise<Piece> {
        const wizard: Wizard = new Wizard(this, this._idCounter++, config);
        this._pieces.set(wizard.id, wizard);
        this.emitBoardUpdateEvent();
        return wizard;
    }

    override getPiece(id: number): Piece | null {
        return super.getPiece(id) as Piece | null;
    }

    override getPiecesByOwner(owner: Player): Piece[] {
        return super.getPiecesByOwner(owner) as Piece[];
    }

    /**
     * Select a piece by its ID. If the piece is already selected, does nothing.
     *
     * @param id The ID of the piece to select.
     * @returns A promise that resolves when the piece has been selected.
     */
    async selectPiece(id: number, silent?: boolean): Promise<void> {
        if (!id || this.state === BoardState.GameOver) {
            return;
        }
        if (this.selected?.id === id) {
            console.warn(`Piece with ID ${id} is already selected`);
            return;
        }
        this._selected = this.getPiece(id);
        if (!this.selected) {
            throw new Error(`No piece with ID ${id} found to select`);
        }
        this._boardEvents.emit(BoardEvent.PieceSelected, this.selected);
        if (this.phase === BoardPhase.Moving) {
            if (!silent) {
                this.sound.play("select-piece");
            }
            if (this.selected.currentMount) {
                this.emitUIEvent(EventType.DismountAvailable, true);
            }

            let firstEngagingPiece: Piece | null = null;
            // Special case: Units in Shadow Form do not become engaged at the
            // start of movement.
            if (this.selected.hasStatus(UnitStatus.ShadowForm)) {
                this.selected.engaged = false;
            } else {
                firstEngagingPiece = this.selected.getFirstEngagingPiece() as Piece | null;
            }

            if (firstEngagingPiece) {
                if (
                    this.selected.engaged ||
                    this.selected.properties.manoeuvrability < 0 || // A negative manoeuvrability means the unit stays engaged if near engageable enemies
                    firstEngagingPiece.properties.manoeuvrability === Infinity || // An infinite manoeuvrability means the unit always engages nearby enemies
                    this.roll(firstEngagingPiece.stats.manoeuvrability, this.selected.stats.manoeuvrability)
                ) {
                    await this.selected.engage(firstEngagingPiece);
                    await this.rangeGizmo.reset();
                } else {
                    this.logger.log(`${this.selected.name} disengaged from ${firstEngagingPiece.name}`, Colour.Green);
                    if (!this.selected.moved) {
                        await this.rangeGizmo.generate(this.selected);
                    }
                }
            } else if (!this.selected.moved) {
                await this.rangeGizmo.generate(this.selected);
            }

            const pm = this._stateManager;
            if (pm.isActive(pm.states.pieceDismounting)) {
                pm.evaluate(new CompleteDismount());
            }
            pm.evaluate(new SelectPiece());
        }

        switch (this.state) {
            case BoardState.Move:
            case BoardState.Dismount:
            case BoardState.Attack:
            case BoardState.RangedAttack:
                if (this.currentPlayer && !this.currentPlayer.remote) {
                    this.emitUIEvent(EventType.CancelAvailable, true);
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
        this.rules.dispatchEvent(EventType.PieceInfo, null, this);

        if (!this.selected) {
            console.warn("No piece selected to deselect");
            this.nextPlayer();
            return;
        }
        if (this.phase === BoardPhase.Moving) {
            const previousSelected: Piece = this.selected;
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
            this.stateManager.evaluate(new PieceDeselected());
        }
        this.emitUIEvent(EventType.DismountAvailable, false);
        this.emitUIEvent(EventType.CancelAvailable, false);

        const turnOver: boolean =
            this.getPiecesByOwner(this.currentPlayer).every((piece) => piece.turnOver) ||
            this.phase === BoardPhase.Casting;

        if (turnOver) {
            this.deselectPlayer();
        }
        await this.rangeGizmo.reset();

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

    override getPiecesAtPosition(point: SimplePoint, filter?: (piece: Piece) => boolean): Piece[] {
        return super.getPiecesAtPosition(new Point(point.x, point.y), filter) as Piece[];
    }

    override getAdjacentPiecesAtPosition(
        point: SimplePoint,
        filter?: (piece: Piece) => boolean,
        includeCentre?: boolean,
    ): Piece[] {
        return super.getAdjacentPiecesAtPosition(new Point(point.x, point.y), filter, includeCentre) as Piece[];
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
        this.sound.play("step");
        await piece.moveTo(path.nodes.shift().pos, Piece.DEFAULT_STEP_MOVE_DURATION);
        // Check for engagement after each step
        const firstEngagingPiece: Piece | null = piece.getFirstEngagingPiece() as Piece | null;
        if (firstEngagingPiece) {
            // Cancel movement if engagement occurs
            await this.rangeGizmo.reset();
            return;
        }

        if (path.nodes.length > 0) {
            await this.movePath(piece, path);
        }
    }

    /**
     * Move a piece to a given position, handling pathfinding and movement
     * rules. Calls the engine super to record a broadcast event with
     * `piece-moved` and `piece-turn-flag-changed` outcomes, then
     * handles client-side animation, sound, and engagement checks.
     *
     * @param id The ID of the piece to move.
     * @param position The position to move the piece to.
     * @param silent Optional flag to suppress movement sound effects.
     * @returns A promise that resolves to the moved piece.
     */
    async movePiece(id: number, position: SimplePoint, silent?: boolean): Promise<Piece> {
        const piece: Piece | null = this.getPiece(id);
        if (!piece) {
            throw new Error(`Could not find piece with ID ${id}`);
        }
        this.cursor.enabled = false;
        this.emitUIEvent(EventType.DismountAvailable, false);
        const path: Path = this.rangeGizmo.getPathTo(position);
        const isFlying: boolean = piece.hasStatus(UnitStatus.Flying);

        if (isFlying || Board.distance(piece.position, new Point(position.x, position.y)) <= 1.5) {
            if (!silent) {
                this.sound.play(isFlying ? "fly" : "step");
            }
            await piece.moveTo(position);
        } else if (path && path.nodes?.length > 1) {
            // Remove first step, as that's the piece's current position
            path.nodes.shift();
            // If the last step is terminal, remove it also
            if (path.nodes.at(-1).terminal) {
                path.nodes.pop();
            }
            await this.movePath(piece, path);
        } else {
            throw new Error(`No path to ${position.x}, ${position.y}`);
        }
        await this.rangeGizmo.reset();
        // Record the broadcast event (piece-moved + piece-turn-flag-changed
        // outcomes) and emit BoardEvent.PieceMoved via the engine. The client
        // has no real command context yet; synthetic ids are used until the
        // command pipeline is wired end-to-end.
        await super.movePiece(
            id,
            new Point(position.x, position.y),
            `client-move-${id}-${Date.now()}`,
            piece.owner?.id ?? 0,
        );
        this.cursor.enabled = true;

        if (!piece.currentMount && !piece.engaged) {
            const firstEngagingPiece: Piece | null = piece.getFirstEngagingPiece() as Piece | null;

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
     * Flying units that are not adjacent (distance > 1.5) play a swoop
     * animation: the attacker hovers above the target, the attack resolves,
     * then the attacker either lands (success) or returns (failure).
     *
     * @param attackingPieceId The ID of the attacking piece.
     * @param defendingPieceId The ID of the defending piece.
     * @returns The attacking piece, or null if either piece was not found.
     */
    async attackPiece(attackingPieceId: number, defendingPieceId: number): Promise<Piece | null> {
        const attackingPiece: Piece | null = this.getPiece(attackingPieceId);
        const defendingPiece: Piece | null = this.getPiece(defendingPieceId);
        if (!attackingPiece) {
            throw new Error(`Could not find piece with ID ${attackingPieceId}`);
        }
        if (!defendingPiece) {
            throw new Error(`Could not find piece with ID ${defendingPieceId}`);
        }
        this._busy = true;

        // Flying units that aren't adjacent animate a swoop to the target
        const isFlyAttack: boolean =
            attackingPiece.hasStatus(UnitStatus.Flying) &&
            Board.distance(attackingPiece.position, defendingPiece.position) > 1.5;

        let originPos: PMath.Vector2 | null = null;
        if (isFlyAttack) {
            originPos = new PMath.Vector2(attackingPiece.position.x, attackingPiece.position.y);
            this.sound.play("fly");
            await attackingPiece.flyApproach(defendingPiece.position);
        }

        const attackResult: boolean = await attackingPiece.attack(
            defendingPiece,
            isFlyAttack ? { silentMove: true } : undefined,
        );
        this._boardEvents.emit(BoardEvent.PieceAttacked, attackingPiece, defendingPiece, attackResult);

        // Return to origin if: attack missed, OR attack succeeded but the
        // tile was still occupied (e.g. killing a mount dismounts its wizard),
        // so movePiece was not called and the sprite is still hovering.
        const didNotMove =
            isFlyAttack &&
            originPos &&
            originPos.x === attackingPiece.position.x &&
            originPos.y === attackingPiece.position.y;
        if (didNotMove) {
            await attackingPiece.flyReturn(originPos, defendingPiece.position);
        }

        this._busy = false;
        if (attackResult) {
            await this.rangeGizmo.reset();
        }
        return attackingPiece;
    }

    /**
     * Perform a ranged attack from one piece to another.
     *
     * @param attackingPieceId The ID of the attacking piece.
     * @param defendingPieceId The ID of the defending piece.
     * @returns
     */
    async rangedAttackPiece(attackingPieceId: number, defendingPieceId: number): Promise<Piece | null> {
        const attackingPiece: Piece | null = this.getPiece(attackingPieceId);
        const defendingPiece: Piece | null = this.getPiece(defendingPieceId);
        if (!attackingPiece) {
            throw new Error(`Could not find piece with ID ${attackingPieceId}`);
        }
        if (!defendingPiece) {
            throw new Error(`Could not find piece with ID ${defendingPieceId}`);
        }
        // For AI players, the cursor never runs the pre-attack setup
        // (sound, log, range gizmo) that it does for human players.
        // Replicate that here so the ranged attack is visible.
        if (this.currentPlayer?.remote) {
            this.sound.play("ranged-select");
            this.logger.log(`${attackingPiece.name}'s turn to ranged attack`, Colour.Yellow);
            await this.rangeGizmo.showSimpleRange(
                attackingPiece.position,
                attackingPiece.stats.range,
                CursorType.RangeRangedAttack,
                true,
            );
            await this.delay(Board.DEFAULT_DELAY);
        }
        this._busy = true;
        if (attackingPiece && defendingPiece) {
            const attackResult: boolean = await attackingPiece.rangedAttack(defendingPiece);
            this._boardEvents.emit(BoardEvent.PieceRangedAttacked, attackingPiece, defendingPiece, attackResult);
            this._busy = false;
            if (attackResult) {
                await this.rangeGizmo.reset();
            }
            return attackingPiece;
        }
        this._busy = false;
        return null;
    }

    /**
     * Mount one piece onto another.
     *
     * @param mountingPieceId The ID of the piece that will mount.
     * @param mountedPieceId The ID of the piece to be mounted.
     * @returns The mounting piece, or null if the mount failed.
     */
    async mountPiece(mountingPieceId: number, mountedPieceId: number): Promise<Piece | null> {
        await this.rangeGizmo.reset();
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
                mountingPiece.moved = false;
            }
            this.sound.play("step");
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
        const dismountingPiece: Piece | null = this.getPiece(dismountingPieceId);
        if (!dismountingPiece) {
            console.error(`Could not find piece with ID ${dismountingPieceId}`);
            return null;
        }
        this.emitUIEvent(EventType.DismountAvailable, false);
        this.sound.play("step");
        await dismountingPiece.dismount();
        this.emitBoardUpdateEvent();
        return dismountingPiece;
    }

    /* #endregion */

    /* #region Players */

    /**
     * Get all players in the game.
     */
    override get players(): Player[] {
        return super.players as Player[];
    }

    /**
     * Get the current player whose turn it is.
     */
    override get currentPlayer(): Player | null {
        return super.currentPlayer as Player | null;
    }

    override set currentPlayer(player: Player | null) {
        super.currentPlayer = player;
        this.cursor.enabled = Boolean(!this._currentPlayer?.remote);
        if (this._currentPlayer?.remote) {
            setTimeout(() => {
                // Disable UI buttons for AI players
                this.emitUIEvent(EventType.EndTurnAvailable, false);
                this.emitUIEvent(EventType.CancelAvailable, false);
                this.emitUIEvent(EventType.DismountAvailable, false);
            }, 10);
        }
    }

    /**
     * Add a new player to the game.
     *
     * @param config The configuration for the player to add.
     * @param remote Optional remote-player controller (unused here;
     *               client Player sets up AI internally from config).
     * @returns The newly added player.
     */
    override addPlayer(config: PlayerConfig, _remote?: RemotePlayer | null): Player {
        const player: Player = new Player(this, this._idCounter++, config, Player.PLAYER_COLOURS[this._players.size]);
        this._players.set(player.id, player);
        return player;
    }

    /**
     * Add a new spell to a player's spellbook.
     *
     * @param player The player to add the spell to.
     * @param config The configuration for the spell to add.
     * @returns The newly added spell.
     */
    override addSpell(player: Player, config: SpellConfig): Spell<Piece> {
        if (!config || !player) {
            throw new Error("No player or config provided");
        }
        const spell = createSpell(this as any, this._idCounter++, config);
        player.addSpell(spell as any);
        return spell as Spell<Piece>;
    }

    /**
     * The active tutorial, or null if no tutorial is running.
     */
    get tutorial(): Tutorial | null {
        return this._tutorial;
    }

    set tutorial(tutorial: Tutorial | null) {
        this._tutorial = tutorial;
    }

    override getPlayer(id: number): Player | null {
        return super.getPlayer(id) as Player | null;
    }

    /**
     * Update the background colour based on the current player's colour.
     *
     * @returns A promise that resolves when the background colour has been updated.
     */
    public async updateBackgroundColour(): Promise<void> {
        return new Promise((resolve) => {
            if (this.currentPlayer?.colour) {
                document.body.style.setProperty(
                    "--bg-colour",
                    `${Display.Color.ValueToColor(this.currentPlayer.colour).rgba}`,
                );
                this.getLayer(BoardLayer.Floor)
                    .getChildren()
                    .forEach((child) => {
                        const tintColour: Display.Color = Display.Color.ValueToColor(this.currentPlayer.colour);
                        const noiseValue: number = child.getData("noiseValue");
                        (child as GameObjects.Sprite).setTint(tintColour.brighten(70 - noiseValue * 10).color);
                    });
            } else {
                this.getLayer(BoardLayer.Floor)
                    .getChildren()
                    .forEach((child) => {
                        const noiseValue: number = child.getData("noiseValue");
                        (child as GameObjects.Sprite).setTint(
                            Display.Color.ValueToColor(0xffffff).darken(noiseValue * 20).color,
                        );
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
        this.currentPlayer = this.getPlayer(id);

        if (!this.currentPlayer) {
            console.trace("No current player to select");
            return;
        }

        // If the current player is defeated, skip their turn
        if (this.currentPlayer.defeated) {
            return;
        }

        const units: Piece[] = this.pieces.filter(
            (piece: Piece) => piece.owner === this.currentPlayer || piece.currentRider?.owner === this.currentPlayer,
        );

        await this.updateBackgroundColour();
        if (this.currentPlayer.remote) {
            this.cursor.enabled = false;
            this.emitUIEvent(EventType.EndTurnAvailable, false);
        } else {
            this.cursor.enabled = true;
            this.emitUIEvent(EventType.EndTurnAvailable, true);
        }

        let previousVal = 0;

        switch (this.phase) {
            case BoardPhase.Spellbook:
                this.sound.play("new-turn");
                this.logger.log(`${this.currentPlayer?.name}'s turn to select a spell`);
                break;
            case BoardPhase.Casting:
                if (this.currentPlayer?.selectedSpell) {
                    this.logger.log(
                        `${this.currentPlayer?.name}'s turn to cast '${this.currentPlayer.selectedSpell.name}'`,
                    );
                } else {
                    this.sound.play("cancel");
                    this.logger.log(
                        `Skipping ${this.currentPlayer?.name}'s casting turn (no spell selected)`,
                        Colour.Magenta,
                    );
                }
                break;
            case BoardPhase.Moving:
                this.sound.play("new-turn");
                this.logger.log(`${this.currentPlayer?.name}'s turn to move`);
                break;
        }

        this.centreOnPieces(units.filter((p) => p.type === UnitType.Wizard));

        return new Promise<void>((resolve) => {
            this.scene.tweens.addCounter({
                from: 0,
                to: Board.NEW_TURN_HIGHLIGHT_STEPS,
                onUpdate: (tween) => {
                    const currentVal = Math.round(tween.getValue()) % 2;
                    if (currentVal !== previousVal) {
                        previousVal = currentVal;
                        units.forEach((piece: Piece) => {
                            const target: GameObjects.Sprite = piece.sprite;
                            if (currentVal === 0) {
                                target.setTint(this.currentPlayer?.colour || 0xffffff).setTintMode(TintModes.FILL);
                            } else {
                                target.setTint(piece.defaultTint).setTintMode(TintModes.MULTIPLY);
                            }
                        });
                    }
                },
                onComplete: () => {
                    units.forEach((piece: Piece) => {
                        const target: GameObjects.Sprite = piece.sprite;
                        target.setTint(piece.defaultTint).setTintMode(TintModes.MULTIPLY);
                        piece.turnOver = false;
                        piece.highlighted = true;
                    });
                    resolve();
                },
                duration: Board.NEW_TURN_HIGHLIGHT_DURATION,
            });

            // Beep beep beep for casting phase
            if (this.phase === BoardPhase.Casting) {
                this.sound.playAsync("is-casting", {
                    repeat: 3,
                    delay: 60,
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
            (piece: Piece) => piece.owner === player || piece.currentRider?.owner === player,
        );
        if (!silent) {
            this.logger.log(`Highlighting ${player.name}'s units`, Colour.Yellow);
        }
        await Promise.all(
            units.map(async (piece: Piece) => {
                await piece.flashHighlight();
            }),
        );
    }

    /**
     * Highlight all units owned by the given player.
     *
     * @param player The player whose units to highlight.
     * @param silent Whether to suppress logging output (default: false).
     */
    async highlightOwnedUnitsForPlayer(player: Player, silent?: boolean): Promise<void> {
        const playerIndex: number = Array.from(this._players.keys()).indexOf(player.id);
        await this.highlightOwnedUnitsForPlayerIndex(playerIndex, silent);
    }

    /**
     * Centre the camera on a given piece(s).
     *
     * @param pieces The piece(s) to centre the camera on.
     * @returns A promise that resolves when the camera has centred.
     */
    async centreOnPieces(pieces: Piece[]): Promise<void> {
        if (!pieces?.length) {
            return;
        }

        const avgX: number = pieces.reduce((sum, piece) => sum + piece.position.x, 0) / pieces.length;
        const avgY: number = pieces.reduce((sum, piece) => sum + piece.position.y, 0) / pieces.length;
        return this.centreOnPosition(new PMath.Vector2(avgX, avgY));
    }

    /**
     * Centre the camera on a given board position.
     *
     * @param position The board position to centre the camera on.
     * @returns A promise that resolves when the camera has centred.
     */
    async centreOnPosition(position: SimplePoint): Promise<void> {
        return this.centreOnWorldPosition(this.getIsoPosition(position));
    }

    /**
     * Centre the camera on a given screen position.
     *
     * @param screenPosition The screen position to centre the camera on.
     * @returns A promise that resolves when the camera has centred.
     */
    async centreOnScreenPosition(screenPosition: SimplePoint): Promise<void> {
        const camera: Cameras.Scene2D.Camera = this.scene.cameras.main;
        const worldVector = camera.getWorldPoint(screenPosition.x, screenPosition.y);
        return this.centreOnWorldPosition(new PMath.Vector2(worldVector.x, worldVector.y));
    }

    /**
     * Centre the camera on a given world (isometric) position.
     *
     * @param isoPos The world position to centre the camera on.
     * @returns A promise that resolves when the camera has centred.
     */
    async centreOnWorldPosition(isoPos: PMath.Vector2): Promise<void> {
        if (!this.needsPanning) {
            return;
        }

        const camera: Cameras.Scene2D.Camera = this.scene.cameras.main;
        const bounds = camera.getBounds();

        const tweenProps: { scrollX?: number; scrollY?: number } = {};
        if (camera.width < bounds.width) {
            tweenProps.scrollX = isoPos.x - camera.width / 2;
        }
        if (camera.height < bounds.height) {
            tweenProps.scrollY = isoPos.y - camera.height / 2;
        }

        return new Promise<void>((resolve) => {
            this.scene.tweens.add({
                targets: camera,
                ...tweenProps,
                duration: Board.DEFAULT_DELAY,
                ease: "Power2",
                onComplete: () => {
                    resolve();
                },
            });
        });
    }

    /**
     * Deselect the current player.
     */
    override deselectPlayer(): void {
        super.deselectPlayer();
        this.rangeGizmo.reset();
        this.emitUIEvent(EventType.EndTurnAvailable, false);
    }

    /**
     * Start a new game.
     */
    async startGame(): Promise<void> {
        this._currentPlayerIndex = -1;
        this.currentPlayer = null;
        this.state = BoardState.Idle;
        this.stateManager.reset();

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
        this.currentPlayer = null;
        this.state = BoardState.Idle;
        this.stateManager.reset();

        // Fast-forward FSM to the requested phase
        if (phase === BoardPhase.Spreading) {
            this.stateManager.evaluate(new StartGame());
            this.stateManager.evaluate(new SpellbookReady());
            this.stateManager.evaluate(new SpellsDone());
            this.stateManager.evaluate(new CastingReady());
            this.stateManager.evaluate(new CastingDone());
        }

        console.log(`Resuming game at player index ${this._currentPlayerIndex} and phase ${BoardPhase[this.phase]}`);
        await this.nextPlayer();
    }

    /**
     * Advance to the next player's turn.
     */
    async nextPlayer(): Promise<void> {
        this.emitBoardUpdateEvent();
        while (true) {
            if (this.state == BoardState.GameOver || (await this.checkWinCondition())) {
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
                    return new Promise<void>((resolve) => {
                        this.emitUIEvent(EventType.SpellbookOpen, <SpellbookOpenEventData>{
                            data: {
                                caster: this.currentPlayer?.name,
                                spells: this.currentPlayer?.spells,
                                soloMode: this.players.filter((p) => !p.defeated && !p.remote).length === 1,
                                preventSkip: this.tutorial?.config.disableCancelSpell ?? false,
                            },
                            callback: async (spell: Spell | null) => {
                                if (spell) {
                                    this.currentPlayer?.pickSpell(spell.id);
                                    this._boardEvents.emit(BoardEvent.SpellSelected, this.currentPlayer, spell);
                                }
                                this.emitUIEvent(EventType.SpellbookClose, true);
                                resolve();
                                void this.nextPlayer();
                            },
                        });
                    });
                }
            } else {
                this.emitUIEvent(EventType.SpellbookClose, true);
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
                    const spell: Spell = this.currentPlayer?.selectedSpell;
                    if (spell?.properties?.autoPlace) {
                        this.stateManager.evaluate(new SpellTargeting());
                        await this.rules.doAutoCastSpell(this as any);
                        this.emitBoardUpdateEvent();
                        continue;
                    } else if (spell?.range === 0) {
                        this.stateManager.evaluate(new SpellTargeting());
                        await this.rules.doCastSpell(this as any, this.currentPlayer.castingPiece as Piece);
                        this.emitBoardUpdateEvent();
                        continue;
                    } else if (spell?.range > 0) {
                        this.stateManager.evaluate(new SpellTargeting());
                        await this.rangeGizmo.showSimpleRange(
                            this.selected.position,
                            spell.range,
                            CursorType.RangeCast,
                            spell.lineOfSight,
                        );
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

        // Simplex noise config for tile variation. noiseCells of 0.25
        // matches the original x/4 sampling frequency; a randomised seed
        // varies the pattern each game.
        const noiseConfig = {
            noiseCells: [0.25, 0.25],
            noiseSeed: [Math.floor(Math.random() * 1_000_000), Math.floor(Math.random() * 1_000_000)],
        };

        for (let x: number = 0; x < this.width; x++) {
            for (let y: number = 0; y < this.height; y++) {
                const isoPos: PMath.Vector2 = this.getIsoPosition(new PMath.Vector2(x, y));

                const tile: GameObjects.Image = this.scene.add.image(isoPos.x, isoPos.y, "board", "empty");

                tile.setDisplayOrigin(14, 1);
                tile.setActive(false);

                // Set tint based on noise value (range -1 to 1)
                const noiseValue: number = PMath.HashSimplex([x, y], noiseConfig);
                tile.setData("noiseValue", noiseValue);
                tile.setTint(Display.Color.ValueToColor(0xffffff).darken(noiseValue * 20).color);

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
        startPosition: PMath.Vector2,
        endPosition?: PMath.Vector2,
        target?: Piece,
        duration?: number,
    ): Promise<void> {
        return new Promise((resolve) => {
            const effect = createEffect(
                this.scene,
                type,
                startPosition,
                endPosition ?? null,
                target ?? null,
                duration ?? null,
                resolve,
            );
            this.scene.add.existing(effect);
        });
    }

    /**
     * Set up the effects layer.
     */
    createEffects() {
        const effectsLayer: GameObjects.Layer = this.scene.add.layer();

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
     * Whether the camera viewport is smaller than the board in either
     * dimension, enabling panning.
     */
    get needsPanning(): boolean {
        const camera: Cameras.Scene2D.Camera = this._scene.cameras.main;
        if (!camera) {
            return false;
        }
        const bounds = camera.getBounds();
        return camera.width < (bounds?.width ?? camera.width) || camera.height < (bounds?.height ?? camera.height);
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
    getIsoPosition(point: SimplePoint): PMath.Vector2 {
        const newPoint: PMath.Vector2 = new PMath.Vector2(
            point.x * Board.DEFAULT_CELLSIZE,
            point.y * Board.DEFAULT_CELLSIZE,
        );

        const isoPos: PMath.Vector2 = Board.toIsometric(newPoint);

        isoPos.y += Board.DEFAULT_CELLSIZE / 2;

        return isoPos;
    }

    /**
     * Get the screen position of a point on the board.
     *
     * @param point The point to get the screen position for.
     * @returns The screen position of the point.
     */
    getScreenPosition(point: SimplePoint): PMath.Vector2 {
        const isoPos: PMath.Vector2 = this.getIsoPosition(point);

        const screenPos: PMath.Vector2 = new PMath.Vector2(
            isoPos.x + this.scene.cameras.main.scrollX,
            isoPos.y + this.scene.cameras.main.scrollY,
        );

        return screenPos;
    }

    /**
     * Convert a point to isometric coordinates.
     *
     * @param point The point to convert.
     * @returns The converted point.
     */
    static toIsometric(point: SimplePoint): PMath.Vector2 {
        return new PMath.Vector2(point.x - point.y, (point.x + point.y) / 2);
    }

    /**
     * Convert a point from isometric coordinates to cartesian.
     *
     * @param point The point to convert.
     * @returns The converted point.
     */
    static fromIsometric(point: SimplePoint): PMath.Vector2 {
        return new PMath.Vector2(point.x + point.y / 2, point.y - point.x / 2);
    }

    /* #endregion */

    /* #region Dev helpers */

    /**
     * Set up a media-query listener that resizes the game canvas whenever the
     * viewport becomes narrower (or wider) than the full board.  This keeps
     * the canvas correctly sized after device rotation, browser resize, etc.
     */
    private setupViewportResizing(boardPixelWidth: number, boardPixelHeight: number): void {
        const zoom: number = this._scene.game.scale.zoom;
        const widthQuery: MediaQueryList = globalThis.matchMedia(`(max-width: ${boardPixelWidth * zoom}px)`);
        const heightQuery: MediaQueryList = globalThis.matchMedia(`(max-height: ${boardPixelHeight * zoom}px)`);

        const handler = (): void => {
            const targetWidth: number = widthQuery.matches ? Math.floor(globalThis.innerWidth / zoom) : boardPixelWidth;
            const targetHeight: number = heightQuery.matches
                ? Math.floor(globalThis.innerHeight / zoom)
                : boardPixelHeight;
            this._scene.game.scale.resize(targetWidth, targetHeight);
            if (widthQuery.matches || heightQuery.matches) {
                // If a player is awaiting their turn, center on them, otherwise
                // center the board
                if (this.currentPlayer) {
                    this.centreOnPieces(
                        this.pieces.filter(
                            (piece: Piece) =>
                                piece.owner === this.currentPlayer || piece.currentRider?.owner === this.currentPlayer,
                        ),
                    );
                }
            }
            if (this._cursor) {
                this._cursor.panningEnabled = widthQuery.matches || heightQuery.matches;
            }
        };

        widthQuery.addEventListener("change", handler, {
            signal: this._viewportListenerAbort.signal,
        });
        heightQuery.addEventListener("change", handler, {
            signal: this._viewportListenerAbort.signal,
        });

        // Also track viewport size changes within the matched range, since
        // media query "change" events only fire when crossing the threshold,
        // not when the viewport resizes within the same state.
        globalThis.addEventListener("resize", handler, {
            signal: this._viewportListenerAbort.signal,
        });

        // Run once immediately so the canvas is sized correctly on load.
        handler();
    }

    /**
     * Destroy the board and all its pieces and layers.
     */
    destroy() {
        this._viewportListenerAbort.abort();
        this._boardEvents.removeAllListeners();

        this.pieces?.forEach((piece: Piece) => {
            piece.destroy();
        });

        this._layers?.forEach((layer: GameObjects.Layer) => {
            layer.destroy();
        });

        this._weatherEffect?.destroy();
    }

    /* #endregion */

    /* #region Weather and atmosphere */

    /**
     * Start a weather effect on the board. Currently supports only rain, but
     * more effects may be added in the future.
     */
    private _weatherEffect?: WeatherEffect;

    /**
     * Start a weather effect on the board. Any existing weather effect is
     * destroyed first, so this can be called to replace the current weather.
     *
     * @param type     The type of weather effect to start (default: Rain).
     * @param options  Untyped per-effect options bag. Validated at runtime
     *                 by the effect class — see e.g. `RainEffect` for the
     *                 supported keys. Omit to use random defaults.
     */
    public startWeather(type: WeatherType = null, options?: Record<string, unknown>): void {
        type ??= this.rng.pick([WeatherType.Rain, WeatherType.Snow]);

        if (this._weatherEffect) {
            this._weatherEffect.destroy();
            this._weatherEffect = undefined;
        }
        switch (type) {
            case WeatherType.Rain:
                this._weatherEffect = new RainEffect(this, options);
                break;
            case WeatherType.Snow:
                this._weatherEffect = new SnowEffect(this, options);
                break;
        }
        this._weatherEffect.start();
    }

    /* endregion */
}
