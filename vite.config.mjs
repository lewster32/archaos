import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { phaserAssetSizesPlugin } from "./vite-plugin-asset-sizes.mjs";

export default defineConfig({
    plugins: [vue(), phaserAssetSizesPlugin()],
    base: "./",
    build: {
        assetsInlineLimit: 0,
        chunkSizeWarningLimit: 1500,
        rolldownOptions: {
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
