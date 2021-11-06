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

type SimplePoint = { x: number; y: number };

export class Board extends Model {
    private _scene: Phaser.Scene;
    private _width: number;
    private _height: number;

    private _layers: Map<BoardLayer, Phaser.GameObjects.Layer>;

    static DEFAULT_WIDTH: number = 13;
    static DEFAULT_HEIGHT: number = 13;
    static DEFAULT_CELLSIZE: number = 14;

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

    private _state: BoardState;
    private _cursor: Cursor;
    private _pieces: Map<number, Piece>;
    private _selected: Piece | null;
    private _players: Map<number, Player>;
    private _currentPlayer: Player | null;

    private _idCounter: number = 1;

    private _rules: Rules;

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

        this._cursor = new Cursor(this);
        this._selected = null;
        this._currentPlayer = null;

        this._rules = Rules.getInstance();

        let spaceKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        spaceKey.on("up", () => {
            this.pieces.forEach((piece) => {
                piece.reset();
            });
        });
    }

    /* #region State */

    get state(): BoardState {
        return this._state;
    }

    set state(state: BoardState) {
        this._state = state;
    }

    get cursor(): Cursor {
        return this._cursor;
    }

    get rules(): Rules {
        return this._rules;
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

    selectPiece(id: number): void {
        this._selected = this.getPiece(id);
    }

    deselectPiece(): void {
        this._selected = null;
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
            return piece;
        }
        throw new Error(`Could not find piece with ID ${id}`);
    }

    async attackPiece(attackingPieceId: number, defendingPieceId: number): Promise<Piece | null> {
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

    async mountPiece(mountingPieceId: number, mountedPieceId: number): Promise<Piece | null> {
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
        const dismountingPiece: Piece | null = this.getPiece(dismountingPieceId);
        if (!dismountingPiece) {
            throw new Error(`Could not find piece with ID ${dismountingPieceId}`);
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
        return player;
    }

    getPlayer(id: number): Player | null {
        if (this._players.has(id)) {
            return this._players.get(id)!;
        }
        return null;
    }

    selectPlayer(id: number): void {
        this._currentPlayer = this.getPlayer(id);
    }

    deselectPlayer(): void {
        this._currentPlayer = null;
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
