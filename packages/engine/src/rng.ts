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
 * Pure TypeScript seedable PRNG. Uses Mulberry32 — a fast
 * 32-bit PRNG with good distribution. Replaces Phaser's
 * RandomDataGenerator so the engine has no Phaser dependency.
 */
export class GameRNG implements IRNG {
    private _state: number;

    constructor(seed?: string) {
        this._state = seed ? GameRNG._hashSeed(seed) : Date.now();
    }

    private static _hashSeed(seed: string): number {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
        }
        return hash >>> 0 || 1;
    }

    private _next(): number {
        // Mulberry32
        this._state += 0x6d2b79f5;
        let t = this._state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    frac(): number {
        return this._next();
    }

    pick<T>(array: T[]): T {
        return array[Math.floor(this._next() * array.length)];
    }

    weightedPick<T>(array: T[]): T {
        return array[Math.floor(Math.pow(this._next(), 2) * array.length)];
    }

    integerInRange(min: number, max: number): number {
        return Math.floor(this._next() * (max - min + 1) + min);
    }

    realInRange(min: number, max: number): number {
        return this._next() * (max - min) + min;
    }

    between(min: number, max: number): number {
        return this.integerInRange(min, max);
    }

    shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this._next() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
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
    private _betweenValue: number | null = null;

    constructor(fracValue: number = 0.5) {
        this._fracValue = fracValue;
    }

    /** Allow tests to override the value returned by `frac()`. */
    set fracValue(v: number) {
        this._fracValue = v;
    }

    /** Allow tests to override the value returned by `between()`. */
    set betweenValue(v: number) {
        this._betweenValue = v;
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
        return this._betweenValue ?? min;
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
