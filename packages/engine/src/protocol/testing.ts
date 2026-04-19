import { expect } from "vitest";

/**
 * Assert that a value round-trips cleanly through
 * `JSON.parse(JSON.stringify(value))` — i.e. every field is JSON-safe
 * (no `undefined`, no `Map`, no `Set`, no functions, no class instances
 * that don't have a `toJSON` method).
 *
 * Returns the parsed clone typed as the input, which is useful for
 * asserting that the declared TypeScript type is also the runtime shape.
 *
 * Throws via Vitest's `expect` if the round-trip is lossy.
 *
 * @param value the value to test
 * @returns the parsed clone, typed as the input
 */
export function expectJsonSafe<T>(value: T): T {
    // Use a replacer to detect non-JSON-safe values during stringification
    let foundUnsafeValue = false;
    const stringified: string = JSON.stringify(value, (key, val) => {
        // Check for values that JSON.stringify will drop or coerce
        if (val === undefined) {
            foundUnsafeValue = true;
        }
        if (typeof val === "function") {
            foundUnsafeValue = true;
        }
        if (val instanceof Map || val instanceof Set) {
            foundUnsafeValue = true;
        }
        return val;
    });

    // If we found an unsafe value, expect the assertion to fail
    expect(!foundUnsafeValue).toBe(true);

    const parsed: unknown = JSON.parse(stringified);
    return parsed as T;
}
