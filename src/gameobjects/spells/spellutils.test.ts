import { describe, it, expect } from "vitest";
import {
    chancePercent,
    chanceRounded,
    balanceIndicator,
    friendlyBalance,
} from "./spellutils";
import type { Spell } from "./spell";

describe("chancePercent", () => {
    it("converts 0 to 0%", () => {
        expect(chancePercent(0)).toBe(0);
    });

    it("converts 0.5 to 50%", () => {
        expect(chancePercent(0.5)).toBe(50);
    });

    it("converts 1 to 100%", () => {
        expect(chancePercent(1)).toBe(100);
    });

    it("rounds 0.333 down to 33%", () => {
        expect(chancePercent(0.333)).toBe(33);
    });

    it("rounds 0.335 up to 34%", () => {
        expect(chancePercent(0.335)).toBe(34);
    });

    it("rounds 0.005 up to 1%", () => {
        expect(chancePercent(0.005)).toBe(1);
    });
});

describe("chanceRounded", () => {
    it("converts 0 to 0", () => {
        expect(chanceRounded(0)).toBe(0);
    });

    it("converts 0.15 to 10 (floor to nearest 10)", () => {
        expect(chanceRounded(0.15)).toBe(10);
    });

    it("converts 0.99 to 90", () => {
        expect(chanceRounded(0.99)).toBe(90);
    });

    it("converts 1.0 to 100", () => {
        expect(chanceRounded(1.0)).toBe(100);
    });

    it("converts 0.09 to 0", () => {
        expect(chanceRounded(0.09)).toBe(0);
    });

    it("converts 0.1 to 10 (exact boundary)", () => {
        expect(chanceRounded(0.1)).toBe(10);
    });
});

// balance() accepts any object with a `balance: number` property
describe("balance", () => {
    const spell = (b: number) => ({ balance: b }) as Pick<Spell, "balance">;

    it('returns "-" for neutral (balance 0)', () => {
        expect(balanceIndicator(spell(0) as Spell)).toBe("-");
    });

    it('returns "^" for lawful balance of 1', () => {
        expect(balanceIndicator(spell(1) as Spell)).toBe("^");
    });

    it('returns "^^^" for lawful balance of 3', () => {
        expect(balanceIndicator(spell(3) as Spell)).toBe("^^^");
    });

    it('returns "^^^^" for lawful balance of 4 (maximum)', () => {
        expect(balanceIndicator(spell(4) as Spell)).toBe("^^^^");
    });

    it("caps lawful symbols at 4 when balance exceeds 4", () => {
        expect(balanceIndicator(spell(10) as Spell)).toBe("^^^^");
    });

    it('returns "*" for chaotic balance of -1', () => {
        expect(balanceIndicator(spell(-1) as Spell)).toBe("*");
    });

    it('returns "**" for chaotic balance of -2', () => {
        expect(balanceIndicator(spell(-2) as Spell)).toBe("**");
    });

    it("caps chaotic symbols at 4 when balance is below -4", () => {
        expect(balanceIndicator(spell(-5) as Spell)).toBe("****");
    });
});

describe("friendlyBalance", () => {
    it('returns "No effect on balance" for 0', () => {
        expect(friendlyBalance(0)).toBe("No effect on balance");
    });

    it('returns "slightly" description for lawful balance of 1', () => {
        expect(friendlyBalance(1)).toBe("Increases lawfulness slightly");
    });

    it('returns "moderately" description for lawful balance of 2', () => {
        expect(friendlyBalance(2)).toBe("Increases lawfulness moderately");
    });

    it('returns "highly" description for lawful balance of 3', () => {
        expect(friendlyBalance(3)).toBe("Increases lawfulness highly");
    });

    it('returns "greatly" description for lawful balance of 4', () => {
        expect(friendlyBalance(4)).toBe("Increases lawfulness greatly");
    });

    it('caps at "greatly" for lawful balance above 4', () => {
        expect(friendlyBalance(10)).toBe("Increases lawfulness greatly");
    });

    it('returns "slightly" description for chaotic balance of -1', () => {
        expect(friendlyBalance(-1)).toBe("Increases chaos slightly");
    });

    it('returns "greatly" description for chaotic balance of -4', () => {
        expect(friendlyBalance(-4)).toBe("Increases chaos greatly");
    });

    it('caps at "greatly" for chaotic balance below -4', () => {
        expect(friendlyBalance(-10)).toBe("Increases chaos greatly");
    });
});
