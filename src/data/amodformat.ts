/**
 * Thrown by .amod decode/validate paths. Wrap any underlying JSON
 * parse / decompression error via the optional cause argument.
 */
export class AmodFormatError extends Error {
    public readonly cause?: unknown;
    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = "AmodFormatError";
        this.cause = cause;
    }
}

/** A frame entry in a unit's atlas. Matches the Phaser atlas shape. */
export interface SerialisedFrame {
    filename: string;
    frame: { x: number; y: number; w: number; h: number };
    sourceSize?: { w: number; h: number };
    spriteSourceSize?: { x: number; y: number; w: number; h: number };
    trimmed?: boolean;
    rotated?: boolean;
}

/** Texture-atlas slice of a unit. The PNG it references is the
 *  single atlas blob in the same .amod. */
export interface SerialisedTexture {
    format?: string;
    size?: { w: number; h: number };
    scale?: number;
    frames: SerialisedFrame[];
}

export interface SerialisedUnit {
    id: string;
    name: string;
    indefiniteArticle?: "a" | "an";
    attackType?: string;
    rangedType?: string;
    projectileType?: string;
    properties: {
        mov: number;
        com: number;
        rcm: number;
        rng: number;
        def: number;
        mnv: number;
        res: number;
    };
    status: string[];
    animFrames?: number[];
    animSpeed?: number;
    shadowScale?: number;
    textures: SerialisedTexture[];
}

export interface SerialisedSpell {
    id: string;
    name: string;
    chance: number;
    balance: number;
    group: string;
    description?: string;
    types?: string[];
    spellFrame?: number;
    /** References a unit in the same manifest's `units[]`. */
    unitId?: string;
}

export interface ModManifest {
    id: string;
    name: string;
    modVersion: string;
    spells: SerialisedSpell[];
    units: SerialisedUnit[];
}

/**
 * Throws AmodFormatError if `manifest` is structurally invalid:
 * - empty id
 * - non-array spells or units
 * - duplicate unit or spell ids
 * - spell.unitId pointing at a non-existent unit
 */
export function validateManifest(manifest: ModManifest): void {
    if (typeof manifest?.id !== "string" || manifest.id === "") {
        throw new AmodFormatError("Manifest.id must be a non-empty string");
    }
    if (!Array.isArray(manifest.spells)) {
        throw new AmodFormatError("Manifest.spells must be an array");
    }
    if (!Array.isArray(manifest.units)) {
        throw new AmodFormatError("Manifest.units must be an array");
    }
    const unitIds = new Set<string>();
    for (const u of manifest.units) {
        if (!u?.id) throw new AmodFormatError("Unit missing id");
        if (unitIds.has(u.id)) {
            throw new AmodFormatError(`Duplicate unit id: ${u.id}`);
        }
        unitIds.add(u.id);
    }
    const spellIds = new Set<string>();
    for (const s of manifest.spells) {
        if (!s?.id) throw new AmodFormatError("Spell missing id");
        if (spellIds.has(s.id)) {
            throw new AmodFormatError(`Duplicate spell id: ${s.id}`);
        }
        spellIds.add(s.id);
        if (s.unitId !== undefined && !unitIds.has(s.unitId)) {
            throw new AmodFormatError(`Spell '${s.id}' references unitId='${s.unitId}' not in units[]`);
        }
    }
}

/** "AMOD" as raw bytes. */
const MAGIC = new Uint8Array([0x41, 0x4d, 0x4f, 0x44]);
const MAGIC_STR = "AMOD";

/** Currently supported format version. */
export const AMOD_VERSION = 1;

/** Fixed-position header size, in bytes. */
const HEADER_SIZE = 16;

/** Flag bit 0: JSON payload is gzipped. v1 reserves but does not
 *  implement; v2+ enables. */
const FLAG_GZIP_JSON = 1 << 0;

/** Mask of reserved flag bits that must be zero in v1. */
const RESERVED_FLAGS_MASK = ~FLAG_GZIP_JSON & 0xffff;

export interface PackOptions {
    /** Reserved for future use. v1 throws if true. */
    gzipJson?: boolean;
}

/**
 * Pack a manifest + atlas PNG into a single .amod byte string.
 *
 * Header is little-endian:
 *   magic (4)  | version u16 | flags u16 | jsonLen u32 | pngLen u32
 *
 * The JSON payload is the manifest wrapped: `{ "manifest": {...} }`,
 * UTF-8 encoded, 4-space indented for human inspection.
 */
export function packAmod(manifest: ModManifest, pngBytes: Uint8Array, options: PackOptions = {}): Uint8Array {
    validateManifest(manifest);
    if (options.gzipJson) {
        throw new AmodFormatError("gzipJson is reserved but not supported in v1");
    }
    const flags = 0;
    const jsonString = JSON.stringify({ manifest }, null, 4);
    const jsonBytes = new TextEncoder().encode(jsonString);

    const out = new Uint8Array(HEADER_SIZE + jsonBytes.length + pngBytes.length);
    out.set(MAGIC, 0);
    const dv = new DataView(out.buffer);
    dv.setUint16(4, AMOD_VERSION, true);
    dv.setUint16(6, flags, true);
    dv.setUint32(8, jsonBytes.length, true);
    dv.setUint32(12, pngBytes.length, true);
    out.set(jsonBytes, HEADER_SIZE);
    out.set(pngBytes, HEADER_SIZE + jsonBytes.length);
    return out;
}

export interface DecodedAmod {
    manifest: ModManifest;
    pngBytes: Uint8Array;
}

/**
 * Decode a .amod byte string into its manifest and atlas PNG bytes.
 * Throws AmodFormatError on any structural or content-level failure.
 * PNG decode itself is the caller's responsibility - this function
 * returns the raw bytes from the body.
 */
export function decodeAmod(bytes: Uint8Array): DecodedAmod {
    if (bytes.length < HEADER_SIZE) {
        throw new AmodFormatError(`Truncated: file is ${bytes.length} bytes, header alone is ${HEADER_SIZE}`);
    }
    for (let i = 0; i < 4; i++) {
        if (bytes[i] !== MAGIC[i]) {
            const hex = Array.from(bytes.slice(0, 4))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(" ");
            throw new AmodFormatError(`Bad magic: expected ${MAGIC_STR}, got ${hex}`);
        }
    }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = dv.getUint16(4, true);
    if (version !== AMOD_VERSION) {
        throw new AmodFormatError(
            `Unsupported .amod version ${version} (this build understands up to ${AMOD_VERSION})`,
        );
    }
    const flags = dv.getUint16(6, true);
    if ((flags & FLAG_GZIP_JSON) !== 0) {
        throw new AmodFormatError("gzip JSON payload is reserved but not supported in v1");
    }
    if ((flags & RESERVED_FLAGS_MASK) !== 0) {
        throw new AmodFormatError(`Reserved flag bits set: flags=0x${flags.toString(16).padStart(4, "0")}`);
    }
    const jsonLen = dv.getUint32(8, true);
    const pngLen = dv.getUint32(12, true);
    const expectedTotal = HEADER_SIZE + jsonLen + pngLen;
    if (bytes.length !== expectedTotal) {
        throw new AmodFormatError(`Truncated: header declares ${expectedTotal} bytes total, file is ${bytes.length}`);
    }
    const jsonEnd = HEADER_SIZE + jsonLen;
    const rawJson = bytes.slice(HEADER_SIZE, jsonEnd);
    const jsonText = new TextDecoder().decode(rawJson);
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (err) {
        throw new AmodFormatError("Invalid JSON payload", err);
    }
    if (!parsed || typeof parsed !== "object" || !("manifest" in parsed)) {
        throw new AmodFormatError('JSON payload missing top-level "manifest" key');
    }
    const manifest = (parsed as { manifest: ModManifest }).manifest;
    validateManifest(manifest);
    const pngBytes = bytes.slice(jsonEnd, jsonEnd + pngLen);
    return { manifest, pngBytes };
}
