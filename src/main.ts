import { createApp } from "vue";
import App from "./App.vue";

// Pre-load UI images so we don't get pop-in when they are first used.
// new Image().src triggers an immediate fetch (unlike link[rel=preload] which browsers may ignore).
const uiImages = import.meta.glob("../assets/images/ui/**", { eager: true, import: "default" });
Object.values(uiImages).forEach((src) => {
    if (src) {
        new Image().src = src as string;
    }
});

createApp(App).mount("#app");
