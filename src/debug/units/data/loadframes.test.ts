import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFrameBuffers } from "./loadframes";
import { frameBufferKey, type EditableSpell, type Texture } from "./types";

let nextLoadOutcome: "load" | "error" = "load";
let lastRequestedSrc = "";

class StubImage {
    src = "";
    naturalWidth = 36;
    naturalHeight = 36;
    decode(): Promise<void> {
        lastRequestedSrc = this.src;
        return nextLoadOutcome === "load"
            ? Promise.resolve()
            : Promise.reject(new Error("decode failed"));
    }
}

function makeStubCanvasContext(): {
    canvas: unknown;
    ctx: unknown;
    lastSlices: Array<{ x: number; y: number; w: number; h: number }>;
} {
    const lastSlices: Array<{ x: number; y: number; w: number; h: number }> = [];
    const ctx = {
        drawImage: vi.fn(),
        getImageData: vi.fn((x: number, y: number, w: number, h: number) => {
            lastSlices.push({ x, y, w, h });
            const img = new ImageData(w, h);
            for (let i = 0; i < img.data.length; i += 4) {
                img.data[i] = x & 0xff;
                img.data[i + 1] = y & 0xff;
                img.data[i + 2] = w & 0xff;
                img.data[i + 3] = h & 0xff;
            }
            return img;
        }),
    };
    const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ctx),
    };
    return { canvas, ctx, lastSlices };
}

let stubCtx: ReturnType<typeof makeStubCanvasContext> | null = null;
const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
    nextLoadOutcome = "load";
    lastRequestedSrc = "";
    stubCtx = makeStubCanvasContext();
    vi.stubGlobal("Image", StubImage);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        if (tag === "canvas") return stubCtx.canvas as HTMLCanvasElement;
        return realCreateElement(tag);
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function makeSpell(
    overrides: Partial<EditableSpell> = {},
    texturesOverride?: Texture[],
): EditableSpell {
    const textures: Texture[] = texturesOverride ?? [
        {
            image: "dwarf.png",
            size: { w: 36, h: 36 },
            frames: [
                {
                    filename: "dwarf_l_0",
                    frame: { x: 0, y: 0, w: 18, h: 18 },
                    sourceSize: { w: 18, h: 18 },
                    spriteSourceSize: { x: 0, y: 0, w: 18, h: 18 },
                    trimmed: false,
                    rotated: false,
                },
                {
                    filename: "dwarf_r_0",
                    frame: { x: 18, y: 0, w: 18, h: 18 },
                    sourceSize: { w: 18, h: 18 },
                    spriteSourceSize: { x: 0, y: 0, w: 18, h: 18 },
                    trimmed: false,
                    rotated: false,
                },
                {
                    filename: "dwarf_l_d",
                    frame: { x: 0, y: 18, w: 18, h: 18 },
                    sourceSize: { w: 18, h: 18 },
                    spriteSourceSize: { x: 0, y: 0, w: 18, h: 18 },
                    trimmed: false,
                    rotated: false,
                },
            ],
        },
    ];
    return {
        id: "dwarf",
        name: "Dwarf",
        chance: 0.7,
        balance: 2,
        group: "enhanced",
        unit: {
            id: "dwarf",
            name: "Dwarf",
            properties: {
                mov: 1,
                com: 6,
                rcm: 0,
                rng: 0,
                def: 5,
                mnv: 4,
                res: 7,
            },
            status: [],
            textures,
        },
        _origin: "enhanced",
        _originalId: "dwarf",
        _dirty: false,
        ...overrides,
    };
}

describe("loadFrameBuffers", () => {
    it("produces a map keyed by direction:slot:index", async () => {
        const spell = makeSpell();
        const buffers = await loadFrameBuffers(spell);
        expect([...buffers.keys()].toSorted()).toEqual(
            [
                frameBufferKey("l", "anim", 0),
                frameBufferKey("l", "death", 0),
                frameBufferKey("r", "anim", 0),
            ].toSorted(),
        );
    });

    it("slices the canvas using each frame's x/y/w/h", async () => {
        const spell = makeSpell();
        const buffers = await loadFrameBuffers(spell);
        const lBuf = buffers.get(frameBufferKey("l", "anim", 0));
        expect(lBuf.data.data[0]).toBe(0);
        expect(lBuf.data.data[1]).toBe(0);
        expect(lBuf.data.data[2]).toBe(18);
        expect(lBuf.data.data[3]).toBe(18);
        const rBuf = buffers.get(frameBufferKey("r", "anim", 0));
        expect(rBuf.data.data[0]).toBe(18);
        expect(rBuf.data.data[1]).toBe(0);
        const dBuf = buffers.get(frameBufferKey("l", "death", 0));
        expect(dBuf.data.data[0]).toBe(0);
        expect(dBuf.data.data[1]).toBe(18);
    });

    it("initialises each buffer's undo and redo stacks empty", async () => {
        const spell = makeSpell();
        const buffers = await loadFrameBuffers(spell);
        for (const buf of buffers.values()) {
            expect(buf.undoStack).toEqual([]);
            expect(buf.redoStack).toEqual([]);
        }
    });

    it("skips frame filenames that do not match the convention", async () => {
        const spell = makeSpell({}, [
            {
                image: "dwarf.png",
                size: { w: 18, h: 18 },
                frames: [
                    {
                        filename: "weird-name",
                        frame: { x: 0, y: 0, w: 18, h: 18 },
                        sourceSize: { w: 18, h: 18 },
                        spriteSourceSize: { x: 0, y: 0, w: 18, h: 18 },
                        trimmed: false,
                        rotated: false,
                    },
                    {
                        filename: "dwarf_l_0",
                        frame: { x: 0, y: 0, w: 18, h: 18 },
                        sourceSize: { w: 18, h: 18 },
                        spriteSourceSize: { x: 0, y: 0, w: 18, h: 18 },
                        trimmed: false,
                        rotated: false,
                    },
                ],
            },
        ]);
        const buffers = await loadFrameBuffers(spell);
        expect([...buffers.keys()]).toEqual([frameBufferKey("l", "anim", 0)]);
    });

    it("rejects when the source image fails to decode", async () => {
        nextLoadOutcome = "error";
        const spell = makeSpell();
        await expect(loadFrameBuffers(spell)).rejects.toThrow(/decode failed/);
    });

    it("returns an empty map when the unit has no textures", async () => {
        const spell = makeSpell({}, []);
        const buffers = await loadFrameBuffers(spell);
        expect(buffers.size).toBe(0);
    });

    it("requests the classic atlas URL for classic-origin spells", async () => {
        const spell = makeSpell({ _origin: "classic" });
        spell.unit.textures[0].image = "classicunits.png";
        await loadFrameBuffers(spell);
        expect(lastRequestedSrc).not.toBe("");
        expect(lastRequestedSrc).toMatch(/classicunits/);
    });
});
