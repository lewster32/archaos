import { SpellTarget } from "../enums/spelltarget";

export interface SpellConfig {
    /**
     * The unique ID of the spell
     */
    id?: string;

    /**
     * How likely the spell is to succeed when cast (0 to 1)
     */
    chance: number;

    /**
     * The balance alignment of the spell with negative being chaotic and
     * positive being lawful.
     */
    balance: number;

    /**
     * The name of the spell
     */
    name: string;

    /**
     * A description of the spell
     */
    description?: string;

    /**
     * The unit ID to summon (if a summon spell)
     */
    unitId?: string;

    /**
     * Whether illusions are allowed for this summon spell
     */
    allowIllusion?: boolean;

    /**
     * Whether the spell auto-places summoned units (e.g., Magic Wood)
     */
    autoPlace?: boolean;

    /**
     * Whether the spell results in a tree (used to prevent adjacent tree summoning)
     */
    tree?: boolean;

    /**
     * Whether line of sight is required to cast the spell
     */
    lineOfSight?: boolean;

    /**
     * The number of times this spell can be cast in a turn
     */
    castTimes?: number;

    /**
     * The range at which this spell can be cast
     */
    range?: number;

    /**
     * The target type of this spell
     */
    target?: SpellTarget;
    
    /**
     * The projectile used by this spell (if any)
     */
    projectile?: string;

    /**
     * The damage dealt by this spell (if an attack spell)
     */
    damage?: number;

    /**
     * Whether this spell can be cast on enemy units
     */
    castOnEnemyUnit?: boolean;

    /**
     * Whether this spell can be cast on friendly units
     */
    castOnFriendlyUnit?: boolean;

    /**
     * Whether this spell can be cast on enemy wizards
     */
    castOnWizard?: boolean;

    /**
     * If true and cast on a wizard, will destroy all creatures owned by that 
     * wizard instead of the wizard themselves
     */
    destroyWizardCreatures?: boolean;

    /**
     * Whether this spell persists after being cast (e.g., Disbelieve)
     */
    persist?: boolean;

    /**
     * Whether this spell is only available as a gift (e.g., Turmoil)
     */
    giftOnly?: boolean;
}