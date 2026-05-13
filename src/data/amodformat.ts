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
            throw new AmodFormatError(
                `Spell '${s.id}' references unitId='${s.unitId}' not in units[]`,
            );
        }
    }
}
