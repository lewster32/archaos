/**
 * Enumeration for different types of spells.
 */
export enum SpellType {
    /**
     * Miscellaneous spell types such as Subversion, Turmoil, etc.
     */
    Misc = "misc",

    /**
     * Buff spell types, such as Magic Shield, Law, etc.
     */
    Buff = "buff",

    /**
     * Summon a unit onto the board.
     */
    Summon = "summon",

    /**
     * Attack spell types, such as Magic Bolt, Lightning, etc.
     */
    Attack = "attack",

    /**
     * Disbelieve spell type. It's special enough to warrant its own type.
     */
    Disbelieve = "disbelieve",
}
