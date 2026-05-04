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
    async doCast(owner: Player<P>, castingPiece: P, _point?: Point, targets?: P[]): Promise<P | boolean | null> {
        const target: P = targets.find((p: P) => p.canBeDisbelieved);
        if (!target) {
            return false;
        }

        // Mode A failure: cast-roll failed. Suppress the DisbelieveBeam
        // and fizzle on the wizard. (Disbelieve has chance=1 in
        // practice, so this branch is defensive.)
        if (this._failed) {
            await this.castFail(owner, castingPiece);
            return null;
        }

        this._board.events.emit(EngineEvent.EffectRequested, {
            sound: "cast-beam",
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.DisbelieveBeam,
            pieceId: target.id,
            startPieceId: castingPiece.id,
        });

        if (target.illusion) {
            this._board.events.emit(EngineEvent.EffectRequested, {
                sound: "destroy",
            });
            await target.kill();
            this._board.logger.log(`Disbelieve succeeded on illusionary ${target.name}`);
        } else {
            this._board.logger.log(`Disbelieve failed on non-illusionary ${target.name}`, Colour.Magenta);
            // Inform AI players that this piece is not an illusion
            this._board.players.forEach((player: Player<P>) => {
                player.ai?.rememberNonIllusionPiece(target.id);
            });
        }
        await this._board.idleDelay();
        return true;
    }
}
