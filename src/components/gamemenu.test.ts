import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-vue";
import { userEvent } from "vitest/browser";

import GameMenu from "./GameMenu.vue";

function renderMenu(menuProps: Record<string, unknown> = {}) {
    return render(GameMenu, { props: menuProps });
}

describe("GameMenu", () => {
    beforeEach(() => {
        globalThis.localStorage.clear();
    });

    describe("initial render", () => {
        it("renders the Configure players button", async () => {
            const screen = await renderMenu();
            await expect
                .element(
                    screen.getByRole("button", {
                        name: /Configure players/,
                    }),
                )
                .toBeVisible();
        });

        it("reveals the player count select when Configure players is clicked", async () => {
            const screen = await renderMenu();
            await screen
                .getByRole("button", { name: /Configure players/ })
                .click();
            await expect
                .element(screen.getByLabelText("Number of players:"))
                .toBeVisible();
        });

        it("renders 7 options in the player count select (2–8 players)", async () => {
            const screen = await renderMenu();
            const playerSelect = screen
                .getByLabelText("Number of players:")
                .element() as HTMLSelectElement;
            expect(playerSelect.options).toHaveLength(7);
        });

        it("renders the board size select", async () => {
            const screen = await renderMenu();
            await expect
                .element(screen.getByLabelText("Board size:"))
                .toBeVisible();
        });

        it("renders the spell count select", async () => {
            const screen = await renderMenu();
            await expect
                .element(screen.getByLabelText("Spell count:"))
                .toBeVisible();
        });

        it("renders the Start Game button", async () => {
            const screen = await renderMenu();
            await expect
                .element(screen.getByRole("button", { name: "Start Game" }))
                .toBeVisible();
        });

        it("defaults to 2 players", async () => {
            const screen = await renderMenu();
            await expect
                .element(screen.getByLabelText("Number of players:"))
                .toHaveValue("2");
        });
    });

    describe("start game", () => {
        it("emits the start event when Start Game is clicked", async () => {
            const onStart = vi.fn();
            const screen = await renderMenu({ onStart });
            await screen.getByRole("button", { name: "Start Game" }).click();
            expect(onStart).toHaveBeenCalledOnce();
        });

        it("saves setup to localStorage when Start Game is clicked", async () => {
            const screen = await renderMenu();
            await screen.getByRole("button", { name: "Start Game" }).click();
            expect(globalThis.localStorage.getItem("setup")).not.toBeNull();
        });

        it("emits player data sliced to the selected player count", async () => {
            const onStart = vi.fn();
            const screen = await renderMenu({ onStart });
            // Default playerCount is 2
            await screen.getByRole("button", { name: "Start Game" }).click();
            expect(onStart.mock.calls[0][0].players).toHaveLength(2);
        });
    });

    describe("localStorage persistence", () => {
        it("loads saved setup from localStorage on mount", async () => {
            globalThis.localStorage.setItem(
                "setup",
                JSON.stringify({
                    playerCount: 4,
                    boardSize: 17,
                    spellCount: 20,
                    players: Array.from({ length: 8 }, (_, i) => ({
                        name: `P${i + 1}`,
                        computerControlled: i > 0,
                    })),
                    classicSpells: false,
                }),
            );
            const screen = await renderMenu();
            await expect
                .element(screen.getByLabelText("Number of players:"))
                .toHaveValue("4");
        });
    });

    describe("board size constraint", () => {
        it("upgrades small board to medium when player count exceeds 4", async () => {
            globalThis.localStorage.setItem(
                "setup",
                JSON.stringify({
                    playerCount: 5,
                    boardSize: 9,
                    spellCount: 15,
                    players: Array.from({ length: 8 }, (_, i) => ({
                        name: `P${i + 1}`,
                        computerControlled: i > 0,
                    })),
                    classicSpells: false,
                }),
            );
            const screen = await renderMenu();
            // The watcher should have upgraded boardSize from 9 to 13.
            await expect
                .element(screen.getByLabelText("Board size:"))
                .toHaveValue("13");
        });

        it("disables the small board option for more than 4 players", async () => {
            const screen = await renderMenu();
            // Open the player config dialog to access the player count select
            await screen
                .getByRole("button", { name: /Configure players/ })
                .click();
            // Switch to 5 players
            await userEvent.selectOptions(
                screen.getByLabelText("Number of players:"),
                "5",
            );
            const boardSizeSelect = screen
                .getByLabelText("Board size:")
                .element() as HTMLSelectElement;
            const smallOption = Array.from(boardSizeSelect.options).find(
                (o) => o.value === "9",
            );
            expect(smallOption?.disabled).toBe(true);
        });
    });
});
