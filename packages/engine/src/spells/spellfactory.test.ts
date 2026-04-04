import { describe, it, expect } from "vitest";
import { createSpell } from "./spellfactory";
import { AttackSpell } from "./attackspell";
import { DisbelieveSpell } from "./disbelievespell";
import { RaiseDeadSpell } from "./raisedeadspell";
import { Spell } from "./spell";
import { StatusEffectSpell } from "./statuseffectspell";
import { SubversionSpell } from "./subversionspell";
import { SummonSpell } from "./summonspell";
import { TurmoilSpell } from "./turmoilspell";
import { SpellTarget } from "../enums/spelltarget";
import { makeMockBoard, makeConfig } from "./spell.testhelpers";

describe("createSpell", () => {
    const board = makeMockBoard();

    it("creates a SummonSpell when config has unitId", () => {
        const spell = createSpell(board, 1, makeConfig({ unitId: "goblin" }));
        expect(spell).toBeInstanceOf(SummonSpell);
    });

    it("creates a SummonSpell when config has a unit object", () => {
        const spell = createSpell(
            board,
            1,
            makeConfig({ unit: { id: "goblin" } as any }),
        );
        expect(spell).toBeInstanceOf(SummonSpell);
    });

    it("creates an AttackSpell when config has damage", () => {
        const spell = createSpell(board, 1, makeConfig({ damage: 3 }));
        expect(spell).toBeInstanceOf(AttackSpell);
    });

    it('creates a DisbelieveSpell for id "disbelieve"', () => {
        const spell = createSpell(board, 1, makeConfig({ id: "disbelieve" }));
        expect(spell).toBeInstanceOf(DisbelieveSpell);
    });

    it('creates a RaiseDeadSpell for id "raise-dead"', () => {
        const spell = createSpell(board, 1, makeConfig({ id: "raise-dead" }));
        expect(spell).toBeInstanceOf(RaiseDeadSpell);
    });

    it('creates a SubversionSpell for id "subversion"', () => {
        const spell = createSpell(board, 1, makeConfig({ id: "subversion" }));
        expect(spell).toBeInstanceOf(SubversionSpell);
    });

    it('creates a TurmoilSpell for id "turmoil"', () => {
        const spell = createSpell(board, 1, makeConfig({ id: "turmoil" }));
        expect(spell).toBeInstanceOf(TurmoilSpell);
    });

    it("creates a StatusEffectSpell when target is SpellTarget.Self", () => {
        const spell = createSpell(
            board,
            1,
            makeConfig({ target: SpellTarget.Self }),
        );
        expect(spell).toBeInstanceOf(StatusEffectSpell);
    });

    it("creates a base Spell for unrecognised config", () => {
        const spell = createSpell(board, 1, makeConfig());
        expect(spell).toBeInstanceOf(Spell);
        expect(spell.constructor).toBe(Spell);
    });

    it("unitId rule takes priority over damage", () => {
        const spell = createSpell(
            board,
            1,
            makeConfig({ unitId: "goblin", damage: 5 }),
        );
        expect(spell).toBeInstanceOf(SummonSpell);
    });

    it("passes id and config through to the constructed spell", () => {
        const config = makeConfig({ id: "disbelieve", name: "Disbelieve" });
        const spell = createSpell(board, 42, config);
        expect(spell.id).toBe(42);
        expect(spell.name).toBe("Disbelieve");
    });
});
