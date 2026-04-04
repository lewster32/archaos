import { Board } from "../board";
import { Colour } from "../enums/colour";
import { EffectType } from "../enums/effecttype";
import { EngineEvent } from "../enums/engineevent";
import { UnitType } from "../enums/unittype";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Point } from "../point";

/**
 * Turmoil — teleports every piece on the board to a random empty space.
 * Only available as a gift spell.
 */
export class TurmoilSpell<
    P extends Piece = Piece,
> extends Spell<P> {
    async doCast(
        owner: Player<P>,
        castingPiece: P,
        point?: Point,
        targets?: P[],
    ): Promise<P | boolean | null> {
        const target: P = targets.find(
            (p: P) =>
                p.type === UnitType.Wizard && p.owner === this.owner,
        );
        if (!target) {
            return false;
        }

        this._board.events.emit(
            EngineEvent.EffectRequested,
            { sound: "spelleffect" },
        );
        await this._board.events.emitAsync(
            EngineEvent.EffectRequested,
            {
                type: EffectType.WizardCasting,
                pieceId: target.id,
            },
        );

        for (const piece of this._board.pieces.filter(
            (p: P) => !p.dead && !p.currentMount && !p.engulfed,
        )) {
            const randomEmptySpace: Point =
                this._board.getRandomEmptySpace();
            if (randomEmptySpace) {
                this._board.events.emit(
                    EngineEvent.EffectRequested,
                    { sound: "spelleffect" },
                );
                const oldPosition = {
                    x: piece.position.x,
                    y: piece.position.y,
                };
                await piece.moveTo(randomEmptySpace, 500);
                await this._board.events.emitAsync(
                    EngineEvent.EffectRequested,
                    {
                        type: EffectType.TurmoilBeam,
                        pieceId: piece.id,
                        startPosition: oldPosition,
                        targetPosition: {
                            x: randomEmptySpace.x,
                            y: randomEmptySpace.y,
                        },
                    },
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
