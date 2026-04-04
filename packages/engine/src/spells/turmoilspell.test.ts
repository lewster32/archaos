import { describe, it, expect } from "vitest";
import { Spell } from "./spell";
import { TurmoilSpell } from "./turmoilspell";
import { UnitType } from "../enums/unittype";
import { Point } from "../point";
import {
    makeMockBoard,
    makeMockPiece,
    makeMockPlayer,
} from "./spell.testhelpers";
import { vi } from "vitest";

describe("TurmoilSpell.doCast", () => {
    it("moves all non-dead pieces to random empty spaces and returns true", async () => {
        const piece1 = makeMockPiece({ x: 1, y: 1 });
        const piece2 = makeMockPiece({ id: 2, x: 2, y: 2 });
        const corpse = makeMockPiece({ dead: true, x: 3, y: 3 });
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
        (board as any).getIsoPosition = vi.fn().mockReturnValue(randomSpace);

        const turmoilConfig = Spell.getSpellProperties("Turmoil");
        const spell = new TurmoilSpell(board, 1, turmoilConfig);
        spell.owner = owner;

        const result = await spell.doCast(owner, wizard, new Point(0, 0), [
            wizard,
        ]);
        expect(result).toBe(true);
        expect(piece1.moveTo).toHaveBeenCalled();
        expect(piece2.moveTo).toHaveBeenCalled();
        expect(wizard.moveTo).toHaveBeenCalled();
        // Dead pieces should not be moved
        expect(corpse.moveTo).not.toHaveBeenCalled();
    });

    it("returns false when no wizard owned by the caster is in the targets list", async () => {
        // targets list contains only a non-wizard piece — find() returns undefined
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
        const turmoilConfig = Spell.getSpellProperties("Turmoil");
        const spell = new TurmoilSpell(board, 1, turmoilConfig);
        spell.owner = owner;

        // Pass creature (not a wizard) as the only target
        const result = await spell.doCast(owner, wizard, new Point(0, 0), [
            creature,
        ]);
        expect(result).toBe(false);
    });

    it("skips a piece when getRandomEmptySpace returns null", async () => {
        const wizard = makeMockPiece({ type: UnitType.Wizard });
        const owner = makeMockPlayer(wizard);
        wizard.owner = owner;
        const board = makeMockBoard();
        (board as any).pieces = [wizard];
        (board as any).getRandomEmptySpace = vi.fn().mockReturnValue(null);
        const turmoilConfig = Spell.getSpellProperties("Turmoil");
        const spell = new TurmoilSpell(board, 1, turmoilConfig);
        spell.owner = owner;
        await spell.doCast(owner, wizard, new Point(0, 0), [wizard]);
        expect(wizard.moveTo).not.toHaveBeenCalled();
    });
});
