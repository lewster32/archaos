// scripts/amodformat.test.mjs
import { describe, expect, it } from "vitest";
import { packAmod as packTs } from "../src/data/amodformat";
import { packAmod as packJs, decodeAmod as decodeJs } from "./amodformat.mjs";

const manifest = {
    id: "test",
    name: "Test",
    modVersion: "1.0.0",
    spells: [
        { id: "test", name: "Test", chance: 1, balance: 0, group: "enhanced", unitId: "test" },
    ],
    units: [
        {
            id: "test",
            name: "Test",
            properties: { mov: 1, com: 1, rcm: 0, rng: 0, def: 1, mnv: 1, res: 1 },
            status: [],
            textures: [{ frames: [] }],
        },
    ],
};

const png = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

describe("amodformat.mjs <-> amodformat.ts parity", () => {
    it("produces byte-identical pack output", () => {
        const tsBytes = packTs(manifest, png);
        const jsBytes = packJs(manifest, png);
        expect(Array.from(jsBytes)).toEqual(Array.from(tsBytes));
    });

    it("mjs decodes ts-produced bytes", () => {
        const tsBytes = packTs(manifest, png);
        const decoded = decodeJs(tsBytes);
        expect(decoded.manifest).toEqual(manifest);
        expect(Array.from(decoded.pngBytes)).toEqual(Array.from(png));
    });
});
