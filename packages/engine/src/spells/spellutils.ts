/**
 * Mainly UI-related spell utility functions.
 */

/**
 * Converts a normalised casting chance into a percentage.
 *
 * @param chance The casting chance (0 to 1).
 * @returns The casting chance as a percentage.
 */
export const chancePercent = (chance: number): number => {
    return Math.round(chance * 100);
};

/**
 * Rounds the casting chance to the nearest 10 percent, chiefly for colour
 * coding in the UI.
 *
 * @param chance The casting chance (0 to 1).
 * @returns The casting chance rounded to nearest 10 percent (0 to 100).
 */
export const chanceRounded = (chance: number): number => {
    return Math.floor(chance * 10) * 10;
};

/**
 * Returns a simple symbol as per the original game: ^ for lawful, * for
 * chaotic, - for neutral. The number of symbols indicates the strength of the
 * balance effect, up to a maximum of 4.
 *
 * @param balance The balance value of the spell.
 * @returns The balance indicator symbol.
 */
export const balanceIndicator = (balance: number): string => {
    if (balance > 0) {
        return "^".repeat(Math.min(balance, 4));
    } else if (balance < 0) {
        return "*".repeat(Math.min(Math.abs(balance), 4));
    }
    return "-";
};

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
    const amount: string = ["slightly", "moderately", "highly", "greatly"][
        Math.min(Math.abs(balance) - 1, 3)
    ];
    if (balance > 0) {
        return `Increases lawfulness ${amount}`;
    } else if (balance < 0) {
        return `Increases chaos ${amount}`;
    }
    return "No effect on balance";
};
