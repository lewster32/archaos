import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
    test: {
        projects: [
            {
                // Engine tests — pure TS, no DOM needed.
                test: {
                    name: "engine",
                    include: [
                        "packages/engine/src/**/*.test.ts",
                    ],
                },
            },
            {
                // Logic / service tests — jsdom, no real browser needed.
                plugins: [vue()],
                test: {
                    name: "unit",
                    environment: "jsdom",
                    css: false,
                    include: ["src/**/*.test.ts"],
                    exclude: [
                        "src/components/**/*.test.ts",
                    ],
                    setupFiles: ["./vitest.setup.ts"],
                },
            },
            {
                // Vue component tests — real Chromium via Playwright.
                plugins: [vue()],
                test: {
                    name: "components",
                    include: [
                        "src/components/**/*.test.ts",
                    ],
                    // vitest-browser-vue injects render() onto page and registers cleanup.
                    setupFiles: ["vitest-browser-vue"],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [
                            { browser: "chromium" },
                        ],
                    },
                },
            },
        ],
    },
});
