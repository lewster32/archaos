import { test, expect } from "@playwright/test";

declare global {
    // biome-ignore lint: var is required for global augmentation
    var currentBoard: // eslint-disable-line no-var
    import("../src/gameobjects/board").Board & Record<string, any>;
}

/**
 * Helper: wait for the Phaser game board to be initialised.
 * The Board constructor exposes itself as `globalThis.currentBoard`.
 */
async function waitForBoard(page: import("@playwright/test").Page) {
    await page.waitForFunction(() => "currentBoard" in globalThis, {
        timeout: 15_000,
    });
}

/**
 * Helper: wait until a player's turn has started (currentPlayer is set).
 */
async function waitForPlayerTurn(page: import("@playwright/test").Page) {
    await page.waitForFunction(
        () => globalThis.currentBoard?.currentPlayer != null,
        { timeout: 15_000 },
    );
}

test.describe("Mobile camera panning", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/?scenario=mobile");
        await waitForBoard(page);
    });

    test("camera viewport is narrower than board on mobile", async ({
        page,
    }) => {
        const result = await page.evaluate(() => {
            const board = globalThis.currentBoard;
            const camera = board.scene.cameras.main;
            const bounds = camera.getBounds();
            return {
                cameraWidth: camera.width,
                boundsWidth: bounds.width,
                needsPanning: board.needsPanning,
            };
        });

        expect(result.needsPanning).toBe(true);
        expect(result.cameraWidth).toBeLessThan(result.boundsWidth);
    });

    test("camera viewport is shorter than board on mobile", async ({
        page,
    }) => {
        const result = await page.evaluate(() => {
            const board = globalThis.currentBoard;
            const camera = board.scene.cameras.main;
            const bounds = camera.getBounds();
            return {
                cameraHeight: camera.height,
                boundsHeight: bounds.height,
            };
        });

        expect(result.cameraHeight).toBeLessThan(result.boundsHeight);
    });

    test("auto-pans to first player's wizard on turn start", async ({
        page,
    }) => {
        await waitForPlayerTurn(page);

        // Allow the pan tween to complete (shortDelay is enabled in the scenario)
        await page.waitForTimeout(500);

        const scrollX = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.scrollX,
        );

        // Player 1 wizard is at grid (34, 0) → iso x ≈ 476.
        // Camera should have scrolled right, so scrollX should be positive
        // or near the right bound.
        expect(scrollX).toBeGreaterThan(-100);
    });

    test("pans to second wizard after skipping turn", async ({ page }) => {
        await waitForPlayerTurn(page);
        await page.waitForTimeout(500);

        const firstScrollX: number = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.scrollX,
        );

        // Skip the first player's turn via the EndTurn event
        await page.evaluate(() => {
            globalThis.currentBoard.scene.game.events.emit("end-turn");
        });

        await page.waitForTimeout(500);

        // Wait for second player's turn
        await page.waitForFunction(
            () => globalThis.currentBoard?.currentPlayer?.name === "Left",
            { timeout: 15_000 },
        );
        await page.waitForTimeout(500);

        const secondScrollX: number = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.scrollX,
        );

        // "Left" wizard is at grid (0, 34) → iso x ≈ -476 (far left).
        // Camera should have scrolled left, so scrollX should be much less
        // than it was for "Right".
        expect(secondScrollX).toBeLessThan(firstScrollX);
        expect(secondScrollX).toBeLessThan(-100);
    });

    test("drag gesture pans the camera horizontally", async ({ page }) => {
        await waitForPlayerTurn(page);
        await page.waitForTimeout(500);

        const initialScrollX: number = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.scrollX,
        );

        // Perform a horizontal drag on the canvas
        const canvas = page.locator("canvas");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();

        const startX = box!.x + box!.width / 2;
        const startY = box!.y + box!.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // Drag right — this decreases scrollX, panning the view left.
        // (The initial scrollX may already be at the right bound after
        // auto-panning to Player 1's wizard, so dragging right is the
        // direction with room to scroll.)
        await page.mouse.move(startX + 80, startY, { steps: 10 });
        await page.mouse.up();

        const newScrollX: number = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.scrollX,
        );

        // Dragging right should decrease scrollX (panning the view left)
        expect(newScrollX).toBeLessThan(initialScrollX);
    });

    test("drag gesture pans the camera vertically", async ({ page }) => {
        await waitForPlayerTurn(page);
        await page.waitForTimeout(500);

        const initialScrollY: number = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.scrollY,
        );

        const canvas = page.locator("canvas");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();

        const startX = box!.x + box!.width / 2;
        const startY = box!.y + box!.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // Drag up — this increases scrollY, panning the view downward.
        await page.mouse.move(startX, startY - 40, { steps: 10 });
        await page.mouse.up();

        const newScrollY: number = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.scrollY,
        );

        // Dragging up should increase scrollY (panning the view down)
        expect(newScrollY).toBeGreaterThan(initialScrollY);
    });
});

test.describe("Viewport transition panning", () => {
    test("canvas resizes correctly when viewport narrows past the threshold then further", async ({
        page,
    }) => {
        // Start with a wide viewport
        await page.setViewportSize({ width: 1200, height: 874 });
        await page.goto("/?scenario=mobile");
        await waitForBoard(page);
        await waitForPlayerTurn(page);
        await page.waitForTimeout(500);

        // Step 1: narrow just below the media-query threshold (~1008px).
        // The matchMedia "change" event fires HERE.
        await page.setViewportSize({ width: 1000, height: 874 });
        await page.waitForTimeout(300);

        // Step 2: narrow much further — matchMedia does NOT fire again
        // because the query already matches.
        await page.setViewportSize({ width: 402, height: 874 });
        await page.waitForTimeout(300);

        // The camera width must track the actual viewport, not the width
        // when the media query first matched.
        const cameraWidth = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.width,
        );
        expect(cameraWidth).toBe(Math.floor(402 / 2));
    });

    test("drag-to-pan works after narrowing viewport in two steps", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 1200, height: 874 });
        await page.goto("/?scenario=mobile");
        await waitForBoard(page);
        await waitForPlayerTurn(page);
        await page.waitForTimeout(500);

        // Cross the threshold, then narrow further
        await page.setViewportSize({ width: 1000, height: 874 });
        await page.waitForTimeout(300);
        await page.setViewportSize({ width: 402, height: 874 });
        await page.waitForTimeout(300);

        const initialScrollX: number = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.scrollX,
        );

        const canvas = page.locator("canvas");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();

        const startX = box!.x + box!.width / 2;
        const startY = box!.y + box!.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        // Drag right — after auto-centering on Player 1 (far right of the
        // board) scrollX is already at the camera's right bound, so drag
        // right to scroll left (decrease scrollX) where there is room.
        await page.mouse.move(startX + 80, startY, { steps: 10 });
        await page.mouse.up();

        const newScrollX: number = await page.evaluate(
            () => globalThis.currentBoard.scene.cameras.main.scrollX,
        );

        expect(newScrollX).toBeLessThan(initialScrollX);
    });
});
