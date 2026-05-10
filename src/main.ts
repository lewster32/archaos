import { createApp } from "vue";
import App from "./App.vue";

// In production, UI images are inlined as data URIs in the CSS bundles
// (see assetsInlineLimit in vite.config.mjs), so hover states are
// paint-ready. The dev server doesn't apply assetsInlineLimit, so pre-fetch
// the UI images at startup to avoid first-hover pop-in during development.
// `import.meta.env.DEV` is statically replaced at build time, so the entire
// block is tree-shaken out of production bundles.
if (import.meta.env.DEV) {
    const uiImages = import.meta.glob("../assets/images/ui/**", {
        eager: true,
        import: "default",
    });
    Object.values(uiImages).forEach((src) => {
        if (src) new Image().src = src as string;
    });
}

createApp(App).mount("#app");
