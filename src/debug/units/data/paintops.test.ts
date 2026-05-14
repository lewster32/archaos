import { describe, expect, it } from "vitest";
import { bresenhamLine, cloneImageData, drawPixel, floodFill, mirrorHorizontal, readPixel } from "./paintops";
import type { Rgba } from "./types";

const RED: Rgba = [255, 0, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const TRANSPARENT: Rgba = [0, 0, 0, 0];

function makeData(w = 4, h = 4): ImageData {
    return new ImageData(w, h);
}

describe("drawPixel", () => {
    it("writes RGBA at the right offset", () => {
        const data = makeData();
        drawPixel(data, 2, 1, RED);
        expect(readPixel(data, 2, 1)).toEqual(RED);
    });

    it("is a no-op for out-of-bounds coordinates", () => {
        const data = makeData();
        drawPixel(data, -1, 0, RED);
        drawPixel(data, 4, 0, RED);
        drawPixel(data, 0, 4, RED);
        expect(readPixel(data, 0, 0)).toEqual(TRANSPARENT);
    });

    it("writes a transparent pixel (eraser case)", () => {
        const data = makeData();
        drawPixel(data, 1, 1, RED);
        drawPixel(data, 1, 1, TRANSPARENT);
        expect(readPixel(data, 1, 1)).toEqual(TRANSPARENT);
    });
});

describe("readPixel", () => {
    it("returns the RGBA at the given coords", () => {
        const data = makeData();
        drawPixel(data, 3, 2, BLUE);
        expect(readPixel(data, 3, 2)).toEqual(BLUE);
    });
});

describe("bresenhamLine", () => {
    it("draws a single point when start equals end", () => {
        const data = makeData();
        bresenhamLine(data, 1, 1, 1, 1, RED);
        expect(readPixel(data, 1, 1)).toEqual(RED);
    });

    it("covers a horizontal run", () => {
        const data = makeData();
        bresenhamLine(data, 0, 0, 3, 0, RED);
        for (let x = 0; x < 4; x++) expect(readPixel(data, x, 0)).toEqual(RED);
        expect(readPixel(data, 0, 1)).toEqual(TRANSPARENT);
    });

    it("covers a diagonal run without gaps", () => {
        const data = makeData();
        bresenhamLine(data, 0, 0, 3, 3, RED);
        for (let i = 0; i < 4; i++) expect(readPixel(data, i, i)).toEqual(RED);
    });

    it("works for reverse-direction lines", () => {
        const data = makeData();
        bresenhamLine(data, 3, 0, 0, 0, BLUE);
        for (let x = 0; x < 4; x++) expect(readPixel(data, x, 0)).toEqual(BLUE);
    });
});

describe("floodFill", () => {
    it("fills a single connected region of identical RGBA", () => {
        const data = makeData();
        floodFill(data, 0, 0, RED);
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) expect(readPixel(data, x, y)).toEqual(RED);
        }
    });

    it("respects 4-connectivity - diagonal neighbours are separate regions", () => {
        const data = makeData(3, 3);
        drawPixel(data, 0, 0, RED);
        drawPixel(data, 2, 0, RED);
        drawPixel(data, 1, 1, RED);
        drawPixel(data, 0, 2, RED);
        drawPixel(data, 2, 2, RED);

        floodFill(data, 1, 0, BLUE);
        expect(readPixel(data, 1, 0)).toEqual(BLUE);
        expect(readPixel(data, 0, 1)).toEqual(TRANSPARENT);
        expect(readPixel(data, 2, 1)).toEqual(TRANSPARENT);
        expect(readPixel(data, 1, 1)).toEqual(RED);
    });

    it("is a no-op when start equals target colour", () => {
        const data = makeData();
        drawPixel(data, 0, 0, RED);
        floodFill(data, 0, 0, RED);
        expect(readPixel(data, 0, 0)).toEqual(RED);
        expect(readPixel(data, 1, 0)).toEqual(TRANSPARENT);
    });

    it("is a no-op for out-of-bounds start", () => {
        const data = makeData();
        floodFill(data, -1, 0, RED);
        expect(readPixel(data, 0, 0)).toEqual(TRANSPARENT);
    });
});

describe("mirrorHorizontal", () => {
    it("flips an asymmetric pattern", () => {
        const data = makeData(3, 1);
        drawPixel(data, 0, 0, RED);
        drawPixel(data, 1, 0, BLUE);
        const flipped = mirrorHorizontal(data);
        expect(readPixel(flipped, 0, 0)).toEqual(TRANSPARENT);
        expect(readPixel(flipped, 1, 0)).toEqual(BLUE);
        expect(readPixel(flipped, 2, 0)).toEqual(RED);
        expect(readPixel(data, 0, 0)).toEqual(RED);
        expect(readPixel(data, 2, 0)).toEqual(TRANSPARENT);
    });

    it("preserves dimensions", () => {
        const data = makeData(5, 3);
        const flipped = mirrorHorizontal(data);
        expect(flipped.width).toBe(5);
        expect(flipped.height).toBe(3);
    });
});

describe("cloneImageData", () => {
    it("produces an independent copy", () => {
        const data = makeData();
        drawPixel(data, 2, 1, RED);
        const copy = cloneImageData(data);
        expect(readPixel(copy, 2, 1)).toEqual(RED);
        drawPixel(copy, 0, 0, BLUE);
        expect(readPixel(data, 0, 0)).toEqual(TRANSPARENT);
    });

    it("preserves dimensions", () => {
        const data = makeData(7, 5);
        const copy = cloneImageData(data);
        expect(copy.width).toBe(7);
        expect(copy.height).toBe(5);
    });
});
