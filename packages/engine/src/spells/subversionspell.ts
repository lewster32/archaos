import { EffectType } from "../enums/effecttype";
import { EngineEvent } from "../enums/engineevent";
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
export class SubversionSpell<P extends Piece = Piece> extends Spell<P> {
    async doCast(owner: Player<P>, castingPiece: P, _point?: Point, targets?: P[]): Promise<P | boolean | null> {
        const target: P = targets.find((p: P) => p.owner !== this.owner);
        if (!target) {
            return false;
        }

        // Mode A failure: cast-roll failed. Suppress the SubversionBeam
        // and fizzle on the wizard. The resist roll below is mode B,
        // distinct from a cast-roll failure.
        if (this._failed) {
            await this.castFail(owner, castingPiece);
            return null;
        }

        this._board.events.emit(EngineEvent.EffectRequested, {
            sound: "cast-beam",
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.SubversionBeam,
            pieceId: target.id,
            startPieceId: castingPiece.id,
        });

        const rollSuccess: boolean = this._board.roll(10, target.stats.magicResistance, this._owner);

        if (rollSuccess && !target.illusion) {
            this._board.events.emit(EngineEvent.EffectRequested, {
                sound: "die",
            });
            await this._board.events.emitAsync(EngineEvent.EffectRequested, {
                type: EffectType.SubversionHit,
                pieceId: target.id,
            });
            target.owner = this.owner;
            this._board.logger.log(`${target.name} was subverted and now belongs to ${owner.name}`);
        } else {
            this._board.logger.log(`${target.name} resisted ${this.name}`, Colour.Magenta);
        }
        await this._board.idleDelay();
        return true;
    }
}
