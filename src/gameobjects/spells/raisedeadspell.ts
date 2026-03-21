import { Board } from "../board";
import { EffectType } from "../effectemitter";
import { Colour } from "../enums/colour";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Geom } from "phaser";

/**
 * Raise Dead — reanimates a target corpse and transfers ownership to the
 * casting wizard.
 */
export class RaiseDeadSpell extends Spell {
    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Geom.Point,
        targets?: Piece[],
    ): Promise<Piece | boolean | null> {
        const target: Piece = targets.find((p: Piece) => p.dead);
        if (!target) {
            return false;
        }
        this._board.sound.play("castloop08");
        await this._board.playEffect(
            EffectType.RaiseDeadBeam,
            castingPiece.sprite.getCenter(),
            target.sprite.getCenter(),
        );
        this._board.sound.play("spelleffect");
        await this._board.playEffect(
            EffectType.RaiseDeadHit,
            target.sprite.getCenter(),
            null,
            target,
        );
        await target.raiseDead(this.owner);
        this._board.logger.log(
            `${target.name} was reanimated and now belongs to ${owner.name}`,
            Colour.LightBlue,
        );

        // Raised dead units are not illusionary, since they came from a
        // corpse and illusionary units don't leave corpses. Ipso facto.
        this._board.players.forEach((player: Player) => {
            player.ai?.rememberNonIllusionPiece(target.id);
        });

        await this._board.idleDelay(Board.DEFAULT_DELAY);
        return true;
    }
}
