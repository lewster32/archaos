import { EffectType } from "../enums/effecttype";
import { EngineEvent } from "../enums/engineevent";
import { Colour } from "../enums/colour";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Point } from "../point";

/**
 * Disbelieve — reveals whether an enemy unit is an illusion and destroys it
 * if so. Unlike other spells, Disbelieve always succeeds and is never consumed.
 */
export class DisbelieveSpell<P extends Piece = Piece> extends Spell<P> {
    async doCast(
        owner: Player<P>,
        castingPiece: P,
        point?: Point,
        targets?: P[],
    ): Promise<P | boolean | null> {
        const target: P = targets.find((p: P) => p.canBeDisbelieved);
        if (!target) {
            return false;
        }
        this._board.events.emit(EngineEvent.EffectRequested, {
            sound: "castloop08",
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.DisbelieveBeam,
            pieceId: target.id,
            startPieceId: castingPiece.id,
        });
        if (target.illusion) {
            this._board.events.emit(EngineEvent.EffectRequested, {
                sound: "disbelieve",
            });
            await target.kill();
            this._board.logger.log(
                `Disbelieve succeeded on illusionary ${target.name}`,
            );
        } else {
            this._board.logger.log(
                `Disbelieve failed on non-illusionary ${target.name}`,
                Colour.Magenta,
            );
            // Inform AI players that this piece is not an illusion
            this._board.players.forEach((player: Player<P>) => {
                player.ai?.rememberNonIllusionPiece(target.id);
            });
        }
        await this._board.idleDelay();
        return true;
    }
}
