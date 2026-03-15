import { Board } from "../board";
import { SpellConfig } from "../configs/spellconfig";
import { EffectType } from "../effectemitter";
import { Colour } from "../enums/colour";
import { SpellTarget } from "../enums/spelltarget";
import { SpellType } from "../enums/spelltype";
import { UnitRangedProjectileType } from "../enums/unitrangedprojectiletype";
import { UnitType } from "../enums/unittype";
import { UnitConfig } from "../interfaces/ui";
import { Piece } from "../piece";
import { Player } from "../player";
import { Spell } from "./spell";
import { Geom } from "phaser";

/**
 * A spell that summons a unit onto the board.
 */
export class SummonSpell extends Spell {

    protected _illusion: boolean;

    constructor(board: Board, id: number, config: SpellConfig) {
        super(board, id, config);
        this._illusion = false;
        this._type = SpellType.Summon;
    }

    get unitId(): string {
        return this._properties.unitId || this._properties.unit?.id || "";
    }

    get spellFrame(): number {
        return this._properties.spellFrame ?? 0;
    }

    get unitProperties(): UnitConfig {
        return Piece.getUnitConfig(this.unitId);
    }

    get illusion() {
        return this._illusion;
    }

    set illusion(state: boolean) {
        this._illusion = state;
    }

    get allowIllusion(): boolean {
        return (
            (
                this._properties.allowIllusion === undefined || // Default to true
                this._properties.allowIllusion === true 
            )
        );
    }

    get description(): string {
        let description: string = "";

        const unitConfig: any = Piece.getUnitConfig(this.unitId);
        
        if (this.castTimes === 1)  {
            description += ` Summon ${unitConfig.indefiniteArticle || (/^[aeiou]/i.test(unitConfig.name) ? "an" : "a")} ${unitConfig.name}.`;
        }
        if (unitConfig?.status?.includes("undead")) {
            description += ` Undead units cannot usually be attacked by the living.`;
        }
        if (unitConfig?.status?.includes("mount")) {
            if (unitConfig?.status?.includes("struct")) {
                description += ` Can be occupied by the owning wizard.`;
            }
            else {  
                description += ` Can be ridden by the owning wizard.`;
            }
        }
        if (unitConfig?.status?.includes("expires")) {
            description += ` Has a random chance to expire each turn.`;
            if (unitConfig?.status?.includes("expiresGivesSpell")) {
                description += ` Will only expire if a wizard is currently mounted, and upon doing so, grants a new spell to that player.`;
            }
        }

        return `${description} ${super.description}`.trim();
    }

    protected roll(): boolean {
        return this.illusion || this._board.rollChance(this.chance)
    }

    getValidTarget(target: Geom.Point | Piece, showReason?: boolean): Geom.Point | null {
        if (Piece.isPiece(target)) {
            if (showReason) {
                this._board.logger.log(
                    `${this.name} cannot be cast in occupied positions`,
                    Colour.Magenta
                );
            }
            return null;
        }
        const targetPoint: Geom.Point = target;
        if (!this.inCastingRange(targetPoint)) {
            if (showReason) {
                this._board.logger.log(
                    `${this.name} target is out of range`,
                    Colour.Magenta
                );
            }
            return null;
        }
        if (!this.canCastAtPosition(targetPoint, showReason)) {
            return null;
        }

        const targetPieces: Piece[] = this._board.getPiecesAtPosition(targetPoint, (piece: Piece) => {
            return !piece.currentMount && !piece.engulfed && !piece.dead;
        });

        // Summon spells
        if (this._properties.target === SpellTarget.Empty) {
            if (targetPieces.length > 0) {
                if (showReason) {
                    this._board.logger.log(
                        `${this.name} must be cast in an empty position`,
                        Colour.Magenta
                    );
                }
                return null;
            }
            return target;
        }

        return null;
    }

    async doCast(
        owner: Player,
        castingPiece: Piece,
        point: Geom.Point
    ): Promise<Piece> {
        const unit: any = Piece.getUnitConfig(this.unitId);

        this._board.sound.play("castloop08");
        await this._board.playEffect(
            EffectType.WizardCasting,
            castingPiece.sprite.getCenter()
        );

        await this._board.playEffect(
            EffectType.WizardCastBeam,
            castingPiece.sprite.getCenter(),
            this._board.getIsoPosition(point),
            castingPiece
        );

        const newPiece: Piece = await this._board.addPiece({
            type: UnitType.Creature,
            x: point.x,
            y: point.y,
            properties: {
                id: this.unitId,
                name: unit.name,
                movement: unit.properties.mov,
                combat: unit.properties.com,
                rangedCombat: unit.properties.rcm,
                range: unit.properties.rng,
                defense: unit.properties.def,
                maneuverability: unit.properties.mnv,
                magicResistance: unit.properties.res,
                attackType: unit.attackType || "attacked",
                rangedType: unit.rangedType || "shot",
                projectileType: unit.projectileType || UnitRangedProjectileType.Arrow,
                status: unit.status || [],
            },
            shadowScale: unit.shadowScale,
            offsetY: unit.offY,
            owner: owner,
            illusion: !!this._illusion,
            group: unit.group || "classicunits",
        });

        this._board.sound.play("spelleffect");
        await this._board.playEffect(
            EffectType.SummonPiece,
            this._board.getIsoPosition(point),
            null,
            newPiece
        );

        newPiece.turnOver = true;

        this._board.logger.log(
            `${owner.name} successfully casts '${this.name}'`,
            Colour.Green
        );

        return newPiece;
    }
}