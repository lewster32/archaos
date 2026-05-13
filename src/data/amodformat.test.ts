import { describe, expect, it } from "vitest";
import { AmodFormatError } from "./amodformat";
import { validateManifest, type ModManifest } from "./amodformat";
import { packAmod } from "./amodformat";
import { decodeAmod } from "./amodformat";

const MAGIC = new Uint8Array([0x41, 0x4d, 0x4f, 0x44]);

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

describe("decodeAmod", () => {
    it("round-trips a packed manifest + PNG", () => {
        const png = makePng();
        const bytes = packAmod(minimalManifest, png);
        const decoded = decodeAmod(bytes);
        expect(decoded.manifest).toEqual(minimalManifest);
        expect(Array.from(decoded.pngBytes)).toEqual(Array.from(png));
    });

    it("rejects a buffer shorter than the header", () => {
        const bytes = new Uint8Array(8);
        expect(() => decodeAmod(bytes)).toThrow(/Truncated/);
    });

    it("rejects bad magic bytes", () => {
        const bytes = packAmod(minimalManifest, makePng());
        bytes[0] = 0x00;
        expect(() => decodeAmod(bytes)).toThrow(/Bad magic/);
    });

    it("rejects an unsupported version", () => {
        const bytes = packAmod(minimalManifest, makePng());
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        dv.setUint16(4, 999, true);
        expect(() => decodeAmod(bytes)).toThrow(/Unsupported.*999/);
    });

    it("rejects a reserved flag bit being set", () => {
        const bytes = packAmod(minimalManifest, makePng());
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        dv.setUint16(6, 0b10, true);
        expect(() => decodeAmod(bytes)).toThrow(/Reserved flag/);
    });

    it("rejects gzip flag bit set (reserved in v1)", () => {
        const bytes = packAmod(minimalManifest, makePng());
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        dv.setUint16(6, 0b1, true);
        expect(() => decodeAmod(bytes)).toThrow(/gzip.*not.*supported/i);
    });

    it("rejects header lengths that overshoot the file size", () => {
        const bytes = packAmod(minimalManifest, makePng());
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        dv.setUint32(8, 9999, true);
        expect(() => decodeAmod(bytes)).toThrow(/Truncated/);
    });

    it("rejects malformed JSON payload", () => {
        const bytes = packAmod(minimalManifest, makePng());
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const jsonLen = dv.getUint32(8, true);
        bytes[16] = 0x7b; // '{'
        bytes[17] = 0x7d; // '}'
        for (let i = 18; i < 16 + jsonLen; i++) bytes[i] = 0x20;
        expect(() => decodeAmod(bytes))
            .toThrow(/missing top-level "manifest" key/);
    });

    it("rejects manifest with reference errors", () => {
        const bad = {
            ...minimalManifest,
            spells: [{ ...minimalManifest.spells[0], unitId: "ghost" }],
        };
        const bytes = packAmod({ ...minimalManifest }, makePng());
        // Patch JSON inline to inject the bad reference, recomputing
        // jsonLen so the header stays consistent.
        const newJson = new TextEncoder().encode(
            JSON.stringify({ manifest: bad }, null, 4),
        );
        const png = makePng();
        const out = new Uint8Array(16 + newJson.length + png.length);
        out.set(MAGIC, 0);
        const odv = new DataView(out.buffer);
        odv.setUint16(4, 1, true);
        odv.setUint16(6, 0, true);
        odv.setUint32(8, newJson.length, true);
        odv.setUint32(12, png.length, true);
        out.set(newJson, 16);
        out.set(png, 16 + newJson.length);
        expect(() => decodeAmod(out)).toThrow(/ghost.*units\[\]/);
    });
});
