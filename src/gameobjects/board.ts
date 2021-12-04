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
import { Model } from "./model";
import { Piece } from "./piece";
import { Player } from "./player";
import { Path, RangeGizmo } from "./rangegizmo";
import { Logger } from "./services/logger";
import { Rules } from "./services/rules";
import { AttackSpell } from "./spells/attackspell";
import { Spell } from "./spells/spell";
import { SummonSpell } from "./spells/summonspell";
import { Wizard } from "./wizard";

type SimplePoint = { x: number; y: number };

export class Board extends Model {
    static CHEAT_FORCE_HIT: boolean | null = null;
    static CHEAT_FORCE_CAST: boolean | null = null;
    static CHEAT_SHORT_DELAY: boolean = false;

    static NEW_TURN_HIGHLIGHT_DURATION: number = Board.CHEAT_SHORT_DELAY
        ? 10
        : 700;
    static NEW_TURN_HIGHLIGHT_STEPS: number = 7;
    static SPREAD_ITERATIONS: number = 2;

    private _scene: Phaser.Scene;
    private _width: number;
    private _height: number;

    private _layers: Map<BoardLayer, Phaser.GameObjects.Layer>;
    private _particles: Phaser.GameObjects.Particles.ParticleEmitterManager;

    static DEFAULT_WIDTH: number = 13;
    static DEFAULT_HEIGHT: number = 13;
    static DEFAULT_CELLSIZE: number = 14;

    static DEFAULT_DELAY: number = Board.CHEAT_SHORT_DELAY ? 10 : 750;
    static END_TURN_DELAY: number = Board.CHEAT_SHORT_DELAY ? 10 : 1500;
    static SPREAD_DELAY: number = Board.CHEAT_SHORT_DELAY ? 10 : 250;

    static NEIGHBOUR_DIRECTIONS: SimplePoint[] = [
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
    private _cursor: Cursor;
    private _moveGizmo: RangeGizmo;
    private _pieces: Map<number, Piece>;
    private _selected: Piece | null;

    private _players: Map<number, Player>;
    private _currentPlayer: Player | null;
    private _currentPlayerIndex: number = -1;

    private _idCounter: number = 1;

    private _rules: Rules;
    private _logger: Logger;
    private _sound: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

    constructor(
        scene: Phaser.Scene,
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
                Board.DEFAULT_CELLSIZE * 2,
            this._height * Board.DEFAULT_CELLSIZE + Board.DEFAULT_CELLSIZE
        );

        this._scene.cameras.main.setBounds(
            (this._scene.game.scale.width as number) / -2,
            0,
            this._scene.game.scale.width as number,
            this._scene.game.scale.height as number
        );

        this._pieces = new Map();
        this._players = new Map();
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

        this._sound = this.scene.sound.addAudioSprite("classicsounds");

        this._sound.play("screenactive");

        window["currentBoard"] = this;
    }

    /* #region State */

    get state(): BoardState {
        return this._state;
    }

    set state(state: BoardState) {
        if (this._state === BoardState.GameOver) {
            return;
        }
        this._state = state;
        console.log(`Board state: ${BoardState[state]}`);
        switch (state) {
            case BoardState.Idle:
            case BoardState.GameOver:
            case BoardState.View:
                this.scene.game.events.emit("cancel-available", false);
                this.scene.game.events.emit("end-turn-available", false);
                break;
            case BoardState.Move:
            case BoardState.SelectSpell:
                this.scene.game.events.emit("end-turn-available", true);
                break;
            default:
                this.scene.game.events.emit("cancel-available", true);
                this.scene.game.events.emit("end-turn-available", false);
                break;
        }
    }

    get phase(): BoardPhase {
        return this._phase;
    }

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

    get balance(): number {
        return this._balance;
    }

    get balanceShift(): number {
        return this._balanceShift;
    }

    set balanceShift(balance: number) {
        this._balanceShift = balance;
    }

    get cursor(): Cursor {
        return this._cursor;
    }

    get moveGizmo(): RangeGizmo {
        return this._moveGizmo;
    }

    get rules(): Rules {
        return this._rules;
    }

    get logger(): Logger {
        return this._logger;
    }

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
                    } by ${parseInt(
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

    get pieces(): Piece[] {
        return Array.from(this._pieces.values());
    }

    get selected(): Piece | null {
        return this._selected;
    }

    private _emitTimeout: any;

    emitBoardUpdateEvent(): void {
        if (this._emitTimeout) {
            clearTimeout(this._emitTimeout);
        }
        this._emitTimeout = setTimeout(() => {
            this.scene.game.events.emit("board-update", {
                pieces: this.pieces,
                board: {
                    width: this._width,
                    height: this._height,
                },
            });
        }, 500);
    }

    async addPiece(config: PieceConfig): Promise<Piece> {
        const piece: Piece = new Piece(this, this._idCounter++, config);
        this._pieces.set(piece.id, piece);
        this.emitBoardUpdateEvent();
        return piece;
    }

    createWizards(): void {
        if (
            this.state !== BoardState.Idle ||
            this.phase !== BoardPhase.Idle ||
            this.pieces.filter((piece: Piece) =>
                piece.hasStatus(UnitStatus.Wizard)
            ).length > 0
        ) {
            throw new Error(
                "Cannot create wizards - game not in initialising state"
            );
        }
        switch (this.players.length) {
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
        }
    }

    addWizard(config: WizardConfig): Wizard {
        const wizard: Wizard = new Wizard(this, this._idCounter++, config);
        this._pieces.set(wizard.id, wizard);
        this.emitBoardUpdateEvent();
        return wizard;
    }

    getPiece(id: number): Piece | null {
        if (this._pieces.has(id)) {
            return this._pieces.get(id)!;
        }
        return null;
    }

    getPiecesByOwner(owner: Player): Piece[] {
        return this.pieces.filter((piece) => piece.owner === owner);
    }

    async selectPiece(id: number): Promise<void> {
        this._selected = this.getPiece(id);

        if (this.phase === BoardPhase.Moving) {
            if (this._selected.currentMount) {
                await this.moveGizmo.generate(this._selected);
                return;
            }

            const firstEngagingPiece: Piece | null =
                this._selected.getFirstEngagingPiece();

            if (firstEngagingPiece != null) {
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
            } else {
                if (!this._selected.moved) {
                    await this.moveGizmo.generate(this._selected);
                }
            }
        }

        switch (this.state) {
            case BoardState.Move:
            case BoardState.Dismount:
            case BoardState.Attack:
            case BoardState.RangedAttack:
                this.scene.game.events.emit("cancel-available", true);
                break;
        }
    }

    async deselectPiece(): Promise<void> {
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
            this.getPiecesByOwner(this.currentPlayer!).every(
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

    async selectWizard(player: Player): Promise<Wizard | null> {
        const ownedPieces: Piece[] = this.getPiecesByOwner(player);
        for (let i: number = 0; i < ownedPieces.length; i++) {
            if (ownedPieces[i].type === UnitType.Wizard) {
                await this.selectPiece(ownedPieces[i].id);
                return ownedPieces[i] as Wizard;
            }
        }
        throw new Error(`Player '${player.name}' does not own a wizard`);
    }

    removePiece(id: number): void {
        this._pieces.delete(id);
    }

    getAdjacentPoints(point: Phaser.Geom.Point): Phaser.Geom.Point[] {
        const points: Phaser.Geom.Point[] = [];

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
                    points.push(new Phaser.Geom.Point(x, y));
                }
            }
        }

        return points;
    }

    getAdjacentPiecesAtPosition(
        point: Phaser.Geom.Point,
        filter?: Function
    ): Piece[] {
        let neighbours: Piece[] = [];
        const position: Phaser.Geom.Point = Phaser.Geom.Point.Clone(point);
        for (const direction of Board.NEIGHBOUR_DIRECTIONS) {
            const directionNeighbours: Piece[] = this.getPiecesAtPosition(
                new Phaser.Geom.Point(
                    position.x + direction.x,
                    position.y + direction.y
                ),
                filter
            );
            if (directionNeighbours) {
                neighbours = neighbours.concat(directionNeighbours);
            }
        }
        return neighbours;
    }

    getPiecesAtPosition(point: Phaser.Geom.Point, filter?: Function): Piece[] {
        return Array.from(
            this.pieces.filter((piece) => {
                return (
                    Phaser.Geom.Point.Equals(piece.position, point) &&
                    (filter ? filter(piece) : true)
                );
            })
        );
    }

    isBlocker(point: Phaser.Geom.Point): boolean {
        const pieces: Piece[] = this.getPiecesAtPosition(point, (piece) => {
            return !piece.hasStatus(UnitStatus.Transparent) && !piece.dead;
        });
        if (!pieces?.length) {
            return false;
        }
        return true;
    }

    async movePath(piece: Piece, path: Path) {
        if (!path?.nodes?.length) {
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

    async movePiece(id: number, position: Phaser.Geom.Point): Promise<Piece> {
        const piece: Piece | null = this.getPiece(id);
        if (piece) {
            const path: Path = this.moveGizmo.getPathTo(position);
            const isFlying: boolean = piece.hasStatus(UnitStatus.Flying);
            if (isFlying || Board.distance(piece.position, position) <= 1.5) {
                this.sound.play(isFlying ? "fly" : "move");
                await piece.moveTo(position);
            } else {
                if (path && path.nodes?.length > 1) {
                    // Remove first step, as that's the piece's current position
                    path.nodes.shift();
                    await this.movePath(piece, path);
                } else {
                    throw new Error(`No path to ${position.x}, ${position.y}`);
                }
            }

            piece.moved = true;

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

            await this.moveGizmo.reset();

            await this.cursor.update(true);
            this.emitBoardUpdateEvent();

            return piece;
        }
        throw new Error(`Could not find piece with ID ${id}`);
    }

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
            this.sound.play("move");
            await mountingPiece.mount(mountedPiece);
            this.emitBoardUpdateEvent();
            return mountingPiece;
        }
        return null;
    }

    async dismountPiece(dismountingPieceId: number): Promise<Piece | null> {
        const dismountingPiece: Piece | null =
            this.getPiece(dismountingPieceId);
        if (!dismountingPiece) {
            throw new Error(
                `Could not find piece with ID ${dismountingPieceId}`
            );
        }
        if (dismountingPiece) {
            this.sound.play("move");
            await dismountingPiece.dismount();
            this.emitBoardUpdateEvent();
            return dismountingPiece;
        }
        return null;
    }

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

    get players(): Player[] {
        return Array.from(this._players.values());
    }

    get currentPlayer(): Player | null {
        return this._currentPlayer;
    }

    addPlayer(config: PlayerConfig): Player {
        const player: Player = new Player(this, this._idCounter++, config);
        this._players.set(player.id, player);
        player.colour = Player.PLAYER_COLOURS[this._players.size - 1];
        return player;
    }

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

    getPlayer(id: number): Player | null {
        if (this._players.has(id)) {
            return this._players.get(id)!;
        }
        return null;
    }

    private async updateBackgroundColour(): Promise<void> {
        return new Promise((resolve) => {
            if (this._currentPlayer?.colour) {
                document.body.style.setProperty(
                    "--bg-colour",
                    `${
                        Phaser.Display.Color.ValueToColor(
                            this._currentPlayer.colour
                        ).rgba
                    }`
                );
                this.getLayer(BoardLayer.Floor)
                    .getChildren()
                    .forEach((child) => {
                        const tintColour: Phaser.Display.Color =
                            Phaser.Display.Color.ValueToColor(
                                this._currentPlayer!.colour!
                            );
                        (child as Phaser.GameObjects.Sprite).setTint(
                            tintColour.brighten(80).color
                        );
                    });
            } else {
                this.getLayer(BoardLayer.Floor)
                    .getChildren()
                    .forEach((child) => {
                        (child as Phaser.GameObjects.Sprite).clearTint();
                    });
                document.body.style.removeProperty("--bg-colour");
            }
            setTimeout(() => {
                resolve();
            }, 100);
        });
    }

    async selectPlayer(id: number): Promise<void> {
        const oldState: BoardState = this.state;

        this.pieces.forEach((piece: Piece) => {
            piece.highlighted = false;
        });

        this._currentPlayer = this.getPlayer(id);

        if (this._currentPlayer.defeated) {
            return;
        }

        const units: Piece[] = this.pieces.filter(
            (piece: Piece) =>
                piece.owner === this._currentPlayer ||
                piece.currentRider?.owner === this._currentPlayer
        );

        return new Promise<void>((resolve) => {
            setTimeout(async () => {
                await this.updateBackgroundColour();

                let previousVal = 0;

                switch (this.phase) {
                    case BoardPhase.Spellbook:
                        this.sound.play("endturn");
                        this.logger.log(
                            `${this.currentPlayer?.name}'s turn to select a spell`
                        );
                        break;
                    case BoardPhase.Casting:
                        if (this.currentPlayer?.selectedSpell) {
                            this.sound.play("endturn");
                            this.logger.log(
                                `${this.currentPlayer?.name}'s turn to cast '${this.currentPlayer.selectedSpell.name}'`
                            );
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
                        break;
                }

                this.scene.tweens.addCounter({
                    from: 0,
                    to: Board.NEW_TURN_HIGHLIGHT_STEPS,
                    onUpdate: (tween) => {
                        const currentVal = Math.round(tween.getValue()) % 2;
                        if (currentVal !== previousVal) {
                            previousVal = currentVal;
                            units.forEach((piece: Piece) => {
                                const target: Phaser.GameObjects.Sprite =
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
                            const target: Phaser.GameObjects.Sprite =
                                piece.sprite;
                            target.setTint(piece.defaultTint);
                            piece.turnOver = false;
                            piece.highlighted = true;
                        });
                        setTimeout(() => {
                            resolve();
                        }, 100);
                    },
                    duration: Board.NEW_TURN_HIGHLIGHT_DURATION,
                });
                await this.idleDelay(Board.NEW_TURN_HIGHLIGHT_DURATION);
            });
        });
    }

    deselectPlayer(): void {
        this._currentPlayer = null;
        this.moveGizmo.reset();
        this._selected = null;
        this.scene.game.events.emit("end-turn-available", false);
    }

    async startGame(): Promise<void> {
        this._currentPlayerIndex = -1;
        this._currentPlayer = null;
        this.state = BoardState.Idle;
        this.phase = BoardPhase.Idle;
        await this.nextPlayer();
    }

    async checkWinCondition(): Promise<boolean> {
        if (this.state === BoardState.GameOver) {
            return true;
        }
        const undefeated: Player[] = this.players.filter(
            (player) => !player.defeated
        );
        if (undefeated?.length < 2) {
            this.state = BoardState.GameOver;
            if (undefeated.length === 1) {
                this.logger.log(
                    `Game over! ${undefeated[0].name} wins!`,
                    Colour.Yellow
                );
            } else if (undefeated.length < 1) {
                this.logger.log(`Game over!`, Colour.Yellow);
            }
            this.scene.game.events.emit("game-over");
            return true;
        }
        return false;
    }

    async nextPlayer(): Promise<void> {
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

        if (this.currentPlayer?.defeated) {
            return await this.nextPlayer();
        }

        if (this.phase === BoardPhase.Spellbook) {
            if (this.currentPlayer?.spells?.length) {
                this.scene.game.events.emit("spellbook-open", {
                    data: {
                        caster: this.currentPlayer?.name,
                        spells: this.currentPlayer?.spells,
                    },
                    callback: async (spell: Spell | null) => {
                        if (spell) {
                            this.currentPlayer?.pickSpell(spell.id);
                        }
                        this.scene.game.events.emit("spellbook-close");
                        await this.nextPlayer();
                    },
                });
            }
        } else {
            this.scene.game.events.emit("spellbook-close");
        }

        if (this._phase === BoardPhase.Spellbook) {
            if (this.currentPlayer?.spells.length === 0) {
                await this.nextPlayer();
            }
        }

        if (this._phase === BoardPhase.Casting) {
            await this.selectWizard(this.currentPlayer!);

            if (this.selected) {
                const spell: Spell = this.currentPlayer?.selectedSpell;
                if (spell?.range === 0) {
                    await this.rules.doCastSpell(
                        this,
                        spell,
                        this.currentPlayer.castingPiece
                    );
                    return await this.nextPlayer();
                } else if (spell?.range > 0) {
                    await this.moveGizmo.generateSimpleRange(
                        this.selected.position,
                        spell.range,
                        CursorType.RangeCast,
                        spell.lineOfSight
                    );
                }
            }
        }

        if (
            this._phase === BoardPhase.Casting &&
            this.currentPlayer &&
            !this.currentPlayer.selectedSpell
        ) {
            return await this.nextPlayer();
        }

        setTimeout(() => {
            this.cursor.update(true);
        }, 100);
    }

    /* #endregion */

    /* #region Initialisation */

    createFloor() {
        const floorLayer: Phaser.GameObjects.Layer = this.scene.add.layer();

        for (let x: number = 0; x < this.width; x++) {
            for (let y: number = 0; y < this.height; y++) {
                const isoPos: Phaser.Geom.Point = this.getIsoPosition(
                    new Phaser.Geom.Point(x, y)
                );

                const tile: Phaser.GameObjects.Image = this.scene.add.image(
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

    async playEffect(
        type: EffectType,
        startPosition: Phaser.Math.Vector2 | Phaser.Geom.Point,
        endPosition?: Phaser.Math.Vector2 | Phaser.Geom.Point,
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

    createEffects() {
        const effectsLayer: Phaser.GameObjects.Layer = this.scene.add.layer();

        this._particles = this.scene.add.particles("effects");

        this._layers.set(BoardLayer.Effects, effectsLayer);
    }

    /* #endregion */

    /* #region Utils */

    get scene(): Phaser.Scene {
        return this._scene;
    }

    get sound(): Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound {
        return this._sound;
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    getLayer(layer: BoardLayer): Phaser.GameObjects.Layer {
        return this._layers.get(layer)!;
    }

    getIsoPosition(point: Phaser.Geom.Point): Phaser.Geom.Point {
        const newPoint: Phaser.Geom.Point = Phaser.Geom.Point.Clone(point);

        newPoint.x *= Board.DEFAULT_CELLSIZE;
        newPoint.y *= Board.DEFAULT_CELLSIZE;

        const isoPos: Phaser.Geom.Point = Board.toIsometric(newPoint);

        isoPos.y += Board.DEFAULT_CELLSIZE / 2;

        return isoPos;
    }

    getScreenPosition(point: Phaser.Geom.Point): Phaser.Geom.Point {
        const isoPos: Phaser.Geom.Point = this.getIsoPosition(point);

        const screenPos: Phaser.Geom.Point = new Phaser.Geom.Point(
            isoPos.x + this.scene.cameras.main.scrollX,
            isoPos.y + this.scene.cameras.main.scrollY
        );

        return screenPos;
    }

    roll(attack: number, defense: number): boolean {
        if (Board.CHEAT_FORCE_HIT !== null) {
            return Board.CHEAT_FORCE_HIT;
        }
        const attackRoll: number = Phaser.Math.Between(0, 10 + attack);
        const defenseRoll: number = Phaser.Math.Between(0, 10 + defense);
        console.log("Rolling attack: " + attackRoll + " vs " + defenseRoll);
        return attackRoll > defenseRoll;
    }

    rollChance(attack: number): boolean {
        if (Board.CHEAT_FORCE_CAST !== null) {
            return Board.CHEAT_FORCE_CAST;
        }
        const defenseRoll: number = Phaser.Math.RND.frac();
        return attack > defenseRoll;
    }

    hasLineOfSight(
        startPosition: Phaser.Geom.Point | Phaser.Math.Vector2,
        endPosition: Phaser.Geom.Point | Phaser.Math.Vector2
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
                            new Phaser.Geom.Point(xVal, startPosition.y)
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
                            new Phaser.Geom.Point(startPosition.x, yVal)
                        )
                    ) {
                        return false;
                    }
                }
            }
        } else {
            numChecks =
                Math.abs(xDiff) > Math.abs(yDiff)
                    ? Math.abs(xDiff)
                    : Math.abs(yDiff);
            let yInc = yDiff / numChecks,
                xInc = xDiff / numChecks;

            for (a = 1; a < numChecks; a++) {
                xVal = startPosition.x + Math.round(xInc * a);
                yVal = startPosition.y + Math.round(yInc * a);
                if (this.isBlocker(new Phaser.Geom.Point(xVal, yVal))) {
                    return false;
                }
            }
        }

        return true;
    }

    static distance(a: Phaser.Geom.Point, b: Phaser.Geom.Point): number {
        if (Phaser.Geom.Point.Equals(a, b)) {
            return 0;
        }
        const difference: Phaser.Geom.Point = new Phaser.Geom.Point(
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y)
        );
        return (
            Math.max(difference.x, difference.y) -
            Math.min(difference.x, difference.y) +
            Math.min(difference.x, difference.y) * 1.5
        );
    }

    static toIsometric(point: Phaser.Geom.Point): Phaser.Geom.Point {
        return new Phaser.Geom.Point(
            point.x - point.y,
            (point.x + point.y) / 2
        );
    }

    static fromIsometric(point: Phaser.Geom.Point): Phaser.Geom.Point {
        return new Phaser.Geom.Point(
            point.x + point.y / 2,
            point.y - point.x / 2
        );
    }

    async idleDelay(time: number = Board.DEFAULT_DELAY): Promise<void> {
        const oldState: BoardState = this.state;
        this.state = BoardState.Idle;
        await Board.delay(time);
        this.state = oldState;
    }

    async busyDelay(time: number = Board.DEFAULT_DELAY): Promise<void> {
        const oldState: BoardState = this.state;
        this.state = BoardState.Busy;
        await Board.delay(time);
        this.state = oldState;
    }

    static async delay(time: number = Board.DEFAULT_DELAY): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, time);
        });
    }

    /* #endregion */

    /* #region Dev helpers */

    private _emptySpaceIterations: number = 5;

    getRandomEmptySpace(): Phaser.Geom.Point {
        const x: number = Math.floor(Math.random() * this.width);
        const y: number = Math.floor(Math.random() * this.height);

        const point: Phaser.Geom.Point = new Phaser.Geom.Point(x, y);

        if (
            this.getPiecesAtPosition(point, (piece: Piece) => !piece.dead)
                .length > 0
        ) {
            this._emptySpaceIterations--;
            if (this._emptySpaceIterations > 0) {
                return this.getRandomEmptySpace();
            }
        }

        if (this._emptySpaceIterations <= 0) {
            this._emptySpaceIterations = 5;
            return null;
        }

        return point;
    }

    destroy() {
        this.pieces?.forEach((piece: Piece) => {
            piece.destroy();
        });

        this._layers?.forEach((layer: Phaser.GameObjects.Layer) => {
            layer.destroy();
        });

        this._particles?.destroy();

        this._sound.destroy();

    }

    /* #endregion */
}
