import { describe, it, expect } from "vitest";
import { GameRNG, TestRNG, weightedRandomPick } from "./rng";

describe("TestRNG", () => {
    it("frac returns the configured value", () => {
        const rng = new TestRNG(0.75);
        expect(rng.frac()).toBe(0.75);
    });

    it("pick returns the first element", () => {
        const rng = new TestRNG();
        expect(rng.pick([10, 20, 30])).toBe(10);
    });

    it("weightedPick returns the first element", () => {
        const rng = new TestRNG();
        expect(rng.weightedPick([10, 20, 30])).toBe(10);
    });

    it("integerInRange returns min", () => {
        const rng = new TestRNG();
        expect(rng.integerInRange(3, 7)).toBe(3);
    });

    it("realInRange returns min", () => {
        const rng = new TestRNG();
        expect(rng.realInRange(1.5, 3.5)).toBe(1.5);
    });

    it("between returns min", () => {
        const rng = new TestRNG();
        expect(rng.between(5, 10)).toBe(5);
    });

    it("shuffle returns array unchanged", () => {
        const rng = new TestRNG();
        const arr = [1, 2, 3];
        expect(rng.shuffle(arr)).toBe(arr);
    });

    it("weightedRandomPick returns first element", () => {
        const rng = new TestRNG();
        expect(rng.weightedRandomPick([1, 2, 3], 1)).toBe(1);
    });

    it("fracValue setter changes frac output", () => {
        const rng = new TestRNG(0.5);
        expect(rng.frac()).toBe(0.5);
        rng.fracValue = 0.9;
        expect(rng.frac()).toBe(0.9);
    });
});

describe("weightedRandomPick", () => {
    it("throws on empty array", () => {
        const rng = new TestRNG();
        expect(() => weightedRandomPick(rng, [], 1)).toThrow(
            "Cannot pick from an empty array",
        );
    });

    it("returns single element for length-1 array", () => {
        const rng = new TestRNG();
        expect(weightedRandomPick(rng, [42], 5)).toBe(42);
    });

    it("returns via pick when weight is 0", () => {
        const rng = new TestRNG();
        expect(weightedRandomPick(rng, [1, 2, 3], 0)).toBe(1);
    });
});

describe("GameRNG", () => {
    it("produces deterministic output from the same seed", () => {
        const a = new GameRNG("test-seed");
        const b = new GameRNG("test-seed");
        expect(a.frac()).toBe(b.frac());
        expect(a.frac()).toBe(b.frac());
    });

    it("frac returns values in [0, 1)", () => {
        const rng = new GameRNG("seed");
        for (let i = 0; i < 100; i++) {
            const v = rng.frac();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it("integerInRange stays within bounds", () => {
        const rng = new GameRNG("bounds");
        for (let i = 0; i < 100; i++) {
            const v = rng.integerInRange(3, 7);
            expect(v).toBeGreaterThanOrEqual(3);
            expect(v).toBeLessThanOrEqual(7);
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    it("pick returns an element from the array", () => {
        const rng = new GameRNG("pick-test");
        const arr = [10, 20, 30];
        for (let i = 0; i < 20; i++) {
            expect(arr).toContain(rng.pick(arr));
        }
    });

    it("shuffle returns the same array reference", () => {
        const rng = new GameRNG("shuffle");
        const arr = [1, 2, 3, 4, 5];
        expect(rng.shuffle(arr)).toBe(arr);
    });

    it("realInRange stays within bounds", () => {
        const rng = new GameRNG("real");
        for (let i = 0; i < 100; i++) {
            const v = rng.realInRange(2.0, 5.0);
            expect(v).toBeGreaterThanOrEqual(2.0);
            expect(v).toBeLessThan(5.0);
        }
    });

    it("between is an alias for integerInRange", () => {
        const a = new GameRNG("alias");
        const b = new GameRNG("alias");
        expect(a.between(1, 10)).toBe(b.integerInRange(1, 10));
    });

    it("weightedPick returns an element from the array", () => {
        const rng = new GameRNG("wp");
        const arr = ["a", "b", "c"];
        for (let i = 0; i < 20; i++) {
            expect(arr).toContain(rng.weightedPick(arr));
        }
    });

    it("weightedRandomPick delegates correctly", () => {
        const rng = new GameRNG("wrp");
        const arr = [1, 2, 3, 4, 5];
        for (let i = 0; i < 20; i++) {
            expect(arr).toContain(rng.weightedRandomPick(arr, 2));
        }
    });
});
