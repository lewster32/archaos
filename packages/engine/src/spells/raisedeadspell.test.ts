import { describe, it, expect, beforeEach, vi } from "vitest";
import { Spell } from "./spell";
import { RaiseDeadSpell } from "./raisedeadspell";
import { Point } from "../point";
import type { Board } from "../board";
import {
    makeMockBoard,
    makeMockPiece,
    makeMockPlayer,
} from "./spell.testhelpers";

describe("RaiseDeadSpell.doCast", () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;
    let spell: RaiseDeadSpell;

    beforeEach(() => {
        castingPiece = makeMockPiece();
        const mockAI = { rememberNonIllusionPiece: vi.fn() };
        owner = { ...makeMockPlayer(castingPiece), ai: mockAI };
        board = makeMockBoard({ players: [{ ai: mockAI }] });
        spell = new RaiseDeadSpell(
            board,
            1,
            Spell.getSpellProperties("Raise Dead"),
        );
        spell.owner = owner;
    });

    it("returns false when no dead piece in the targets list", async () => {
        const living = makeMockPiece({ dead: false });
        const result = await spell.doCast(
            owner,
            castingPiece,
            new Point(0, 0),
            [living],
        );
        expect(result).toBe(false);
    });

    it("reanimates the dead piece and returns true", async () => {
        const corpse = makeMockPiece({ dead: true, name: "Elf" });
        const result = await spell.doCast(
            owner,
            castingPiece,
            new Point(0, 0),
            [corpse],
        );
        expect(result).toBe(true);
        expect(corpse.raiseDead).toHaveBeenCalledWith(owner);
    });

    it("logs a reanimation message", async () => {
        const corpse = makeMockPiece({ dead: true, name: "Elf" });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [corpse]);
        expect(board.logger.log as any).toHaveBeenCalledWith(
            expect.stringContaining("Elf"),
            expect.anything(),
        );
    });

    it("plays sound effects", async () => {
        const corpse = makeMockPiece({ dead: true });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [corpse]);
        expect((board as any).sound.play).toHaveBeenCalledWith("castloop08");
        expect((board as any).sound.play).toHaveBeenCalledWith("spelleffect");
    });
});
