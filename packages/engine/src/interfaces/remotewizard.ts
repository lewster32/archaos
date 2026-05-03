import { Board } from "../board";
import { Player } from "../player";
import { RemotePlayer } from "./remoteplayer";

/**
 * Stub network-player controller. The legacy moveUnit / moveAllUnits
 * entry points were removed in Task 12 of the movement-phase
 * command-wiring spec, leaving this class as an empty marker until
 * actual networking work begins.
 */
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
}
