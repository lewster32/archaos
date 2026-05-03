import { Piece } from "../piece";

export interface RemotePlayer {
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
}
