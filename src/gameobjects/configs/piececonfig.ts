import { UnitType } from "../enums/unittype";
import { IUnitProperties } from "../interfaces/unitproperties";
import { Player } from "../player";

interface UnitConfig {
    x: number;
    y: number;
    owner?: Player;
}

export interface PieceConfig extends UnitConfig {
    type: UnitType;
    properties?: IUnitProperties;
    shadowScale?: number;
    offsetY?: number;
    illusion?: boolean;
}

export interface WizardConfig extends UnitConfig {
    wizCode: string;
}