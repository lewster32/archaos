import type { EditableSpell, EditableUnit, Frame, Texture } from "./types";
import type {
    ModManifest,
    SerialisedUnit as ManifestUnit,
} from "../../../data/amodformat";

/**
 * Output shape that mirrors the enhanced JSON files shipped today, e.g.
 * `assets/data/enhanced/dwarf.json`. Editor-only fields and any
 * `undefined` optional fields are dropped from the serialised form.
 */
interface SerialisedSpell {
    id: string;
    name: string;
    chance: number;
    balance: number;
    group: "enhanced";
    unit: SerialisedUnit;
    description?: string;
    types?: string[];
    spellFrame?: number;
}

interface SerialisedUnit {
    id: string;
    name: string;
    properties: EditableUnit["properties"];
    status: string[];
    textures: SerialisedTexture[];
    indefiniteArticle?: "a" | "an";
    attackType?: string;
    rangedType?: string;
    projectileType?: string;
    animFrames?: number[];
    animSpeed?: number;
    shadowScale?: number;
}

type SerialisedTexture = Omit<Texture, "imageUrl">;

/**
 * Build the enhanced-format JSON string for the given editable spell.
 *
 * - Drops editor-only fields (`_origin`, `_originalId`, `_dirty`,
 *   `texture.imageUrl`).
 * - Always sets `group` to `"enhanced"`.
 * - Falls back to `spell.name` when `unit.name` is empty so the output
 *   is valid against the schema (which requires `unit.name`).
 * - Pretty-printed with 4-space indentation to match the existing
 *   `assets/data/enhanced/*.json` files.
 */
export function buildEnhancedJson(spell: EditableSpell): string {
    const out = {
        spell: serialiseSpell(spell),
    };
    return JSON.stringify(out, null, 4);
}

function serialiseSpell(spell: EditableSpell): SerialisedSpell {
    const out: SerialisedSpell = {
        id: spell.id,
        name: spell.name,
        chance: spell.chance,
        balance: spell.balance,
        group: "enhanced",
        unit: serialiseUnit(spell.unit, spell.name),
    };
    if (spell.description !== undefined) out.description = spell.description;
    if (spell.types !== undefined) out.types = spell.types;
    if (spell.spellFrame !== undefined) out.spellFrame = spell.spellFrame;
    return out;
}

function serialiseUnit(unit: EditableUnit, spellName: string): SerialisedUnit {
    const out: SerialisedUnit = {
        id: unit.id,
        name: unit.name.trim() === "" ? spellName : unit.name,
        properties: { ...unit.properties },
        status: [...unit.status],
        textures: unit.textures.map(serialiseTexture),
    };
    if (unit.indefiniteArticle !== undefined) {
        out.indefiniteArticle = unit.indefiniteArticle;
    }
    if (unit.attackType !== undefined) out.attackType = unit.attackType;
    if (unit.rangedType !== undefined) out.rangedType = unit.rangedType;
    if (unit.projectileType !== undefined) {
        out.projectileType = unit.projectileType;
    }
    if (unit.animFrames !== undefined) out.animFrames = [...unit.animFrames];
    if (unit.animSpeed !== undefined) out.animSpeed = unit.animSpeed;
    if (unit.shadowScale !== undefined) out.shadowScale = unit.shadowScale;
    return out;
}

function serialiseTexture(texture: Texture): SerialisedTexture {
    // Re-build the texture without `imageUrl`. `JSON.parse(JSON.stringify(...))`
    // would also work but is heavier; this keeps frame metadata typed.
    const { imageUrl: _unused, frames, ...rest } = texture;
    const clonedFrames: Frame[] = [];
    for (const f of frames) clonedFrames.push({ ...f });
    return { ...rest, frames: clonedFrames };
}

/**
 * Build a Phase 2B manifest from an EditableSpell. Strips editor-only
 * fields; lifts `unit` into the manifest's `units[]` and replaces it
 * with `spell.unitId`.
 */
export function buildManifest(spell: EditableSpell): ModManifest {
    const serialisedSpell = serialiseSpell(spell);
    const embeddedUnit = serialisedSpell.unit;
    const unit: ManifestUnit = {
        id: embeddedUnit.id,
        name: embeddedUnit.name ?? spell.name,
        properties: { ...embeddedUnit.properties },
        status: [...embeddedUnit.status],
        textures: embeddedUnit.textures.map((t) => ({ frames: t.frames })),
    };
    if (embeddedUnit.indefiniteArticle !== undefined) {
        unit.indefiniteArticle = embeddedUnit.indefiniteArticle;
    }
    if (embeddedUnit.attackType !== undefined) {
        unit.attackType = embeddedUnit.attackType;
    }
    if (embeddedUnit.rangedType !== undefined) {
        unit.rangedType = embeddedUnit.rangedType;
    }
    if (embeddedUnit.projectileType !== undefined) {
        unit.projectileType = embeddedUnit.projectileType;
    }
    if (embeddedUnit.animFrames !== undefined) {
        unit.animFrames = [...embeddedUnit.animFrames];
    }
    if (embeddedUnit.animSpeed !== undefined) {
        unit.animSpeed = embeddedUnit.animSpeed;
    }
    if (embeddedUnit.shadowScale !== undefined) {
        unit.shadowScale = embeddedUnit.shadowScale;
    }

    return {
        id: unit.id,
        name: spell.name,
        modVersion: "1.0.0",
        spells: [{
            id: serialisedSpell.id,
            name: serialisedSpell.name,
            chance: serialisedSpell.chance,
            balance: serialisedSpell.balance,
            group: "enhanced",
            description: serialisedSpell.description,
            types: serialisedSpell.types,
            spellFrame: serialisedSpell.spellFrame,
            unitId: unit.id,
        }],
        units: [unit],
    };
}

/** Trigger a browser download of an .amod byte string. */
export function downloadAmod(filename: string, bytes: Uint8Array): void {
    const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    try {
        a.click();
    } finally {
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}

/**
 * Trigger a browser download of the given enhanced JSON. The anchor
 * uses an object URL that's revoked immediately after the synthetic
 * click so we don't leak Blob storage.
 */
export function downloadJson(filename: string, json: string): void {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    try {
        a.click();
    } finally {
        a.remove();
        // Defer the revoke - some older browsers (Safari, legacy WebView2)
        // race the download stream against an immediate revoke and silently
        // fail. setTimeout(0) gives the browser one tick to start the
        // download before we drop the URL.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}
