import { UnitType } from "../enums/unittype";
import { SpellTarget } from "../enums/spelltarget";
import { describe, it, expect, vi } from "vitest";
import { StatusEffectSpell } from "./statuseffectspell";
import { Point } from "../point";
import { makeMockBoard, makeMockPiece, makeMockPlayer, makeConfig } from "./spell.testhelpers";

describe("StatusEffectSpell.doCast", () => {
    it("returns false when no matching wizard in targets", async () => {
        const board = makeMockBoard();
        const castingPiece = makeMockPiece();
        const owner = makeMockPlayer(castingPiece);
        const s = new StatusEffectSpell(board, 1, makeConfig({ target: SpellTarget.Self, id: "shadow-form" }));
        s.owner = owner;
        const result = await s.doCast(owner, castingPiece, new Point(0, 0), [
            makeMockPiece({ type: UnitType.Creature }),
        ]);
        expect(result).toBe(false);
    });

    it("returns false when wizard in targets, but not owned by caster", async () => {
        const board = makeMockBoard();
        const castingPiece = makeMockPiece();
        const owner = makeMockPlayer(castingPiece);
        const s = new StatusEffectSpell(board, 1, makeConfig({ target: SpellTarget.Self, id: "shadow-form" }));
        s.owner = owner;
        const result = await s.doCast(owner, castingPiece, new Point(0, 0), [
            makeMockPiece({ type: UnitType.Wizard, owner: { id: 99 } }),
        ]);
        expect(result).toBe(false);
    });

    it("applies status and returns true for a matching wizard", async () => {
        const board = makeMockBoard();
        const castingPiece = makeMockPiece();
        const owner = makeMockPlayer(castingPiece);
        const s = new StatusEffectSpell(board, 1, makeConfig({ target: SpellTarget.Self, id: "shadow-form" }));
        s.owner = owner;
        const wizard = makeMockPiece({ type: UnitType.Wizard, owner });
        wizard.addStatus = vi.fn().mockReturnValue(true);
        const result = await s.doCast(owner, castingPiece, new Point(0, 0), [wizard]);
        expect(result).toBe(true);
        expect(wizard.addStatus).toHaveBeenCalled();
    });

    it('logs "already has" message when addStatus returns false', async () => {
        const board = makeMockBoard();
        const castingPiece = makeMockPiece();
        const owner = makeMockPlayer(castingPiece);
        const s = new StatusEffectSpell(
            board,
            1,
            makeConfig({
                target: SpellTarget.Self,
                id: "shadow-form",
                name: "Shadow Form",
            }),
        );
        s.owner = owner;
        const wizard = makeMockPiece({
            type: UnitType.Wizard,
            owner,
            name: "Zack",
        });
        wizard.addStatus = vi.fn().mockReturnValue(false);
        await s.doCast(owner, castingPiece, new Point(0, 0), [wizard]);
        expect(board.logger.log as any).toHaveBeenCalledWith(expect.stringContaining("already has"), expect.anything());
    });

    it("returns true and logs success when id is not in statusMap (no status effect applied)", async () => {
        const board = makeMockBoard();
        const castingPiece = makeMockPiece();
        const owner = makeMockPlayer(castingPiece);
        const s = new StatusEffectSpell(board, 1, makeConfig({ target: SpellTarget.Self, id: "unknown-self-spell" }));
        s.owner = owner;
        const wizard = makeMockPiece({ type: UnitType.Wizard, owner });
        const result = await s.doCast(owner, castingPiece, new Point(0, 0), [wizard]);
        expect(result).toBe(true);
        expect(wizard.addStatus).not.toHaveBeenCalled();
    });

    it("plays visuals then calls castFail and returns null when _failed is true", async () => {
        const board = makeMockBoard();
        const castingPiece = makeMockPiece();
        const owner = makeMockPlayer(castingPiece);
        const wizard = makeMockPiece({ type: UnitType.Wizard, owner });
        const s = new StatusEffectSpell(board, 1, makeConfig({ target: SpellTarget.Self, id: "shadow-form" }));
        s.owner = owner;
        (s as any)._failed = true;

        const result = await s.doCast(owner, castingPiece, undefined, [wizard]);

        expect(result).toBeNull();

        // WizardCasting should have fired before the failure branch.
        const emitAsync = (board as any).events.emitAsync as ReturnType<typeof vi.fn>;
        const types = emitAsync.mock.calls.map(([, p]: any) => p?.type).filter(Boolean);
        expect(types).toContain("WizardCasting");

        // WizardCastFail is emitted by castFail.
        expect(types).toContain("WizardCastFail");

        // Failure is logged.
        expect((board as any).logger.log).toHaveBeenCalledWith(
            expect.stringContaining("failed to cast"),
            expect.anything(),
        );

        // No status was applied.
        expect(wizard.addStatus).not.toHaveBeenCalled();
    });
});
