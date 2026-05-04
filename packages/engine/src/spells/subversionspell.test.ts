import { describe, it, expect, beforeEach, vi } from "vitest";
import { Spell } from "./spell";
import { SubversionSpell } from "./subversionspell";
import { Point } from "../point";
import type { Board } from "../board";
import { makeMockBoard, makeMockPiece, makeMockPlayer } from "./spell.testhelpers";

describe("SubversionSpell.doCast", () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;
    let spell: SubversionSpell;

    beforeEach(() => {
        castingPiece = makeMockPiece();
        owner = makeMockPlayer(castingPiece);
        board = makeMockBoard({ players: [{ ai: null }] });
        spell = new SubversionSpell(board, 1, Spell.getSpellProperties("Subversion"));
        spell.owner = owner;
    });

    it("returns false when no enemy piece in the targets list", async () => {
        const result = await spell.doCast(owner, castingPiece, new Point(0, 0), []);
        expect(result).toBe(false);
    });

    it("returns true when an enemy piece is present (regardless of roll outcome)", async () => {
        const enemy = makeMockPiece({ owner: { id: 99 }, illusion: false });
        const result = await spell.doCast(owner, castingPiece, new Point(0, 0), [enemy]);
        expect(result).toBe(true);
    });

    it("transfers ownership on a successful roll against a real piece", async () => {
        (board as any).roll = vi.fn().mockReturnValue(true);
        const enemy = makeMockPiece({ owner: { id: 99 }, illusion: false });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [enemy]);
        expect(enemy.owner).toBe(owner);
    });

    it("does not transfer ownership when roll fails", async () => {
        (board as any).roll = vi.fn().mockReturnValue(false);
        const originalOwner = { id: 99 };
        const enemy = makeMockPiece({ owner: originalOwner, illusion: false });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [enemy]);
        expect(enemy.owner).toBe(originalOwner);
    });

    it("does not transfer ownership for illusionary pieces even on roll success", async () => {
        (board as any).roll = vi.fn().mockReturnValue(true);
        const originalOwner = { id: 99 };
        const illusion = makeMockPiece({
            owner: originalOwner,
            illusion: true,
        });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [illusion]);
        expect(illusion.owner).toBe(originalOwner);
    });

    it("logs resistance message when roll fails", async () => {
        (board as any).roll = vi.fn().mockReturnValue(false);
        const enemy = makeMockPiece({
            owner: { id: 99 },
            illusion: false,
            name: "Dragon",
        });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [enemy]);
        expect(board.logger.log as any).toHaveBeenCalledWith(expect.stringContaining("Dragon"), expect.anything());
    });

    it("plays visuals then calls castFail and returns null when _failed is true", async () => {
        (spell as any)._failed = true;
        const enemy = makeMockPiece({ owner: { id: 99 }, illusion: false });
        const point = new Point(2, 2);

        const result = await spell.doCast(owner, castingPiece, point, [enemy]);

        expect(result).toBeNull();

        // SubversionBeam should have fired before the branch.
        const emitAsync = (board as any).events.emitAsync as ReturnType<typeof vi.fn>;
        const types = emitAsync.mock.calls.map(([, p]: any) => p?.type).filter(Boolean);
        expect(types).toContain("SubversionBeam");

        // WizardCastFail is emitted by castFail.
        expect(types).toContain("WizardCastFail");

        // Failure is logged; ownership unchanged.
        expect((board as any).logger.log).toHaveBeenCalledWith(
            expect.stringContaining("failed to cast"),
            expect.anything(),
        );
        expect(enemy.owner).toEqual({ id: 99 });
    });
});
