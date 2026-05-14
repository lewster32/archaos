import { vi } from "vitest";

// Mock canvas context — must be installed before Phaser is imported,
// because Phaser's module-level code (CanvasFeatures.js) reads the
// canvas context at load time.
const mockCanvasContext = {
    fillStyle: "",
    strokeStyle: "",
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(4),
    })),
    putImageData: vi.fn(),
    createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
    })),
};

// Mock HTMLCanvasElement.getContext
HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext) as any;

// jsdom does not implement toBlob without the `canvas` native dep.
// Stub it to return a minimal PNG-shaped blob so atlas packing tests
// can exercise the encode path without pulling in node-canvas.
HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback): void {
    const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const blob = new Blob([pngSignature], { type: "image/png" });
    setTimeout(() => callback(blob), 0);
} as any;

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = vi.fn((cb) => {
    setTimeout(cb, 0);
    return 1;
}) as any;

// Mock cancelAnimationFrame
globalThis.cancelAnimationFrame = vi.fn();

// jsdom omits ImageData (which is part of the Canvas spec). Provide a
// minimal polyfill so unit tests that operate on pixel buffers - e.g.
// the sprite-editor data-layer tests - can construct ImageData
// directly. Mirrors the two browser constructor signatures.
if (typeof (globalThis as { ImageData?: unknown }).ImageData === "undefined") {
    class ImageDataPolyfill {
        readonly width: number;
        readonly height: number;
        readonly data: Uint8ClampedArray;
        constructor(width: number, height: number);
        constructor(data: Uint8ClampedArray, width: number, height?: number);
        constructor(a: number | Uint8ClampedArray, b: number, c?: number) {
            if (a instanceof Uint8ClampedArray) {
                this.data = a;
                this.width = b;
                this.height = c ?? a.length / (b * 4);
            } else {
                this.width = a;
                this.height = b;
                this.data = new Uint8ClampedArray(a * b * 4);
            }
        }
    }
    (globalThis as unknown as { ImageData: typeof ImageDataPolyfill }).ImageData = ImageDataPolyfill;
}
