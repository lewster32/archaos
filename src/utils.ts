import { Display } from "phaser";

/**
 * Converts a numeric colour to a hex string.
 * 
 * @param colourNum  The numeric colour.
 * @returns The hex colour string.
 */
export const cssColour = (colourNum: number = 0xffffff) => {
    colourNum ??= 0xffffff; // Default to white if no colour is provided
    const colour: Display.Color =
        Display.Color.ValueToColor(colourNum);
    return `${colour.rgba}`;
};