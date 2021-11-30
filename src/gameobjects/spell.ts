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
    protected _board: Board;
    protected _type: SpellType;

    protected _properties: SpellConfig;
    protected _totalCastTimes: number;
    protected _castTimes: number;
    protected _failed: boolean;

    constructor(
        board: Board,
        id: number,
        config: SpellConfig
    ) {
        super(id);
        this._board = board;

        this._type = SpellType.Misc;

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

    get persist(): boolean {
        return this._properties.persist || false;
    }

    get lineOfSight(): boolean {
        return this._properties.lineOfSight || false;
    }

    get properties(): SpellConfig {
        return this._properties;
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

    protected roll(): boolean {
        return this._board.rollChance(this.chance);
    }

    async cast(
        owner: Player,
        castingPiece: Piece,
        point?: Phaser.Geom.Point,
        targets?: Piece[]
    ): Promise<Piece | boolean | null> {
        const castPoint: Phaser.Geom.Point = Phaser.Geom.Point.Clone(point);

        // Prevent failure on subsequent cast of multiple-cast spells
        if (this._castTimes === this._totalCastTimes && !this.roll()) {
            return await this.castFail(owner, castingPiece);
        }
        if (this._castTimes === this._totalCastTimes) {
            // TODO: Check how this shift compares to the real game
            this._board.balanceShift += this.balance * 0.05;
        }
        this._castTimes--;

        return await this.doCast(owner, castingPiece, castPoint, targets);
    }

    async doCast(owner: Player, castingPiece: Piece, point?: Phaser.Geom.Point, targets?: Piece[]): Promise<Piece | boolean | null> {
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

    async castFail(owner: Player, castingPiece: Piece): Promise<null> {
        this._failed = true;
        this._castTimes = 0;
        await this._board.playEffect(
            EffectType.WizardCastFail,
            castingPiece.sprite.getCenter()
        );
        return null;
    }
}
