/**
 * Round-trip helper used in handleCommand tests to prove zero reliance
 * on non-wire-safe fields. Lives in a non-`.test.ts` file so the lint
 * rule against exporting from test files is satisfied.
 */
export function roundTrip<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}
