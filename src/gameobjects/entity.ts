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
    private readonly _board: Board;

    /**
     * The position of this entity on the board.
     */
    private readonly _position: Geom.Point;

    /**
     * Create a new Entity instance.
     * @param board The board this entity belongs to.
     * @param id The unique identifier for this entity.
     * @param x The x-coordinate of this entity on the board.
     * @param y The y-coordinate of this entity on the board.
     */
    constructor(board: Board, id: number, x: number, y: number) {
        super(id);
        if (!board) {
            throw new Error("Board cannot be null or undefined.");
        }
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
            throw new TypeError("Coordinates must be integers.");
        }
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
        if (!Number.isInteger(value.x) || !Number.isInteger(value.y)) {
            throw new TypeError("Coordinates must be integers.");
        }
        this._position.setTo(value.x, value.y);
    }
}
