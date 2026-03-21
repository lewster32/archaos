import { Display } from "phaser";

/**
 * Converts a numeric colour to a hex string.
 *
 * @param colourNum  The numeric colour.
 * @returns The hex colour string.
 */
/**
 * Returns a promise that resolves after the given number of milliseconds.
 *
 * @param time  Duration in milliseconds.
 */
export async function delay(time: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, time);
    });
}

export const cssColour = (colourNum: number = 0xffffff) => {
    colourNum ??= 0xffffff; // Default to white if no colour is provided
    const colour: Display.Color = Display.Color.ValueToColor(colourNum);
    return `${colour.rgba}`;
};
