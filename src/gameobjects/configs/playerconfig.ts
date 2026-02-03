import { GameSetupPlayerType } from "../interfaces/ui";

export interface PlayerConfig {
    name?: string;
    type: GameSetupPlayerType;
    difficulty?: number;
}