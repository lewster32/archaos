import { Board } from "./board";
import { PlayerConfig } from "./configs/playerconfig";
import { Model } from "./model";
import { Spell } from "./spell";

export class Player extends Model {
    private _name?: string;
    private _board: Board;
    private _colour: number | null;

    private _spells: Set<Spell>;

    private _selectedSpell: Spell | null;
    private _defeated: boolean;

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

        this._spells = new Set();
        this._selectedSpell = null;
        this._defeated = false;
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

    get spells(): Spell[] {
        return Array.from(this._spells);
    }

    get defeated(): boolean {
        return this._defeated;
    }

    async defeat(): Promise<void> {
        this._defeated = true;
        this.board.getPiecesByOwner(this).forEach(piece => {
            setTimeout(() => {
                piece.destroy()
            }, 500 + (Math.random() * 1000));
        });
    }

    addSpell(spell: Spell) {
        this._spells.add(spell);
    }

    get selectedSpell(): Spell | null {
        return this._selectedSpell;
    }

    async pickSpell(spell: Spell): Promise<Spell> {
        if (this._spells.has(spell)) {
            this._selectedSpell = spell;
            return this._selectedSpell;
        }
        throw new Error("This player does not have that spell")
    }

    async useSpell(): Promise<Spell | null> {
        if (this._selectedSpell) {
            if (this._selectedSpell.castTimes <= 0) {
                this.discardSpell();
                return null;
            }
            else {
                const spell: Spell = this._selectedSpell;
                return spell;
            }
        }
        return null;
    }

    async discardSpell(): Promise<Spell | null> {
        if (this._selectedSpell) {
            const spell: Spell = this._selectedSpell;
            this._spells.delete(this._selectedSpell);
            this._selectedSpell = null;
            return spell;
        }
        return null;
    }
}
