import { Board } from "./board";
import { Model } from "./model";

import { SpellType } from "./enums/spelltype";
import { SpellConfig } from "./configs/spellconfig";
import { Piece } from "./piece";
import { UnitType } from "./enums/unittype";
import { Player } from "./player";
import { UnitStatus } from "./enums/unitstatus";

export class Spell extends Model {
    private _board: Board;
    private _type: SpellType;

    private _properties: SpellConfig;
    private _castTimes: number;

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
        return this._properties.chance + balanceOffset;
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

    get castTimes(): number {
        return this._castTimes;
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
        // Trees cannot be placed next to one another
        if (this._properties.tree) {
            const neighbourTrees: Piece[] = this._board.getAdjacentPiecesAtPosition(
                point,
                (p: Piece) => p.hasStatus(UnitStatus.Tree)
            );
            if (neighbourTrees.length > 0) {
                return false;
            }
        }
        return true;
    }

    async cast(owner: Player, point: Phaser.Geom.Point, _targets: Piece[]): Promise<Piece | boolean | null> {
        this._castTimes--;
        switch (this._type) {
            case SpellType.Summon:
                return await this.castSummon(owner, point);
        }
        return null;
    }

    async castSummon(owner: Player, point: Phaser.Geom.Point): Promise<Piece> {
        const unit: any = Piece.getUnitConfig(this.unitId);

        const newPiece: Piece = this._board.addPiece(
            {
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
                    attackDescription: unit.attackType || "attacked",
                    rangedDescription: unit.rangedDescription || "shot",
                    status: unit.status || [],
                },
                shadowScale: unit.shadowScale,
                offsetY: unit.offY,
                owner: owner
            }
        );

        newPiece.turnOver = true;

        return newPiece;
    }


}
