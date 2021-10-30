import { Board } from "./board";
import { Model } from "./model";

export class Entity extends Model {
    private _board: Board;

    private _position: Phaser.Geom.Point;

    constructor(board: Board, id: number, x: number, y: number) {
        super(id);
        this._position = new Phaser.Geom.Point(x, y);
        this._board = board;
    }

    get board(): Board {
        return this._board;
    }

    get position(): Phaser.Geom.Point {
        return this._position;
    }

    set position(value: Phaser.Geom.Point) {
        this._position.setTo(value.x, value.y);
    }
}