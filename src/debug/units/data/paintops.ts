import type { Rgba } from "./types";

/**
 * Reads the RGBA tuple at (x, y). Returns [0,0,0,0] for out-of-bounds
 * coordinates so callers do not need to bounds-check.
 */
export function readPixel(data: ImageData, x: number, y: number): Rgba {
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) {
        return [0, 0, 0, 0] as const;
    }
    const i = (y * data.width + x) * 4;
    const a = data.data;
    return [a[i], a[i + 1], a[i + 2], a[i + 3]] as const;
}

/**
 * Writes the RGBA tuple at (x, y). Out-of-bounds coords are a no-op.
 */
export function drawPixel(
    data: ImageData,
    x: number,
    y: number,
    rgba: Rgba,
): void {
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return;
    const i = (y * data.width + x) * 4;
    const a = data.data;
    a[i] = rgba[0];
    a[i + 1] = rgba[1];
    a[i + 2] = rgba[2];
    a[i + 3] = rgba[3];
}

function rgbaEqual(a: Rgba, b: Rgba): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/**
 * Bresenham line algorithm. Writes `rgba` to every pixel on the line
 * from (x0, y0) to (x1, y1) inclusive. Used to bridge pointer-sample
 * gaps on fast drags.
 */
export function bresenhamLine(
    data: ImageData,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    rgba: Rgba,
): void {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
        drawPixel(data, x, y, rgba);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
}

/**
 * 4-connected flood fill from (x, y). Replaces every pixel reachable
 * via N/S/E/W steps that shares the seed pixel's exact RGBA value with
 * `rgba`. No-op when the seed pixel already matches `rgba`, or when
 * the start coords are out of bounds.
 */
export function floodFill(
    data: ImageData,
    x: number,
    y: number,
    rgba: Rgba,
): void {
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return;
    const target = readPixel(data, x, y);
    if (rgbaEqual(target, rgba)) return;
    const stack: Array<[number, number]> = [[x, y]];
    while (stack.length) {
        const next = stack.pop();
        if (!next) continue;
        const [cx, cy] = next;
        if (cx < 0 || cy < 0 || cx >= data.width || cy >= data.height) continue;
        if (!rgbaEqual(readPixel(data, cx, cy), target)) continue;
        drawPixel(data, cx, cy, rgba);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
}

/**
 * Returns a horizontally-flipped copy. Source is not modified.
 */
export function mirrorHorizontal(data: ImageData): ImageData {
    const w = data.width;
    const h = data.height;
    const out = new ImageData(w, h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const src = (y * w + (w - 1 - x)) * 4;
            const dst = (y * w + x) * 4;
            out.data[dst] = data.data[src];
            out.data[dst + 1] = data.data[src + 1];
            out.data[dst + 2] = data.data[src + 2];
            out.data[dst + 3] = data.data[src + 3];
        }
    }
    return out;
}

/**
 * Returns a copy of `data` shifted by (dx, dy) pixels. Pixels that
 * fall outside the buffer after the shift are dropped; vacated pixels
 * are fully transparent. Source is not modified.
 */
export function shiftImageData(
    data: ImageData,
    dx: number,
    dy: number,
): ImageData {
    const w = data.width;
    const h = data.height;
    const out = new ImageData(w, h);
    for (let y = 0; y < h; y++) {
        const sy = y - dy;
        if (sy < 0 || sy >= h) continue;
        for (let x = 0; x < w; x++) {
            const sx = x - dx;
            if (sx < 0 || sx >= w) continue;
            const src = (sy * w + sx) * 4;
            const dst = (y * w + x) * 4;
            out.data[dst] = data.data[src];
            out.data[dst + 1] = data.data[src + 1];
            out.data[dst + 2] = data.data[src + 2];
            out.data[dst + 3] = data.data[src + 3];
        }
    }
    return out;
}

/**
 * Produces an independent copy. Mutations on the returned buffer do
 * not affect the original (and vice versa).
 */
export function cloneImageData(data: ImageData): ImageData {
    const copy = new ImageData(data.width, data.height);
    copy.data.set(data.data);
    return copy;
}

/**
 * Returns a copy of `data` with a 1-pixel solid-black opaque outline
 * dilated around every opaque pixel (8-way neighbourhood). Outline
 * pixels are written only into fully transparent cells; existing
 * non-transparent pixels are preserved. Mirrors the importer's
 * outline pass so the editor can re-apply it after touch-ups.
 */
export function addBlackOutline(data: ImageData): ImageData {
    const w = data.width;
    const h = data.height;
    const out = cloneImageData(data);
    const src = data.data;
    const dst = out.data;
    const isOpaque = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= w || y >= h) return false;
        return src[(y * w + x) * 4 + 3] !== 0;
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            if (src[idx + 3] !== 0) continue;
            let touch = false;
            for (let dy = -1; dy <= 1 && !touch; dy++) {
                for (let dx = -1; dx <= 1 && !touch; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    if (isOpaque(x + dx, y + dy)) touch = true;
                }
            }
            if (touch) {
                dst[idx] = 0;
                dst[idx + 1] = 0;
                dst[idx + 2] = 0;
                dst[idx + 3] = 255;
            }
        }
    }
    return out;
}
