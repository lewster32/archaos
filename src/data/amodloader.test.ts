import { describe, expect, it, vi } from "vitest";
import { decodeAndRegisterAmod, reconstructAtlasJson } from "./amodloader";
import { packAmod, type ModManifest } from "./amodformat";

function makeManifest(): ModManifest {
    return {
        id: "testmod",
        name: "Test",
        modVersion: "1.0.0",
        spells: [
            { id: "testspell", name: "Test", chance: 1, balance: 0, group: "enhanced", unitId: "testunit" },
        ],
        units: [
            {
                id: "testunit",
                name: "Test",
                properties: { mov: 1, com: 1, rcm: 0, rng: 0, def: 1, mnv: 1, res: 1 },
                status: [],
                textures: [
                    {
                        frames: [
                            {
                                filename: "testunit_l_0",
                                frame: { x: 0, y: 0, w: 18, h: 18 },
                                sourceSize: { w: 18, h: 18 },
                                spriteSourceSize: { x: 0, y: 0, w: 18, h: 18 },
                                trimmed: false,
                                rotated: false,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe("reconstructAtlasJson", () => {
    it("merges every unit's frames into one Phaser atlas object", () => {
        const m = makeManifest();
        const atlas = reconstructAtlasJson(m);
        expect(atlas.frames).toHaveLength(1);
        expect(atlas.frames[0].filename).toBe("testunit_l_0");
    });
});

describe("decodeAndRegisterAmod", () => {
    it("invokes scene.load.atlas with manifest.id and the atlas json", () => {
        const m = makeManifest();
        const png = new Uint8Array([0, 1, 2, 3]);
        const bytes = packAmod(m, png);
        const scene = {
            load: { atlas: vi.fn() },
        } as unknown as Phaser.Scene;
        const spells: Record<string, unknown> = {};
        const units: Record<string, unknown> = {};
        decodeAndRegisterAmod(scene, bytes, { spells, units });
        expect(scene.load.atlas).toHaveBeenCalledTimes(1);
        const call = (scene.load.atlas as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
        expect(call[0]).toBe("testmod"); // atlas key = manifest.id
        // call[1] is a blob URL string in the live path; in tests it's
        // still produced by URL.createObjectURL on the stub.
        expect(typeof call[1]).toBe("string");
        expect(call[2]).toEqual({ frames: m.units[0].textures[0].frames });
    });

    it("registers each spell into Spell.spells with atlasKey-tagged unit", () => {
        const m = makeManifest();
        const bytes = packAmod(m, new Uint8Array([0, 1, 2, 3]));
        const scene = { load: { atlas: vi.fn() } } as unknown as Phaser.Scene;
        const spells: Record<string, any> = {};
        const units: Record<string, any> = {};
        decodeAndRegisterAmod(scene, bytes, { spells, units });
        expect(spells.testspell).toBeDefined();
        expect(spells.testspell.unitId).toBe("testunit");
        expect(units.testunit.atlasKey).toBe("testmod");
        expect(units.testunit.group).toBe("enhanced");
    });
});
