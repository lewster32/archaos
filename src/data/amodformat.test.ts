import { describe, expect, it } from "vitest";
import { AmodFormatError } from "./amodformat";
import { validateManifest, type ModManifest } from "./amodformat";

const minimalManifest: ModManifest = {
    id: "test-mod",
    name: "Test",
    modVersion: "1.0.0",
    spells: [
        { id: "test-spell", name: "Test", chance: 1, balance: 0, group: "enhanced", unitId: "test-unit" },
    ],
    units: [
        {
            id: "test-unit",
            name: "Test",
            properties: { mov: 1, com: 1, rcm: 0, rng: 0, def: 1, mnv: 1, res: 1 },
            status: [],
            textures: [{ frames: [] }],
        },
    ],
};

describe("AmodFormatError", () => {
    it("is an Error subclass with the right name", () => {
        const e = new AmodFormatError("boom");
        expect(e).toBeInstanceOf(Error);
        expect(e.name).toBe("AmodFormatError");
        expect(e.message).toBe("boom");
    });

    it("preserves an optional cause", () => {
        const cause = new Error("inner");
        const e = new AmodFormatError("outer", cause);
        expect(e.cause).toBe(cause);
    });
});

describe("validateManifest", () => {
    it("accepts a minimal valid manifest", () => {
        expect(() => validateManifest(minimalManifest)).not.toThrow();
    });

    it("rejects an empty id", () => {
        expect(() => validateManifest({ ...minimalManifest, id: "" }))
            .toThrow(/non-empty string/);
    });

    it("rejects duplicate unit ids", () => {
        const m = {
            ...minimalManifest,
            units: [minimalManifest.units[0], minimalManifest.units[0]],
        };
        expect(() => validateManifest(m)).toThrow(/Duplicate unit id/);
    });

    it("rejects a spell whose unitId is not in units[]", () => {
        const m = {
            ...minimalManifest,
            spells: [{ ...minimalManifest.spells[0], unitId: "ghost" }],
        };
        expect(() => validateManifest(m)).toThrow(/ghost.*units\[\]/);
    });
});
