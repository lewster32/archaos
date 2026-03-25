import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    timeout: 5_000,
    webServer: {
        command: "npm start",
        port: 5173,
        reuseExistingServer: !process.env.CI,
    },
    use: {
        baseURL: "http://localhost:5173",
    },
    projects: [
        {
            name: "mobile",
            use: {
                ...devices["Pixel 5"],
            },
        },
    ],
});
