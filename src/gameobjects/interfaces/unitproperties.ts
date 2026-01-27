import { UnitRangedProjectileType } from "../enums/unitrangedprojectiletype";
import { UnitStatus } from "../enums/unitstatus";

export interface UnitProperties extends IUnitStats {
    id?: string;
    name?: string;

    attackType?: string;
    rangedType?: string;

    projectileType?: UnitRangedProjectileType;

    status: UnitStatus[];
    group?: string;
}

export interface IUnitStats {
    /**
     * The movement range of the unit.
     */
    movement: number;

    /**
     * The combat strength of the unit.
     */
    combat: number;

    /**
     * The ranged combat strength of the unit.
     */
    rangedCombat: number;

    /**
     * The range of the unit's ranged attack.
     */
    range: number;

    /**
     * The defense rating of the unit.
     */
    defense: number;

    /**
     * How likely a unit is to disengage from an enemy (higher is more likely).
     */
    maneuverability: number;
    
    /**
     * How likely a unit will resist magic attacks or spells like Subversion (higher is more likely).
     */
    magicResistance: number;
}