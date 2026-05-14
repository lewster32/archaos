import { describe, expect, it } from "vitest";
import { adaptClassic } from "./classicadapter";
import type { Frame } from "./types";

const spells = {
    "0": {
        name: "Goblin",
        chance: 0.9,
        balance: -1,
        unitId: "goblin",
        description: "Goblin description.",
        types: ["ground"],
    },
    "1": {
        name: "Subversion",
        chance: 0.5,
        balance: 0,
        // No unitId - must be filtered out.
        target: "piece",
    },
    "2": {
        name: "Bear",
        chance: 0.6,
        balance: 1,
        unitId: "bear",
    },
};

const units = {
    goblin: {
        name: "Goblin",
        attackType: "slashed",
        properties: { mov: 1, com: 3, rcm: 0, rng: 0, def: 3, mnv: 4, res: 3 },
        status: ["spread"],
        animFrames: [0, 1],
        animSpeed: 4,
    },
    // bear is missing on purpose - the adapter must drop spell "2".
};

const goblinFrameL: Frame = {
    filename: "goblin_l_0",
    frame: { x: 0, y: 0, w: 18, h: 18 },
};
const goblinFrameR: Frame = {
    filename: "goblin_r_0",
    frame: { x: 18, y: 0, w: 18, h: 18 },
};
const unrelatedFrame: Frame = {
    filename: "horse_l_0",
    frame: { x: 0, y: 0, w: 18, h: 18 },
};

const atlasFrames = [goblinFrameL, goblinFrameR, unrelatedFrame];
const atlasSize = { w: 256, h: 256 };
const atlasUrl = "/fake/classicunits.png";

describe("adaptClassic", () => {
    it("emits one EditableSpell per spell with a known unitId", () => {
        const result = adaptClassic(spells, units, atlasFrames, atlasSize, atlasUrl);
        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe("Goblin");
    });

    it("filters spells with no unitId", () => {
        const result = adaptClassic(spells, units, atlasFrames, atlasSize, atlasUrl);
        expect(result.find((s) => s.name === "Subversion")).toBeUndefined();
    });

    it("filters spells whose unit is not in the units map", () => {
        const result = adaptClassic(spells, units, atlasFrames, atlasSize, atlasUrl);
        expect(result.find((s) => s.name === "Bear")).toBeUndefined();
    });

    it("copies unit properties and status", () => {
        const [goblin] = adaptClassic(spells, units, atlasFrames, atlasSize, atlasUrl);
        expect(goblin?.unit.properties.com).toBe(3);
        expect(goblin?.unit.status).toEqual(["spread"]);
        expect(goblin?.unit.animFrames).toEqual([0, 1]);
    });

    it("filters atlas frames to the requested unit only", () => {
        const [goblin] = adaptClassic(spells, units, atlasFrames, atlasSize, atlasUrl);
        const filenames = goblin?.unit.textures[0]?.frames.map((f) => f.filename);
        expect(filenames).toEqual(["goblin_l_0", "goblin_r_0"]);
    });

    it("tags the spell with _origin=classic and group=enhanced", () => {
        const [goblin] = adaptClassic(spells, units, atlasFrames, atlasSize, atlasUrl);
        expect(goblin?._origin).toBe("classic");
        expect(goblin?.group).toBe("enhanced");
        expect(goblin?._dirty).toBe(false);
    });

    it("deep-clones - mutating the result does not affect inputs", () => {
        const [goblin] = adaptClassic(spells, units, atlasFrames, atlasSize, atlasUrl);
        if (!goblin) throw new Error("Goblin missing");
        goblin.unit.properties.com = 99;
        goblin.unit.status.push("flying");
        expect(units.goblin.properties.com).toBe(3);
        expect(units.goblin.status).toEqual(["spread"]);
    });
});
