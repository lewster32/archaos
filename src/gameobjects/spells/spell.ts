import { Board } from "../board";
import { PieceConfig } from "../configs/piececonfig";
import { SpellConfig } from "../configs/spellconfig";
import { EffectType } from "../effectemitter";
import { Colour } from "../enums/colour";
import { SpellTarget } from "../enums/spelltarget";
import { SpellType } from "../enums/spelltype";
import { UnitRangedProjectileType } from "../enums/unitrangedprojectiletype";
import { UnitStatus } from "../enums/unitstatus";
import { UnitType } from "../enums/unittype";
import { Model } from "../model";
import { Piece } from "../piece";
import { Player } from "../player";

export class Spell extends Model {
    protected _board: Board;
    protected _type: SpellType;

    protected _castingPiece: Piece;
    protected _properties: SpellConfig;
    protected _totalCastTimes: number;
    protected _castTimes: number;
    protected _failed: boolean;

    protected _owner: Player;

    constructor(
        board: Board,
        id: number,
        config: SpellConfig,
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

    get owner(): Player {
        return this._owner;
    }

    set owner(owner: Player) {
        this._owner = owner;
        if (this._owner.castingPiece) {
            this._castingPiece = this._owner.castingPiece;
        }
        else {
            throw new Error("Owner has no casting piece");
        }
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
        return "";
    }

    resetCastTimes(): void {
        this._castTimes = this._totalCastTimes;
    }

    protected inCastingRange(
        point: Phaser.Geom.Point
    ): boolean {
        if (this.range < 0) {
            return true;
        }
        if (!this._castingPiece) {
            console.error("Spell has no casting piece");
            return false;
        }
        const casterPosition: Phaser.Geom.Point = Phaser.Geom.Point.Clone(
            this._castingPiece.position
        );
        if (Board.distance(casterPosition, point) > this.range) {
            return false;
        }
        return true;
    }

    protected canCastAtPosition(point: Phaser.Geom.Point, showReason?: boolean): boolean {
        if (this.lineOfSight && !this._board.hasLineOfSight(this._castingPiece.position, point)) {
            if (showReason) {
                this._board.logger.log(
                    `${this.name} requires line of sight to target`,
                    Colour.Magenta
                );
            }
            return false;
        }
        if (this._properties.tree) {
            const neighbourTrees: Piece[] =
                this._board.getAdjacentPiecesAtPosition(point, (p: Piece) =>
                    p.hasStatus(UnitStatus.Tree)
                );
            if (neighbourTrees.length > 0) {
                if (showReason) {
                    this._board.logger.log(
                        `${this.name} cannot be cast adjacent to another tree`,
                        Colour.Magenta
                    );
                }
                return false;
            }
        }
        return true;
    }

    isValidTarget(target: Phaser.Geom.Point, showReason?: boolean): Phaser.Geom.Point | Piece | null {
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

        // Only find actively targetable pieces
        const targetPieces: Piece[] = this._board.getPiecesAtPosition(target, (piece: Piece) => {
            return !piece.currentMount && !piece.engulfed;
        });
        const targetLivingPiece: Piece = targetPieces.find((piece: Piece) => !piece.dead);

        // Corpse spells (e.g., raise dead)
        if (this._properties.target === SpellTarget.Corpse) {
            if (targetLivingPiece) {
                if (showReason) {
                    this._board.logger.log(
                        `${this.name} must be cast on a corpse`,
                        Colour.Magenta
                    );
                }
                return null;
            }
            return targetPieces.find((piece: Piece) => piece.dead);
        }

        // Living target spells (e.g., disbelieve, magic bolt etc.)
        if (!targetLivingPiece) {
            if (showReason) {
                this._board.logger.log(
                    `${this.name} must be cast on a unit`,
                    Colour.Magenta
                );
            }
            return null;
        }
        
        const targetEnemyLivingPiece: Piece = targetLivingPiece.owner !== this._owner ? targetLivingPiece : null;
        const targetEnemyWizard: Piece = targetEnemyLivingPiece?.type === UnitType.Wizard ? targetEnemyLivingPiece : null;

        if (this._properties.target === SpellTarget.Piece) {
            if (this.properties.castOnEnemyUnit) {
                if (!targetEnemyLivingPiece) {
                    if (showReason) {
                        this._board.logger.log(
                            `${this.name} must be cast on an enemy unit`,
                            Colour.Magenta
                        );
                    }
                    return null;
                }
                if (!this.properties.castOnWizard && targetEnemyWizard) {
                    if (showReason) {
                        this._board.logger.log(
                            `${this.name} cannot be cast on a wizard`,
                            Colour.Magenta
                        );
                    }
                    return null;
                }
                if (this.properties.id === "disbelieve") {
                    const disbelievableTarget: Piece = targetEnemyLivingPiece.canDisbelieve ? targetEnemyLivingPiece : null;
                    if (!disbelievableTarget) {
                        if (showReason) {
                            this._board.logger.log(
                                `${this.name} cannot be cast on this unit`,
                                Colour.Magenta
                            );
                        }
                        return null;
                    }
                    return disbelievableTarget;
                }

                if (this.properties.damage > 0 && targetEnemyLivingPiece?.hasStatus(UnitStatus.Invulnerable)) {
                    if (showReason) {
                        this._board.logger.log(
                            `${this.name} cannot be cast on an invulnerable unit`,
                            Colour.Magenta
                        );
                    }
                    return null;
                }

                return targetEnemyLivingPiece;
            }
            else if (this.properties.castOnFriendlyUnit) {
                if (targetEnemyLivingPiece) {
                    if (showReason) {
                        this._board.logger.log(
                            `${this.name} must be cast on a friendly unit`,
                            Colour.Magenta
                        );
                    }
                    return null;
                }
                return targetLivingPiece;
            }

        }

        return null;
    }

    protected roll(): boolean {
        return this._board.rollChance(this.chance);
    }

    async cast(
        owner: Player,
        castingPiece: Piece,
        target?: Phaser.Geom.Point | Piece,
    ): Promise<Piece | boolean | null> {
        let castPoint: Phaser.Geom.Point;
        let castPiece: Piece;
        if (target instanceof Phaser.Geom.Point) {
            castPoint = Phaser.Geom.Point.Clone(target);
        } else if (target instanceof Piece) {
            castPiece = target;
            castPoint = Phaser.Geom.Point.Clone(target.position);
        }

        // Prevent failure on subsequent cast of multiple-cast spells
        if (this._castTimes === this._totalCastTimes && !this.roll()) {
            return await this.castFail(owner, castingPiece);
        }
        if (this._castTimes === this._totalCastTimes) {
            // TODO: Check how this shift compares to the real game
            this._board.balanceShift += this.balance * 0.05;
        }
        this._castTimes--;

        return await this.doCast(owner, castingPiece, castPoint, [castPiece]);
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
                target.sprite.getCenter(),
                target
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
                await Board.delay(1000);
            }
            return true;
        }

        if (this.properties.id === "raise-dead") {
            const target: Piece = targets.find((p: Piece) => p.dead);
            if (!target) {
                return false;
            }
            await this._board.playEffect(
                EffectType.RaiseDeadBeam,
                castingPiece.sprite.getCenter(),
                target.sprite.getCenter()
            );
            await this._board.playEffect(
                EffectType.RaiseDeadHit,
                target.sprite.getCenter(),
                null,
                target
            );
            await target.raiseDead(this.owner);
            this._board.logger.log(
                `${target.name} was reanimated and now belongs to ${owner.name}`,
                Colour.LightBlue
            );
                
            await Board.delay(1000);
            return true;
        }

        return false;
    }

    async castFail(owner: Player, castingPiece: Piece): Promise<null> {
        this._failed = true;
        this._castTimes = 0;
        await this._board.playEffect(
            EffectType.WizardCastFail,
            castingPiece.sprite.getCenter(),
            null,
            castingPiece
        );
        return null;
    }
}
