import { Colour } from "../enums/colour";
import { EngineEvent } from "../enums/engineevent";
import { UnitType } from "../enums/unittype";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Point } from "../point";
import type {
    TurmoilBatchPayload,
    TurmoilMoveResult,
} from "../actions";

/**
 * Turmoil — teleports every piece on the board to
 * a random empty space. Only available as a gift
 * spell.
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
                p.type === UnitType.Wizard &&
                p.owner === this.owner,
        );
        if (!target) {
            return false;
        }

        const moves: TurmoilMoveResult[] = [];

        for (const piece of this._board.pieces
            .filter(
                (p: P) =>
                    !p.dead &&
                    !p.currentMount &&
                    !p.engulfed,
            )) {
            const randomEmptySpace: Point =
                this._board.getRandomEmptySpace();
            if (randomEmptySpace) {
                const from = {
                    x: piece.position.x,
                    y: piece.position.y,
                };
                await piece.moveTo(
                    randomEmptySpace,
                    500,
                );
                moves.push({
                    pieceId: piece.id,
                    from,
                    to: {
                        x: randomEmptySpace.x,
                        y: randomEmptySpace.y,
                    },
                });
            }
        }

        const payload: TurmoilBatchPayload = {
            castingPieceId: target.id,
            moves,
        };
        this._board.events.emit(
            EngineEvent.TurmoilBatch,
            payload,
        );

        this._board.logger.log(
            `${target.name} successfully casts` +
                ` '${this.name}'`,
            Colour.Green,
        );

        return true;
    }
}
