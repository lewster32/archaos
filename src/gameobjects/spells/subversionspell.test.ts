import { describe, it, expect, beforeEach, vi } from "vitest";
import "../wizard";
import { Spell } from "./spell";
import { SubversionSpell } from "./subversionspell";
import { Geom } from "phaser";
import type { Board } from "../board";
import {
    makeMockBoard,
    makeMockPiece,
    makeMockPlayer,
} from "./spell.testhelpers";

describe("SubversionSpell.doCast", () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;
    let spell: SubversionSpell;

    beforeEach(() => {
        castingPiece = makeMockPiece();
        owner = makeMockPlayer(castingPiece);
        board = makeMockBoard({ players: [{ ai: null }] });
        spell = new SubversionSpell(
            board,
            1,
            Spell.getSpellProperties("Subversion"),
        );
        spell.owner = owner;
    });

    it("returns false when no enemy piece in the targets list", async () => {
        const result = await spell.doCast(
            owner,
            castingPiece,
            new Geom.Point(0, 0),
            [],
        );
        expect(result).toBe(false);
    });

    it("returns true when an enemy piece is present (regardless of roll outcome)", async () => {
        const enemy = makeMockPiece({ owner: { id: 99 }, illusion: false });
        const result = await spell.doCast(
            owner,
            castingPiece,
            new Geom.Point(0, 0),
            [enemy],
        );
        expect(result).toBe(true);
    });

    it("transfers ownership on a successful roll against a real piece", async () => {
        (board as any).roll = vi.fn().mockReturnValue(true);
        const enemy = makeMockPiece({ owner: { id: 99 }, illusion: false });
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [enemy]);
        expect(enemy.owner).toBe(owner);
    });

    it("does not transfer ownership when roll fails", async () => {
        (board as any).roll = vi.fn().mockReturnValue(false);
        const originalOwner = { id: 99 };
        const enemy = makeMockPiece({ owner: originalOwner, illusion: false });
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [enemy]);
        expect(enemy.owner).toBe(originalOwner);
    });

    it("does not transfer ownership for illusionary pieces even on roll success", async () => {
        (board as any).roll = vi.fn().mockReturnValue(true);
        const originalOwner = { id: 99 };
        const illusion = makeMockPiece({
            owner: originalOwner,
            illusion: true,
        });
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [
            illusion,
        ]);
        expect(illusion.owner).toBe(originalOwner);
    });

    it("logs resistance message when roll fails", async () => {
        (board as any).roll = vi.fn().mockReturnValue(false);
        const enemy = makeMockPiece({
            owner: { id: 99 },
            illusion: false,
            name: "Dragon",
        });
        await spell.doCast(owner, castingPiece, new Geom.Point(0, 0), [enemy]);
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining("Dragon"),
            expect.anything(),
        );
    });
});
