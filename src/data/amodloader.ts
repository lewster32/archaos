import { reactive } from "vue";
import { decodeAmod, type ModManifest, type SerialisedFrame } from "./amodformat";

/** Phaser-compatible atlas JSON reconstructed from a manifest. */
export interface ReconstructedAtlas {
    frames: ModManifest["units"][0]["textures"][0]["frames"];
}

/** Frame rect lookup for a single unit's atlas. */
export interface UnitAtlasInfo {
    imageUrl: string;
    frames: Map<string, SerialisedFrame["frame"]>;
}

/**
 * Module-level lookup keyed by unitId. Populated whenever an amod is
 * registered. Consumed by Vue components that need to draw individual
 * frames outside the Phaser scene (e.g. the spellbook icon canvas).
 */
export const enhancedAtlasInfo = reactive(new Map<string, UnitAtlasInfo>());

/**
 * Merge every unit's textures[].frames[] in a manifest into a single
 * Phaser atlas JSON object. Frame filenames are unit-prefixed by
 * convention, so cross-unit collisions are impossible.
 */
export function reconstructAtlasJson(manifest: ModManifest): ReconstructedAtlas {
    const frames: ReconstructedAtlas["frames"] = [];
    for (const u of manifest.units) {
        for (const tex of u.textures) {
            for (const f of tex.frames) frames.push(f);
        }
    }
    return { frames };
}

/** Registries the loader writes into. Passed in for testability. */
export interface AmodRegistries {
    spells: Record<string, unknown>;
    units: Record<string, unknown>;
}

/**
 * Decode a .amod byte string and register it into a Phaser scene plus
 * the supplied spell/unit registries. Synchronous in the registry
 * step; the actual texture decode is Phaser's job once the load
 * queue runs.
 */
export function decodeAndRegisterAmod(
    scene: Phaser.Scene,
    bytes: Uint8Array,
    registries: AmodRegistries,
): void {
    const { manifest, pngBytes } = decodeAmod(bytes);
    const blob = new Blob([pngBytes as BlobPart], { type: "image/png" });
    const blobUrl = URL.createObjectURL(blob);
    const atlasJson = reconstructAtlasJson(manifest);
    scene.load.atlas(manifest.id, blobUrl, atlasJson);

    // Build a unit-by-id map for cross-reference during spell binding.
    const unitsById = new Map<string, ModManifest["units"][0]>();
    for (const u of manifest.units) unitsById.set(u.id, u);

    // Populate the shared atlas-info lookup so non-Phaser consumers
    // (e.g. spellbook icons) can resolve frame rects + PNG blob URL
    // by unit id without re-reading the legacy JSON glob.
    for (const unit of manifest.units) {
        const tex = unit.textures[0];
        if (!tex) continue;
        const frames = new Map<string, SerialisedFrame["frame"]>(
            tex.frames.map((f) => [f.filename, f.frame]),
        );
        enhancedAtlasInfo.set(unit.id, { imageUrl: blobUrl, frames });
    }

    for (const spell of manifest.spells) {
        const unit = spell.unitId ? unitsById.get(spell.unitId) : undefined;
        const registeredUnit = unit
            ? {
                  ...unit,
                  group: spell.group ?? "enhanced",
                  atlasKey: manifest.id,
              }
            : undefined;
        registries.spells[spell.id] = {
            ...spell,
            unit: registeredUnit,
        };
        if (registeredUnit) {
            registries.units[registeredUnit.id] = registeredUnit;
        }
    }
}

/**
 * Discover and load every .amod under assets/amods/ into the supplied
 * scene. Fetch + decode runs in parallel; one broken .amod logs and
 * is skipped, the rest still register.
 */
export async function loadAmodsIntoScene(
    scene: Phaser.Scene,
    registries: AmodRegistries,
): Promise<void> {
    const amods = import.meta.glob("../../assets/amods/*.amod", {
        eager: true,
        query: "?url",
        import: "default",
    }) as Record<string, string>;

    const loads = Object.entries(amods).map(async ([path, url]) => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const buf = await response.arrayBuffer();
            decodeAndRegisterAmod(scene, new Uint8Array(buf), registries);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Failed to load mod from ${path}: ${msg}`);
        }
    });
    await Promise.all(loads);
}
