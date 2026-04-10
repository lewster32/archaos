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
