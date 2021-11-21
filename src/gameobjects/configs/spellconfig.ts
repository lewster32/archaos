export interface SpellConfig {
    id: string;
    chance: number;
    balance: number;
    name: string;

    unitId?: string;
    allowIllusion?: boolean;
    
    autoPlace?: boolean;
    tree?: boolean;
    castTimes?: number;
    range?: number;
    damage?: number;
    lineOfSight?: boolean;

    projectile?: string;
}