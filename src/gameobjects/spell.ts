import { Board } from "./board";
import { Model } from "./model";

import { SpellType } from "./enums/spelltype";
import { SpellConfig } from "./configs/spellconfig";
import { Piece } from "./piece";
import { UnitType } from "./enums/unittype";
import { Player } from "./player";
import { UnitStatus } from "./enums/unitstatus";
import { PieceConfig } from "./configs/piececonfig";
import { Colour } from "./enums/colour";
import { EffectType } from "./effectemitter";

export class Spell extends Model {
    private _board: Board;
    private _type: SpellType;

    private _properties: SpellConfig;
    private _totalCastTimes: number;
    private _castTimes: number;
    private _failed: boolean;

    constructor(board: Board, id: number, config: SpellConfig) {
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
    }

    get spellId(): string {
        return this._properties.id;
    }

    get name(): string {
        return this._properties.name;
    }

    get chance(): number {
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

    get allowIllusion(): boolean {
        return typeof this._properties.allowIllusion == "undefined"
            ? true
            : this._properties.allowIllusion;
    }

    get unitId(): string {
        return this._properties.unitId || "";
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

    inCastingRange(
        casterPosition: Phaser.Geom.Point,
        point: Phaser.Geom.Point
    ): boolean {
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
        _targets: Piece[],
    ): Promise<Piece | boolean | null> {
        const castPoint: Phaser.Geom.Point = Phaser.Geom.Point.Clone(point);
        const castRoll: number = Phaser.Math.RND.frac();

        // Prevent failure on subsequent cast of multiple-cast spells
        if (this._castTimes === this._totalCastTimes && castRoll > this.chance) {
            return await this.castFail(owner, castingPiece);
        }
        await this._board.playEffect(
            EffectType.WizardCasting,
            castingPiece.sprite.getCenter()
        );
        this._castTimes--;
        switch (this._type) {
            case SpellType.Summon:
                return await this.castSummon(owner, castingPiece, castPoint);
        }
        return null;
    }

    async castFail(owner: Player, castingPiece:Piece): Promise<null> {
        this._failed = true;
        this._castTimes = 0;
        await this._board.playEffect(
            EffectType.WizardCastFail,
            castingPiece.sprite.getCenter()
        );
        return null;
    }

    async castSummon(owner: Player, castingPiece: Piece, point: Phaser.Geom.Point): Promise<Piece> {
        const unit: any = Piece.getUnitConfig(this.unitId);

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
        });

        newPiece.turnOver = true;

        return newPiece;
    }
}
