import { Board } from "../../../../src/gameobjects/board";
import { Piece } from "../piece";
import { Player } from "../player";
import { RemotePlayer } from "./remoteplayer";

export class RemoteWizard implements RemotePlayer {
    /**
     * The player this represents.
     */
    private readonly player: Player;

    /**
     * The game board.
     */
    private readonly board: Board;

    /**
     * Create a new RemoteWizard controller for the given player.
     *
     * @param board a reference to the game board
     * @param player the player this remote instance is controlling
     */
    constructor(board: Board, player: Player) {
        this.board = board;
        this.player = player;
    }

    /**
     * Selects a spell for the player to cast.
     *
     * @returns whether a spell was successfully selected
     */
    async selectSpell(): Promise<boolean> {
        // Dummy implementation
        return false;
    }

    /**
     * Casts the currently selected spell.
     *
     * @returns whether the spell was successfully cast
     */
    async castSpell(): Promise<boolean> {
        // Dummy implementation
        return false;
    }

    /**
     * Moves all units controlled by the player.
     *
     * @returns a promise that resolves when all units have been moved
     */
    async moveAllUnits(): Promise<void> {
        // Dummy implementation
        return;
    }

    /**
     * Moves a single unit controlled by the player.
     *
     * @param piece the piece to move
     * @returns whether the piece was successfully moved
     */
    async moveUnit(_piece: Piece): Promise<boolean> {
        // Dummy implementation
        return false;
    }
}
