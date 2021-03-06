import { Board } from "../board";
import { PieceConfig } from "../configs/piececonfig";
import { SpellConfig } from "../configs/spellconfig";
import { EffectType } from "../effectemitter";
import { Colour } from "../enums/colour";
import { SpellTarget } from "../enums/spelltarget";
import { SpellType } from "../enums/spelltype";
import { UnitType } from "../enums/unittype";
import { Piece } from "../piece";
import { Player } from "../player";
import { Spell } from "./spell";

export class SummonSpell extends Spell {

    protected _illusion: boolean;

    constructor(board: Board, id: number, config: SpellConfig) {
        super(board, id, config);
        this._illusion = false;
        this._type = SpellType.Summon;
    }

    get unitId(): string {
        return this._properties.unitId || "";
    }

    get unitProperties(): PieceConfig {
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
            (typeof this._properties.allowIllusion === "undefined" ||
                this._properties.allowIllusion === true)
        );
    }

    get description(): string {
        let description: string = "";

        description += ` Summon a ${this.name}.`;
        const unitConfig: any = Piece.getUnitConfig(this.unitId);
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
        }

        return (description + " " + super.description).trim();
    }

    protected roll(): boolean {
        return this.illusion || this._board.rollChance(this.chance)
    }

    isValidTarget(target: Phaser.Geom.Point, showReason?: boolean): Phaser.Geom.Point | null {
        if (!this.inCastingRange(target)) {
            if (showReason) {
                this._board.logger.log(
                    `${this.name} target is out of range`,
                    Colour.Magenta
                );
            }
            return null;
        }
        if (!this.canCastAtPosition(target, showReason)) {
            return null;
        }

        const targetPieces: Piece[] = this._board.getPiecesAtPosition(target, (piece: Piece) => {
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
        point: Phaser.Geom.Point
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
                status: unit.status || [],
            },
            shadowScale: unit.shadowScale,
            offsetY: unit.offY,
            owner: owner,
            illusion: !!this._illusion,
        });

        this._board.sound.play("spelleffect");
        await this._board.playEffect(
            EffectType.SummonPiece,
            this._board.getIsoPosition(point),
            null,
            newPiece
        );

        newPiece.turnOver = true;

        return newPiece;
    }
}