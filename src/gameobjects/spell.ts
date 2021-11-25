import { Board } from "./board";
import { PieceConfig } from "./configs/piececonfig";
import { SpellConfig } from "./configs/spellconfig";
import { EffectType } from "./effectemitter";
import { Colour } from "./enums/colour";
import { SpellType } from "./enums/spelltype";
import { UnitRangedProjectileType } from "./enums/unitrangedprojectiletype";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { Model } from "./model";
import { Piece } from "./piece";
import { Player } from "./player";

export class Spell extends Model {
    private _board: Board;
    private _type: SpellType;

    private _properties: SpellConfig;
    private _totalCastTimes: number;
    private _castTimes: number;
    private _failed: boolean;
    private _illusion: boolean;

    constructor(
        board: Board,
        id: number,
        config: SpellConfig,
        illusion?: boolean
    ) {
        super(id);
        this._board = board;

        if (config.unitId) {
            this._type = SpellType.Summon;
        } else if (config.damage) {
            this._type = SpellType.Attack;
        } else {
            this._type = SpellType.Misc;
        }

        this._properties = config;
        this._castTimes = config.castTimes || 1;
        this._totalCastTimes = this._castTimes;
        this._failed = false;
        this._illusion = !!illusion;
    }

    get spellId(): string {
        return this._properties.id;
    }

    get name(): string {
        return this._properties.name;
    }

    get chance(): number {
        if (this.balance === 0) {
            return this._properties.chance;
        }
        let balanceOffset = this._board.balance;
        if (this.balance < 0) {
            balanceOffset *= -1;
        }
        return Phaser.Math.Clamp(
            this._properties.chance + balanceOffset,
            0.1,
            1
        );
    }

    get type(): SpellType {
        return this._type;
    }

    get balance(): number {
        return this._properties.balance;
    }

    get range(): number {
        return this._properties.range || 1.5;
    }

    get damage(): number {
        return this._properties.damage || 0;
    }

    get illusion() {
        return this._illusion;
    }

    set illusion(state: boolean) {
        this._illusion = state;
    }

    get persist(): boolean {
        return this._properties.persist || false;
    }

    get allowIllusion(): boolean {
        return (
            (typeof this._properties.allowIllusion === "undefined" ||
                this._properties.allowIllusion === true) &&
            this.type === SpellType.Summon
        );
    }

    get unitId(): string {
        return this._properties.unitId || "";
    }

    get properties(): SpellConfig {
        return this._properties;
    }

    get unitProperties(): PieceConfig {
        return Piece.getUnitConfig(this.unitId);
    }

    get castTimes(): number {
        return this._castTimes;
    }

    get failed(): boolean {
        return this._failed;
    }

    get description(): string {
        if (this._properties.description) {
            return this._properties.description;
        }
        let description: string = "";
        if (this._type === SpellType.Summon) {
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
        }
        if (this._type === SpellType.Attack) {
            description += ` Attack with ${this.name}.`;
        }
        if (this.chance < 0.3) {
            if (this.balance < 0) {
                description += `<br /><span class='c-magenta'>Unlikely to succeed in casting until the world is more chaotic.</span>`;   
            }
            else if (this.balance > 0) {
                description += `<br /><span class='c-cyan'>Unlikely to succeed in casting until the world is more lawful.</span>`;   
            }
            else {
                description += `<br /><span class='c-magenta'>Unlikely to succeed in casting.</span>`;   
            }
        }
        if (description) {
            return description.trim();
        }
        return `Cast ${this.name}.`;
    }

    resetCastTimes(): void {
        this._castTimes = this._totalCastTimes;
    }

    inCastingRange(
        casterPosition: Phaser.Geom.Point,
        point: Phaser.Geom.Point
    ): boolean {
        if (this.range < 0) {
            return true;
        }
        if (Board.distance(casterPosition, point) > this.range) {
            return false;
        }
        return true;
    }

    canCastAtPosition(point: Phaser.Geom.Point): boolean {
        if (this._properties.tree) {
            const neighbourTrees: Piece[] =
                this._board.getAdjacentPiecesAtPosition(point, (p: Piece) =>
                    p.hasStatus(UnitStatus.Tree)
                );
            if (neighbourTrees.length > 0) {
                return false;
            }
        }
        return true;
    }

    async cast(
        owner: Player,
        castingPiece: Piece,
        point: Phaser.Geom.Point,
        _targets: Piece[]
    ): Promise<Piece | boolean | null> {
        const castPoint: Phaser.Geom.Point = Phaser.Geom.Point.Clone(point);

        const castRollSuccess: boolean = this.illusion || this._board.rollChance(this.chance);

        // Prevent failure on subsequent cast of multiple-cast spells
        if (this._castTimes === this._totalCastTimes && !castRollSuccess) {
            return await this.castFail(owner, castingPiece);
        }
        if (this._castTimes === this._totalCastTimes) {
            // TODO: Check how this shift compares to the real game
            this._board.balanceShift += this.balance * 0.05;
        }
        this._castTimes--;
        switch (this._type) {
            case SpellType.Summon:
                return await this.castSummon(owner, castingPiece, castPoint);
            case SpellType.Attack:
                return await this.castAttack(owner, castingPiece, _targets);
            case SpellType.Misc:
                return await this.castMisc(owner, castingPiece, castPoint, _targets);
        }
        return null;
    }

    async castFail(owner: Player, castingPiece: Piece): Promise<null> {
        this._failed = true;
        this._castTimes = 0;
        await this._board.playEffect(
            EffectType.WizardCastFail,
            castingPiece.sprite.getCenter()
        );
        return null;
    }

    async castAttack(
        owner: Player,
        castingPiece: Piece,
        targets: Piece[]
    ): Promise<boolean> {
        if (targets.length === 0) {
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
        }

        if (beamEffect) {
            await this._board.playEffect(
                beamEffect,
                castingPiece.sprite.getCenter(),
                target.sprite.getCenter()
            );
        }

        const rollSuccess: boolean = this._board.roll(
            this._properties.damage,
            target.properties.magicResistance
        );

        if (rollSuccess) {
            await target.kill();
        }

        if (hitEffect) {
            await this._board.playEffect(hitEffect, target.sprite.getCenter());
            if (rollSuccess) {
                this._board.logger.log(
                    `${target.name} was defeated by ${owner.name}'s ${this.name}`
                );
            }
        }

        return true;
    }

    async castSummon(
        owner: Player,
        castingPiece: Piece,
        point: Phaser.Geom.Point
    ): Promise<Piece> {
        const unit: any = Piece.getUnitConfig(this.unitId);

        await this._board.playEffect(
            EffectType.WizardCasting,
            castingPiece.sprite.getCenter()
        );

        await this._board.playEffect(
            EffectType.WizardCastBeam,
            castingPiece.sprite.getCenter(),
            this._board.getIsoPosition(point)
        );

        await this._board.playEffect(
            EffectType.SummonPiece,
            this._board.getIsoPosition(point)
        );

        const newPiece: Piece = this._board.addPiece({
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

        newPiece.turnOver = true;

        return newPiece;
    }

    async castMisc(
        owner: Player,
        castingPiece: Piece,
        point: Phaser.Geom.Point,
        targets: Piece[]
    ): Promise<boolean> {
        if (this.properties.id === "disbelieve") {
            const target: Piece = targets.find((p: Piece) => p.canDisbelieve);
            if (!target) {
                return false;
            }
            await this._board.playEffect(
                EffectType.DisbelieveBeam,
                castingPiece.sprite.getCenter(),
                target.sprite.getCenter()
            );
            if (target.illusion) {
                await target.kill();
                this._board.logger.log(
                    `Disbelieve succeeded on illusionary ${target.name}`
                );
                await Board.delay(1000);
            }
            else {
                this._board.logger.log(
                    `Disbelieve failed on non-illusionary ${target.name}`,
                    Colour.Magenta
                );
                await Board.delay(2000);
            }
            return true;
        }

        return false;
    }
}
