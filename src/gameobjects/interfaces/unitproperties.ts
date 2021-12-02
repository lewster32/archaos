import { UnitRangedProjectileType } from "../enums/unitrangedprojectiletype";
import { UnitStatus } from "../enums/unitstatus";

export interface IUnitProperties extends IUnitStats {
    id?: string;
    name?: string;

    attackType?: string;
    rangedType?: string;

    projectileType?: UnitRangedProjectileType;

    status: UnitStatus[];
}

export interface IUnitStats {
    movement: number;
    combat: number;
    rangedCombat: number;
    range: number;
    defense: number;
    maneuverability: number;
    magicResistance: number;
}