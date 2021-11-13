import { UnitRangedProjectileType } from "../enums/unitrangedprojectiletype";
import { UnitStatus } from "../enums/unitstatus";

export interface IUnitProperties {
    id?: string;
    name?: string;

    movement: number;
    combat: number;
    rangedCombat: number;
    range: number;
    defense: number;
    maneuverability: number;
    magicResistance: number;

    attackType?: string;
    rangedType?: string;

    projectileType?: UnitRangedProjectileType;

    status: UnitStatus[];
}