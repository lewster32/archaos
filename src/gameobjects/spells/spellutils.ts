/**
 * Mainly UI-related spell utility functions.
 */

import type { Spell } from "./spell";

/**
 * Converts a normalised casting chance into a percentage.
 * 
 * @param chance The casting chance (0 to 1).
 * @returns The casting chance as a percentage.
 */
export const chancePercent = (chance: number): number => {
    return Math.round(chance * 100);
}

/**
 * Rounds the casting chance to the nearest 10 percent, chiefly for colour
 * coding in the UI.
 * 
 * @param chance The casting chance (0 to 1).
 * @returns The casting chance rounded to nearest 10 percent (0 to 100).
 */
export const chanceRounded = (chance: number): number => {
    return Math.floor(chance * 10) * 10;
}

/**
 * Gets the balance indicator for a spell. This is a simple symbol as per the
 * original game: ^ for lawful, * for chaotic, - for neutral.
 * 
 * @param spell The spell to get the balance indicator for.
 * @returns The balance indicator symbol.
 */
export const balance = (spell: Spell): string => {
    if (spell.balance > 0) {
        return "^".repeat(spell.balance);
    }
    else if (spell.balance < 0) {
        return "*".repeat(-spell.balance);
    }
    return "-";
}

/**
 * Gets a friendly description of the spell's balance effect. This is to help
 * explain the slightly obscure balance mechanic from the original game.
 * 
 * @param balance The spell's balance value.
 * @returns A friendly description of the balance effect.
 */
export const friendlyBalance = (balance: number): string => {
    // Determine the amount description based on balance value. A maximum of
    // "greatly" is used for balances of 4 or higher.
    const amount: string = [
        "slightly",
        "moderately",
        "highly",
        "greatly"
    ][Math.min(Math.abs(balance) - 1, 3)];
    if (balance > 0) {
        return `Increases lawfulness ${amount}`;
    }
    else if (balance < 0) {
        return `Increases chaos ${amount}`;
    }
    return "No effect on balance";
}