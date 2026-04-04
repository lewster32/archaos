import { describe, it, expect, vi } from "vitest";
import { Spell } from "./spell";
import { TurmoilSpell } from "./turmoilspell";
import { UnitType } from "../enums/unittype";
import { EngineEvent } from "../enums/engineevent";
import { Point } from "../point";
import {
    makeMockBoard,
    makeMockPiece,
    makeMockPlayer,
} from "./spell.testhelpers";
import type { TurmoilBatchPayload } from "../actions";

describe("TurmoilSpell.doCast", () => {
    it("emits TurmoilBatch with moves for all live pieces", async () => {
        const piece1 = makeMockPiece({
            x: 1,
            y: 1,
        });
        const piece2 = makeMockPiece({
            id: 2,
            x: 2,
            y: 2,
        });
        const corpse = makeMockPiece({
            dead: true,
            x: 3,
            y: 3,
        });
        const wizard = makeMockPiece({
            type: UnitType.Wizard,
            id: 3,
            x: 0,
            y: 0,
        });
        wizard.owner = null;
        const owner = makeMockPlayer(wizard);
        wizard.owner = owner;
        const randomSpace = new Point(5, 5);
        const board = makeMockBoard();
        (board as any).pieces = [piece1, piece2, corpse, wizard];
        (board as any).getRandomEmptySpace = vi
            .fn()
            .mockReturnValue(randomSpace);

        const config = Spell.getSpellProperties("Turmoil");
        const spell = new TurmoilSpell(board, 1, config);
        spell.owner = owner;

        const result = await spell.doCast(owner, wizard, new Point(0, 0), [
            wizard,
        ]);
        expect(result).toBe(true);

        // Verify pieces were moved
        expect(piece1.moveTo).toHaveBeenCalled();
        expect(piece2.moveTo).toHaveBeenCalled();
        expect(corpse.moveTo).not.toHaveBeenCalled();

        // Verify batch event emitted
        const batchCall = (board.events.emit as any).mock.calls.find(
            (c: any) => c[0] === EngineEvent.TurmoilBatch,
        );
        expect(batchCall).toBeDefined();
        const payload: TurmoilBatchPayload = batchCall[1];
        expect(payload.castingPieceId).toBe(3);
        // 3 live pieces (piece1, piece2, wizard)
        expect(payload.moves).toHaveLength(3);
    });

    it("returns false when no wizard owned by the caster is in the targets list", async () => {
        const creature = makeMockPiece({
            type: UnitType.Creature,
            id: 10,
            x: 1,
            y: 1,
        });
        const wizard = makeMockPiece({
            type: UnitType.Wizard,
            id: 11,
            x: 0,
            y: 0,
        });
        const owner = makeMockPlayer(wizard);
        wizard.owner = owner;
        const board = makeMockBoard();
        (board as any).pieces = [creature];
        const config = Spell.getSpellProperties("Turmoil");
        const spell = new TurmoilSpell(board, 1, config);
        spell.owner = owner;

        const result = await spell.doCast(owner, wizard, new Point(0, 0), [
            creature,
        ]);
        expect(result).toBe(false);
    });

    it("skips a piece when getRandomEmptySpace returns null", async () => {
        const wizard = makeMockPiece({
            type: UnitType.Wizard,
        });
        const owner = makeMockPlayer(wizard);
        wizard.owner = owner;
        const board = makeMockBoard();
        (board as any).pieces = [wizard];
        (board as any).getRandomEmptySpace = vi.fn().mockReturnValue(null);
        const config = Spell.getSpellProperties("Turmoil");
        const spell = new TurmoilSpell(board, 1, config);
        spell.owner = owner;
        const result = await spell.doCast(owner, wizard, new Point(0, 0), [
            wizard,
        ]);
        expect(result).toBe(true);
        expect(wizard.moveTo).not.toHaveBeenCalled();

        const batchCall = (board.events.emit as any).mock.calls.find(
            (c: any) => c[0] === EngineEvent.TurmoilBatch,
        );
        expect(batchCall[1].moves).toHaveLength(0);
    });
});
