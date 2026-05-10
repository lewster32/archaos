import { createApp } from "vue";
import App from "./App.vue";

// In production, UI images are inlined as data URIs in the CSS bundles
// (see assetsInlineLimit in vite.config.mjs), so hover states are
// paint-ready. The dev server doesn't apply assetsInlineLimit, so pre-fetch
// the UI images at startup to avoid first-hover pop-in during development.
// `import.meta.env.DEV` is statically replaced at build time, so the entire
// block is tree-shaken out of production bundles.
//
// Implementation notes:
//   - References are anchored on globalThis so Firefox's GC can't reap the
//     Image objects mid-fetch (this manifested as NS_BINDING_ABORTED).
//   - decode() guarantees the bitmap is parsed, not just fetched, so the
//     first :hover paints from a warm cache.
if (import.meta.env.DEV) {
    const uiImages = import.meta.glob("../assets/images/ui/**", {
        eager: true,
        import: "default",
    });
    const cache: HTMLImageElement[] = [];
    (globalThis as Record<string, unknown>).__archaosUiImageCache = cache;
    for (const src of Object.values(uiImages)) {
        if (!src) continue;
        const img = new Image();
        img.src = src as string;
        cache.push(img);
        img.decode().catch(() => {
            // Decode can reject on transient dev-server errors; the image
            // will be re-fetched on demand if that happens, so we just
            // swallow the rejection here.
        });
    }
}

createApp(App).mount("#app");
