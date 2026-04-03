import { describe, it, expect } from "vitest";
import { weightedRandomPick, TestRNG } from "@archaos/engine";

/**
 * A TestRNG variant that delegates frac() to Math.random() for statistical
 * tests, and pick() to a uniform random selection.
 */
class StatisticalRNG extends TestRNG {
    frac(): number {
        return Math.random();
    }
    pick<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)];
    }
}

describe("weightedRandomPick", () => {
    const rng = new StatisticalRNG();

    it("throws on an empty array", () => {
        expect(() => weightedRandomPick(rng, [], 1)).toThrow(
            "Cannot pick from an empty array",
        );
    });

    it("always returns the only element for a single-element array", () => {
        expect(weightedRandomPick(rng, ["only"], 2)).toBe("only");
        expect(weightedRandomPick(rng, ["only"], -2)).toBe("only");
    });

    it("returns a value from the array", () => {
        const array = ["a", "b", "c", "d"];
        for (let i = 0; i < 100; i++) {
            expect(array).toContain(weightedRandomPick(rng, array, 1));
            expect(array).toContain(weightedRandomPick(rng, array, -1));
            expect(array).toContain(weightedRandomPick(rng, array, 0));
        }
    });

    /**
     * Statistical helper: run N trials and return the frequency of each index.
     * Also returns the mean index selected across all trials.
     */
    function sample(
        array: number[],
        weight: number,
        N: number,
        exponential = false,
    ): { counts: number[]; mean: number } {
        const counts = Array.from({ length: array.length }, () => 0);
        let total = 0;
        for (let i = 0; i < N; i++) {
            const result = weightedRandomPick(rng, array, weight, exponential);
            counts[result]++;
            total += result;
        }
        return { counts, mean: total / N };
    }

    // We use a 4-element array [0,1,2,3] so the result is its own index.
    // With weight=0 the mean should be ~1.5 (uniform).
    // With positive weight the mean should be significantly above 1.5.
    // With negative weight the mean should be significantly below 1.5.
    //
    // Theoretical probabilities with the corrected formula (n*(2+|w|)/2 total weight):
    //   array [0,1,2,3], weight=2:
    //     w_i = 1 + i*2/3 → [1, 5/3, 7/3, 3], total = 8
    //     P = [1/8, 5/24, 7/24, 3/8] ≈ [0.125, 0.208, 0.292, 0.375]
    //     mean = 0*0.125 + 1*(5/24) + 2*(7/24) + 3*0.375 ≈ 1.917
    //   For weight=-2 the probabilities are reversed, mean ≈ 1.083

    const N = 20_000;
    const indices = [0, 1, 2, 3];
    const TOLERANCE = 0.05; // ±5% of N

    it("with weight=0, picks uniformly (mean ≈ 1.5)", () => {
        const { mean } = sample(indices, 0, N);
        expect(mean).toBeGreaterThan(1.2);
        expect(mean).toBeLessThan(1.8);
    });

    it("with positive weight, biases towards later elements (mean > 1.5)", () => {
        const { mean } = sample(indices, 2, N);
        expect(mean).toBeGreaterThan(1.7); // theoretical ≈ 1.917
    });

    it("with negative weight, biases towards earlier elements (mean < 1.5)", () => {
        const { mean } = sample(indices, -2, N);
        expect(mean).toBeLessThan(1.3); // theoretical ≈ 1.083
    });

    it("positive and negative weights of the same magnitude produce mirrored means", () => {
        const pos = sample(indices, 2, N);
        const neg = sample(indices, -2, N);
        // The two means should sum to ~3 (the max index), symmetric around 1.5.
        expect(Math.abs(pos.mean + neg.mean - 3)).toBeLessThan(0.3);
    });

    it("higher weight magnitude produces a more extreme mean", () => {
        const low = sample(indices, 1, N);
        const high = sample(indices, 3, N);
        expect(high.mean).toBeGreaterThan(low.mean);
    });

    it("matches expected probabilities for weight=2 within tolerance", () => {
        // P(0)=0.125, P(1)≈0.208, P(2)≈0.292, P(3)=0.375
        const expected = [0.125, 5 / 24, 7 / 24, 0.375];
        const { counts } = sample(indices, 2, N);
        for (let i = 0; i < indices.length; i++) {
            const observed = counts[i] / N;
            expect(Math.abs(observed - expected[i])).toBeLessThan(TOLERANCE);
        }
    });

    it("matches expected probabilities for weight=-2 within tolerance (mirrored)", () => {
        // Negative weight reverses direction: P(3)=0.125, P(0)=0.375
        const expected = [0.375, 7 / 24, 5 / 24, 0.125];
        const { counts } = sample(indices, -2, N);
        for (let i = 0; i < indices.length; i++) {
            const observed = counts[i] / N;
            expect(Math.abs(observed - expected[i])).toBeLessThan(TOLERANCE);
        }
    });

    it("all elements are reachable with positive weight", () => {
        const { counts } = sample(indices, 3, N);
        for (const count of counts) {
            expect(count).toBeGreaterThan(0);
        }
    });

    it("all elements are reachable with negative weight", () => {
        const { counts } = sample(indices, -3, N);
        for (const count of counts) {
            expect(count).toBeGreaterThan(0);
        }
    });

    describe("exponential mode", () => {
        // Theoretical probabilities for n=4, weight=+2, exponential=true:
        //   slot weights: exp(0), exp(2/3), exp(4/3), exp(2) ≈ [1, 1.948, 3.794, 7.389]
        //   total ≈ 14.131
        //   P ≈ [0.0708, 0.1378, 0.2685, 0.5230]
        //   mean ≈ 2.244  (vs linear mean ≈ 1.917 for the same weight)

        it("exponential=false matches the default behaviour", () => {
            const lin = sample(indices, 2, N, false);
            const def = sample(indices, 2, N);
            // Both should produce a similar mean — within noise of each other
            expect(Math.abs(lin.mean - def.mean)).toBeLessThan(0.15);
        });

        it("exponential mode biases more strongly than linear for positive weight", () => {
            const lin = sample(indices, 2, N, false);
            const log = sample(indices, 2, N, true);
            // Log mean ≈ 2.24, linear mean ≈ 1.92 — log should be clearly higher
            expect(log.mean).toBeGreaterThan(lin.mean + 0.1);
        });

        it("exponential mode biases more strongly than linear for negative weight", () => {
            const lin = sample(indices, -2, N, false);
            const log = sample(indices, -2, N, true);
            // Log mean ≈ 0.76, linear mean ≈ 1.08 — log should be clearly lower
            expect(log.mean).toBeLessThan(lin.mean - 0.1);
        });

        it("exponential positive and negative weights are mirrored", () => {
            const pos = sample(indices, 2, N, true);
            const neg = sample(indices, -2, N, true);
            expect(Math.abs(pos.mean + neg.mean - 3)).toBeLessThan(0.3);
        });

        it("matches expected probabilities for exponential weight=+2", () => {
            const total =
                Math.exp(0) + Math.exp(2 / 3) + Math.exp(4 / 3) + Math.exp(2);
            const expected = [
                Math.exp(0) / total,
                Math.exp(2 / 3) / total,
                Math.exp(4 / 3) / total,
                Math.exp(2) / total,
            ];
            const { counts } = sample(indices, 2, N, true);
            for (let i = 0; i < indices.length; i++) {
                expect(Math.abs(counts[i] / N - expected[i])).toBeLessThan(
                    TOLERANCE,
                );
            }
        });

        it("all elements are reachable in exponential mode", () => {
            const { counts } = sample(indices, 3, N, true);
            for (const count of counts) {
                expect(count).toBeGreaterThan(0);
            }
        });

        it("single-element array returns the only element in exponential mode", () => {
            expect(weightedRandomPick(rng, ["only"], 2, true)).toBe("only");
            expect(weightedRandomPick(rng, ["only"], -2, true)).toBe("only");
        });
    });
});
