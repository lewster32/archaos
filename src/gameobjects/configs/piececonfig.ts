import { PieceType } from "../enums/piecetype";
import { IUnitProperties } from "../interfaces/unitproperties";
import { Player } from "../player";

export interface PieceConfig {
    type: PieceType;
    x: number;
    y: number;
    properties: IUnitProperties;
    owner?: Player;
    shadowScale: number;
    offsetY: number;
}
