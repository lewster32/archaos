import { Board } from "./board";
import { EffectType } from "./effectemitter";
import { UnitStatus } from "./enums/unitstatus";
import { Model } from "./model";
import { Wizard } from "./wizard";
import type { PlayerConfig } from "./configs/playerconfig";
import type { Piece } from "./piece";
import type { Spell } from "./spells/spell";
import { ComputerWizard } from "./computerwizard";
import { Colour } from "./enums/colour";
import { RemotePlayer } from "../remoteplayer";
import { GameSetupPlayerType } from "./interfaces/ui";

export class Player extends Model {
    /**
     * The name of this player. This is optional in the constructor, and will
     * default to "Player " followed by the player's ID if not provided.
     */
    private readonly _name: string;

    /**
     * A reference to the game board. This is used internally by the Player
     * class to interact with the game board, such as when marking the player as
     * defeated.
     */
    private readonly _board: Board;

    /**
     * A unique code representing the visual appearance of this player's wizard.
     */
    private readonly _wizcode: string;

    /**
     * A map of this player's spells, keyed by spell ID. This is used to manage
     */
    private readonly _spells: Map<number, Spell>;
    
    /**
     * The colour of this player, represented as a hexadecimal RGB value. This
     * is used to tint the background, the wizard marker, the outlines on pieces
     * and the map markers for this player.
     */
    private readonly _colour: number;

    /**
     * The piece that this player is currently casting a spell with, if any.
     */
    private _castingPiece: Piece | null;

    /**
     * The currently selected spell for this player, if any. This is set when 
     * the player picks a spell from their spell list.
     */
    private _selectedSpell: Spell | null;

    /**
     * Whether or not this player has been defeated.
     */
    private _defeated: boolean;

    /**
     * The remote player controller for this player, if any. This will be set if
     * this player is controlled by a remote player (either a human over the
     * network or a computer wizard).
     */
    private readonly _remote: RemotePlayer | null;

    /**
     * Get the AI controller for this player, if any.
     */
    public get ai(): ComputerWizard | null {
        if (this._remote instanceof ComputerWizard) {
            return this._remote;
        }
        return null;
    }

    /**
     * A list of default player colours to assign to players in order of player
     * slot.
     */
    static readonly PLAYER_COLOURS: number[] = [
        0x0000ff, // Blue
        0xff0000, // Red
        0xff00ff, // Magenta
        0x00ff00, // Green
        0x00ffff, // Cyan
        0xffff00, // Yellow
        0x5500ff, // Purple
        0xff5500, // Orange
    ];

    /**
     * Creates a new Player instance.
     * 
     * @param board A reference to the game board.
     * @param id The unique ID for this player.
     * @param config The configuration for this player, including their name, type, and difficulty (if applicable).
     * @param colour The colour of this player, represented as a hexadecimal RGB value.
     */
    constructor(board: Board, id: number, config: PlayerConfig, colour: number) {
        super(id);
        if (!config) {
            throw new Error("Player must be given a config");
        }
        this._name = config.name?.toString().trim() || "Player " + id;
        this._board = board;
        this._colour = colour;

        this._spells = new Map();
        this._selectedSpell = null;
        this._defeated = false;
        this._wizcode = config.wizcode || Wizard.randomWizCode();
        if (config.type === GameSetupPlayerType.Computer) {
            this._remote = new ComputerWizard(board, this, config.difficulty ?? 0.5);
            console.log(`${this.name} will be controlled by AI, with difficulty ${this.ai.difficulty}.`);
        }
    }

    get colour(): number {
        return this._colour;
    }

    get name(): string {
        return this._name;
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
        return this._wizcode;
    }

    get castingPiece(): Piece | null {
        return this._castingPiece;
    }
    
    set castingPiece(piece: Piece | null) {
        if (piece && piece.owner !== this) {
            throw new Error("Cannot set casting piece to a piece not owned by this player");
        }
        this._castingPiece = piece;
    }
    
    get remote(): RemotePlayer | null {
        return this._remote;
    }

    /**
     * Marks this player as defeated, plays the defeat sequence, and destroys
     * all of their non-wizard pieces.
     */
    async defeat(): Promise<void> {
        this._defeated = true;
        this.board.logger.log(
            `Game over for ${this.name}`,
            Colour.Red
        );
        await this.board.sound.playAsync("deadwizard2", {
            delay: Board.DEFAULT_DELAY
        });
        await this.destroyCreations();
        // Let's really dwell on this for a bit
        await this.board.idleDelay(Board.END_TURN_DELAY);
    }

    /**
     * Destroys all non-wizard pieces owned by this player, with a short delay
     * and effect for each.
     * 
     * @returns A promise that resolves when all non-wizard pieces owned by this player have been destroyed.
     */
    async destroyCreations(): Promise<any[]> {
        return Promise.all(
            this.board.getPiecesByOwner(this)
                .filter(p => !p.hasStatus(UnitStatus.Wizard))
                .map((piece: Piece) => {
                    return new Promise((resolve, reject) => {
                        setTimeout(async () => {
                            this.board.sound.play("disbelieve");
                            await this.board.playEffect(EffectType.DisbelieveHit, piece.sprite.getCenter(), null, piece);
                            await piece.destroy();
                            resolve(true);
                        }, 250 + Math.random() * 500);
                    })
                }));
    }

    /**
     * Adds a spell to this player's spell list. The spell's owner will be set
     * to this player.
     * 
     * @param spell The spell to add to this player's spell list.
     */
    addSpell(spell: Spell) {
        spell.owner = this;
        this._spells.set(spell.id, spell);
    }

    /**
     * Gets the currently selected spell for this player.
     * 
     * @returns The currently selected spell, or null if no spell is selected.
     */
    get selectedSpell(): Spell | null {
        return this._selectedSpell;
    }

    /**
     * Selects a spell from this player's spell list by its ID. The selected
     * spell will be set as the currently selected spell for this player.
     * 
     * @param id The ID of the spell to select.
     * @returns A promise that resolves to the selected spell.
     */
    async pickSpell(id: number): Promise<Spell> {
        const spell: Spell | undefined = this._spells.get(id);
        if (spell) {
            this._selectedSpell = spell;
            return this._selectedSpell;
        }
        throw new Error("This player does not have that spell");
    }

    /**
     * Uses the currently selected spell, if any.
     * 
     * @returns A promise that resolves to the used spell, or null if no spell is selected or the spell cannot be used.
     */
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

    /**
     * Discards the currently selected spell, if any. This will remove the spell
     * from the player's spell list if it does not persist, or reset its cast
     * times if it does.
     * 
     * @returns A promise that resolves to the discarded spell, or null if no spell is selected.
     */
    async discardSpell(): Promise<Spell | null> {
        if (this._selectedSpell) {
            const spell: Spell = this._selectedSpell;
            if (spell.persist) {
                spell.resetCastTimes();
            }
            else {
                this._spells.delete(this._selectedSpell.id);
            }
            this._selectedSpell = null;
            return spell;
        }
        return null;
    }

    /**
     * Returns a string representation of this player, which is simply their
     * name.
     * 
     * @returns A string representation of this player.
     */
    toString(): string {
        return this.name;
    }
}
