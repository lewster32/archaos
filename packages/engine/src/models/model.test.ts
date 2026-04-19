import { describe, it, expect } from "vitest";
import { Model } from "./model";

// Create a concrete implementation for testing
class TestModel extends Model {}

describe("Model", () => {
    it("should create a model with a valid positive integer ID", () => {
        const model = new TestModel(42);
        expect(model.id).toBe(42);
    });

    it("should create a model with ID of 0", () => {
        const model = new TestModel(0);
        expect(model.id).toBe(0);
    });

    it("should throw RangeError for negative ID", () => {
        expect(() => new TestModel(-1)).toThrow(RangeError);
        expect(() => new TestModel(-1)).toThrow("Model ID must be a non-negative integer.");
    });

    it("should throw RangeError for non-integer ID", () => {
        expect(() => new TestModel(3.14)).toThrow(RangeError);
        expect(() => new TestModel(3.14)).toThrow("Model ID must be a non-negative integer.");
    });

    it("should throw RangeError for NaN ID", () => {
        expect(() => new TestModel(Number.NaN)).toThrow(RangeError);
        expect(() => new TestModel(Number.NaN)).toThrow("Model ID must be a non-negative integer.");
    });

    it("should have a readonly id property", () => {
        const model = new TestModel(100);
        expect(() => {
            (model as any).id = 200;
        }).toThrow(TypeError);
    });
});
