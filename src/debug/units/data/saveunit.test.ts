import { describe, expect, it } from "vitest";
import { buildEnhancedJson } from "./saveunit";
import type { EditableSpell } from "./types";

function makeSpell(): EditableSpell {
    return {
        id: "dwarf",
        name: "Dwarf",
        chance: 0.7,
        balance: 2,
        description: "A short fighter.",
        group: "enhanced",
        types: ["ground"],
        spellFrame: 12,
        unit: {
            id: "dwarf",
            name: "Dwarf",
            indefiniteArticle: "a",
            attackType: "hit",
            properties: { mov: 1, com: 6, rcm: 0, rng: 0, def: 5, mnv: 4, res: 7 },
            status: ["spread"],
            animFrames: [0, 1, 2, 1],
            animSpeed: 5,
            shadowScale: 1,
            textures: [
                {
                    image: "dwarf.png",
                    size: { w: 54, h: 54 },
                    frames: [
                        {
                            filename: "dwarf_l_0",
                            frame: { x: 0, y: 0, w: 18, h: 18 },
                        },
                    ],
                },
            ],
        },
        _origin: "enhanced",
        _originalId: "dwarf",
        _dirty: true,
    };
}

describe("buildEnhancedJson", () => {
    it("wraps the spell inside a top-level `spell` field", () => {
        const json = buildEnhancedJson(makeSpell());
        const parsed = JSON.parse(json);
        expect(parsed).toHaveProperty("spell");
        expect(parsed.spell.id).toBe("dwarf");
    });

    it("strips editor-only fields (_origin, _originalId, _dirty)", () => {
        const json = buildEnhancedJson(makeSpell());
        const parsed = JSON.parse(json);
        expect(parsed.spell._origin).toBeUndefined();
        expect(parsed.spell._originalId).toBeUndefined();
        expect(parsed.spell._dirty).toBeUndefined();
    });

    it("strips the unit.textures imageUrl field (editor-only)", () => {
        const spell = makeSpell();
        spell.unit.textures[0].imageUrl = "/should/not/save.png";
        const json = buildEnhancedJson(spell);
        const parsed = JSON.parse(json);
        expect(parsed.spell.unit.textures[0].imageUrl).toBeUndefined();
        expect(parsed.spell.unit.textures[0].image).toBe("dwarf.png");
    });

    it("falls back to spell.name when unit.name is empty", () => {
        const spell = makeSpell();
        spell.unit.name = "";
        const json = buildEnhancedJson(spell);
        const parsed = JSON.parse(json);
        expect(parsed.spell.unit.name).toBe("Dwarf");
    });

    it("preserves a custom unit.name when set", () => {
        const spell = makeSpell();
        spell.unit.name = "Bearded Warrior";
        const json = buildEnhancedJson(spell);
        const parsed = JSON.parse(json);
        expect(parsed.spell.unit.name).toBe("Bearded Warrior");
    });

    it("omits optional fields when undefined", () => {
        const spell = makeSpell();
        spell.description = undefined;
        spell.types = undefined;
        spell.spellFrame = undefined;
        spell.unit.indefiniteArticle = undefined;
        spell.unit.attackType = undefined;
        spell.unit.rangedType = undefined;
        spell.unit.projectileType = undefined;
        spell.unit.animFrames = undefined;
        spell.unit.animSpeed = undefined;
        spell.unit.shadowScale = undefined;
        const json = buildEnhancedJson(spell);
        const parsed = JSON.parse(json);
        expect(parsed.spell).not.toHaveProperty("description");
        expect(parsed.spell).not.toHaveProperty("types");
        expect(parsed.spell).not.toHaveProperty("spellFrame");
        expect(parsed.spell.unit).not.toHaveProperty("indefiniteArticle");
        expect(parsed.spell.unit).not.toHaveProperty("attackType");
        expect(parsed.spell.unit).not.toHaveProperty("rangedType");
        expect(parsed.spell.unit).not.toHaveProperty("projectileType");
        expect(parsed.spell.unit).not.toHaveProperty("animFrames");
        expect(parsed.spell.unit).not.toHaveProperty("animSpeed");
        expect(parsed.spell.unit).not.toHaveProperty("shadowScale");
    });

    it("hard-codes group to 'enhanced' regardless of input", () => {
        const spell = makeSpell();
        // Even if somehow group has drifted, the output is enhanced.
        (spell as unknown as { group: string }).group = "classic";
        const json = buildEnhancedJson(spell);
        const parsed = JSON.parse(json);
        expect(parsed.spell.group).toBe("enhanced");
    });

    it("formats the JSON with 4-space indentation", () => {
        const json = buildEnhancedJson(makeSpell());
        // Top-level "spell" key indented by 4 spaces.
        expect(json).toMatch(/\n {4}"spell": \{/);
    });
});
