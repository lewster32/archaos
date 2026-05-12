import { describe, expect, it } from "vitest";
import {
    addDeathFrame,
    appendAnimFrame,
    clearDeathFrame,
    mirrorDirection,
    removeAnimFrame,
} from "./framebuffers";
import { cloneImageData, drawPixel, readPixel } from "./paintops";
import {
    frameBufferKey,
    type EditableUnit,
    type FrameBuffer,
    type FrameBuffers,
} from "./types";

const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;

function makeBuffer(): FrameBuffer {
    return { data: new ImageData(18, 18), undoStack: [], redoStack: [] };
}

function makeUnit(animFrames: number[] = [0]): EditableUnit {
    return {
        id: "dwarf",
        name: "Dwarf",
        properties: {
            mov: 1,
            com: 1,
            rcm: 1,
            rng: 1,
            def: 1,
            mnv: 1,
            res: 1,
        },
        status: [],
        animFrames,
        textures: [
            {
                image: "dwarf.png",
                size: { w: 36, h: 18 },
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
                ],
            },
        ],
    };
}

function makeBuffers(): FrameBuffers {
    const out: FrameBuffers = new Map();
    out.set(frameBufferKey("l", "anim", 0), makeBuffer());
    out.set(frameBufferKey("r", "anim", 0), makeBuffer());
    return out;
}

describe("appendAnimFrame", () => {
    it("appends matching L and R anim buffers", () => {
        const unit = makeUnit();
        const buffers = makeBuffers();
        appendAnimFrame(buffers, unit);
        expect(buffers.has(frameBufferKey("l", "anim", 1))).toBe(true);
        expect(buffers.has(frameBufferKey("r", "anim", 1))).toBe(true);
    });

    it("extends animFrames with the new index", () => {
        const unit = makeUnit([0]);
        appendAnimFrame(makeBuffers(), unit);
        expect(unit.animFrames).toEqual([0, 1]);
    });

    it("appends matching textures[0].frames metadata for L and R", () => {
        const unit = makeUnit();
        appendAnimFrame(makeBuffers(), unit);
        const names = unit.textures[0].frames.map((f) => f.filename);
        expect(names).toContain("dwarf_l_1");
        expect(names).toContain("dwarf_r_1");
        const lFrame = unit.textures[0].frames.find(
            (f) => f.filename === "dwarf_l_1",
        );
        expect(lFrame?.frame).toEqual({ x: 0, y: 0, w: 18, h: 18 });
        expect(lFrame?.sourceSize).toEqual({ w: 18, h: 18 });
        expect(lFrame?.trimmed).toBe(false);
    });

    it("handles a unit with no existing animFrames array", () => {
        const unit = makeUnit();
        unit.animFrames = undefined;
        appendAnimFrame(makeBuffers(), unit);
        expect(unit.animFrames).toEqual([1]);
    });
});

describe("removeAnimFrame", () => {
    it("removes both L and R buffers and metadata entries when index is unreferenced", () => {
        const unit = makeUnit([0]);
        const buffers = makeBuffers();
        appendAnimFrame(buffers, unit);
        unit.animFrames = [0];
        removeAnimFrame(buffers, unit, 1);
        expect(buffers.has(frameBufferKey("l", "anim", 1))).toBe(false);
        expect(buffers.has(frameBufferKey("r", "anim", 1))).toBe(false);
        const names = unit.textures[0].frames.map((f) => f.filename);
        expect(names).not.toContain("dwarf_l_1");
        expect(names).not.toContain("dwarf_r_1");
    });

    it("throws when animFrames still references the index", () => {
        const unit = makeUnit([0]);
        const buffers = makeBuffers();
        expect(() => removeAnimFrame(buffers, unit, 0)).toThrow(/referenced/);
    });
});

describe("addDeathFrame", () => {
    it("creates an empty death buffer and metadata entry for the given direction", () => {
        const unit = makeUnit();
        const buffers = makeBuffers();
        addDeathFrame(buffers, unit, "l");
        expect(buffers.has(frameBufferKey("l", "death", 0))).toBe(true);
        expect(buffers.has(frameBufferKey("r", "death", 0))).toBe(false);
        const names = unit.textures[0].frames.map((f) => f.filename);
        expect(names).toContain("dwarf_l_d");
        expect(names).not.toContain("dwarf_r_d");
    });

    it("is a no-op when the death frame already exists", () => {
        const unit = makeUnit();
        const buffers = makeBuffers();
        addDeathFrame(buffers, unit, "l");
        const buf1 = buffers.get(frameBufferKey("l", "death", 0));
        addDeathFrame(buffers, unit, "l");
        const buf2 = buffers.get(frameBufferKey("l", "death", 0));
        expect(buf2).toBe(buf1);
        expect(
            unit.textures[0].frames.filter((f) => f.filename === "dwarf_l_d"),
        ).toHaveLength(1);
    });
});

describe("clearDeathFrame", () => {
    it("drops the death buffer and metadata entry", () => {
        const unit = makeUnit();
        const buffers = makeBuffers();
        addDeathFrame(buffers, unit, "r");
        clearDeathFrame(buffers, unit, "r");
        expect(buffers.has(frameBufferKey("r", "death", 0))).toBe(false);
        expect(
            unit.textures[0].frames.find((f) => f.filename === "dwarf_r_d"),
        ).toBeUndefined();
    });

    it("is a no-op when there is no death frame to clear", () => {
        const unit = makeUnit();
        const buffers = makeBuffers();
        expect(() => clearDeathFrame(buffers, unit, "l")).not.toThrow();
    });
});

describe("mirrorDirection", () => {
    it("overwrites every destination anim buffer with a horizontally-flipped source clone", () => {
        const unit = makeUnit();
        const buffers = makeBuffers();
        drawPixel(
            buffers.get(frameBufferKey("l", "anim", 0)).data,
            0,
            0,
            RED,
        );
        drawPixel(
            buffers.get(frameBufferKey("r", "anim", 0)).data,
            0,
            0,
            BLUE,
        );
        mirrorDirection(buffers, unit, "l", "r");
        const destData = buffers.get(frameBufferKey("r", "anim", 0)).data;
        expect(readPixel(destData, 17, 0)).toEqual(RED);
        expect(readPixel(destData, 0, 0)).toEqual([0, 0, 0, 0]);
    });

    it("pushes the pre-overwrite buffer onto the destination's undo stack", () => {
        const unit = makeUnit();
        const buffers = makeBuffers();
        drawPixel(
            buffers.get(frameBufferKey("r", "anim", 0)).data,
            5,
            5,
            BLUE,
        );
        const preMirror = cloneImageData(
            buffers.get(frameBufferKey("r", "anim", 0)).data,
        );
        mirrorDirection(buffers, unit, "l", "r");
        const dst = buffers.get(frameBufferKey("r", "anim", 0));
        expect(dst.undoStack).toHaveLength(1);
        expect([...dst.undoStack[0].data]).toEqual([...preMirror.data]);
    });

    it("mirrors death when source has one and destination does not", () => {
        const unit = makeUnit();
        const buffers = makeBuffers();
        addDeathFrame(buffers, unit, "l");
        drawPixel(
            buffers.get(frameBufferKey("l", "death", 0)).data,
            0,
            0,
            RED,
        );
        mirrorDirection(buffers, unit, "l", "r");
        expect(buffers.has(frameBufferKey("r", "death", 0))).toBe(true);
        const rDeath = buffers.get(frameBufferKey("r", "death", 0)).data;
        expect(readPixel(rDeath, 17, 0)).toEqual(RED);
    });

    it("leaves destination death untouched when source has none", () => {
        const unit = makeUnit();
        const buffers = makeBuffers();
        addDeathFrame(buffers, unit, "r");
        drawPixel(
            buffers.get(frameBufferKey("r", "death", 0)).data,
            4,
            4,
            BLUE,
        );
        mirrorDirection(buffers, unit, "l", "r");
        expect(
            readPixel(
                buffers.get(frameBufferKey("r", "death", 0)).data,
                4,
                4,
            ),
        ).toEqual(BLUE);
    });
});
