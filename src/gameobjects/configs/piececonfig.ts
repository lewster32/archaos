import { UnitType } from "../enums/unittype";
import { IUnitProperties } from "../interfaces/unitproperties";
import { Player } from "../player";

interface Config {
    x: number;
    y: number;
    owner?: Player;
}

export interface PieceConfig extends Config {
    type: UnitType;
    properties?: IUnitProperties;
    shadowScale?: number;
    offsetY?: number;
}

export interface WizardConfig extends Config {
    wizCode: string;
}