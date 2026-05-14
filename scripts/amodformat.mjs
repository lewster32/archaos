// scripts/amodformat.mjs

/**
 * Plain-JS twin of src/data/amodformat.ts. Same wire format, same
 * algorithm. Parity guarded by scripts/amodformat.test.mjs.
 */

export class AmodFormatError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = "AmodFormatError";
        this.cause = cause;
    }
}

const MAGIC = new Uint8Array([0x41, 0x4d, 0x4f, 0x44]);
const MAGIC_STR = "AMOD";
export const AMOD_VERSION = 1;
const HEADER_SIZE = 16;
const FLAG_GZIP_JSON = 1 << 0;
const RESERVED_FLAGS_MASK = ~FLAG_GZIP_JSON & 0xffff;

export function validateManifest(manifest) {
    if (typeof manifest?.id !== "string" || manifest.id === "") {
        throw new AmodFormatError("Manifest.id must be a non-empty string");
    }
    if (!Array.isArray(manifest.spells)) {
        throw new AmodFormatError("Manifest.spells must be an array");
    }
    if (!Array.isArray(manifest.units)) {
        throw new AmodFormatError("Manifest.units must be an array");
    }
    const unitIds = new Set();
    for (const u of manifest.units) {
        if (!u?.id) throw new AmodFormatError("Unit missing id");
        if (unitIds.has(u.id)) {
            throw new AmodFormatError(`Duplicate unit id: ${u.id}`);
        }
        unitIds.add(u.id);
    }
    const spellIds = new Set();
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

export function packAmod(manifest, pngBytes, options = {}) {
    validateManifest(manifest);
    if (options.gzipJson) {
        throw new AmodFormatError("gzipJson is reserved but not supported in v1");
    }
    const jsonString = JSON.stringify({ manifest }, null, 4);
    const jsonBytes = new TextEncoder().encode(jsonString);

    const out = new Uint8Array(HEADER_SIZE + jsonBytes.length + pngBytes.length);
    out.set(MAGIC, 0);
    const dv = new DataView(out.buffer);
    dv.setUint16(4, AMOD_VERSION, true);
    dv.setUint16(6, 0, true);
    dv.setUint32(8, jsonBytes.length, true);
    dv.setUint32(12, pngBytes.length, true);
    out.set(jsonBytes, HEADER_SIZE);
    out.set(pngBytes, HEADER_SIZE + jsonBytes.length);
    return out;
}

export function decodeAmod(bytes) {
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
    const jsonText = new TextDecoder().decode(bytes.slice(HEADER_SIZE, jsonEnd));
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (err) {
        throw new AmodFormatError("Invalid JSON payload", err);
    }
    if (!parsed || typeof parsed !== "object" || !("manifest" in parsed)) {
        throw new AmodFormatError('JSON payload missing top-level "manifest" key');
    }
    const manifest = parsed.manifest;
    validateManifest(manifest);
    const pngBytes = bytes.slice(jsonEnd, jsonEnd + pngLen);
    return { manifest, pngBytes };
}
