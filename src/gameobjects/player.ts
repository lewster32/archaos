import { Board } from "./board";
import { PlayerConfig } from "./configs/playerconfig";
import { Model } from "./model";

export class Player extends Model {
    private _name?: string;
    private _board: Board;
    private _colour: number | null;

    static PLAYER_COLOURS: number[] = [
        0x0000ff,
        0xff0000,
        0xff00ff,
        0x00ff00,
        0x00ffff,
        0xffff00,
        0x000000,
        0xff5500,
    ];

    constructor(board: Board, id: number, config: PlayerConfig) {
        super(id);
        this._name = config.name;
        this._board = board;
        this._colour = null;
    }

    get colour(): number | null {
        return this._colour || null;
    }

    set colour(colour: number | null) {
        this._colour = colour;
    }

    get name(): string  {
        return this._name || `Player ${this.id}`;
    }

    get board(): Board {
        return this._board;
    }

}
