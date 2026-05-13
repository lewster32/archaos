import { describe, expect, it } from "vitest";
import { autoMirrorMissingDeath, packBuffersToAtlas } from "./savesprites";
import type { EditableUnit, FrameBuffer, FrameBuffers } from "./types";
import { frameBufferKey } from "./types";

const FRAME_SIZE = 18;

function makeRedBuffer(): FrameBuffer {
    const data = new ImageData(FRAME_SIZE, FRAME_SIZE);
    for (let i = 0; i < data.data.length; i += 4) {
        data.data[i + 0] = 255;
        data.data[i + 3] = 255;
    }
    return { data, undoStack: [], redoStack: [] };
}

function makeEmptyBuffer(): FrameBuffer {
    return {
        data: new ImageData(FRAME_SIZE, FRAME_SIZE),
        undoStack: [],
        redoStack: [],
    };
}

function makeUnit(): EditableUnit {
    return {
        id: "u",
        name: "U",
        properties: { mov: 1, com: 1, rcm: 0, rng: 0, def: 1, mnv: 1, res: 1 },
        status: [],
        animFrames: [0],
        textures: [{ image: "u.png", size: { w: 0, h: 0 }, frames: [] }],
    };
}

describe("autoMirrorMissingDeath", () => {
    it("creates an r:death:0 mirror when only l:death:0 exists", () => {
        const buffers: FrameBuffers = new Map();
        buffers.set(frameBufferKey("l", "death", 0), makeRedBuffer());
        autoMirrorMissingDeath(buffers, makeUnit());
        expect(buffers.has(frameBufferKey("r", "death", 0))).toBe(true);
    });

    it("creates an l:death:0 mirror when only r:death:0 exists", () => {
        const buffers: FrameBuffers = new Map();
        buffers.set(frameBufferKey("r", "death", 0), makeRedBuffer());
        autoMirrorMissingDeath(buffers, makeUnit());
        expect(buffers.has(frameBufferKey("l", "death", 0))).toBe(true);
    });

    it("leaves buffers unchanged when neither or both death frames exist", () => {
        const both: FrameBuffers = new Map();
        both.set(frameBufferKey("l", "death", 0), makeRedBuffer());
        both.set(frameBufferKey("r", "death", 0), makeRedBuffer());
        autoMirrorMissingDeath(both, makeUnit());
        expect(both.size).toBe(2);

        const neither: FrameBuffers = new Map();
        autoMirrorMissingDeath(neither, makeUnit());
        expect(neither.size).toBe(0);
    });
});

describe("packBuffersToAtlas", () => {
    it("packs L and R as separate rows with anim frames then death", async () => {
        const buffers: FrameBuffers = new Map();
        buffers.set(frameBufferKey("l", "anim", 0), makeRedBuffer());
        buffers.set(frameBufferKey("r", "anim", 0), makeEmptyBuffer());
        buffers.set(frameBufferKey("l", "death", 0), makeEmptyBuffer());
        buffers.set(frameBufferKey("r", "death", 0), makeEmptyBuffer());
        const { framesMetadata } = await packBuffersToAtlas(buffers, makeUnit());

        expect(framesMetadata).toHaveLength(4);
        const l0 = framesMetadata.find((f) => f.filename === "u_l_0");
        const r0 = framesMetadata.find((f) => f.filename === "u_r_0");
        const ld = framesMetadata.find((f) => f.filename === "u_l_d");
        const rd = framesMetadata.find((f) => f.filename === "u_r_d");
        expect(l0?.frame).toEqual({ x: 0, y: 0, w: 18, h: 18 });
        expect(r0?.frame).toEqual({ x: 0, y: 18, w: 18, h: 18 });
        expect(ld?.frame).toEqual({ x: 18, y: 0, w: 18, h: 18 });
        expect(rd?.frame).toEqual({ x: 18, y: 18, w: 18, h: 18 });
        for (const f of framesMetadata) {
            expect(f.trimmed).toBe(false);
            expect(f.spriteSourceSize).toEqual({ x: 0, y: 0, w: 18, h: 18 });
        }
    });
});
