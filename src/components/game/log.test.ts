import { describe, it, expect, vi } from "vitest";
import { defineComponent, ref, type PropType } from "vue";
import { render } from "vitest-browser-vue";

// ── Mock Phaser ─────────────────────────────────────────────────────────────
// logger.ts creates a Phaser EventEmitter at module load time; stub it out so
// tests don't require a real Phaser environment.
vi.mock("phaser", () => ({
    Events: {
        EventEmitter: class MockEventEmitter {
            removeAllListeners = vi.fn();
            on = vi.fn();
            off = vi.fn();
            emit = vi.fn();
        },
    },
}));

import Log from "./Log.vue";
import type { Log as LogEntry } from "../../gameobjects/services/logger";
import { Colour } from "@archaos/engine";

// The colour is bound as inline style on the .game-log__message <span>, not
// the <li>. We read element.style.color directly to avoid CSS-variable
// resolution issues with toHaveStyle (which checks computed style).
function msgStyle(screen: Awaited<ReturnType<typeof render>>) {
    return (screen.getByRole("listitem").first().element().querySelector(".game-log__message") as HTMLElement).style
        .color;
}

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
    return {
        message: "Hello",
        id: 1,
        timestamp: new Date("2024-01-01T12:00:00"),
        ...overrides,
    };
}

/**
 * Renders Log with showTimestamps pre-enabled, using a parent component that
 * sets the exposed ref immediately after the child mounts.
 */
function renderWithTimestamps(logs: LogEntry[]) {
    const logRef = ref<InstanceType<typeof Log> | null>(null);
    const Wrapper = defineComponent({
        components: { Log },
        props: {
            logs: { type: Array as PropType<LogEntry[]>, required: true },
        },
        setup() {
            return { logRef };
        },
        mounted() {
            if (logRef.value) (logRef.value as any).showTimestamps = true;
        },
        template: '<Log ref="logRef" :logs="logs" />',
    });
    return render(Wrapper, { props: { logs } });
}

describe("Log", () => {
    describe("visibility", () => {
        it("does not render when logs array is empty", async () => {
            const screen = await render(Log, { props: { logs: [] } });
            expect(screen.getByRole("list").query()).toBeNull();
        });

        it("renders when at least one log entry exists", async () => {
            const screen = await render(Log, { props: { logs: [makeLog()] } });
            await expect.element(screen.getByRole("list")).toBeInTheDocument();
        });
    });

    describe("sorting and limiting", () => {
        it("renders log entries in descending timestamp order", async () => {
            const logs: LogEntry[] = [
                makeLog({
                    id: 1,
                    message: "First",
                    timestamp: new Date("2024-01-01T10:00:00"),
                }),
                makeLog({
                    id: 2,
                    message: "Second",
                    timestamp: new Date("2024-01-01T11:00:00"),
                }),
                makeLog({
                    id: 3,
                    message: "Third",
                    timestamp: new Date("2024-01-01T12:00:00"),
                }),
            ];
            const screen = await render(Log, { props: { logs } });
            // Expand the log first — in a real browser the minimised CSS hides all
            // but the first item, removing them from the accessibility tree.
            await screen.getByRole("button").click();
            const items = screen.getByRole("listitem").elements();
            await expect.element(items[0]).toHaveTextContent("Third");
            await expect.element(items[1]).toHaveTextContent("Second");
            await expect.element(items[2]).toHaveTextContent("First");
        });

        it("displays at most 25 entries when more are provided", async () => {
            const logs: LogEntry[] = Array.from({ length: 30 }, (_, i) =>
                makeLog({
                    id: i,
                    message: `Entry ${i}`,
                    timestamp: new Date(i * 1000),
                }),
            );
            const screen = await render(Log, { props: { logs } });
            await screen.getByRole("button").click();
            expect(screen.getByRole("listitem").elements()).toHaveLength(25);
        });

        it("shows all entries when fewer than 25 are provided", async () => {
            const logs: LogEntry[] = Array.from({ length: 5 }, (_, i) => makeLog({ id: i, message: `Entry ${i}` }));
            const screen = await render(Log, { props: { logs } });
            await screen.getByRole("button").click();
            expect(screen.getByRole("listitem").elements()).toHaveLength(5);
        });
    });

    describe("toggle", () => {
        it('toggle button shows "+" when minimised (default)', async () => {
            const screen = await render(Log, { props: { logs: [makeLog()] } });
            await expect.element(screen.getByRole("button")).toHaveTextContent("+");
        });

        it('toggle button shows "-" after clicking to expand', async () => {
            const screen = await render(Log, { props: { logs: [makeLog()] } });
            await screen.getByRole("button").click();
            await expect.element(screen.getByRole("button")).toHaveTextContent("-");
        });

        it("adds the minimised class by default", async () => {
            const screen = await render(Log, { props: { logs: [makeLog()] } });
            const root = screen.getByRole("list").element().closest(".game-log") as HTMLElement;
            await expect.element(root).toHaveClass("game-log--minimised");
        });

        it("removes the minimised class after toggling open", async () => {
            const screen = await render(Log, { props: { logs: [makeLog()] } });
            await screen.getByRole("button").click();
            const root = screen.getByRole("list").element().closest(".game-log") as HTMLElement;
            await expect.element(root).not.toHaveClass("game-log--minimised");
        });

        it("re-applies the minimised class after toggling twice", async () => {
            const screen = await render(Log, { props: { logs: [makeLog()] } });
            const btn = screen.getByRole("button");
            await btn.click();
            await btn.click();
            const root = screen.getByRole("list").element().closest(".game-log") as HTMLElement;
            await expect.element(root).toHaveClass("game-log--minimised");
        });
    });

    describe("getColour", () => {
        it("returns the correct CSS variable for a Colour enum value", async () => {
            const screen = await render(Log, {
                props: { logs: [makeLog({ colour: Colour.Red })] },
            });
            expect(msgStyle(screen)).toBe("var(--color-red)");
        });

        it("does not use a CSS variable for a non-enum colour", async () => {
            // Non-enum colours go through the color-mix() branch. We verify the
            // branching logic does NOT produce a CSS variable (which enum colours return).
            const screen = await render(Log, {
                props: { logs: [makeLog({ colour: 0xff8800 as any })] },
            });
            expect(msgStyle(screen)).not.toContain("var(--color-");
        });

        it("defaults to white when no colour is specified", async () => {
            const screen = await render(Log, {
                props: { logs: [makeLog({ colour: undefined })] },
            });
            expect(msgStyle(screen)).toBe("var(--color-white)");
        });
    });

    describe("timestamp formatting", () => {
        it("formats timestamps as HH:MM:SS", async () => {
            // Pin toLocaleString to a stable string independent of test-environment locale.
            const spy = vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("1/1/2024, 12:34:56 PM");

            const screen = await renderWithTimestamps([makeLog({ timestamp: new Date("2024-01-01T12:34:56") })]);
            // formatDate splits by ' ' and takes index [1]: '12:34:56'
            // The template appends ': ' after the time, trimmed to ':' by text().
            await expect.element(screen.getByRole("listitem").first()).toHaveTextContent("12:34:56:");
            spy.mockRestore();
        });
    });
});
