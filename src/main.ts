import "phaser";

import { createApp } from "vue";
import App from "./App.vue";

// Pre-load UI images so we don't get pop-in when they are first used
const uiImages = import.meta.glob("../assets/images/ui/**", { eager: true, import: "default" });
Object.keys(uiImages).forEach((key) => {
    const img = uiImages[key] as { default: string };
    if (!key || !img?.default) {
        return;
    }
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = img.default;
    document.head.appendChild(link);
});

createApp(App).mount("#app");
