import { describe, it, expect } from "vitest";
import { render } from "vitest-browser-vue";
import UnitStats from "./UnitStats.vue";
import type { UnitConfig } from "../gameobjects/interfaces/ui";

function makeUnit(overrides: Partial<UnitConfig> = {}): UnitConfig {
    return {
        attackType: "melee",
        rangedType: "",
        projectileType: "",
        properties: { mov: 2, com: 3, rcm: 0, rng: 0, def: 4, mnv: 3, res: 2 },
        status: [],
        name: "Test Unit",
        dead: false,
        wizard: false,
        ...overrides,
    };
}

describe("UnitStats", () => {
    describe("movement / flying icon", () => {
        it("shows the movement stat title when not flying", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit() },
            });
            await expect
                .element(screen.getByTitle("Movement range: 2"))
                .toBeInTheDocument();
        });

        it("shows the fly stat title when the unit has flying status", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ status: ["flying"] }) },
            });
            await expect
                .element(screen.getByTitle("Flying range: 2"))
                .toBeInTheDocument();
        });

        it("does not show flying stat title when not flying", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit() },
            });
            expect(screen.getByTitle("Flying range: 2").query()).toBeNull();
        });
    });

    describe("ranged combat stats", () => {
        it("hides ranged combat stat when rcm is 0", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit() },
            });
            expect(
                screen.getByTitle("Ranged combat rating: 0").query(),
            ).toBeNull();
        });

        it("shows ranged combat stat when rcm is non-zero", async () => {
            const screen = await render(UnitStats, {
                props: {
                    unit: makeUnit({
                        properties: {
                            mov: 2,
                            com: 3,
                            rcm: 4,
                            rng: 6,
                            def: 4,
                            mnv: 3,
                            res: 2,
                        },
                    }),
                },
            });
            await expect
                .element(screen.getByTitle("Ranged combat rating: 4"))
                .toBeInTheDocument();
            await expect
                .element(screen.getByTitle("Ranged combat range: 6"))
                .toBeInTheDocument();
        });
    });

    describe("status badges", () => {
        it("shows Wizard badge for wizard units", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ wizard: true }) },
            });
            await expect.element(screen.getByText("Wizard")).toBeVisible();
        });

        it("does not show Wizard badge for non-wizard units", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit() },
            });
            expect(screen.getByText("Wizard").query()).toBeNull();
        });

        it("shows Dead badge for dead units", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ dead: true }) },
            });
            await expect.element(screen.getByText("Dead")).toBeVisible();
        });

        it("does not show Dead badge for living units", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit() },
            });
            expect(screen.getByText("Dead").query()).toBeNull();
        });

        it("shows Flying badge for units with flying status", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ status: ["flying"] }) },
            });
            await expect.element(screen.getByText("Flying")).toBeVisible();
        });

        it("shows Undead badge for units with undead status", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ status: ["undead"] }) },
            });
            await expect.element(screen.getByText("Undead")).toBeVisible();
        });

        it("shows Mountable badge for units with mount status", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ status: ["mount"] }) },
            });
            await expect.element(screen.getByText("Mountable")).toBeVisible();
        });

        it("shows Mountable badge for units with mountAny status", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ status: ["mountAny"] }) },
            });
            await expect.element(screen.getByText("Mountable")).toBeVisible();
        });

        it("shows Spreads badge for units with spread status", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ status: ["spread"] }) },
            });
            await expect.element(screen.getByText("Spreads")).toBeVisible();
        });

        it("shows Invulnerable badge for units with invuln status", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ status: ["invuln"] }) },
            });
            await expect
                .element(screen.getByText("Invulnerable"))
                .toBeVisible();
        });

        it("shows Tree badge for units with tree status", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ status: ["tree"] }) },
            });
            await expect.element(screen.getByText("Tree")).toBeVisible();
        });

        it("shows Expires badge for units with expires status", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ status: ["expires"] }) },
            });
            await expect.element(screen.getByText("Expires")).toBeVisible();
        });
    });

    describe("owner display", () => {
        it("shows owner name when provided and not a wizard", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit(), owner: "Gandalf" },
            });
            await expect.element(screen.getByText("Gandalf")).toBeVisible();
        });

        it("does not show Owned-by text for wizard units", async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit({ wizard: true }), owner: "Gandalf" },
            });
            expect(screen.getByText("Owned by").query()).toBeNull();
        });

        it('shows "Mounted by" label when isMount is true', async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit(), owner: "Gandalf", isMount: true },
            });
            await expect.element(screen.getByText(/Mounted by/)).toBeVisible();
        });

        it('shows "Owned by" label when isMount is false', async () => {
            const screen = await render(UnitStats, {
                props: { unit: makeUnit(), owner: "Gandalf", isMount: false },
            });
            await expect.element(screen.getByText(/Owned by/)).toBeVisible();
        });
    });

    describe("itemNumClass", () => {
        it("applies the correct numeral class for stats 1–10", async () => {
            for (let n = 1; n <= 10; n++) {
                const screen = await render(UnitStats, {
                    props: {
                        unit: makeUnit({
                            properties: {
                                mov: n,
                                com: n,
                                rcm: 0,
                                rng: 0,
                                def: n,
                                mnv: n,
                                res: n,
                            },
                        }),
                    },
                });
                await expect
                    .element(screen.getByTitle(`Movement range: ${n}`))
                    .toHaveClass(`unit-properties__item--num-${n}`);
            }
        });

        it("applies no numeral class for stat value 0", async () => {
            const screen = await render(UnitStats, {
                props: {
                    unit: makeUnit({
                        properties: {
                            mov: 0,
                            com: 0,
                            rcm: 0,
                            rng: 0,
                            def: 0,
                            mnv: 0,
                            res: 0,
                        },
                    }),
                },
            });
            await expect
                .element(screen.getByTitle("Movement range: 0"))
                .not.toHaveClass("unit-properties__item--num-0");
        });

        it("applies no numeral class for stat value 11 or above", async () => {
            const screen = await render(UnitStats, {
                props: {
                    unit: makeUnit({
                        properties: {
                            mov: 11,
                            com: 11,
                            rcm: 0,
                            rng: 0,
                            def: 11,
                            mnv: 11,
                            res: 11,
                        },
                    }),
                },
            });
            await expect
                .element(screen.getByTitle("Movement range: 11"))
                .not.toHaveClass("unit-properties__item--num-11");
        });
    });
});
