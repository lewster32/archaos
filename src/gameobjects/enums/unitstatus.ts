export enum UnitStatus {
    Engulfs = "engulf", // When spreading, can engulf other units
    Expires = "expires", // Disappears after a random number of turns
    ExpiresGivesSpell = "expiresGivesSpell", // Gives spell on expiry
    Flying = "flying", // Can move over obstacles
    Invulnerable = "invuln", // Cannot be harmed
    Mount = "mount", // Mountable by wizards
    MountAny = "mountAny", // Mountable by any unit - not currently used
    Spreads = "spread", // Can spread to adjacent tiles
    Structure = "struct", // Is a structure (cannot move)
    Transparent = "trans", // Does not block line of sight
    Tree = "tree", // Is a tree (used to prevent trees from being cast on adjacent tiles to other trees)
    Undead = "undead", // Is undead
    Wizard = "wizard", // Can cast spells
    NoCorpse = "noCorpse", // Does not leave a corpse when killed
    AttackUndead = "attackUndead", // Can attack undead units

    // Wizard-specific buffs
    ShadowForm = "shadowForm", // Improved stats, lost on attack
    MagicWings = "magicWings", // Can fly
    MagicShield = "magicShield", // Improved armour
    MagicArmour = "magicArmour", // Greatly improved armour
    MagicSword = "magicSword", // Greatly improved melee attack (can attack undead)
    MagicBow = "magicBow", // Adds long ranged attack (can attack undead)
    MagicKnife = "magicKnife", // Improved melee attack (can attack undead)
}