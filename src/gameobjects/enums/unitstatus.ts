/**
 * Enumeration of unit statuses
 */
export enum UnitStatus {
    /**
     * When spreading, can engulf other units
     */
    Engulfs = "engulf",

    /**
     * Disappears after a random number of turns
     */
    Expires = "expires",

    /**
     * Gives spell on expiry
     */
    ExpiresGivesSpell = "expiresGivesSpell",

    /**
     * Can move over obstacles
     */
    Flying = "flying",

    /**
     * Cannot be harmed
     */
    Invulnerable = "invuln",

    /**
     * Cannot be attacked with magical attacks
     */
    Sanctity = "sanctity",

    /**
     * Mountable by wizards
     */
    Mount = "mount",

    /**
     * Mountable by any unit - not currently used
     */
    MountAny = "mountAny",

    /**
     * Can spread to adjacent tiles
     */
    Spreads = "spread",

    /**
     * Is a structure (cannot move)
     */
    Structure = "struct",

    /**
     * Does not block line of sight
     */
    Transparent = "trans",

    /**
     * Is a tree (used to prevent trees from being cast on adjacent tiles to other trees)
     */
    Tree = "tree",

    /**
     * Is undead
     */
    Undead = "undead",

    /**
     * Can cast spells
     */
    Wizard = "wizard",

    /**
     * Does not leave a corpse when killed
     */
    NoCorpse = "noCorpse",

    /**
     * Can attack undead units
     */
    AttackUndead = "attackUndead",

    // Wizard buff statuses
    /**
     * Improved stats, lost on attack
     */
    ShadowForm = "shadowForm",

    /**
     * Can fly
     */
    MagicWings = "magicWings",

    /**
     * Improved armour
     */
    MagicShield = "magicShield",

    /**
     * Greatly improved armour
     */
    MagicArmour = "magicArmour",

    /**
     * Greatly improved melee attack (can attack undead)
     */
    MagicSword = "magicSword",

    /**
     * Adds long ranged attack (can attack undead)
     */
    MagicBow = "magicBow",

    /**
     * Improved melee attack (can attack undead)
     */
    MagicKnife = "magicKnife",
}
