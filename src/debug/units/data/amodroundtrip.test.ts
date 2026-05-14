import { describe, expect, it } from "vitest";
import { packAmod } from "../../../data/amodformat";
import { decodeAmod } from "../../../data/amodformat";
import { autoMirrorMissingDeath, packBuffersToAtlas } from "./savesprites";
import { frameBufferKey, type EditableUnit, type FrameBuffer, type FrameBuffers } from "./types";

const FRAME_SIZE = 18;

function makeBuffer(red: boolean): FrameBuffer {
    const data = new ImageData(FRAME_SIZE, FRAME_SIZE);
    if (red) {
        data.data[0] = 255;
        data.data[3] = 255;
    }
    return { data, undoStack: [], redoStack: [] };
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

describe("editor .amod round-trip", () => {
    it("survives pack -> decode -> pack with no pixel drift on (0,0) red", async () => {
        const buffers: FrameBuffers = new Map();
        buffers.set(frameBufferKey("l", "anim", 0), makeBuffer(true));
        buffers.set(frameBufferKey("r", "anim", 0), makeBuffer(false));
        autoMirrorMissingDeath(buffers, makeUnit());
        const { atlasPngBytes, framesMetadata } = await packBuffersToAtlas(buffers, makeUnit());

        const manifest = {
            id: "u",
            name: "U",
            modVersion: "1.0.0",
            spells: [{ id: "u", name: "U", chance: 1, balance: 0, group: "enhanced", unitId: "u" }],
            units: [
                {
                    id: "u",
                    name: "U",
                    properties: { mov: 1, com: 1, rcm: 0, rng: 0, def: 1, mnv: 1, res: 1 },
                    status: [],
                    textures: [{ frames: framesMetadata }],
                },
            ],
        };

        const amodBytes = packAmod(manifest, atlasPngBytes);
        const { manifest: decoded, pngBytes } = decodeAmod(amodBytes);
        expect(decoded.id).toBe("u");
        expect(decoded.units[0].textures[0].frames).toHaveLength(2);
        expect(pngBytes.length).toBeGreaterThan(0);
    });
});
