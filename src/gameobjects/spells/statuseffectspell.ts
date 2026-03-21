import { Board } from "../board";
import { EffectType } from "../effectemitter";
import { Colour } from "../enums/colour";
import { UnitStatus } from "../enums/unitstatus";
import { UnitType } from "../enums/unittype";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Geom } from "phaser";

/**
 * A self-targeting spell that grants a status effect to the casting wizard.
 * Covers shadow form and all magic equipment spells.
 */
export class StatusEffectSpell extends Spell {
    private static readonly STATUS_MAP: { [key: string]: UnitStatus } = {
        "shadow-form": UnitStatus.ShadowForm,
        "magic-knife": UnitStatus.MagicKnife,
        "magic-sword": UnitStatus.MagicSword,
        "magic-shield": UnitStatus.MagicShield,
        "magic-armour": UnitStatus.MagicArmour,
        "magic-bow": UnitStatus.MagicBow,
        "magic-wings": UnitStatus.MagicWings,
    };

    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Geom.Point,
        targets?: Piece[],
    ): Promise<Piece | boolean | null> {
        const target: Piece = targets.find(
            (p: Piece) => p.type === UnitType.Wizard && p.owner === this.owner,
        );
        if (!target) {
            return false;
        }

        this._board.sound.play("spelleffect");
        await this._board.playEffect(
            EffectType.WizardCasting,
            target.sprite.getCenter(),
            null,
            target,
        );

        if (this.properties.id in StatusEffectSpell.STATUS_MAP) {
            if (
                !target.addStatus(
                    StatusEffectSpell.STATUS_MAP[this.properties.id],
                )
            ) {
                this._board.logger.log(
                    `${target.name} already has ${this.name} - this spell has no effect`,
                    Colour.Magenta,
                );
                await this._board.idleDelay(Board.DEFAULT_DELAY);
                return true;
            }
        }

        this._board.logger.log(
            `${target.name} successfully casts '${this.name}'`,
            Colour.Green,
        );

        await this._board.idleDelay(Board.DEFAULT_DELAY);
        return true;
    }
}
