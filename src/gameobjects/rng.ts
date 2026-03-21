import { Math as PMath } from "phaser";

/**
 * Interface for a seedable pseudo-random number generator used by gameplay
 * logic. Visual/audio code should use `Math.random()` instead.
 */
export interface IRNG {
    /** Random float in [0, 1) */
    frac(): number;
    /** Pick a random element from an array (uniform) */
    pick<T>(array: T[]): T;
    /** Pick from an array with bias towards earlier elements */
    weightedPick<T>(array: T[]): T;
    /** Random integer in [min, max] inclusive */
    integerInRange(min: number, max: number): number;
    /** Random float in [min, max] */
    realInRange(min: number, max: number): number;
    /** Random integer in [min, max] inclusive (alias for integerInRange) */
    between(min: number, max: number): number;
    /** Seedable Fisher-Yates shuffle (mutates in-place and returns the array) */
    shuffle<T>(array: T[]): T[];
    /**
     * Pick a random element from an array with configurable bias strength and
     * direction. Positive weight favours later elements, negative favours
     * earlier. A weight of 0 picks uniformly. In exponential mode (default)
     * the bias is much stronger for the same weight value.
     */
    weightedRandomPick<T>(array: T[], weight: number, exponential?: boolean): T;
}

/**
 * Production PRNG backed by Phaser's RandomDataGenerator.
 * When a seed is provided a fresh generator is created; otherwise the global
 * `Phaser.Math.RND` instance is reused (preserving current behaviour).
 */
export class GameRNG implements IRNG {
    private readonly _rng: PMath.RandomDataGenerator;

    constructor(seed?: string) {
        this._rng = seed ? new PMath.RandomDataGenerator([seed]) : PMath.RND;
    }

    frac(): number {
        return this._rng.frac();
    }
    pick<T>(array: T[]): T {
        return this._rng.pick(array);
    }
    weightedPick<T>(array: T[]): T {
        return this._rng.weightedPick(array);
    }
    integerInRange(min: number, max: number): number {
        return this._rng.integerInRange(min, max);
    }
    realInRange(min: number, max: number): number {
        return this._rng.realInRange(min, max);
    }
    between(min: number, max: number): number {
        return this._rng.between(min, max);
    }
    shuffle<T>(array: T[]): T[] {
        return this._rng.shuffle(array);
    }
    weightedRandomPick<T>(
        array: T[],
        weight: number,
        exponential: boolean = true,
    ): T {
        return weightedRandomPick(this, array, weight, exponential);
    }
}

/**
 * Deterministic PRNG for unit tests. Returns predictable values so tests
 * don't need to stub `Phaser.Math.RND`.
 */
export class TestRNG implements IRNG {
    private _fracValue: number;

    constructor(fracValue: number = 0.5) {
        this._fracValue = fracValue;
    }

    /** Allow tests to override the value returned by `frac()`. */
    set fracValue(v: number) {
        this._fracValue = v;
    }

    frac(): number {
        return this._fracValue;
    }
    pick<T>(array: T[]): T {
        return array[0];
    }
    weightedPick<T>(array: T[]): T {
        return array[0];
    }
    integerInRange(min: number, _max: number): number {
        return min;
    }
    realInRange(min: number, _max: number): number {
        return min;
    }
    between(min: number, _max: number): number {
        return min;
    }
    shuffle<T>(array: T[]): T[] {
        return array;
    }
    weightedRandomPick<T>(
        array: T[],
        _weight: number,
        _exponential?: boolean,
    ): T {
        return array[0];
    }
}

/**
 * Pick a random element from an array, with a weight value to bias it
 * towards earlier or later elements. The weight value increases the
 * likelihood of picking later elements when positive, and earlier elements
 * when negative. The absolute value of the weight determines how strong the
 * bias is. A weight of 0 picks uniformly at random.
 *
 * In linear mode slot weights increase by equal steps from 1 to
 * 1+|weight|. In exponential mode (default) slot weights grow as
 * exp(i*|weight|/(n-1)), which produces a much stronger concentration at
 * the favoured end for the same weight value.
 *
 * @param rng         the PRNG instance to use
 * @param array       the array to pick from
 * @param weight      bias strength; positive -> later elements, negative -> earlier
 * @param exponential use exponential slot weights instead of linear (default true)
 */
export function weightedRandomPick<T>(
    rng: IRNG,
    array: T[],
    weight: number,
    exponential: boolean = true,
): T {
    if (array.length === 0) {
        throw new Error("Cannot pick from an empty array");
    }
    if (array.length === 1 || weight === 0) {
        return rng.pick(array);
    }
    const n = array.length;
    const absW = Math.abs(weight);
    const slotWeights: number[] = Array.from({ length: n });
    let totalWeight = 0;
    for (let i = 0; i < n; i++) {
        slotWeights[i] = exponential
            ? Math.exp((i * absW) / (n - 1))
            : 1 + (i * absW) / (n - 1);
        totalWeight += slotWeights[i];
    }
    const randomWeight: number = rng.frac() * totalWeight;
    let cumulativeWeight = 0;
    for (let i = 0; i < n; i++) {
        cumulativeWeight += slotWeights[i];
        if (randomWeight < cumulativeWeight) {
            return weight >= 0 ? array[i] : array[n - 1 - i];
        }
    }
    return weight >= 0 ? array.at(-1) : array[0];
}
