import { EngineEvent } from "../enums/engineevent";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Spell } from "./spell";
import { RaiseDeadSpell } from "./raisedeadspell";
import { Point } from "../point";
import type { Board } from "../board";
import { makeMockBoard, makeMockPiece, makeMockPlayer } from "./spell.testhelpers";

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
        spell = new RaiseDeadSpell(board, 1, Spell.getSpellProperties("Raise Dead"));
        spell.owner = owner;
    });

    it("returns false when no dead piece in the targets list", async () => {
        const living = makeMockPiece({ dead: false });
        const result = await spell.doCast(owner, castingPiece, new Point(0, 0), [living]);
        expect(result).toBe(false);
    });

    it("reanimates the dead piece and returns true", async () => {
        const corpse = makeMockPiece({ dead: true, name: "Elf" });
        const result = await spell.doCast(owner, castingPiece, new Point(0, 0), [corpse]);
        expect(result).toBe(true);
        expect(corpse.raiseDead).toHaveBeenCalledWith(owner);
    });

    it("logs a reanimation message", async () => {
        const corpse = makeMockPiece({ dead: true, name: "Elf" });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [corpse]);
        expect(board.logger.log as any).toHaveBeenCalledWith(expect.stringContaining("Elf"), expect.anything());
    });

    it("emits sound effect events", async () => {
        const corpse = makeMockPiece({ dead: true });
        await spell.doCast(owner, castingPiece, new Point(0, 0), [corpse]);
        expect((board as any).events.emit).toHaveBeenCalledWith(EngineEvent.EffectRequested, { sound: "cast-beam" });
        expect((board as any).events.emit).toHaveBeenCalledWith(EngineEvent.EffectRequested, { sound: "die" });
    });

    it("plays visuals then calls castFail and returns null when _failed is true", async () => {
        (spell as any)._failed = true;
        const corpse = makeMockPiece({ dead: true, name: "Ghost" });
        const point = new Point(2, 3);

        const result = await spell.doCast(owner, castingPiece, point, [corpse]);

        expect(result).toBeNull();

        // RaiseDeadBeam and RaiseDeadHit should have fired before the branch.
        const emitAsync = (board as any).events.emitAsync as ReturnType<typeof vi.fn>;
        const types = emitAsync.mock.calls.map(([, p]: any) => p?.type).filter(Boolean);
        expect(types).toContain("RaiseDeadBeam");
        expect(types).toContain("RaiseDeadHit");

        // WizardCastFail is emitted by castFail.
        expect(types).toContain("WizardCastFail");

        // Failure is logged, raiseDead was NOT called.
        expect((board as any).logger.log).toHaveBeenCalledWith(
            expect.stringContaining("failed to cast"),
            expect.anything(),
        );
        expect(corpse.raiseDead).not.toHaveBeenCalled();
    });
});
