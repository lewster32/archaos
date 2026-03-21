/**
 * The possible actions that each spreading unit can take during the spreading
 * phase of a turn.
 */
export enum SpreadAction {
    /**
     * No action taken.
     */
    None = "none",

    /**
     * Shrink away to nothing.
     */
    Shrink = "shrink",

    /**
     * Spread to adjacent tiles.
     */
    Spread = "spread",
}
