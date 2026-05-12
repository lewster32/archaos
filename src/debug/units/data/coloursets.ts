import type { FrameBuffers } from "./types";

/**
 * Scans every non-transparent pixel across a unit's frame buffers and
 * returns the set of distinct RGB values packed as 24-bit integers
 * (`(r << 16) | (g << 8) | b`). Alpha is ignored: sprites are either
 * fully opaque or fully transparent.
 */
export function scanColoursFromBuffers(buffers: FrameBuffers): Set<number> {
    const out = new Set<number>();
    for (const buf of buffers.values()) {
        const arr = buf.data.data;
        for (let i = 0; i < arr.length; i += 4) {
            if (arr[i + 3] === 0) continue;
            out.add((arr[i] << 16) | (arr[i + 1] << 8) | arr[i + 2]);
        }
    }
    return out;
}

/**
 * Shallow equality check for two same-typed Sets. Used so the
 * units-editor only invalidates its global colour cache when a stroke
 * actually changes the colour set, not on every paint event.
 */
export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}

/**
 * Unpacks a 24-bit packed RGB integer back into an [r, g, b] tuple.
 */
export function unpackRgb(packed: number): [r: number, g: number, b: number] {
    return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}
