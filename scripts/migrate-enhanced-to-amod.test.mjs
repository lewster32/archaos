// scripts/migrate-enhanced-to-amod.test.mjs
import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { migrateOne } from "./migrate-enhanced-to-amod.mjs";
import { decodeAmod } from "./amodformat.mjs";

/**
 * Build a 36x18 PNG with a single 10x10 opaque-red square positioned at
 * (4, 4) in the canonical 18x18 sprite area starting at atlas x=0.
 * The second 18x18 cell is empty (transparent). Used to verify the
 * migration re-expands trimmed input frames back to canonical 18x18.
 */
function makeTestAtlas() {
    const png = new PNG({ width: 36, height: 18, fill: true });
    // Cell 1 (x=0..17): trimmed sub-rect (4..13, 4..13) is opaque red.
    for (let y = 4; y < 14; y++) {
        for (let x = 4; x < 14; x++) {
            const i = (y * png.width + x) * 4;
            png.data[i + 0] = 255;
            png.data[i + 1] = 0;
            png.data[i + 2] = 0;
            png.data[i + 3] = 255;
        }
    }
    return PNG.sync.write(png);
}

const legacySpell = {
    spell: {
        id: "testunit",
        name: "Testunit",
        chance: 0.5,
        balance: 0,
        group: "enhanced",
        unit: {
            id: "testunit",
            name: "Testunit",
            properties: { mov: 1, com: 1, rcm: 0, rng: 0, def: 1, mnv: 1, res: 1 },
            status: [],
            animFrames: [0],
            textures: [
                {
                    image: "testunit.png",
                    size: { w: 36, h: 18 },
                    frames: [
                        {
                            filename: "testunit_l_0",
                            // Trimmed sub-rect: 10x10 at atlas (4,4),
                            // re-expanded to 18x18 at sprite (4,4).
                            frame: { x: 4, y: 4, w: 10, h: 10 },
                            sourceSize: { w: 18, h: 18 },
                            spriteSourceSize: { x: 4, y: 4, w: 10, h: 10 },
                            trimmed: true,
                            rotated: false,
                        },
                        {
                            filename: "testunit_r_0",
                            frame: { x: 18, y: 0, w: 18, h: 18 },
                            sourceSize: { w: 18, h: 18 },
                            spriteSourceSize: { x: 0, y: 0, w: 18, h: 18 },
                            trimmed: false,
                            rotated: false,
                        },
                    ],
                },
            ],
        },
    },
};

describe("migrate-enhanced-to-amod", () => {
    it("lifts legacy spell into the manifest shape and re-expands trims", () => {
        const amodBytes = migrateOne(legacySpell.spell, makeTestAtlas());
        const { manifest, pngBytes } = decodeAmod(amodBytes);

        expect(manifest.id).toBe("testunit");
        expect(manifest.spells).toHaveLength(1);
        expect(manifest.spells[0].unitId).toBe("testunit");
        expect(manifest.units).toHaveLength(1);

        const frames = manifest.units[0].textures[0].frames;
        // Two frames produced, both untrimmed 18x18.
        expect(frames).toHaveLength(2);
        for (const f of frames) {
            expect(f.trimmed).toBe(false);
            expect(f.frame.w).toBe(18);
            expect(f.frame.h).toBe(18);
            expect(f.spriteSourceSize).toEqual({ x: 0, y: 0, w: 18, h: 18 });
        }

        // L is at (0, 0), R is at (18, 0), grid layout row 0 = L, row 1 = R.
        // Actually, the spec says row 0 = L row, row 1 = R row.
        // L frame at (col=0, row=0) -> (x=0, y=0)
        // R frame at (col=0, row=1) -> (x=0, y=18)
        const l = frames.find((f) => f.filename === "testunit_l_0");
        const r = frames.find((f) => f.filename === "testunit_r_0");
        expect(l.frame).toEqual({ x: 0, y: 0, w: 18, h: 18 });
        expect(r.frame).toEqual({ x: 0, y: 18, w: 18, h: 18 });

        // Verify the L pixel was re-expanded: the produced PNG has the
        // red square at (4, 4) inside the (0, 0) frame.
        const produced = PNG.sync.read(Buffer.from(pngBytes));
        expect(produced.width).toBe(18);
        expect(produced.height).toBe(36);
        // Pixel at (4, 4) in the L frame should be opaque red.
        const idx = (4 * produced.width + 4) * 4;
        expect(produced.data[idx + 0]).toBe(255);
        expect(produced.data[idx + 1]).toBe(0);
        expect(produced.data[idx + 2]).toBe(0);
        expect(produced.data[idx + 3]).toBe(255);
    });
});
