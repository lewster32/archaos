import type { SpellConfig } from "../configs/spellconfig";
import { SpellTarget } from "../enums/spelltarget";
import type { Board } from "../board";
import { AttackSpell } from "./attackspell";
import { DisbelieveSpell } from "./disbelievespell";
import { RaiseDeadSpell } from "./raisedeadspell";
import { Spell } from "./spell";
import { StatusEffectSpell } from "./statuseffectspell";
import { SubversionSpell } from "./subversionspell";
import { SummonSpell } from "./summonspell";
import { TurmoilSpell } from "./turmoilspell";

type SpellConstructor = new (
    board: Board,
    id: number,
    config: SpellConfig,
) => Spell;

/**
 * An array of rules to determine which Spell subclass to instantiate based on
 * the provided configuration.
 */
const SPELL_RULES: [(config: SpellConfig) => boolean, SpellConstructor][] = [
    [(c) => !!(c.unitId || c.unit), SummonSpell],
    [(c) => !!c.damage, AttackSpell],
    [(c) => c.id === "disbelieve", DisbelieveSpell],
    [(c) => c.id === "raise-dead", RaiseDeadSpell],
    [(c) => c.id === "subversion", SubversionSpell],
    [(c) => c.id === "turmoil", TurmoilSpell],
    [(c) => c.target === SpellTarget.Self, StatusEffectSpell],
];

/**
 * Factory function to create a Spell instance based on the provided
 * configuration. It checks the configuration against a set of rules to
 * determine which specific Spell subclass to instantiate. If no specific match
 * is found, it defaults to creating a generic Spell instance.
 *
 * @param board The game board instance the spell will interact with.
 * @param id The unique identifier for the spell instance.
 * @param config The configuration object that defines the spell's properties and behavior.
 * @returns An instance of a Spell subclass that matches the provided configuration, or a generic Spell if no specific match is found.
 */
export function createSpell(
    board: Board,
    id: number,
    config: SpellConfig,
): Spell {
    const SpellClass =
        SPELL_RULES.find(([match]) => match(config))?.[1] ?? Spell;
    return new SpellClass(board, id, config);
}
