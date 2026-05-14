// scripts/build-legacy-amods.mjs
/**
 * One-shot batch converter for legacy 16x16 single-column GIF sprite
 * strips into .amod files. Used to port the original Chaos creature
 * sprites at F:/Work/Old Work/Chaos/creatures/ into assets/amods/.
 *
 * Pipeline per unit:
 *   GIF -> ffmpeg -> RGBA PNG (Nx16, where N = frames * 16)
 *   slice into 16x16 frames, replace pure black bg with transparent,
 *   dilate a 1-pixel black outline around opaque pixels (8-way),
 *   pad to 18x18 centred, mirror L -> R, compose atlas, pack via
 *   amodformat.mjs.
 *
 * Run from repo root:
 *   node scripts/build-legacy-amods.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { packAmod } from "./amodformat.mjs";

const SOURCE_DIR = "F:/Work/Old Work/Chaos/creatures";
const OUT_DIR = "e:/Work/archaos/assets/amods";
const TMP_DIR = "e:/Work/archaos/scripts/tmp-amod-build";
const CELL = 16;
const FRAME = 18;

// Stats table. balance: Law=1, Law+=2, Neut=0, Chaos=-1, Chaos+=-2.
// chance is the cast chance (0-1). hasCorpse drives noCorpse status and
// whether to look for a 4th (death) frame in the source GIF.
const UNITS = [
    {
        gif: "airelem", id: "air-elemental", name: "Air Elemental",
        article: "an", chance: 0.4, balance: 0,
        props: { mov: 3, com: 5, rcm: 1, rng: 6, def: 8, mnv: 9, res: 4 },
        flags: { flying: true }, ranged: true, hasCorpse: true,
    },
    {
        gif: "angel", id: "angel", name: "Angel",
        article: "an", chance: 0.1, balance: 2,
        props: { mov: 2, com: 9, rcm: 0, rng: 0, def: 7, mnv: 5, res: 7 },
        flags: { flying: true, sanctity: true }, hasCorpse: false,
    },
    {
        gif: "banshee", id: "banshee", name: "Banshee",
        article: "a", chance: 0.6, balance: -1,
        props: { mov: 4, com: 3, rcm: 3, rng: 3, def: 1, mnv: 6, res: 1 },
        flags: { flying: true, undead: true }, ranged: true, hasCorpse: false,
    },
    {
        gif: "carrion", id: "carrion-fowl", name: "Carrion Fowl",
        article: "a", chance: 0.3, balance: -1,
        props: { mov: 5, com: 2, rcm: 0, rng: 0, def: 1, mnv: 3, res: 2 },
        flags: { flying: true, mount: true, undead: true }, hasCorpse: false,
    },
    {
        gif: "chimera", id: "chimera", name: "Chimera",
        article: "a", chance: 0.4, balance: -1,
        props: { mov: 2, com: 5, rcm: 5, rng: 4, def: 3, mnv: 4, res: 3 },
        flags: {}, ranged: true, hasCorpse: true,
    },
    {
        gif: "cyclops", id: "cyclops", name: "Cyclops",
        article: "a", chance: 0.3, balance: -1,
        props: { mov: 2, com: 8, rcm: 0, rng: 0, def: 6, mnv: 2, res: 4 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "darkhorse", id: "dark-horse", name: "Dark Horse",
        article: "a", chance: 0.4, balance: -1,
        props: { mov: 4, com: 1, rcm: 0, rng: 0, def: 2, mnv: 5, res: 3 },
        flags: { mount: true, undead: true }, hasCorpse: false,
    },
    {
        gif: "demon", id: "demon", name: "Demon",
        article: "a", chance: 0.1, balance: -2,
        props: { mov: 2, com: 9, rcm: 0, rng: 0, def: 7, mnv: 5, res: 7 },
        flags: { flying: true, undead: true, sanctity: true }, hasCorpse: false,
    },
    {
        gif: "earthelem", id: "earth-elemental", name: "Earth Elemental",
        article: "an", chance: 0.4, balance: 0,
        props: { mov: 1, com: 7, rcm: 0, rng: 0, def: 6, mnv: 2, res: 6 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "fireelem", id: "fire-elemental", name: "Fire Elemental",
        article: "a", chance: 0.4, balance: 0,
        props: { mov: 2, com: 7, rcm: 4, rng: 4, def: 2, mnv: 2, res: 5 },
        flags: {}, ranged: true, hasCorpse: true,
    },
    {
        gif: "frostgiant", id: "frost-giant", name: "Frost Giant",
        article: "a", chance: 0.3, balance: 1,
        props: { mov: 2, com: 8, rcm: 0, rng: 0, def: 9, mnv: 5, res: 6 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "gorgon", id: "gorgon", name: "Gorgon",
        article: "a", chance: 0.5, balance: -2,
        props: { mov: 1, com: 3, rcm: 4, rng: 4, def: 3, mnv: 4, res: 2 },
        flags: { undead: true }, ranged: true, hasCorpse: false,
    },
    {
        gif: "imp", id: "imp", name: "Imp",
        article: "an", chance: 0.9, balance: -1,
        props: { mov: 1, com: 2, rcm: 0, rng: 0, def: 1, mnv: 6, res: 2 },
        flags: { undead: true }, hasCorpse: false,
    },
    {
        gif: "knight", id: "knight", name: "Knight",
        article: "a", chance: 0.8, balance: 1,
        props: { mov: 1, com: 3, rcm: 0, rng: 0, def: 3, mnv: 3, res: 4 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "kobold", id: "kobold", name: "Kobold",
        article: "a", chance: 0.8, balance: 1,
        props: { mov: 1, com: 3, rcm: 0, rng: 0, def: 3, mnv: 3, res: 4 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "kraken", id: "kraken", name: "Kraken",
        article: "a", chance: 0.8, balance: 1,
        props: { mov: 1, com: 3, rcm: 0, rng: 0, def: 3, mnv: 3, res: 4 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "mammoth", id: "mammoth", name: "Mammoth",
        article: "a", chance: 0.6, balance: 0,
        props: { mov: 1, com: 6, rcm: 0, rng: 0, def: 7, mnv: 2, res: 3 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "mummy", id: "mummy", name: "Mummy",
        article: "a", chance: 0.8, balance: -1,
        props: { mov: 1, com: 3, rcm: 0, rng: 0, def: 2, mnv: 2, res: 6 },
        flags: { undead: true }, hasCorpse: false,
    },
    {
        gif: "phantom", id: "phantom", name: "Phantom",
        article: "a", chance: 0.7, balance: -1,
        props: { mov: 2, com: 2, rcm: 0, rng: 0, def: 1, mnv: 7, res: 2 },
        flags: { undead: true, transparent: true }, hasCorpse: false,
    },
    {
        gif: "scorpion", id: "scorpion", name: "Scorpion",
        article: "a", chance: 0.8, balance: -1,
        props: { mov: 1, com: 6, rcm: 0, rng: 0, def: 1, mnv: 1, res: 1 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "waterelem", id: "water-elemental", name: "Water Elemental",
        article: "a", chance: 0.4, balance: 0,
        props: { mov: 2, com: 6, rcm: 0, rng: 0, def: 2, mnv: 7, res: 6 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "werewolf", id: "werewolf", name: "Werewolf",
        article: "a", chance: 0.5, balance: -1,
        props: { mov: 3, com: 5, rcm: 0, rng: 0, def: 7, mnv: 6, res: 5 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "wisp", id: "wisp", name: "Wisp",
        article: "a", chance: 0.8, balance: 1,
        props: { mov: 2, com: 3, rcm: 0, rng: 0, def: 2, mnv: 7, res: 4 },
        flags: {}, hasCorpse: true,
    },
    {
        gif: "yeti", id: "yeti", name: "Yeti",
        article: "a", chance: 0.7, balance: -1,
        props: { mov: 1, com: 5, rcm: 0, rng: 0, def: 4, mnv: 3, res: 6 },
        flags: {}, hasCorpse: true,
    },
];

function decodeGifToRgba(gifPath, pngPath) {
    execFileSync(
        "ffmpeg",
        [
            "-y", "-i", gifPath,
            "-frames:v", "1", "-update", "1",
            "-pix_fmt", "rgba", pngPath,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
    );
    const png = PNG.sync.read(readFileSync(pngPath));
    return { width: png.width, height: png.height, data: png.data };
}

// Returns a flat Uint8ClampedArray of size w*h*4. Pure black opaque pixels
// become fully transparent. Existing alpha is preserved otherwise.
function stripBlackBackground(src, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < src.length; i += 4) {
        const r = src[i], g = src[i + 1], b = src[i + 2], a = src[i + 3];
        if (a !== 0 && r === 0 && g === 0 && b === 0) {
            out[i] = 0;
            out[i + 1] = 0;
            out[i + 2] = 0;
            out[i + 3] = 0;
        } else {
            out[i] = r;
            out[i + 1] = g;
            out[i + 2] = b;
            out[i + 3] = a;
        }
    }
    return out;
}

// Adds a 1-pixel black outline (8-way) around any opaque pixel.
// Operates inside a frame of size w*h. Outline pixels are written where
// the source is fully transparent and at least one 8-neighbour is opaque.
function addBlackOutline(buf, w, h) {
    const out = new Uint8ClampedArray(buf);
    const op = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return false;
        return buf[(y * w + x) * 4 + 3] !== 0;
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            if (buf[idx + 3] !== 0) continue;
            let touch = false;
            for (let dy = -1; dy <= 1 && !touch; dy++) {
                for (let dx = -1; dx <= 1 && !touch; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    if (op(x + dx, y + dy)) touch = true;
                }
            }
            if (touch) {
                out[idx] = 0;
                out[idx + 1] = 0;
                out[idx + 2] = 0;
                out[idx + 3] = 255;
            }
        }
    }
    return out;
}

// Pad a 16x16 cell into an 18x18 frame, centred (offset +1,+1).
function padToFrame(cell16) {
    const out = new Uint8ClampedArray(FRAME * FRAME * 4);
    for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
            const si = (y * CELL + x) * 4;
            const di = ((y + 1) * FRAME + (x + 1)) * 4;
            out[di] = cell16[si];
            out[di + 1] = cell16[si + 1];
            out[di + 2] = cell16[si + 2];
            out[di + 3] = cell16[si + 3];
        }
    }
    return out;
}

function mirrorHorizontal(frame) {
    const out = new Uint8ClampedArray(frame.length);
    for (let y = 0; y < FRAME; y++) {
        for (let x = 0; x < FRAME; x++) {
            const si = (y * FRAME + x) * 4;
            const di = (y * FRAME + (FRAME - 1 - x)) * 4;
            out[di] = frame[si];
            out[di + 1] = frame[si + 1];
            out[di + 2] = frame[si + 2];
            out[di + 3] = frame[si + 3];
        }
    }
    return out;
}

// Build the atlas RGBA: 2 rows (l, r) of N frames each.
function composeAtlas(leftFrames, rightFrames) {
    const cols = leftFrames.length;
    const w = cols * FRAME;
    const h = 2 * FRAME;
    const out = new Uint8ClampedArray(w * h * 4);
    const blit = (src, ox, oy) => {
        for (let y = 0; y < FRAME; y++) {
            for (let x = 0; x < FRAME; x++) {
                const si = (y * FRAME + x) * 4;
                const di = ((oy + y) * w + (ox + x)) * 4;
                out[di] = src[si];
                out[di + 1] = src[si + 1];
                out[di + 2] = src[si + 2];
                out[di + 3] = src[si + 3];
            }
        }
    };
    for (let i = 0; i < cols; i++) blit(leftFrames[i], i * FRAME, 0);
    for (let i = 0; i < cols; i++) blit(rightFrames[i], i * FRAME, FRAME);
    return { width: w, height: h, data: out };
}

function rgbaToPng(rgba) {
    const png = new PNG({ width: rgba.width, height: rgba.height });
    png.data = Buffer.from(rgba.data.buffer);
    return PNG.sync.write(png);
}

function buildFrames(unit) {
    const gifPath = resolve(SOURCE_DIR, `${unit.gif}.gif`);
    const tmpPng = resolve(TMP_DIR, `${unit.gif}.src.png`);
    const { width, height, data } = decodeGifToRgba(gifPath, tmpPng);
    if (width !== CELL) {
        throw new Error(
            `${unit.gif}: expected width ${CELL}, got ${width}`,
        );
    }
    const stripped = stripBlackBackground(data, width, height);
    const totalRows = Math.floor(height / CELL);
    // Expected layout: 3 walk frames, optionally a 4th corpse frame.
    const walkCount = 3;
    if (totalRows < walkCount) {
        throw new Error(
            `${unit.gif}: only ${totalRows} rows, need at least ${walkCount}`,
        );
    }
    const want = unit.hasCorpse ? walkCount + 1 : walkCount;
    if (totalRows < want) {
        console.warn(
            `${unit.gif}: declared hasCorpse but GIF has only ${totalRows} rows; using last row as corpse`,
        );
    }
    const sliceCell = (row) => {
        const out = new Uint8ClampedArray(CELL * CELL * 4);
        for (let y = 0; y < CELL; y++) {
            for (let x = 0; x < CELL; x++) {
                const si = ((row * CELL + y) * CELL + x) * 4;
                const di = (y * CELL + x) * 4;
                out[di] = stripped[si];
                out[di + 1] = stripped[si + 1];
                out[di + 2] = stripped[si + 2];
                out[di + 3] = stripped[si + 3];
            }
        }
        return out;
    };
    const buildFrame = (row) => {
        const padded = padToFrame(sliceCell(row));
        return addBlackOutline(padded, FRAME, FRAME);
    };
    const left = [buildFrame(0), buildFrame(1), buildFrame(2)];
    let leftDeath = null;
    if (unit.hasCorpse) {
        const deathRow = Math.min(totalRows - 1, walkCount);
        leftDeath = buildFrame(deathRow);
        left.push(leftDeath);
    }
    const right = left.map(mirrorHorizontal);
    return { left, right };
}

function frameMeta(filename, col, row) {
    return {
        filename,
        frame: { x: col * FRAME, y: row * FRAME, w: FRAME, h: FRAME },
        sourceSize: { w: FRAME, h: FRAME },
        spriteSourceSize: { x: 0, y: 0, w: FRAME, h: FRAME },
        trimmed: false,
        rotated: false,
    };
}

function buildManifest(unit) {
    const status = [];
    if (unit.flags.flying) status.push("flying");
    if (unit.flags.undead) status.push("undead");
    if (unit.flags.mount) status.push("mount");
    if (unit.flags.sanctity) status.push("sanctity");
    if (unit.flags.transparent) status.push("trans");
    if (!unit.hasCorpse) status.push("noCorpse");

    const spellTypes = [];
    if (unit.ranged) spellTypes.push("ranged");
    if (unit.flags.flying) spellTypes.push("flying");
    if (unit.flags.undead) spellTypes.push("undead");

    const frames = [];
    const dirOrder = [
        { tag: "l", row: 0 },
        { tag: "r", row: 1 },
    ];
    for (const { tag, row } of dirOrder) {
        for (let i = 0; i < 3; i++) {
            frames.push(frameMeta(`${unit.id}_${tag}_${i}`, i, row));
        }
        if (unit.hasCorpse) {
            frames.push(frameMeta(`${unit.id}_${tag}_d`, 3, row));
        }
    }

    const unitEntry = {
        id: unit.id,
        name: unit.name,
        properties: unit.props,
        status,
        textures: [{ frames }],
        indefiniteArticle: unit.article,
        attackType: "attacked",
        ...(unit.ranged
            ? { rangedType: "shot", projectileType: "arrow" }
            : {}),
        animFrames: [0, 1, 2, 1],
        animSpeed: 5,
    };

    const spell = {
        id: unit.id,
        name: unit.name,
        chance: unit.chance,
        balance: unit.balance,
        group: "enhanced",
        ...(spellTypes.length > 0 ? { types: spellTypes } : {}),
        unitId: unit.id,
    };

    return {
        id: unit.id,
        name: unit.name,
        modVersion: "1.0.0",
        spells: [spell],
        units: [unitEntry],
    };
}

function main() {
    mkdirSync(TMP_DIR, { recursive: true });
    mkdirSync(OUT_DIR, { recursive: true });
    for (const unit of UNITS) {
        const { left, right } = buildFrames(unit);
        const atlas = composeAtlas(left, right);
        const pngBytes = rgbaToPng(atlas);
        const manifest = buildManifest(unit);
        const amodBytes = packAmod(manifest, new Uint8Array(pngBytes));
        const outPath = resolve(OUT_DIR, `${unit.id}.amod`);
        writeFileSync(outPath, amodBytes);
        const corpse = unit.hasCorpse ? " +corpse" : "";
        const ranged = unit.ranged ? " ranged" : "";
        console.log(
            `  ${unit.id.padEnd(20)} ${atlas.width}x${atlas.height}px ` +
            `${(amodBytes.length / 1024).toFixed(1)}KB${corpse}${ranged}`,
        );
    }
    rmSync(TMP_DIR, { recursive: true, force: true });
    console.log(`\nWrote ${UNITS.length} .amod files to ${OUT_DIR}`);
}

main();
