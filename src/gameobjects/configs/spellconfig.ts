import { SpellTarget } from "../enums/spelltarget";

export interface SpellConfig {
    id: string;
    chance: number;
    balance: number;
    name: string;
    description?: string;

    unitId?: string;
    allowIllusion?: boolean;
    
    autoPlace?: boolean;
    tree?: boolean;
    castTimes?: number;
    range?: number;
    damage?: number;
    lineOfSight?: boolean;

    projectile?: string;
    persist?: boolean;

    castOnEnemyUnit?: boolean;
    castOnFriendlyUnit?: boolean;
    castOnWizard?: boolean;
    destroyWizardCreatures?: boolean;

    target?: SpellTarget;
}