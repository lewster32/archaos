import { Board } from "../board";
import { SpellConfig } from "../configs/spellconfig";
import { EffectType } from "../effectemitter";
import { SpellType } from "../enums/spelltype";
import { UnitRangedProjectileType } from "../enums/unitrangedprojectiletype";
import { UnitStatus } from "../enums/unitstatus";
import { Piece } from "../piece";
import { Player } from "../player";
import { Spell } from "./spell";

export class AttackSpell extends Spell {
    constructor(board: Board, id: number, config: SpellConfig) {
        super(board, id, config);
        this._type = SpellType.Attack;
    }

    get damage(): number {
        return this._properties.damage || 0;
    }

    async doCast(owner: Player, castingPiece: Piece, point?: Phaser.Geom.Point, targets?: Piece[]): Promise<Piece | boolean | null> {
        if (targets?.length === 0) {
            throw new Error("No targets for attack spell");
        }
        const target: Piece = targets[0];
        let beamEffect: EffectType = null;
        let hitEffect: EffectType = null;

        switch (this._properties.projectile) {
            case UnitRangedProjectileType.Lightning:
                beamEffect = EffectType.LightningBeam;
                hitEffect = EffectType.LightningHit;
                break;
            case UnitRangedProjectileType.MagicBolt:
                beamEffect = EffectType.MagicBoltBeam;
                hitEffect = EffectType.MagicBoltHit;
                break;
            case UnitRangedProjectileType.Justice:
                hitEffect = EffectType.JusticeHit;
                break;
            case UnitRangedProjectileType.DarkPower:
                hitEffect = EffectType.DarkPowerHit;
                break;
        }

        if (beamEffect) {
            await this._board.playEffect(
                beamEffect,
                castingPiece.sprite.getCenter(),
                target.sprite.getCenter(),
                target
            );
        }

        const rollSuccess: boolean = this._board.roll(
            this._properties.damage,
            target.properties.magicResistance
        );

        let targetKilled: boolean = false;

        if (hitEffect) {
            await this._board.playEffect(hitEffect, target.sprite.getCenter(), null, target);
        }

        if (rollSuccess) {
            if (this.properties.destroyWizardCreatures && target.hasStatus(UnitStatus.Wizard)) {
                await target.owner.destroyCreations();
                this._board.logger.log(
                    `${target.owner.name}'s creations were dispelled by ${this.name}`
                );
                await Board.delay(1000);
            }
            else {
                await target.kill();
                targetKilled = true;
            }
        }

        if (targetKilled) {
            this._board.logger.log(
                `${target.name} was defeated by ${owner.name}'s ${this.name}`
            );
        }

        return true;
    }

    get description(): string {
        let description = ` Attack with ${this.name}.`;

        if (this.properties.destroyWizardCreatures) {
            description += " If successfully cast on a wizard, it will destroy their creations.";
        }

        return (description + " " + super.description).trim();
    }
}