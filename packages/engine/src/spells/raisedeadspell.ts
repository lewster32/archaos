import { Board } from "../board";
import { EffectType } from "../enums/effecttype";
import { EngineEvent } from "../enums/engineevent";
import { Colour } from "../enums/colour";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { Point } from "../point";

/**
 * Raise Dead — reanimates a target corpse and transfers ownership to the
 * casting wizard.
 */
export class RaiseDeadSpell<P extends Piece = Piece> extends Spell<P> {
    async doCast(
        owner: Player<P>,
        castingPiece: P,
        point?: Point,
        targets?: P[],
    ): Promise<P | boolean | null> {
        const target: P = targets.find((p: P) => p.dead);
        if (!target) {
            return false;
        }
        this._board.events.emit(EngineEvent.EffectRequested, {
            sound: "castloop08",
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.RaiseDeadBeam,
            pieceId: target.id,
            startPieceId: castingPiece.id,
        });
        this._board.events.emit(EngineEvent.EffectRequested, {
            sound: "spelleffect",
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.RaiseDeadHit,
            pieceId: target.id,
        });
        await target.raiseDead(this.owner);
        this._board.logger.log(
            `${target.name} was reanimated and now belongs to ${owner.name}`,
            Colour.LightBlue,
        );

        // Raised dead units are not illusionary, since they came from a
        // corpse and illusionary units don't leave corpses. Ipso facto.
        this._board.players.forEach((player: Player<P>) => {
            player.ai?.rememberNonIllusionPiece(target.id);
        });

        await this._board.idleDelay();
        return true;
    }
}
