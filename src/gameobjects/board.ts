import { PieceConfig } from "./configs/piececonfig";
import { Cursor } from "./cursor";
import { Entity } from "./entity";
import { BoardLayer } from "./enums/boardlayer";
import { BoardState } from "./enums/boardstate";
import { Model } from "./model";
import { Piece } from "./piece";

export class Board extends Model {
    private _scene: Phaser.Scene;
    private _width: number;
    private _height: number;

    private _layers: Map<BoardLayer, Phaser.GameObjects.Layer>;

    static DEFAULT_WIDTH: number = 13;
    static DEFAULT_HEIGHT: number = 13;
    static DEFAULT_CELLSIZE: number = 14;

    private _state: BoardState;
    private _cursor: Cursor;
    private _pieces: Map<number, Piece>;
    private _selected: Piece | null;

    private _idCounter: number = 1;

    get entities(): Entity[] {
        return Array.from(this._pieces.values());
    }

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
        this._state = BoardState.MovePieces;

        this._cursor = new Cursor(this);
        this._selected = null;
    }

    get scene(): Phaser.Scene {
        return this._scene;
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    get pieces(): Piece[] {
        return Array.from(this._pieces.values());
    }

    set state(state: BoardState) {
        this._state = state;
    }

    get state(): BoardState {
        return this._state;
    }

    get selected(): Piece | null {
        return this._selected;
    }

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

                floorLayer.add(tile);
            }
        }
        this._layers.set(BoardLayer.Floor, floorLayer);
    }

    getRandomEmptySpace(): Phaser.Geom.Point {
        const x: number = Math.floor(Math.random() * this.width);
        const y: number = Math.floor(Math.random() * this.height);

        const point: Phaser.Geom.Point = new Phaser.Geom.Point(x, y);

        if (this.getPiecesAtPosition(point).length > 0) {
            return this.getRandomEmptySpace();
        }

        return point;
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

    addPiece(config: PieceConfig): Piece {
        const piece: Piece = new Piece(this, this._idCounter++, config);
        this._pieces.set(piece.id, piece);
        return piece;
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

    async movePiece(id: number, positon: Phaser.Geom.Point): Promise<Piece> {
        const piece: Piece | null = this.getPiece(id);
        if (piece) {
            await piece.moveTo(positon);
            return piece;
        }
        throw new Error(`Could not find piece with ID ${id}`);
    }

    removePiece(id: number): void {
        this._pieces.delete(id);
    }

    getPiecesAtPosition(point: Phaser.Geom.Point): Piece[] {
        return Array.from(
            this.pieces.filter((piece) => {
                return Phaser.Geom.Point.Equals(piece.position, point);
            })
        );
    }

    getLayer(layer: BoardLayer): Phaser.GameObjects.Layer {
        return this._layers.get(layer)!;
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
}
