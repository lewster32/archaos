import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
    it("lowercases and trims", () => {
        expect(slugify("Dwarf")).toBe("dwarf");
        expect(slugify("  Dwarf  ")).toBe("dwarf");
    });

    it("replaces whitespace with hyphens", () => {
        expect(slugify("Black Dragon")).toBe("black-dragon");
        expect(slugify("Magic Wood")).toBe("magic-wood");
    });

    it("collapses repeated whitespace and hyphens", () => {
        expect(slugify("Magic   Wood")).toBe("magic-wood");
        expect(slugify("Magic - Wood")).toBe("magic-wood");
    });

    it("strips punctuation other than hyphens", () => {
        expect(slugify("King's Castle!")).toBe("kings-castle");
        expect(slugify("Goblin (small)")).toBe("goblin-small");
    });

    it("preserves digits and underscores", () => {
        expect(slugify("Dwarf 2")).toBe("dwarf-2");
        expect(slugify("foo_bar")).toBe("foo_bar");
    });

    it("returns empty string for empty input", () => {
        expect(slugify("")).toBe("");
        expect(slugify("   ")).toBe("");
        expect(slugify("!@#$")).toBe("");
    });
});
