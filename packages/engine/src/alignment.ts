/**
 * Alignment tracks the universe's current balance and applies spell alignment
 * bias to casting chances.
 */
export class Alignment {
    /**
     * The universe's current balance.
     */
    private _value: number = 0;

    /**
     * The total accumulated bias for this turn. This is used to show the offset
     * in the UK.
     *
     */
    private _valueAccumulated: number = 0;

    /**
     * Whether to use the original game's asymmetric adjustment or the manual's
     * symmetric one.
     */
    private readonly _original: boolean;

    /**
     * Create a new Alignment instance.
     *
     * @param original Whether to use the original game's asymmetric adjustment or the manual's symmetric one.
     */
    constructor(original: boolean) {
        this._original = original;
    }

    /**
     * Adjust a spell's casting chance based on the universe's current balance and
     * the spell's bias.
     *
     * @param baseChance The base chance of the spell casting successfully (0..1).
     * @param bias The spell's alignment bias (-4..+4).
     * @returns The adjusted casting chance (0..1).
     */
    public adjustChance(baseChance: number, bias: number): number {
        return this._original ? this.adjustChanceOriginal(baseChance, bias) : this.adjustChanceFixed(baseChance, bias);
    }

    /**
     * Reset the accumulated bias for this turn. This should be called at the end
     * of each turn to prepare for the next turn's calculations.
     */
    public resetAccumulated(): void {
        this._valueAccumulated = 0;
    }

    /**
     * Reset the universe's balance to neutral. This should be called at the start
     * of the game.
     */
    public reset(): void {
        this._value = 0;
        this._valueAccumulated = 0;
    }

    // Apply a spell's signed bias to the world's balance (on a successful cast).
    // Bias values in the original spell table are in {-4, -2, -1, 0, 1, 2, 4}.
    public shift(bias: number): void {
        if (bias === 0) {
            return;
        }
        if (bias < -4 || bias > 4 || !Number.isInteger(bias)) {
            throw new RangeError(`bias must be an integer in -4..+4, got ${bias}`);
        }
        this._value += bias;
        this._valueAccumulated += bias;
    }

    // Return the spell's casting chance (0..1) after alignment adjustment.
    // Bonus is asymmetric: same-sign world/spell alignments boost the chance;
    // opposing or neutral alignments leave it unchanged - matching the ROM's behaviour
    // which contradicts the manual's claim of a two-way effect.
    private adjustChanceOriginal(baseChance: number, bias: number): number {
        let chance = baseChance;
        if (this._value !== 0 && bias !== 0 && Math.sign(this._value) === Math.sign(bias)) {
            chance += (Math.abs(this._value) >> 2) / 10;
        }
        return Math.max(0, Math.min(1, chance));
    }

    // Return the spell's casting chance (0..1) with the symmetric adjustment the
    // manual describes: same-sign world/spell alignments get the same bonus as
    // adjustChance, but opposing-sign alignments get an equal penalty. Neutral
    // spells and a neutral world still have no effect on each other.
    private adjustChanceFixed(baseChance: number, bias: number): number {
        let chance = baseChance;
        if (this._value !== 0 && bias !== 0) {
            const delta = (Math.abs(this._value) >> 2) / 10;
            chance += Math.sign(this._value) === Math.sign(bias) ? delta : -delta;
        }
        return Math.max(0, Math.min(1, chance));
    }

    /**
     * Get the current universe balance.
     *
     * @returns The current universe balance, where negative values indicate a bias towards chaos and positive values indicate a bias towards law.
     */
    public get value(): number {
        return this._value;
    }

    /**
     * Get the total accumulated bias for this turn.
     *
     * @returns The total accumulated bias for this turn, which is the sum of the biases of all successfully cast spells this turn.
     */
    public get valueAccumulated(): number {
        return this._valueAccumulated;
    }
}
