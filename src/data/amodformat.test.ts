import { describe, expect, it } from "vitest";
import { AmodFormatError } from "./amodformat";
import { validateManifest, type ModManifest } from "./amodformat";
import { packAmod } from "./amodformat";

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

function makePng(): Uint8Array {
    // Minimum-valid PNG: 8-byte signature + IHDR + IDAT + IEND.
    // For the tests we only care about byte-identity of the payload,
    // not that PNG decoders accept it. A 16-byte stub is fine.
    return new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
}

describe("packAmod", () => {
    it("writes the AMOD magic at offset 0", () => {
        const bytes = packAmod(minimalManifest, makePng());
        expect(bytes[0]).toBe(0x41); // A
        expect(bytes[1]).toBe(0x4d); // M
        expect(bytes[2]).toBe(0x4f); // O
        expect(bytes[3]).toBe(0x44); // D
    });

    it("writes version=1 as little-endian u16 at offset 4", () => {
        const bytes = packAmod(minimalManifest, makePng());
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(dv.getUint16(4, true)).toBe(1);
    });

    it("writes flags=0 by default", () => {
        const bytes = packAmod(minimalManifest, makePng());
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(dv.getUint16(6, true)).toBe(0);
    });

    it("writes jsonLen and pngLen consistent with the body", () => {
        const png = makePng();
        const bytes = packAmod(minimalManifest, png);
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const jsonLen = dv.getUint32(8, true);
        const pngLen = dv.getUint32(12, true);
        expect(pngLen).toBe(png.length);
        expect(bytes.length).toBe(16 + jsonLen + pngLen);
    });

    it("appends the PNG bytes verbatim after the JSON", () => {
        const png = makePng();
        const bytes = packAmod(minimalManifest, png);
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const jsonLen = dv.getUint32(8, true);
        const tail = bytes.slice(16 + jsonLen);
        expect(Array.from(tail)).toEqual(Array.from(png));
    });

    it("throws AmodFormatError when manifest is invalid", () => {
        expect(() => packAmod({ ...minimalManifest, id: "" }, makePng()))
            .toThrow(AmodFormatError);
    });

    it("throws AmodFormatError when gzipJson:true is requested in v1", () => {
        expect(() => packAmod(minimalManifest, makePng(), { gzipJson: true }))
            .toThrow(/gzip.*not.*supported/i);
    });
});
