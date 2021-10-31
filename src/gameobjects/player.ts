import { Board } from "./board";
import { PlayerConfig } from "./configs/playerconfig";
import { Model } from "./model";

export class Player extends Model {
    private _name?: string;
    private _board: Board;

    constructor(board: Board, id: number, config: PlayerConfig) {
        super(id);
        this._name = config.name;
        this._board = board;
    }

    get name(): string  {
        return this._name || `Player ${this.id}`;
    }

}
