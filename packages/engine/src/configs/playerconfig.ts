import { GameSetupPlayerType } from "../interfaces/ui";

export interface PlayerConfig {
    name?: string;
    type: GameSetupPlayerType;
    difficulty?: number;
    wizcode?: string;

    /**
     * Per-player attack outcome override. When set, all attacks by this
     * player's units will be forced to hit (true) or miss (false), bypassing
     * normal dice rolls. Null or undefined uses normal rolls (or the global
     * cheat flag if set).
     */
    forceHit?: boolean | null;

    /**
     * Per-player spell cast outcome override. When set, all spells cast by
     * this player will be forced to succeed (true) or fail (false), bypassing
     * normal chance rolls. Null or undefined uses normal rolls (or the global
     * cheat flag if set).
     */
    forceCast?: boolean | null;
}
