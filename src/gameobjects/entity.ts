import { Board } from "./board";
import { Model } from "./model";

import { Geom } from "phaser";

/**
 * A unique entity on the game board with gameplay relevance.
 */
export class Entity extends Model {
    /**
     * The parent board this entity is on.
     */
    private _board: Board;

    /**
     * The position of this entity on the board.
     */
    private _position: Geom.Point;

    /**
     * Create a new Entity instance.
     * @param board The board this entity belongs to.
     * @param id The unique identifier for this entity.
     * @param x The x-coordinate of this entity on the board.
     * @param y The y-coordinate of this entity on the board.
     */
    constructor(board: Board, id: number, x: number, y: number) {
        super(id);
        this._position = new Geom.Point(x, y);
        this._board = board;
    }

    /**
     * Get the board this entity belongs to.
     */
    get board(): Board {
        return this._board;
    }

    /**
     * Get the position of this entity on the board.
     */
    get position(): Geom.Point {
        return this._position;
    }

    /**
     * Set the position of this entity on the board.
     * 
     * @param value The new position.
     */
    set position(value: Geom.Point) {
        this._position.setTo(value.x, value.y);
    }
}