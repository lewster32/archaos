import { Board } from "../board";
import { EffectType } from "../effectemitter";
import { Colour } from "../enums/colour";
import { UnitType } from "../enums/unittype";
import { Spell } from "./spell";
import type { SpellConfig } from "../configs/spellconfig";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Geom, Math as PMath } from "phaser";

/**
 * Turmoil — teleports every piece on the board to a random empty space.
 * Only available as a gift spell.
 */
export class TurmoilSpell extends Spell {

    constructor(board: Board, id: number, config: SpellConfig) {
        super(board, id, config);
    }

    async doCast(owner: Player, castingPiece: Piece, point?: Geom.Point, targets?: Piece[]): Promise<Piece | boolean | null> {
        const target: Piece = targets.find((p: Piece) => p.type === UnitType.Wizard && p.owner === this.owner);
        if (!target) {
            return false;
        }

        this._board.sound.play("spelleffect");
        await this._board.playEffect(
            EffectType.WizardCasting,
            target.sprite.getCenter(),
            null,
            target
        );

        for (const piece of this._board.pieces.filter((p: Piece) => !p.dead && !p.currentMount && !p.engulfed)) {
            const randomEmptySpace: Geom.Point = this._board.getRandomEmptySpace();
            if (randomEmptySpace) {
                this._board.sound.play("spelleffect");
                const oldPiecePos: PMath.Vector2 = new PMath.Vector2(piece.sprite.getCenter().x, piece.sprite.getCenter().y);
                const newPiecePos: Geom.Point = this._board.getIsoPosition(randomEmptySpace);
                piece.moveTo(randomEmptySpace, 500);
                await this._board.playEffect(
                    EffectType.TurmoilBeam,
                    oldPiecePos,
                    newPiecePos,
                    piece
                );
            }
        }

        this._board.logger.log(
            `${target.name} successfully casts '${this.name}'`,
            Colour.Green
        );

        await this._board.idleDelay(Board.DEFAULT_DELAY);
        return true;
    }
}
