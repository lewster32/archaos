import path from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { phaserAssetSizesPlugin } from "./vite-plugin-asset-sizes.mjs";

export default defineConfig({
    plugins: [vue(), phaserAssetSizesPlugin()],
    base: "./",
    resolve: {
        alias: {
            "@assets": path.resolve(import.meta.dirname, "assets"),
        },
    },
    server: {
        watch: {
            ignored: ["**/coverage/**"],
        },
    },
    build: {
        // Inline small UI images (button skins, callouts, icons) as data URIs
        // in the CSS bundle so hover states are paint-ready and don't pop in
        // when first applied. Game assets loaded by Phaser stay as separate
        // files so the loader can report progress and benefit from
        // fingerprinted cache-busting.
        assetsInlineLimit: (filePath) => /[\\/]images[\\/]ui[\\/]/.test(filePath),
        chunkSizeWarningLimit: 1500,
        rolldownOptions: {
            input: {
                main: "index.html",
                debug: "debug.html",
            },
            output: {
                entryFileNames: `assets/[name].js`,
                chunkFileNames: `assets/[name].js`,
                assetFileNames: `assets/[name].[ext]`,
                manualChunks: (id) => {
                    if (id.includes("node_modules/phaser")) return "phaser";
                    if (id.includes("node_modules/vue")) return "vue";
                },
            },
        },
    },
});
