/**
 * Enumeration of spell targets
 */
export enum SpellTarget {
    /**
     * Target an empty tile
     */
    Empty = "empty",

    /**
     * Target the caster - these spells auto-cast on the player's turn to cast
     */
    Self = "self",

    /**
     * Target a piece (unit, structure etc.)
     */
    Piece = "piece",

    /**
     * Target a corpse (a dead unit - not to be confused with an undead unit)
     */
    Corpse = "corpse"
}