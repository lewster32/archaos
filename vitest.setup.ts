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

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = vi.fn((cb) => {
    setTimeout(cb, 0);
    return 1;
}) as any;

// Mock cancelAnimationFrame
globalThis.cancelAnimationFrame = vi.fn();

// Phaser 4 adds a Filters namespace that doesn't exist in Phaser 3.
// Provide a minimal stub so ColorReplaceFilter can be imported in tests
// without crashing. Tests don't exercise rendering paths so a no-op
// base class is sufficient.
// We use a dynamic import here so the canvas mock above is already in
// place before Phaser's module-level code runs.
import("phaser").then((module) => {
    const Phaser = module.default;
    if (!(Phaser as any).Filters) {
        class FilterStub {
            constructor(_frag: string, _uniforms?: unknown) {}
            setUniform(_name: string, _value: unknown): void {}
        }
        (Phaser as any).Filters = { Filter: FilterStub };
    }
});
