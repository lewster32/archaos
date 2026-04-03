import { describe, it, expect } from "vitest";
import { Point } from "./point";

describe("Point", () => {
    it("creates a point with x and y", () => {
        const p = new Point(3, 5);
        expect(p.x).toBe(3);
        expect(p.y).toBe(5);
    });

    it("setTo updates coordinates", () => {
        const p = new Point(0, 0);
        p.setTo(4, 7);
        expect(p.x).toBe(4);
        expect(p.y).toBe(7);
    });

    it("equals compares by value", () => {
        expect(Point.equals(new Point(1, 2), new Point(1, 2)))
            .toBe(true);
        expect(Point.equals(new Point(1, 2), new Point(3, 4)))
            .toBe(false);
    });
});
