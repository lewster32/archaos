/**
 * Enumeration of event types used in the game.
 */
export enum EventType {
    /**
     * Piece information requested.
     */
    PieceInfo = "piece-info",

    /**
     * Cancel action is available.
     */
    CancelAvailable = "cancel-available",

    /**
     * End turn action is available.
     */
    EndTurnAvailable = "end-turn-available",

    /**
     * Dismount action is available.
     */
    DismountAvailable = "dismount-available",

    /**
     * Game is over.
     */
    GameOver = "game-over",

    /**
     * Spellbook opened.
     */
    SpellbookOpen = "spellbook-open",

    /**
     * Spellbook closed.
     */
    SpellbookClose = "spellbook-close",

    /**
     * Board has been updated (e.g., pieces moved, created etc).
     */
    BoardUpdate = "board-update",

    /**
     * Request to cancel the current action. Sent from the cancel button.
     */
    Cancel = "cancel",

    /**
     * Request to end the current turn. Sent from the end turn button.
     */
    EndTurn = "end-turn",

    /**
     * Request to dismount a piece. Sent from the dismount button.
     */
    Dismount = "dismount",

    /**
     * A new turn has started.
     */
    NewTurn = "new-turn",
}
