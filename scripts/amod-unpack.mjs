// scripts/amod-unpack.mjs
/**
 * CLI: extract the manifest JSON and atlas PNG from a .amod file.
 *
 * Usage: node scripts/amod-unpack.mjs <input.amod> [outdir]
 *
 * Writes `<manifest.id>.manifest.json` and `<manifest.id>.png` into
 * `outdir` (default: current working directory).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { decodeAmod } from "./amodformat.mjs";

export { decodeAmod };

function main() {
    const [, , inputPath, outDir = "."] = process.argv;
    if (!inputPath) {
        console.error("Usage: node scripts/amod-unpack.mjs <input.amod> [outdir]");
        process.exit(2);
    }
    const bytes = new Uint8Array(readFileSync(inputPath));
    const { manifest, pngBytes } = decodeAmod(bytes);
    mkdirSync(outDir, { recursive: true });
    const jsonPath = resolve(outDir, `${manifest.id}.manifest.json`);
    const pngPath = resolve(outDir, `${manifest.id}.png`);
    writeFileSync(jsonPath, JSON.stringify({ manifest }, null, 4) + "\n", "utf8");
    writeFileSync(pngPath, pngBytes);
    console.log(`Wrote ${jsonPath}`);
    console.log(`Wrote ${pngPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
