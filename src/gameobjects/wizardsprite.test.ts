import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Phaser ────────────────────────────────────────────────────────────

const { mockSetTexture, mockSuperDestroy } = vi.hoisted(() => ({
    mockSetTexture: vi.fn(),
    mockSuperDestroy: vi.fn(),
}));

vi.mock("phaser", () => {
    class MockSprite {
        scene: any;
        texture: any;
        setTexture = mockSetTexture;
        constructor(scene: any, _x: number, _y: number, _key: string) {
            this.scene = scene;
            this.texture = scene?._texture ?? {
                manager: { exists: () => false },
            };
        }
    }
    // @ts-ignore
    MockSprite.prototype.destroy = mockSuperDestroy;

    return {
        GameObjects: { Sprite: MockSprite },
        Textures: {},
        Scene: vi.fn(),
    };
});

import { WizardSprite } from "./wizardsprite";
import type { WizCode } from "./interfaces/wizcode";
import {
    searchColors,
    replaceColors,
} from "../../assets/spritesheets/wizards.json";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build pixel data: 4 bytes per pixel (RGBA). */
function makePixelData(...pixels: [number, number, number, number][]) {
    return new Uint8ClampedArray(pixels.flat());
}

/** Build a mock CanvasTexture with controllable pixel data. */
function makeMockCanvas(pixelData?: Uint8ClampedArray) {
    const data = pixelData ?? new Uint8ClampedArray(0);
    const imgData = {
        data,
        width: 1,
        height: data.length / 4,
    } as unknown as ImageData;
    return {
        width: 36,
        height: 24,
        drawFrame: vi.fn(),
        refresh: vi.fn(),
        add: vi.fn(),
        context: {
            getImageData: vi.fn().mockReturnValue(imgData),
            putImageData: vi.fn(),
        },
    };
}

function makeWizCode(overrides: Partial<WizCode> = {}): WizCode {
    return {
        code: "test_wiz",
        wiz: 0,
        pri: 0,
        sec: 1,
        skin: 0,
        hat: 0,
        ...overrides,
    };
}

function makeMockScene(textureExists = false) {
    const canvas = makeMockCanvas();
    const removedKeys: string[] = [];
    return {
        _texture: {
            manager: { exists: vi.fn().mockReturnValue(textureExists) },
        },
        textures: {
            exists: vi.fn().mockReturnValue(textureExists),
            createCanvas: vi.fn().mockReturnValue(canvas),
            remove: vi.fn((key: string) => removedKeys.push(key)),
            _removedKeys: removedKeys,
        },
        _canvas: canvas,
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("WizardSprite", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── replaceColors (static) ──────────────────────────────────────────

    describe("replaceColors", () => {
        it("replaces a single matching colour in one pass", () => {
            const pixels = makePixelData(
                [161, 0, 0, 255], // matches primaryDark
            );
            const canvas = makeMockCanvas(pixels);

            WizardSprite.replaceColors(canvas as any, [
                [searchColors.primaryDark, replaceColors[0].dark],
            ]);

            expect(pixels[0]).toBe(replaceColors[0].dark[0]);
            expect(pixels[1]).toBe(replaceColors[0].dark[1]);
            expect(pixels[2]).toBe(replaceColors[0].dark[2]);
            expect(pixels[3]).toBe(255); // alpha unchanged
            expect(canvas.context.putImageData).toHaveBeenCalledOnce();
        });

        it("replaces multiple colours in a single pass", () => {
            const pixels = makePixelData(
                [161, 0, 0, 255], // primaryDark
                [194, 0, 0, 255], // primaryMid
                [225, 66, 24, 255], // primaryLight
            );
            const canvas = makeMockCanvas(pixels);

            WizardSprite.replaceColors(canvas as any, [
                [searchColors.primaryDark, [10, 20, 30]],
                [searchColors.primaryMid, [40, 50, 60]],
                [searchColors.primaryLight, [70, 80, 90]],
            ]);

            // Pixel 0
            expect(pixels[0]).toBe(10);
            expect(pixels[1]).toBe(20);
            expect(pixels[2]).toBe(30);
            // Pixel 1
            expect(pixels[4]).toBe(40);
            expect(pixels[5]).toBe(50);
            expect(pixels[6]).toBe(60);
            // Pixel 2
            expect(pixels[8]).toBe(70);
            expect(pixels[9]).toBe(80);
            expect(pixels[10]).toBe(90);
        });

        it("skips transparent pixels (alpha !== 255)", () => {
            const pixels = makePixelData(
                [161, 0, 0, 0], // transparent — should NOT be replaced
                [161, 0, 0, 128], // semi-transparent — should NOT be replaced
            );
            const canvas = makeMockCanvas(pixels);

            WizardSprite.replaceColors(canvas as any, [
                [searchColors.primaryDark, [99, 99, 99]],
            ]);

            expect(pixels[0]).toBe(161); // unchanged
            expect(pixels[4]).toBe(161); // unchanged
        });

        it("does not modify pixels that match no search colour", () => {
            const pixels = makePixelData(
                [42, 42, 42, 255], // no match
            );
            const canvas = makeMockCanvas(pixels);

            WizardSprite.replaceColors(canvas as any, [
                [searchColors.primaryDark, [99, 99, 99]],
            ]);

            expect(pixels[0]).toBe(42);
            expect(pixels[1]).toBe(42);
            expect(pixels[2]).toBe(42);
        });

        it("stops at first matching replacement (no double-replace)", () => {
            // Both rules match the same colour — only the first should apply
            const pixels = makePixelData([100, 100, 100, 255]);
            const canvas = makeMockCanvas(pixels);

            WizardSprite.replaceColors(canvas as any, [
                [
                    [100, 100, 100],
                    [1, 1, 1],
                ],
                [
                    [100, 100, 100],
                    [2, 2, 2],
                ],
            ]);

            expect(pixels[0]).toBe(1);
            expect(pixels[1]).toBe(1);
            expect(pixels[2]).toBe(1);
        });

        it("handles empty pixel data", () => {
            const canvas = makeMockCanvas(new Uint8ClampedArray(0));

            WizardSprite.replaceColors(canvas as any, [
                [
                    [1, 2, 3],
                    [4, 5, 6],
                ],
            ]);

            expect(canvas.context.putImageData).toHaveBeenCalledOnce();
        });

        it("handles empty replacements array", () => {
            const pixels = makePixelData([161, 0, 0, 255]);
            const canvas = makeMockCanvas(pixels);

            WizardSprite.replaceColors(canvas as any, []);

            expect(pixels[0]).toBe(161); // unchanged
        });
    });

    // ── Constructor ─────────────────────────────────────────────────────

    describe("constructor", () => {
        it("reuses existing texture when it exists", () => {
            const scene = makeMockScene(true);
            const wizCode = makeWizCode();

            const _sprite = new WizardSprite(scene as any, 0, 0, wizCode);

            expect(mockSetTexture).toHaveBeenCalledWith(wizCode.code);
            expect(scene.textures.createCanvas).not.toHaveBeenCalled();
        });

        it("generates frames when texture does not exist", () => {
            const scene = makeMockScene(false);
            const wizCode = makeWizCode();

            const _sprite = new WizardSprite(scene as any, 0, 0, wizCode);

            expect(scene.textures.createCanvas).toHaveBeenCalledWith(
                wizCode.code,
                36,
                24,
            );
        });
    });

    // ── generateFrames ──────────────────────────────────────────────────

    describe("generateFrames", () => {
        it("draws both wizard body frames", () => {
            const scene = makeMockScene();
            const wizCode = makeWizCode({ wiz: 3 });

            const _sprite = new WizardSprite(scene as any, 0, 0, wizCode);

            const canvas = scene._canvas;
            expect(canvas.drawFrame).toHaveBeenCalledWith(
                "wizards",
                6,
                0,
                expect.any(Number),
            );
            expect(canvas.drawFrame).toHaveBeenCalledWith(
                "wizards",
                7,
                18,
                expect.any(Number),
            );
        });

        it("calls replaceColors and refresh", () => {
            const scene = makeMockScene();
            const wizCode = makeWizCode();

            const _sprite = new WizardSprite(scene as any, 0, 0, wizCode);

            const canvas = scene._canvas;
            expect(canvas.context.getImageData).toHaveBeenCalled();
            expect(canvas.context.putImageData).toHaveBeenCalled();
            expect(canvas.refresh).toHaveBeenCalledOnce();
        });

        it("draws hat frames when hat > 0", () => {
            const scene = makeMockScene();
            const wizCode = makeWizCode({ hat: 5 });

            const _sprite = new WizardSprite(scene as any, 0, 0, wizCode);

            const canvas = scene._canvas;
            expect(canvas.drawFrame).toHaveBeenCalledWith(
                "hats",
                10,
                2,
                expect.any(Number),
            );
            expect(canvas.drawFrame).toHaveBeenCalledWith(
                "hats",
                11,
                20,
                expect.any(Number),
            );
        });

        it("does not draw hat frames when hat is 0", () => {
            const scene = makeMockScene();
            const wizCode = makeWizCode({ hat: 0 });

            const _sprite = new WizardSprite(scene as any, 0, 0, wizCode);

            const canvas = scene._canvas;
            const hatCalls = canvas.drawFrame.mock.calls.filter(
                (c: any[]) => c[0] === "hats",
            );
            expect(hatCalls).toHaveLength(0);
        });

        it("creates right and left sub-frames", () => {
            const scene = makeMockScene();
            const wizCode = makeWizCode({ code: "mycode" });

            const _sprite = new WizardSprite(scene as any, 0, 0, wizCode);

            const canvas = scene._canvas;
            expect(canvas.add).toHaveBeenCalledWith(
                "mycode_r",
                0,
                0,
                0,
                18,
                24,
            );
            expect(canvas.add).toHaveBeenCalledWith(
                "mycode_l",
                0,
                18,
                0,
                18,
                24,
            );
        });

        it("sets texture to the generated code", () => {
            const scene = makeMockScene();
            const wizCode = makeWizCode({ code: "gen_wiz" });

            const _sprite = new WizardSprite(scene as any, 0, 0, wizCode);

            expect(mockSetTexture).toHaveBeenCalledWith("gen_wiz");
        });
    });

    // ── destroy ─────────────────────────────────────────────────────────

    describe("destroy", () => {
        it("removes texture and calls super.destroy", () => {
            const scene = makeMockScene(true);
            const wizCode = makeWizCode({ code: "dz" });
            const sprite = new WizardSprite(scene as any, 0, 0, wizCode);

            scene.textures.remove.mockClear();
            mockSuperDestroy.mockClear();
            sprite.destroy();

            const removed = scene.textures.remove.mock.calls.map(
                (c: any[]) => c[0],
            );
            expect(removed).toContain("dz");
            expect(mockSuperDestroy).toHaveBeenCalled();
        });
    });

    it("does not attempt to remove textures that do not exist", () => {
        const scene = makeMockScene(false);
        const wizCode = makeWizCode({ code: "nonexistent" });
        const sprite = new WizardSprite(scene as any, 0, 0, wizCode);

        scene.textures.remove.mockClear();
        mockSuperDestroy.mockClear();
        sprite.destroy();
        expect(scene.textures.remove).not.toHaveBeenCalled();
        expect(mockSuperDestroy).toHaveBeenCalled();
    });

});
