import { describe, it, expect, beforeEach, vi } from "vitest";
import { Spell } from "./spell";
import { DisbelieveSpell } from "./disbelievespell";
import { Point } from "../point";
import type { Board } from "../board";
import { makeMockBoard, makeMockPiece, makeMockPlayer } from "./spell.testhelpers";

describe("DisbelieveSpell.doCast", () => {
    let board: Board;
    let owner: any;
    let castingPiece: any;
    let spell: DisbelieveSpell;

    beforeEach(() => {
        castingPiece = makeMockPiece();
        const mockAI = { rememberNonIllusionPiece: vi.fn() };
        owner = { ...makeMockPlayer(castingPiece), ai: mockAI };
        board = makeMockBoard({ players: [{ ai: mockAI }] });
        spell = new DisbelieveSpell(board, 1, Spell.getSpellProperties("Disbelieve"));
        spell.owner = owner;
    });

    it("returns false when no disbelievable target in the list", async () => {
        const result = await spell.doCast(owner, castingPiece, new Point(0, 0), [
            makeMockPiece({ canBeDisbelieved: false }),
        ]);
        expect(result).toBe(false);
    });

    it("dispells an illusionary target and returns true", async () => {
        const illusion = makeMockPiece({
            canBeDisbelieved: true,
            illusion: true,
        });
        const result = await spell.doCast(owner, castingPiece, new Point(0, 0), [illusion]);
        expect(result).toBe(true);
        expect(illusion.kill).toHaveBeenCalledTimes(1);
    });

    it("does not dispell a non-illusionary target", async () => {
        const nonIllusion = makeMockPiece({
            canBeDisbelieved: true,
            illusion: false,
        });
        const result = await spell.doCast(owner, castingPiece, new Point(0, 0), [nonIllusion]);
        expect(result).toBe(true);
        expect(nonIllusion.kill).not.toHaveBeenCalled();
    });

    it("logs success message containing target name for illusion", async () => {
        const illusion = makeMockPiece({
            canBeDisbelieved: true,
            illusion: true,
            name: "Dragon",
        });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [illusion]);
        expect(board.logger.log as any).toHaveBeenCalledWith(expect.stringContaining("Dragon"));
    });

    it("logs failure message for non-illusionary target", async () => {
        const nonIllusion = makeMockPiece({
            canBeDisbelieved: true,
            illusion: false,
            name: "Lion",
        });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [nonIllusion]);
        expect(board.logger.log as any).toHaveBeenCalledWith(expect.stringContaining("Lion"), expect.anything());
    });

    it("plays visuals then calls castFail and returns null when _failed is true", async () => {
        (spell as any)._failed = true;
        const target = makeMockPiece({ canBeDisbelieved: true, illusion: true });
        const point = new Point(1, 2);

        const result = await spell.doCast(owner, castingPiece, point, [target]);

        expect(result).toBeNull();

        // DisbelieveBeam should have fired before the branch.
        const emitAsync = (board as any).events.emitAsync as ReturnType<typeof vi.fn>;
        const types = emitAsync.mock.calls.map(([, p]: any) => p?.type).filter(Boolean);
        expect(types).toContain("DisbelieveBeam");

        // WizardCastFail is emitted by castFail.
        expect(types).toContain("WizardCastFail");

        // Failure is logged; kill was NOT called.
        expect((board as any).logger.log).toHaveBeenCalledWith(
            expect.stringContaining("failed to cast"),
            expect.anything(),
        );
        expect(target.kill).not.toHaveBeenCalled();
    });
});
