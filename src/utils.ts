import { Display } from "phaser";

/**
 * Converts a numeric colour to a hex string.
 * 
 * @param colourNum  The numeric colour.
 * @returns The hex colour string.
 */
export const hexColour = (colourNum: number) => {
    if (colourNum === undefined || colourNum === null) {
        return "#ffffff";
    }
    const colour: Display.Color =
        Display.Color.ValueToColor(colourNum);
    return `${colour.rgba}`;
};