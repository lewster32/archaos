import { describe, it, expect, vi } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────
// vi.hoisted runs before imports, so mockProgress can be referenced in the
// vi.mock factory below (which is also hoisted to the top of the file).
// The __v_isRef flag makes Vue's template auto-unwrapper treat it as a ref.
const mockProgress = vi.hoisted(() => ({ value: 0, __v_isRef: true }) as any);

vi.mock("../game/loading-state", () => ({
    loadingProgress: mockProgress,
    debugLoading: false,
}));

vi.mock("../game/asset-sizes", () => ({
    TOTAL_GAME_ASSET_BYTES: 2097152, // 2.0 MB
}));

import { render } from "vitest-browser-vue";
import LoadingScreen from "./LoadingScreen.vue";

describe("LoadingScreen", () => {
    describe("progress display", () => {
        it("shows 0% when progress is 0", async () => {
            mockProgress.value = 0;
            const screen = await render(LoadingScreen);
            await expect.element(screen.getByText(/0%/)).toBeVisible();
        });

        it("shows 50% when progress is 0.5", async () => {
            mockProgress.value = 0.5;
            const screen = await render(LoadingScreen);
            await expect.element(screen.getByText(/50%/)).toBeVisible();
        });

        it("shows 100% when progress is 1", async () => {
            mockProgress.value = 1;
            const screen = await render(LoadingScreen);
            await expect.element(screen.getByText(/100%/)).toBeVisible();
        });

        it("rounds fractional percentages", async () => {
            mockProgress.value = 0.336;
            const screen = await render(LoadingScreen);
            await expect.element(screen.getByText(/34%/)).toBeVisible();
        });
    });

    describe("progress bar", () => {
        it("sets the aria-valuenow attribute on the progress bar", async () => {
            mockProgress.value = 0.4;
            const screen = await render(LoadingScreen);
            await expect
                .element(screen.getByRole("progressbar"))
                .toHaveAttribute("aria-valuenow", "40");
        });

        it("sets the fill width as a percentage via inline style", async () => {
            mockProgress.value = 0.75;
            const screen = await render(LoadingScreen);
            // The fill div sits inside the progressbar; check its style attribute directly.
            const fill = screen
                .getByRole("progressbar")
                .element()
                .querySelector(".loading-bar__fill") as HTMLElement;
            expect(fill.style.width).toBe("75%");
        });
    });

    describe("total size display", () => {
        it("shows approximate MB when TOTAL_GAME_ASSET_BYTES is non-zero", async () => {
            mockProgress.value = 0;
            const screen = await render(LoadingScreen);
            // 2097152 bytes = 2.0 MB
            await expect
                .element(screen.getByText(/about 2\.0 MB/))
                .toBeVisible();
        });
    });
});
