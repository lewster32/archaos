import { SpellType } from "../enums/spelltype";
import { UnitRangedProjectileType } from "../enums/unitrangedprojectiletype";
import { UnitStatus } from "../enums/unitstatus";
import { Colour } from "../enums/colour";
import type { SpellConfig } from "../configs/spellconfig";
import { Point } from "../point";
import { Board } from "../board";
import { EffectType } from "../enums/effecttype";
import { EngineEvent } from "../enums/engineevent";
import { Spell } from "./spell";
import type { Piece } from "../piece";
import type { Player } from "../player";
/**
 * A spell that attacks one or more target pieces.
 */
export class AttackSpell<P extends Piece = Piece> extends Spell<P> {
    constructor(board: Board<P>, id: number, config: SpellConfig) {
        super(board, id, config);
        this._type = SpellType.Attack;
    }

    get damage(): number {
        return this._properties.damage || 0;
    }

    async doCast(
        owner: Player<P>,
        castingPiece: P,
        point?: Point,
        targets?: P[],
    ): Promise<P | boolean | null> {
        if (!targets?.length) {
            throw new Error("No targets for attack spell");
        }
        // Find the first valid target from the list of potential targets
        const target: P = targets.find((t) => this.getValidTarget(t));
        if (!target) {
            throw new Error("No valid target for attack spell");
        }
        let beamEffect: EffectType = null;
        let hitEffect: EffectType = null;
        let beamSound: string = null;
        let hitSound: string = null;

        switch (this._properties.projectile) {
            case UnitRangedProjectileType.Lightning:
                beamEffect = EffectType.LightningBeam;
                hitEffect = EffectType.LightningHit;
                beamSound = "lightning4";
                hitSound = "lightningexplode";
                break;
            case UnitRangedProjectileType.MagicBolt:
                beamEffect = EffectType.MagicBoltBeam;
                hitEffect = EffectType.MagicBoltHit;
                beamSound = "magicbolt6";
                hitSound = "magicboltexplode";
                break;
            case UnitRangedProjectileType.Justice:
                hitEffect = EffectType.JusticeHit;
                hitSound = "justice";
                break;
            case UnitRangedProjectileType.DarkPower:
                hitEffect = EffectType.DarkPowerHit;
                hitSound = "justice";
                break;
        }

        if (beamSound) {
            this._board.events.emit(EngineEvent.EffectRequested, {
                sound: beamSound,
            });
        }

        if (beamEffect) {
            await this._board.events.emitAsync(EngineEvent.EffectRequested, {
                type: beamEffect,
                pieceId: target.id,
                startPieceId: castingPiece.id,
            });
        }

        const rollSuccess: boolean = this._board.roll(
            this._properties.damage,
            target.stats.magicResistance,
            this._owner,
        );

        let targetKilled: boolean = false;

        if (hitSound) {
            this._board.events.emit(EngineEvent.EffectRequested, {
                sound: hitSound,
            });
        }
        if (hitEffect) {
            await this._board.events.emitAsync(EngineEvent.EffectRequested, {
                type: hitEffect,
                pieceId: target.id,
            });
        }

        if (rollSuccess) {
            if (
                this.properties.destroyWizardCreatures &&
                target.hasStatus(UnitStatus.Wizard)
            ) {
                this._board.events.emit(EngineEvent.EffectRequested, {
                    sound: "justicesuccessful",
                });
                await target.owner.destroyCreations();
                this._board.logger.log(
                    `${target.fullName}'s creations were dispelled by ${this.name}`,
                );
                await this._board.idleDelay();
            } else {
                this._board.events.emit(EngineEvent.EffectRequested, {
                    sound: "killcreature",
                });
                await target.kill();
                targetKilled = true;
            }
        }

        if (targetKilled) {
            this._board.logger.log(
                `${target.fullName} was defeated by ${this.name}`,
                Colour.Red,
            );
        }

        return true;
    }

    get description(): string {
        let description = ` Attack with ${this.name}.`;

        if (this.properties.destroyWizardCreatures) {
            description +=
                " If successfully cast on a wizard, it will destroy their creations.";
        }

        return (description + " " + super.description).trim();
    }
}
