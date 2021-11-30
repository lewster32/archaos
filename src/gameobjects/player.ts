import { Board } from "./board";
import { PlayerConfig } from "./configs/playerconfig";
import { EffectType } from "./effectemitter";
import { UnitStatus } from "./enums/unitstatus";
import { Model } from "./model";
import { Piece } from "./piece";
import { Spell } from "./spell";
import { Wizard } from "./wizard";

export class Player extends Model {
    private _name?: string;
    private _board: Board;
    private _colour: number | null;
    private _wizcode: string;

    private _spells: Map<number, Spell>;

    private _selectedSpell: Spell | null;
    private _defeated: boolean;

    static PLAYER_COLOURS: number[] = [
        0x0000ff, 0xff0000, 0xff00ff, 0x00ff00, 0x00ffff, 0xffff00, 0x000000,
        0xff5500,
    ];

    constructor(board: Board, id: number, config: PlayerConfig) {
        super(id);
        this._name = config.name;
        this._board = board;
        this._colour = null;

        this._spells = new Map();
        this._selectedSpell = null;
        this._defeated = false;
        this._wizcode = "";
    }

    get colour(): number | null {
        return this._colour || null;
    }

    set colour(colour: number | null) {
        this._colour = colour;
    }

    get name(): string {
        return this._name || `Player ${this.id}`;
    }

    get board(): Board {
        return this._board;
    }

    get spells(): Spell[] {
        return Array.from(this._spells.values());
    }

    get defeated(): boolean {
        return this._defeated;
    }

    get wizcode(): string {
        if (!this._wizcode) {
            return Wizard.randomWizCode()
        }
        return this._wizcode;
    }

    async defeat(): Promise<void> {
        this._defeated = true;
        this.board.logger.log(`Game over for ${this.name}`);
        await this.destroyCreations();
    }

    async destroyCreations(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.board.getPiecesByOwner(this).forEach((piece: Piece) => {
                if (piece.hasStatus(UnitStatus.Wizard)) {
                    return;
                }
                setTimeout(async () => {
                    await this.board.playEffect(EffectType.DisbelieveHit, piece.sprite.getCenter(), null, piece);
                    piece.destroy();
                }, 250 + Math.random() * 1750);
            });
            setTimeout(() => {
                resolve();
            }, 2000);
        });
    }

    addSpell(spell: Spell) {
        this._spells.set(spell.id, spell);
    }

    get selectedSpell(): Spell | null {
        return this._selectedSpell;
    }

    async pickSpell(id: number): Promise<Spell> {
        const spell: Spell | undefined = this._spells.get(id);
        if (spell) {
            this._selectedSpell = spell;
            return this._selectedSpell;
        }
        throw new Error("This player does not have that spell");
    }

    async useSpell(): Promise<Spell | null> {
        if (this._selectedSpell) {
            if (this._selectedSpell.castTimes <= 0) {
                this.discardSpell();
                return null;
            } else {
                const spell: Spell = this._selectedSpell;
                return spell;
            }
        }
        return null;
    }

    async discardSpell(): Promise<Spell | null> {
        if (this._selectedSpell) {
            const spell: Spell = this._selectedSpell;
            if (!spell.persist) {
                this._spells.delete(this._selectedSpell.id);
            }
            else {
                spell.resetCastTimes();
            }
            this._selectedSpell = null;
            return spell;
        }
        return null;
    }
}
