import { Piece } from "./gameobjects/piece";

export interface RemotePlayer {
    /**
     * Selects a spell for the player to cast.
     * 
     * @returns whether a spell was successfully selected
     */
    selectSpell(): Promise<boolean>;

    /**
     * Casts the currently selected spell.
     * 
     * @returns whether the spell was successfully cast
     */
    castSpell(): Promise<boolean>;

    /**
     * Moves all units controlled by the player.
     * 
     * @returns a promise that resolves when all units have been moved
     */
    moveAllUnits(): Promise<void>;

    /**
     * Moves a single unit controlled by the player.
     * 
     * @param piece the piece to move
     * @returns whether the piece was successfully moved
     */
    moveUnit(piece: Piece): Promise<boolean>;

    /**
     * Selects a spell for the player to cast.
     * 
     * @returns whether a spell was successfully selected
     */
    selectSpell(): Promise<boolean>;
}