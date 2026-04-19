import { expect } from "vitest";

/**
 * Test-only helper — this module imports vitest and must not be imported
 * from production code.
 *
 * Assert that a value round-trips cleanly through
 * `JSON.parse(JSON.stringify(value))` — i.e. every field is JSON-safe
 * (no `undefined`, no `Map`, no `Set`, no functions, no class instances
 * that don't have a `toJSON` method).
 *
 * Returns the parsed clone typed as the input, which is useful for
 * asserting that the declared TypeScript type is also the runtime shape.
 *
 * Throws if the round-trip is lossy. The thrown error names the
 * offending key paths, and the final round-trip equality is verified
 * via Vitest's `expect`.
 *
 * @param value the value to test
 * @returns the parsed clone, typed as the input
 */
export function expectJsonSafe<T>(value: T): T {
    const unsafeKeys: string[] = [];
    const stringified: string = JSON.stringify(value, (key, val) => {
        if (val === undefined || typeof val === "function" || val instanceof Map || val instanceof Set) {
            unsafeKeys.push(key || "(root)");
        }
        return val;
    });
    if (unsafeKeys.length > 0) {
        throw new Error(`Non-JSON-safe values at keys: ${unsafeKeys.join(", ")}`);
    }
    const parsed: unknown = JSON.parse(stringified);
    expect(parsed).toEqual(value);
    return parsed as T;
}
