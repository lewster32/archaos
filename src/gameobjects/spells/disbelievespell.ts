import { Board } from "../board";
import { EffectType } from "../effectemitter";
import { Colour } from "../enums/colour";
import { Spell } from "./spell";
import type { SpellConfig } from "../configs/spellconfig";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Geom } from "phaser";

/**
 * Disbelieve — reveals whether an enemy unit is an illusion and destroys it
 * if so. Unlike other spells, Disbelieve always succeeds and is never consumed.
 */
export class DisbelieveSpell extends Spell {

    constructor(board: Board, id: number, config: SpellConfig) {
        super(board, id, config);
    }

    async doCast(owner: Player, castingPiece: Piece, point?: Geom.Point, targets?: Piece[]): Promise<Piece | boolean | null> {
        const target: Piece = targets.find((p: Piece) => p.canBeDisbelieved);
        if (!target) {
            return false;
        }
        this._board.sound.play("castloop08");
        await this._board.playEffect(
            EffectType.DisbelieveBeam,
            castingPiece.sprite.getCenter(),
            target.sprite.getCenter(),
            target
        );
        if (target.illusion) {
            this._board.sound.play("disbelieve");
            await target.kill();
            this._board.logger.log(
                `Disbelieve succeeded on illusionary ${target.name}`
            );
        }
        else {
            this._board.logger.log(
                `Disbelieve failed on non-illusionary ${target.name}`,
                Colour.Magenta
            );
            // Inform AI players that this piece is not an illusion
            this._board.players.forEach((player: Player) => {
                player.ai?.rememberNonIllusionPiece(target.id);
            });
        }
        await this._board.idleDelay(Board.DEFAULT_DELAY);
        return true;
    }
}
