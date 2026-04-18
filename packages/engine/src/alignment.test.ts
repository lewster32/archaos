import { describe, it, expect } from "vitest";
import { Alignment } from "./alignment";

describe("Alignment", () => {
    describe("construction", () => {
        it("starts at value 0 and valueAccumulated 0", () => {
            const a = new Alignment(false);
            expect(a.value).toBe(0);
            expect(a.valueAccumulated).toBe(0);
        });

        it("accepts the original flag (true)", () => {
            const a = new Alignment(true);
            expect(a.value).toBe(0);
            expect(a.valueAccumulated).toBe(0);
        });
    });

    describe("shift", () => {
        it("is a no-op when bias is 0", () => {
            const a = new Alignment(false);
            a.shift(0);
            expect(a.value).toBe(0);
            expect(a.valueAccumulated).toBe(0);
        });

        it("increments value and valueAccumulated by bias", () => {
            const a = new Alignment(false);
            a.shift(2);
            expect(a.value).toBe(2);
            expect(a.valueAccumulated).toBe(2);
        });

        it("supports negative biases", () => {
            const a = new Alignment(false);
            a.shift(-3);
            expect(a.value).toBe(-3);
            expect(a.valueAccumulated).toBe(-3);
        });

        it("accumulates across multiple shifts", () => {
            const a = new Alignment(false);
            a.shift(4);
            a.shift(-1);
            a.shift(2);
            expect(a.value).toBe(5);
            expect(a.valueAccumulated).toBe(5);
        });

        it("accepts the boundary values -4 and +4", () => {
            const a = new Alignment(false);
            a.shift(-4);
            a.shift(4);
            expect(a.value).toBe(0);
            expect(a.valueAccumulated).toBe(0);
        });

        it("throws for a bias below -4", () => {
            const a = new Alignment(false);
            expect(() => a.shift(-5)).toThrow(RangeError);
            expect(() => a.shift(-5)).toThrow(/-5/);
        });

        it("throws for a bias above +4", () => {
            const a = new Alignment(false);
            expect(() => a.shift(5)).toThrow(RangeError);
            expect(() => a.shift(5)).toThrow(/5/);
        });

        it("throws for a non-integer bias", () => {
            const a = new Alignment(false);
            expect(() => a.shift(1.5)).toThrow(RangeError);
        });
    });

    describe("reset", () => {
        it("zeroes both value and valueAccumulated", () => {
            const a = new Alignment(false);
            a.shift(3);
            a.reset();
            expect(a.value).toBe(0);
            expect(a.valueAccumulated).toBe(0);
        });
    });

    describe("resetAccumulated", () => {
        it("zeroes valueAccumulated but leaves value untouched", () => {
            const a = new Alignment(false);
            a.shift(3);
            a.resetAccumulated();
            expect(a.value).toBe(3);
            expect(a.valueAccumulated).toBe(0);
        });
    });

    describe("adjustChance — original mode", () => {
        it("returns the base chance when value is 0", () => {
            const a = new Alignment(true);
            expect(a.adjustChance(0.5, 2)).toBe(0.5);
        });

        it("returns the base chance when bias is 0", () => {
            const a = new Alignment(true);
            a.shift(4);
            expect(a.adjustChance(0.5, 0)).toBe(0.5);
        });

        it("boosts chance when value and bias share the same sign (lawful)", () => {
            const a = new Alignment(true);
            // value 8 = one 10% tier toward law (tiers quantised by floor(|v|/4)/10)
            a.shift(4);
            a.shift(4);
            expect(a.adjustChance(0.5, 2)).toBeCloseTo(0.7);
        });

        it("boosts chance when value and bias share the same sign (chaotic)", () => {
            const a = new Alignment(true);
            a.shift(-4);
            a.shift(-4);
            expect(a.adjustChance(0.5, -2)).toBeCloseTo(0.7);
        });

        it("does not penalise when signs differ (original mode suppresses penalty)", () => {
            const a = new Alignment(true);
            a.shift(4);
            a.shift(4);
            expect(a.adjustChance(0.5, -2)).toBe(0.5);
        });

        it("clamps the result to a maximum of 1", () => {
            const a = new Alignment(true);
            // value 40 → floor(40/4)/10 = 1.0 bonus
            (a as any)._value = 40;
            expect(a.adjustChance(0.8, 2)).toBe(1);
        });

        it("clamps the result to a minimum of 0", () => {
            // In original mode, adjustChance can never go below base — but the
            // clamp still exists, so exercise it by seeding a negative base.
            const a = new Alignment(true);
            a.shift(4);
            expect(a.adjustChance(-0.5, 2)).toBe(0);
        });
    });

    describe("adjustChance — fixed mode", () => {
        it("returns the base chance when value is 0", () => {
            const a = new Alignment(false);
            expect(a.adjustChance(0.5, 2)).toBe(0.5);
        });

        it("returns the base chance when bias is 0", () => {
            const a = new Alignment(false);
            a.shift(4);
            expect(a.adjustChance(0.5, 0)).toBe(0.5);
        });

        it("boosts chance when value and bias share the same sign", () => {
            const a = new Alignment(false);
            a.shift(4);
            a.shift(4);
            expect(a.adjustChance(0.5, 2)).toBeCloseTo(0.7);
        });

        it("penalises chance when value and bias have opposite signs", () => {
            const a = new Alignment(false);
            a.shift(4);
            a.shift(4);
            expect(a.adjustChance(0.5, -2)).toBeCloseTo(0.3);
        });

        it("clamps the result to a maximum of 1", () => {
            const a = new Alignment(false);
            (a as any)._value = 40;
            expect(a.adjustChance(0.8, 2)).toBe(1);
        });

        it("clamps the result to a minimum of 0", () => {
            const a = new Alignment(false);
            (a as any)._value = 40;
            expect(a.adjustChance(0.5, -2)).toBe(0);
        });
    });
});
