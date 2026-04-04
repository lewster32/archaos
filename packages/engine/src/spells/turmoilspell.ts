import { Colour } from "../enums/colour";
import { UnitType } from "../enums/unittype";
import { Board } from "../board";
import { EffectType } from "../../../../src/gameobjects/effectemitter";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Point } from "../point";

/**
 * Turmoil — teleports every piece on the board to a random empty space.
 * Only available as a gift spell.
 */
export class TurmoilSpell extends Spell {
    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Point,
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

        for (const piece of this._board.pieces.filter(
            (p: Piece) => !p.dead && !p.currentMount && !p.engulfed,
        )) {
            const randomEmptySpace: Point =
                this._board.getRandomEmptySpace();
            if (randomEmptySpace) {
                this._board.sound.play("spelleffect");
                const oldPiecePos: Point = new Point(
                    piece.sprite.getCenter().x,
                    piece.sprite.getCenter().y,
                );
                const newPiecePos: Point =
                    this._board.getIsoPosition(randomEmptySpace);
                piece.moveTo(randomEmptySpace, 500);
                await this._board.playEffect(
                    EffectType.TurmoilBeam,
                    oldPiecePos,
                    newPiecePos,
                    piece,
                );
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
