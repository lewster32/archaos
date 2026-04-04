import { Board } from "../board";
import { EffectType } from "../enums/effecttype";
import { Colour } from "../enums/colour";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Point } from "../point";

/**
 * Subversion — attempts to transfer ownership of an enemy unit to the caster.
 * Illusionary units always resist. Succeeds or fails based on the target's
 * magic resistance.
 */
export class SubversionSpell extends Spell {
    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Point,
        targets?: Piece[],
    ): Promise<Piece | boolean | null> {
        const target: Piece = targets.find(
            (p: Piece) => p.owner !== this.owner,
        );
        if (!target) {
            return false;
        }

        const rollSuccess: boolean = this._board.roll(
            10,
            target.stats.magicResistance,
            this._owner,
        );

        this._board.sound.play("castloop08");
        await this._board.playEffect(
            EffectType.SubversionBeam,
            castingPiece.sprite.getCenter(),
            target.sprite.getCenter(),
        );
        if (rollSuccess && !target.illusion) {
            this._board.sound.play("spelleffect");
            await this._board.playEffect(
                EffectType.SubversionHit,
                target.sprite.getCenter(),
                null,
                target,
            );
            target.owner = this.owner;
            this._board.logger.log(
                `${target.name} was subverted and now belongs to ${owner.name}`,
            );
        } else {
            this._board.logger.log(
                `${target.name} resisted ${this.name}`,
                Colour.Magenta,
            );
        }
        await this._board.idleDelay(Board.DEFAULT_DELAY);
        return true;
    }
}
