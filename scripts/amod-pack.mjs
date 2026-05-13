// scripts/amod-pack.mjs
/**
 * CLI: produce a .amod file from a manifest JSON and an atlas PNG.
 *
 * Usage: node scripts/amod-pack.mjs <manifest.json> <atlas.png> [out.amod]
 *
 * Programmatic export: packAmod (re-exported from amodformat.mjs).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { packAmod } from "./amodformat.mjs";

export { packAmod };

function main() {
    const [, , jsonPath, pngPath, outPath] = process.argv;
    if (!jsonPath || !pngPath) {
        console.error("Usage: node scripts/amod-pack.mjs <manifest.json> <atlas.png> [out.amod]");
        process.exit(2);
    }
    const manifestWrapper = JSON.parse(readFileSync(jsonPath, "utf8"));
    const manifest = manifestWrapper.manifest ?? manifestWrapper;
    const png = readFileSync(pngPath);
    const bytes = packAmod(manifest, new Uint8Array(png));
    const finalOut = outPath ?? `${manifest.id}.amod`;
    writeFileSync(finalOut, bytes);
    const jsonLen = bytes.length - 16 - png.length;
    console.log(
        `Wrote ${finalOut} (${bytes.length} bytes; jsonLen=${jsonLen}, pngLen=${png.length})`,
    );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
