import { describe, expect, test } from "vitest";
import { expectJsonSafe } from "./testing";

describe("expectJsonSafe", () => {
    test("round-trips a plain JSON object", () => {
        const input = { a: 1, b: "s", c: [true, null] };
        const parsed = expectJsonSafe(input);
        expect(parsed).toEqual(input);
    });

    test("round-trips a nested object", () => {
        const input = {
            outer: { inner: { value: 42, list: [1, 2, 3] } },
        };
        expectJsonSafe(input);
    });

    test("returns a parsed clone, not the original reference", () => {
        const input = { a: 1 };
        const parsed = expectJsonSafe(input);
        expect(parsed).not.toBe(input);
        expect(parsed).toEqual(input);
    });

    test("preserves the input's TypeScript type on return", () => {
        interface Shape {
            kind: "x";
            n: number;
        }
        const input: Shape = { kind: "x", n: 5 };
        const parsed: Shape = expectJsonSafe(input);
        expect(parsed.kind).toBe("x");
        expect(parsed.n).toBe(5);
    });

    test("fails when the value contains undefined properties", () => {
        const input = { a: 1, b: undefined as unknown as number };
        expect(() => expectJsonSafe(input)).toThrow();
    });

    test("fails when the value contains a Map", () => {
        const input = { m: new Map([["k", "v"]]) } as unknown;
        expect(() => expectJsonSafe(input)).toThrow();
    });

    test("fails when the value contains a Set", () => {
        const input = { s: new Set(["a", "b"]) } as unknown;
        expect(() => expectJsonSafe(input)).toThrow();
    });

    test("fails when the value contains a function", () => {
        const input = { fn: () => 42 } as unknown;
        expect(() => expectJsonSafe(input)).toThrow();
    });
});
