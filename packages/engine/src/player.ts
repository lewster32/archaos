import { Model } from "./models/model";
import { Colour } from "./enums/colour";
import type { PlayerConfig } from "./configs/playerconfig";
import type { RemotePlayer } from "./interfaces/remoteplayer";
import type { Spell } from "./spells/spell";
import type { Piece } from "./piece";

// Board is imported only as a type to avoid a
// circular dependency at runtime.
import type { Board } from "./board";
import { UnitStatus } from "./enums/unitstatus";

/**
 * Minimal AI interface that engine code (spells)
 * can depend on without importing ComputerWizard.
 */
export interface PlayerAI {
    difficulty: number;
    preferredTargetId: number | null;
    rememberNonIllusionPiece?(pieceId: number): void;
    forgetIllusionKnowledge?(): void;
    knowsPieceIsNonIllusion?(pieceId: number): boolean;
}

/**
 * A player in the game. Owns spells, a wizard piece,
 * and tracks defeat state. No Phaser imports.
 *
 * The client Player extends this class and overrides
 * defeat()/destroyCreations() to add rendering.
 */
export class Player<P extends Piece = Piece> extends Model {
    protected readonly _name: string;
    protected readonly _board: Board<P>;
    protected readonly _wizCode: string;
    protected readonly _spells: Map<number, Spell<P>>;
    protected readonly _colour: number;

    protected _castingPiece: P | null;
    protected _selectedSpell: Spell<P> | null;
    protected _defeated: boolean;

    protected _forceHit: boolean | null = null;
    protected _forceCast: boolean | null = null;

    protected readonly _remote: RemotePlayer | null;

    /**
     * A list of default player colours to assign to
     * players in order of player slot.
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
     * @param config The configuration for this player.
     * @param colour The colour of this player.
     * @param remote Optional remote player controller.
     */
    constructor(
        board: Board<P>,
        id: number,
        config: PlayerConfig,
        colour: number,
        remote?: RemotePlayer | null,
    ) {
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
        this._wizCode = config.wizCode || "";
        this._forceHit = config.forceHit ?? null;
        this._forceCast = config.forceCast ?? null;
        this._remote = remote ?? null;
    }

    get colour(): number {
        return this._colour;
    }

    get name(): string {
        return this._name;
    }

    get board(): Board<P> {
        return this._board;
    }

    get spells(): Spell<P>[] {
        return Array.from(this._spells.values());
    }

    get defeated(): boolean {
        return this._defeated;
    }

    get wizCode(): string {
        return this._wizCode;
    }

    get forceHit(): boolean | null {
        return this._forceHit;
    }

    set forceHit(value: boolean | null) {
        this._forceHit = value;
    }

    get forceCast(): boolean | null {
        return this._forceCast;
    }

    set forceCast(value: boolean | null) {
        this._forceCast = value;
    }

    get castingPiece(): P | null {
        return this._castingPiece;
    }

    set castingPiece(piece: P | null) {
        if (piece && piece.owner !== this) {
            throw new Error(
                "Cannot set casting piece to a " +
                    "piece not owned by this player",
            );
        }
        this._castingPiece = piece;
    }

    get remote(): RemotePlayer | null {
        return this._remote;
    }

    /**
     * Get the AI controller for this player, if any.
     * Returns the remote player cast to the AI
     * interface. The client overrides this to return
     * the concrete ComputerWizard type.
     */
    get ai(): PlayerAI | null {
        if (!this._remote) return null;
        return this._remote as unknown as PlayerAI;
    }

    /**
     * Marks this player as defeated and emits the
     * PlayerDefeated event. The client overrides this
     * to add sound and effect playback.
     */
    async defeat(): Promise<void> {
        this._defeated = true;
        await this.destroyCreations();
        this.board.logger.log(`Game over for ${this.name}`, Colour.Red);
    }

    /**
     * Destroys all non-wizard pieces owned by this
     * player. The client overrides this to add
     * rendering effects.
     */
    async destroyCreations(): Promise<any[]> {
        return Promise.all(
            (this.board as unknown as Board)
                .getPiecesByOwner(this)
                .filter((p) => !p.hasStatus(UnitStatus.Wizard))
                .map((piece: Piece) => piece.destroy()),
        );
    }

    /**
     * Adds a spell to this player's spell list.
     */
    addSpell(spell: Spell<P>) {
        spell.owner = this;
        this._spells.set(spell.id, spell);
    }

    get selectedSpell(): Spell<P> | null {
        return this._selectedSpell;
    }

    /**
     * Selects a spell by its ID.
     */
    async pickSpell(id: number): Promise<Spell<P>> {
        const spell: Spell<P> | undefined = this._spells.get(id);
        if (spell) {
            this._selectedSpell = spell;
            return this._selectedSpell;
        }
        throw new Error("This player does not have that spell");
    }

    /**
     * Uses the currently selected spell, if any.
     */
    async useSpell(): Promise<Spell<P> | null> {
        if (this._selectedSpell) {
            if (this._selectedSpell.castTimes <= 0) {
                this.discardSpell();
                return null;
            } else {
                return this._selectedSpell;
            }
        }
        return null;
    }

    /**
     * Discards the currently selected spell.
     */
    async discardSpell(): Promise<Spell<P> | null> {
        if (this._selectedSpell) {
            const spell: Spell<P> = this._selectedSpell;
            if (spell.persist) {
                spell.resetCastTimes();
            } else {
                this._spells.delete(this._selectedSpell.id);
            }
            this._selectedSpell = null;
            return spell;
        }
        return null;
    }

    toString(): string {
        return this.name;
    }
}
