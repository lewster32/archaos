import { UnitType } from "../enums/unittype";
import { UnitProperties } from "../interfaces/unitproperties";
import { Player } from "../player";

interface UnitConfig {
    x: number;
    y: number;
    owner?: Player;
}

export interface PieceConfig extends UnitConfig {
    type: UnitType;
    properties?: UnitProperties;
    shadowScale?: number;
    offsetY?: number;
    illusion?: boolean;
    group?: string;
}

export interface WizardConfig extends UnitConfig {
    wizCode: string;
}
