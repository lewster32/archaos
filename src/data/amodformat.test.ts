import { describe, expect, it } from "vitest";
import { AmodFormatError } from "./amodformat";

describe("AmodFormatError", () => {
    it("is an Error subclass with the right name", () => {
        const e = new AmodFormatError("boom");
        expect(e).toBeInstanceOf(Error);
        expect(e.name).toBe("AmodFormatError");
        expect(e.message).toBe("boom");
    });

    it("preserves an optional cause", () => {
        const cause = new Error("inner");
        const e = new AmodFormatError("outer", cause);
        expect(e.cause).toBe(cause);
    });
});
