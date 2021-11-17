import { Wizard } from "./wizard";
import { PieceConfig, WizardConfig } from "./configs/piececonfig";
import { PlayerConfig } from "./configs/playerconfig";
import { Cursor } from "./cursor";
import { BoardLayer } from "./enums/boardlayer";
import { BoardState } from "./enums/boardstate";
import { Model } from "./model";
import { Piece } from "./piece";
import { Player } from "./player";
import { Rules } from "./services/rules";
import { Logger } from "./services/logger";

import { Spell } from "./spell";
import { SpellConfig } from "./configs/spellconfig";
import { UnitType } from "./enums/unittype";
import { BoardPhase } from "./enums/boardphase";

type SimplePoint = { x: number; y: number };

export class Board extends Model {
    static NEW_TURN_HIGHLIGHT_DURATION: number = 700;
    static NEW_TURN_HIGHLIGHT_STEPS: number = 7;

    private _scene: Phaser.Scene;
    private _width: number;
    private _height: number;

    private _layers: Map<BoardLayer, Phaser.GameObjects.Layer>;

    static DEFAULT_WIDTH: number = 13;
    static DEFAULT_HEIGHT: number = 13;
    static DEFAULT_CELLSIZE: number = 14;

    static END_TURN_DELAY: number = 500;

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
    private _cursor: Cursor;
    private _pieces: Map<number, Piece>;
    private _selected: Piece | null;

    private _players: Map<number, Player>;
    private _currentPlayer: Player | null;
    private _currentPlayerIndex: number = -1;

    private _idCounter: number = 1;

    private _rules: Rules;
    private _logger: Logger;

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

        this._layers.set(BoardLayer.Shadows, this.scene.add.layer());
        this._layers.set(BoardLayer.Pieces, this.scene.add.layer());

        this._scene.cameras.main.setBounds(
            (this._scene.game.config.width as number) / -2,
            Board.DEFAULT_CELLSIZE / -2,
            this._scene.game.config.width as number,
            this._scene.game.config.height as number
        );

        this._pieces = new Map();
        this._players = new Map();
        this._state = BoardState.Idle;
        this._phase = BoardPhase.Idle;
        this._balance = 0;

        this._cursor = new Cursor(this);
        this._selected = null;
        this._currentPlayer = null;

        this._rules = Rules.getInstance();
        this._logger = Logger.getInstance(this.scene.game.events);

        let spaceKey = this.scene.input.keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.SPACE
        );
        spaceKey.on("up", () => {
            this.nextPlayer();
        });

        window['currentBoard'] = this;
    }

    /* #region State */

    get state(): BoardState {
        return this._state;
    }

    set state(state: BoardState) {
        this._state = state;
    }

    get phase(): BoardPhase {
        return this._phase;
    }

    set phase(phase: BoardPhase) {
        this._phase = phase;
        // this.logger.log(`New ${BoardPhase[this._phase]} phase`);
    }

    get balance(): number {
        return this._balance;
    }

    set balance(balance: number) {
        this._balance = balance;
    }

    get cursor(): Cursor {
        return this._cursor;
    }

    get rules(): Rules {
        return this._rules;
    }

    get logger(): Logger {
        return this._logger;
    }

    async newTurn(): Promise<void> {
        this._selected = null;
        this.pieces.forEach((piece) => {
            piece.reset();
        });

        if (
            this.phase === BoardPhase.Idle ||
            this.phase === BoardPhase.Moving
        ) {
            this.phase = BoardPhase.Spellbook;
            this.state = BoardState.SelectSpell;
        } else if (this.phase === BoardPhase.Spellbook) {
            this.phase = BoardPhase.Casting;
            this.state = BoardState.CastSpell;
        } else if (this.phase === BoardPhase.Casting) {
            this.phase = BoardPhase.Moving;
            this.state = BoardState.Move;
        }
    }

    /* #endregion */

    /* #region Pieces */

    get pieces(): Piece[] {
        return Array.from(this._pieces.values());
    }

    get selected(): Piece | null {
        return this._selected;
    }

    addPiece(config: PieceConfig): Piece {
        const piece: Piece = new Piece(this, this._idCounter++, config);
        this._pieces.set(piece.id, piece);
        return piece;
    }

    addWizard(config: WizardConfig): Wizard {
        const wizard: Wizard = new Wizard(this, this._idCounter++, config);
        this._pieces.set(wizard.id, wizard);
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

    selectPiece(id: number): void {
        this._selected = this.getPiece(id);
    }

    deselectPiece(): void {
        this._selected = null;

        setTimeout(async () => {
            if (
                this.getPiecesByOwner(this.currentPlayer!).every(
                    (piece) => piece.turnOver
                )
            ) {
                await this.nextPlayer();
            }
        }, Board.END_TURN_DELAY);
    }

    selectWizard(player: Player): Wizard | null {
        const ownedPieces: Piece[] = this.getPiecesByOwner(player);
        for (let i: number = 0; i < ownedPieces.length; i++) {
            if (ownedPieces[i].type === UnitType.Wizard) {
                this.selectPiece(ownedPieces[i].id);
                return ownedPieces[i] as Wizard;
            }
        }
        throw new Error(`Player '${player.name}' does not own a wizard`);
    }

    removePiece(id: number): void {
        this._pieces.delete(id);
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

    async movePiece(id: number, positon: Phaser.Geom.Point): Promise<Piece> {
        const piece: Piece | null = this.getPiece(id);
        if (piece) {
            await piece.moveTo(positon);
            piece.moved = true;
            if (piece.currentRider) {
                piece.currentRider.moved = true;
            }
            setTimeout(() => {
                this.cursor.update(true);
            }, 100);

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
        if (attackingPiece && defendingPiece) {
            await attackingPiece.attack(defendingPiece);
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
        if (attackingPiece && defendingPiece) {
            await attackingPiece.rangedAttack(defendingPiece);
            return attackingPiece;
        }
        return null;
    }

    async mountPiece(
        mountingPieceId: number,
        mountedPieceId: number
    ): Promise<Piece | null> {
        const mountingPiece: Piece | null = this.getPiece(mountingPieceId);
        const mountedPiece: Piece | null = this.getPiece(mountedPieceId);
        if (!mountingPiece) {
            throw new Error(`Could not find piece with ID ${mountingPieceId}`);
        }
        if (!mountedPiece) {
            throw new Error(`Could not find piece with ID ${mountedPieceId}`);
        }
        if (mountingPiece && mountedPiece) {
            await mountingPiece.mount(mountedPiece);
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
            await dismountingPiece.dismount();
            return dismountingPiece;
        }
        return null;
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
        const spell: Spell = new Spell(this, this._idCounter++, config);
        player.addSpell(spell);
        return spell;
    }

    getPlayer(id: number): Player | null {
        if (this._players.has(id)) {
            return this._players.get(id)!;
        }
        return null;
    }

    async selectPlayer(id: number): Promise<void> {
        this.pieces.forEach((piece: Piece) => {
            piece.highlighted = false;
        });

        this._currentPlayer = this.getPlayer(id);

        if (this._currentPlayer.defeated) {
            return;
        }

        const units: Piece[] = this.pieces.filter(
            (piece: Piece) => piece.owner === this._currentPlayer
        );

        return new Promise<void>((resolve) => {
            setTimeout(async () => {
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
                    document.body.style.removeProperty("--bg-colour");
                }

                let previousVal = 0;

                switch (this.phase) {
                    case BoardPhase.Spellbook:
                        this.logger.log(
                            `${this.currentPlayer?.name}'s turn to select a spell`
                        );
                        break;
                    case BoardPhase.Casting:
                        if (this.currentPlayer?.selectedSpell) {
                            this.logger.log(
                                `${this.currentPlayer?.name}'s turn to cast '${this.currentPlayer.selectedSpell.name}'`
                            );
                        }
                        else {
                            this.logger.log(
                                `Skipping ${this.currentPlayer?.name}'s casting turn (no spell selected)`
                            );
                        }
                        break;
                    case BoardPhase.Moving:
                        this.logger.log(`${this.currentPlayer?.name}'s turn to move`);
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
                                    : target.clearTint();
                            });
                        }
                    },
                    onComplete: () => {
                        units.forEach((piece: Piece) => {
                            const target: Phaser.GameObjects.Sprite =
                                piece.sprite;
                            target.clearTint();
                            piece.turnOver = false;
                            piece.highlighted = true;
                        });
                        setTimeout(() => {
                            resolve();
                        }, 100);
                    },
                    duration: Board.NEW_TURN_HIGHLIGHT_DURATION,
                });
            });
        });
    }

    deselectPlayer(): void {
        this._currentPlayer = null;
    }

    async startGame(): Promise<void> {
        this._currentPlayerIndex = -1;
        this._currentPlayer = null;
        this.state = BoardState.Idle;
        this.phase = BoardPhase.Idle;
        await this.nextPlayer();
    }

    async nextPlayer(): Promise<void> {
        this._currentPlayerIndex =
            (this._currentPlayerIndex + 1) % this._players.size;
        this.deselectPlayer();

        if (this.players.filter((player) => !player.defeated).length < 2) {
            this.state = BoardState.View;
            this.logger.log(`Game over!`);
            return;
        }

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
            this.selectWizard(this.currentPlayer!);
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

    /* #endregion */

    /* #region Utils */

    get scene(): Phaser.Scene {
        return this._scene;
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

    /* #endregion */

    /* #region Dev helpers */

    getRandomEmptySpace(): Phaser.Geom.Point {
        const x: number = Math.floor(Math.random() * this.width);
        const y: number = Math.floor(Math.random() * this.height);

        const point: Phaser.Geom.Point = new Phaser.Geom.Point(x, y);

        if (this.getPiecesAtPosition(point).length > 0) {
            return this.getRandomEmptySpace();
        }

        return point;
    }

    /* #endregion */
}
