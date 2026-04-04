import { Colour } from "../enums/colour";
import { UnitStatus } from "../enums/unitstatus";
import { UnitType } from "../enums/unittype";
import { Board } from "../board";
import { EffectType } from "../enums/effecttype";
import { EngineEvent } from "../enums/engineevent";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Point } from "../point";

/**
 * A self-targeting spell that grants a status effect to the casting wizard.
 * Covers shadow form and all magic equipment spells.
 */
export class StatusEffectSpell<P extends Piece = Piece> extends Spell<P> {
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
        owner: Player<P>,
        castingPiece: P,
        point?: Point,
        targets?: P[],
    ): Promise<P | boolean | null> {
        const target: P = targets.find(
            (p: P) => p.type === UnitType.Wizard && p.owner === this.owner,
        );
        if (!target) {
            return false;
        }

        this._board.events.emit(EngineEvent.EffectRequested, {
            sound: "spelleffect",
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.WizardCasting,
            pieceId: target.id,
        });

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
