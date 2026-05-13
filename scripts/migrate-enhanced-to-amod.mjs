// scripts/migrate-enhanced-to-amod.mjs
/**
 * One-shot lift of legacy assets/data/enhanced/*.json + matching PNG
 * pair into assets/amods/<id>.amod with the new manifest shape and
 * canonical 18x18 untrimmed atlas.
 *
 * Deleted after the Phase 2B migration commit lands. Reproducible from
 * git history if ever needed again.
 *
 * Usage: node scripts/migrate-enhanced-to-amod.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { packAmod } from "./amodformat.mjs";

const FRAME_SIZE = 18;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const ENHANCED_DIR = resolve(root, "assets/data/enhanced");
const ENHANCED_PNG_DIR = resolve(root, "public/images/units/enhanced");
const AMOD_OUT_DIR = resolve(root, "assets/amods");

/** Parse `<id>_<l|r>_<index|d>` into direction, slot, index. */
function parseFrameName(filename) {
    const m = filename.match(/_([lr])_(\d+|d)$/);
    if (!m) return null;
    const dir = m[1];
    const idx = m[2];
    if (idx === "d") return { direction: dir, slot: "death", index: 0 };
    return { direction: dir, slot: "anim", index: parseInt(idx, 10) };
}

/**
 * Lifts one legacy spell + atlas PNG into a .amod byte string. The
 * atlas is re-emitted with all frames in a canonical 18x18 grid:
 *   row 0 = L anim[] + L_death
 *   row 1 = R anim[] + R_death
 * Trimmed frames are re-expanded to 18x18 using spriteSourceSize.
 *
 * Exported for testing.
 */
export function migrateOne(legacySpell, atlasPngBytes) {
    const unit = legacySpell.unit;
    const sourceTexture = unit.textures?.[0];
    if (!sourceTexture) {
        throw new Error(`Spell '${legacySpell.id}' has no texture`);
    }

    const srcPng = PNG.sync.read(Buffer.from(atlasPngBytes));

    // Index the source frames by (direction, slot, index).
    const sourceBySlot = new Map();
    for (const f of sourceTexture.frames) {
        const parsed = parseFrameName(f.filename);
        if (!parsed) continue;
        sourceBySlot.set(
            `${parsed.direction}:${parsed.slot}:${parsed.index}`,
            f,
        );
    }

    // Collect L and R anim indices (sorted).
    const lAnim = [];
    const rAnim = [];
    for (const [key] of sourceBySlot) {
        const [dir, slot, idx] = key.split(":");
        if (slot !== "anim") continue;
        if (dir === "l") lAnim.push(parseInt(idx, 10));
        else if (dir === "r") rAnim.push(parseInt(idx, 10));
    }
    lAnim.sort((a, b) => a - b);
    rAnim.sort((a, b) => a - b);

    const hasLDeath = sourceBySlot.has("l:death:0");
    const hasRDeath = sourceBySlot.has("r:death:0");
    const animCount = Math.max(lAnim.length, rAnim.length);
    const hasDeath = hasLDeath || hasRDeath;
    const colsPerRow = animCount + (hasDeath ? 1 : 0);
    const outW = colsPerRow * FRAME_SIZE;
    const outH = 2 * FRAME_SIZE;

    const outPng = new PNG({ width: outW, height: outH, fill: true });
    // Start fully transparent.
    for (let i = 3; i < outPng.data.length; i += 4) outPng.data[i] = 0;

    const newFrames = [];

    /** Composite one source frame into the output at (col, row). */
    function compositeAt(srcFrame, col, row, filename) {
        const dstX = col * FRAME_SIZE;
        const dstY = row * FRAME_SIZE;
        // Re-expand: copy the trimmed sub-rect onto the canonical 18x18
        // frame at (spriteSourceSize.x, spriteSourceSize.y).
        const ssx = srcFrame.spriteSourceSize?.x ?? 0;
        const ssy = srcFrame.spriteSourceSize?.y ?? 0;
        const fw = srcFrame.frame.w;
        const fh = srcFrame.frame.h;
        for (let y = 0; y < fh; y++) {
            for (let x = 0; x < fw; x++) {
                const sx = srcFrame.frame.x + x;
                const sy = srcFrame.frame.y + y;
                const si = (sy * srcPng.width + sx) * 4;
                const di = ((dstY + ssy + y) * outW + (dstX + ssx + x)) * 4;
                outPng.data[di + 0] = srcPng.data[si + 0];
                outPng.data[di + 1] = srcPng.data[si + 1];
                outPng.data[di + 2] = srcPng.data[si + 2];
                outPng.data[di + 3] = srcPng.data[si + 3];
            }
        }
        newFrames.push({
            filename,
            frame: { x: dstX, y: dstY, w: FRAME_SIZE, h: FRAME_SIZE },
            sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE },
            spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
            trimmed: false,
            rotated: false,
        });
    }

    // L row.
    for (let col = 0; col < lAnim.length; col++) {
        const idx = lAnim[col];
        const f = sourceBySlot.get(`l:anim:${idx}`);
        compositeAt(f, col, 0, `${unit.id}_l_${idx}`);
    }
    if (hasLDeath) {
        compositeAt(
            sourceBySlot.get("l:death:0"),
            animCount,
            0,
            `${unit.id}_l_d`,
        );
    }
    // R row.
    for (let col = 0; col < rAnim.length; col++) {
        const idx = rAnim[col];
        const f = sourceBySlot.get(`r:anim:${idx}`);
        compositeAt(f, col, 1, `${unit.id}_r_${idx}`);
    }
    if (hasRDeath) {
        compositeAt(
            sourceBySlot.get("r:death:0"),
            animCount,
            1,
            `${unit.id}_r_d`,
        );
    }

    const outPngBytes = PNG.sync.write(outPng);

    // Build the new manifest shape.
    const newSpell = {
        id: legacySpell.id,
        name: legacySpell.name,
        chance: legacySpell.chance,
        balance: legacySpell.balance,
        group: "enhanced",
        unitId: unit.id,
    };
    if (legacySpell.description !== undefined) newSpell.description = legacySpell.description;
    if (legacySpell.types !== undefined) newSpell.types = legacySpell.types;
    if (legacySpell.spellFrame !== undefined) newSpell.spellFrame = legacySpell.spellFrame;

    const newUnit = {
        id: unit.id,
        name: unit.name ?? legacySpell.name,
        properties: { ...unit.properties },
        status: unit.status ? [...unit.status] : [],
        textures: [{ frames: newFrames }],
    };
    if (unit.indefiniteArticle !== undefined) newUnit.indefiniteArticle = unit.indefiniteArticle;
    if (unit.attackType !== undefined) newUnit.attackType = unit.attackType;
    if (unit.rangedType !== undefined) newUnit.rangedType = unit.rangedType;
    if (unit.projectileType !== undefined) newUnit.projectileType = unit.projectileType;
    if (unit.animFrames !== undefined) newUnit.animFrames = [...unit.animFrames];
    if (unit.animSpeed !== undefined) newUnit.animSpeed = unit.animSpeed;
    if (unit.shadowScale !== undefined) newUnit.shadowScale = unit.shadowScale;

    const manifest = {
        id: unit.id,
        name: legacySpell.name,
        modVersion: "1.0.0",
        spells: [newSpell],
        units: [newUnit],
    };

    return packAmod(manifest, new Uint8Array(outPngBytes));
}

function main() {
    mkdirSync(AMOD_OUT_DIR, { recursive: true });
    const entries = readdirSync(ENHANCED_DIR).filter((f) => f.endsWith(".json"));
    for (const entry of entries) {
        const jsonPath = resolve(ENHANCED_DIR, entry);
        const legacy = JSON.parse(readFileSync(jsonPath, "utf8"));
        const spell = legacy.spell;
        const pngName = spell.unit.textures?.[0]?.image;
        if (!pngName) {
            console.warn(`Skipping ${entry} - no texture image`);
            continue;
        }
        const pngPath = resolve(ENHANCED_PNG_DIR, pngName);
        const pngBytes = readFileSync(pngPath);
        const amodBytes = migrateOne(spell, new Uint8Array(pngBytes));
        const outPath = resolve(AMOD_OUT_DIR, `${spell.unit.id}.amod`);
        writeFileSync(outPath, amodBytes);
        console.log(`Wrote ${outPath} (${amodBytes.length} bytes)`);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
