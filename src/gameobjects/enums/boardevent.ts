/**
 * Events emitted by the Board when key game state changes occur.
 * Tutorials and other observers can subscribe to these via
 * `board.boardEvents`.
 */
export enum BoardEvent {
    /** A new turn has begun (pieces reset, phase advances to Spellbook). */
    NewTurn = "board:new-turn",

    /** The board phase changed (Spellbook, Casting, Moving, etc.). */
    PhaseChange = "board:phase-change",

    /** The board state changed (Move, CastSpell, Busy, etc.). */
    StateChange = "board:state-change",

    /** A piece finished moving to a new position. */
    PieceMoved = "board:piece-moved",

    /** A melee attack was performed. */
    PieceAttacked = "board:piece-attacked",

    /** A ranged attack was performed. */
    PieceRangedAttacked = "board:piece-ranged-attacked",

    /** A piece was killed (died in combat, by a spell, etc.). */
    PieceDied = "board:piece-died",

    /** A piece was completely removed from the board (illusion disbelieved, undead destroyed, etc.). */
    PieceDestroyed = "board:piece-destroyed",

    /** A player selected a spell from the spellbook. */
    SpellSelected = "board:spell-selected",

    /** A spell was cast. */
    SpellCast = "board:spell-cast",

    /** A player was defeated (all pieces dead, or conceded). */
    PlayerDefeated = "board:player-defeated",

    /** The game ended. */
    GameOver = "board:game-over",
}
