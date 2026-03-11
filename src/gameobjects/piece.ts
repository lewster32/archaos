import unitJsonData from "../../assets/data/classicunits.json";
import { Board, RangeType } from "./board";
import { EffectType } from "./effectemitter";
import { Entity } from "./entity";
import { BoardLayer } from "./enums/boardlayer";
import { Colour } from "./enums/colour";
import { SpreadAction } from "./enums/spreadaction";
import { UnitAttackType } from "./enums/unitattacktype";
import { UnitDirection } from "./enums/unitdirection";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { Math as PMath, GameObjects, Geom, Display, Tweens } from "phaser";
import type { Player } from "./player";
import type { UnitProperties, IUnitStats } from "./interfaces/unitproperties";
import type { PieceConfig } from "./configs/piececonfig";
import type { Types } from "phaser";
import { UnitConfig, UnitStats } from "./interfaces/ui";
import { UnitRangedProjectileType } from "./enums/unitrangedprojectiletype";

enum PieceState {
    Idle,
    Moving,
    Attacking,
    RangedAttacking,
    TurnOver,
}

/**
 * A game piece on the board. This can be a creature, wizard, structure, etc.
 */
export class Piece extends Entity {
    public static readonly units: { [key: string]: UnitConfig } = unitJsonData as any;

    /**
     * Duration of move animations (in ms).
     */
    static readonly DEFAULT_MOVE_DURATION: number = 750;

    /**
     * Duration of each step when moving in a multi-step move.
     */
    static readonly DEFAULT_STEP_MOVE_DURATION: number = 300;

    /**
     * Duration of highlight effect when selecting a piece.
     */
    static readonly DEFAULT_HIGHLIGHT_DURATION: number = 600;

    /**
     * Duration of each step in the highlight effect when selecting a piece.
     */
    static readonly DEFAULT_FLASH_HIGHLIGHT_STEPS: number = 3;

    /**
     * Duration of flash highlight effect when highlighting a piece.
     */
    static readonly DEFAULT_FLASH_HIGHLIGHT_DURATION: number = 100;

    /**
     * The highlight effect isn't a smooth pulse, but a stepped one.
     */
    static readonly DEFAULT_HIGHLIGHT_STEPS: number = 5;

    /**
     * Tint color to use when rendering a piece raised from the dead.
     */
    static readonly RAISED_DEAD_TINT: number = 0x55ffcc;

    /**
     * Amount to darken the piece's tint when it has moved this turn.
     */
    static readonly MOVED_DARKEN_AMOUNT: number = 25;

    /**
     * Alpha value to use when rendering a wizard in Shadow Form.
     */
    static readonly SHADOW_FORM_ALPHA: number = 0.4;

    /**
     * The unit ID of this piece, corresponding to the key in the units JSON
     * file.
     */
    protected readonly _unitId: string;

    protected _type: UnitType;
    protected _owner: Player | null;
    protected _properties: UnitProperties;
    protected _shadowScale: number;
    protected _shadow?: GameObjects.Image;
    protected _sprite?: GameObjects.Sprite;
    protected _effects: Map<UnitStatus, GameObjects.Sprite | GameObjects.Image>;
    protected _offsetY: number;
    protected _direction: UnitDirection;

    protected _dead: boolean;
    protected _raisedDead: boolean;
    protected _engulfed: boolean;
    protected _moved: boolean;
    protected _attacked: boolean;
    protected _rangedAttacked: boolean;
    protected _engaged: boolean;
    protected _illusion: boolean;

    protected _state: PieceState;

    protected _currentMount: Piece | null = null;
    protected _currentRider: Piece | null = null;

    public currentEngulfed: Piece | null = null;

    protected _ownerHighlightTween: Tweens.Tween;

    constructor(board: Board, id: number, config: PieceConfig) {
        super(board, id, config.x, config.y);
        this._type = config.type;
        this._unitId = config.properties.id;

        this._owner = config.owner ?? null;
        this._properties = {
            ...(config.properties ?? {
                id: "",
                name: "Unnamed Unit",
                movement: 1,
                combat: 3,
                rangedCombat: 0,
                range: 0,
                defense: 3,
                maneuverability: 3,
                magicResistance: 3,
                attackType: "hit",
                rangedType: "shot",
                status: [] as UnitStatus[],
                group: Piece.units[config.properties.id]?.group || "classicunits",
            }),
        };

        this._properties.status = [...this.properties.status ?? []];

        let directionOffset: number = this.position.x - this.position.y;
        if (directionOffset === 0) {
            directionOffset =
                this.position.x +
                this.position.y -
                (this.board.width / 2 + this.board.height / 2);
        }
        if (directionOffset > 0) {
            this._direction = UnitDirection.Left;
        } else if (directionOffset < 0) {
            this._direction = UnitDirection.Right;
        } else {
            this._direction = Math.random() < 0.5 ? UnitDirection.Left : UnitDirection.Right;
        }

        this._dead = false;
        this._engulfed = false;
        this._moved = false;
        this._attacked = false;
        this._rangedAttacked = false;
        this._engaged = false;

        this._state = PieceState.Idle;

        this._currentRider = null;
        this._currentMount = null;

        this._shadowScale = config.shadowScale || 3;
        this._offsetY = config.offsetY || 0;

        this._illusion = !!config.illusion;

        this._effects = new Map();

        setTimeout(() => {
            this.initSprites();
        });
    }

    /**
     * Initialise the piece's sprites. Will not create duplicate sprites if
     * they already exist.
     */
    protected initSprites() {
        this.createShadow();
        this.createSprite();
        this.createShaders();
    }

    /**
     * Whether this piece is currently highlighted on the board. Used to
     * indicate whether the piece can still be selected.
     */
    private _highlighted: boolean = false;

    /**
     * Get whether this piece is highlighted on the board.
     */
    get highlighted(): boolean {
        return this._highlighted;
    }

    /**
     * Set whether this piece is highlighted on the board.
     */
    set highlighted(state: boolean) {
        if (!this._ownerHighlightTween) {
            return;
        }
        if (state && this.canSelect) {
            this._highlighted = true;
            this._ownerHighlightTween.play().resume();
            return;
        }
        this._highlighted = false;
        this._ownerHighlightTween.stop();
    }

    /**
     * Flash a highlight effect on this piece. This is typically called by the
     * player pressing a number key from 1 to 8 to highlight their units.
     */
    async flashHighlight(): Promise<void> {
        if (!this._sprite) {
            return;
        }
        for (let i = 0; i < Piece.DEFAULT_FLASH_HIGHLIGHT_STEPS; i++) {
            this._sprite.setTintFill(0xffffff);
            await Board.delay(Piece.DEFAULT_FLASH_HIGHLIGHT_DURATION);
            this._sprite.setTintFill(this.owner?.colour ?? 0x000000);
            await Board.delay(Piece.DEFAULT_FLASH_HIGHLIGHT_DURATION);
        }
        this._sprite.clearTint();
        this._sprite.setTint(this.defaultTint);
    }

    /**
     * Get the default tint color for this piece. Normally it's white which does
     * not alter the piece's colors, but pieces that have been resurrected via
     * Raise Dead have a sallow green tint.
     * 
     */
    get defaultTint(): number {
        return this.raisedDead ? Piece.RAISED_DEAD_TINT : 0xffffff;
    }


    /**
     * Check if this piece's turn is over, i.e., it cannot perform any valid
     * actions this turn.
     */
    get turnOver(): boolean {
        return (
            (this.moved && !this.canAttack && !this.canRangedAttack) ||
            this.dead ||
            this.engulfed ||
            (this.moved && this.attacked && this.rangedAttacked)
        );
    }


    /**
     * End this piece's turn, marking all of its action flags as complete and
     * tinting it slightly darker.
     */
    set turnOver(state: boolean) {
        this.moved = this.attacked = this.rangedAttacked = state;

        if (state) {
            if (this._raisedDead) {
                this._sprite.setTint(
                    Display.Color.ValueToColor(
                        Piece.RAISED_DEAD_TINT
                    ).darken(Piece.MOVED_DARKEN_AMOUNT).color
                );
            } else {
                this._sprite.setTint(
                    Display.Color.ValueToColor(0xffffff).darken(
                        Piece.MOVED_DARKEN_AMOUNT
                    ).color
                );
            }
            this.highlighted = false;
        }
        else if (this._raisedDead) {
            this._sprite.setTint(Piece.RAISED_DEAD_TINT);
        }
        else {
            this._sprite?.setTint(this.defaultTint);
        }
    }

    /**
     * Get the type of this piece (creature, wizard, structure, etc.).
     */
    get type(): UnitType {
        return this._type;
    }

    /**
     * Get the owner of this piece (if any).
     */
    get owner(): Player | null {
        return this._owner || null;
    }

    /**
     * Set the owner of this piece. Can be set to null to indicate no owner,
     * e.g., for corpses or neutral pieces.
     */
    set owner(owner: Player | null) {
        this._owner = owner;
    }

    /**
     * Get the facing direction of this piece.
     */
    get direction(): UnitDirection {
        return this._direction;
    }

    /**
     * Set the facing direction of this piece.
     */
    set direction(direction: UnitDirection) {
        if (direction != this._direction) {
            this._direction = direction;
            this.playAnim();
        }
    }

    /**
     * Get whether this piece is dead. Cannot be set directly; use the `kill()`
     * method instead.
     */
    get dead(): boolean {
        return this._dead;
    }

    /**
     * Get the name of this piece.
     */
    get name(): string {
        return this._properties?.name || "Unnamed unit";
    }

    /**
     * Get the full name of this piece, including the owner's name.
     */
    get fullName(): string {
        if (this.owner) {
            return `${this.owner.name}'s ${this.name}`;
        }
        return this.name;
    }

    /**
     * Get the sprite representing this piece.
     */
    get sprite(): GameObjects.Sprite {
        if (!this._sprite) {
            this.createSprite();
        }
        return this._sprite;
    }

    /**
     * Get the shadow sprite for this piece.
     */
    get shadow(): GameObjects.Image {
        if (!this._shadow) {
            this.createShadow();
        }
        return this._shadow;
    }

    /**
     * Get whether this piece has moved this turn.
     */
    get moved(): boolean {
        if (this.stats.movement === 0 || this._engaged) {
            return true;
        }
        return this._moved;
    }

    /**
     * Set whether this piece has moved this turn.
     */
    set moved(moved: boolean) {
        this._moved = moved;
        if (this.currentRider) {
            if (this.currentRider.moved !== moved) {
                this.currentRider.moved = moved;
            }
        }
    }

    /**
     * Get whether this piece has attacked this turn.
     */
    get attacked(): boolean {
        if (this.stats.combat === 0) {
            return true;
        }
        return this._attacked;
    }

    /**
     * Set whether this piece has attacked this turn.
     */
    set attacked(attacked: boolean) {
        this._moved = attacked;
        this._attacked = attacked;
        if (this.currentRider) {
            if (this.currentRider.moved !== attacked) {
                this.currentRider.moved = attacked;
            }
            if (this.currentRider.attacked !== attacked) {
                this.currentRider.attacked = attacked;
            }
        }
    }

    /**
     * Get whether this piece has performed a ranged attack this turn.
     */
    get rangedAttacked(): boolean {
        if (this.stats.rangedCombat === 0 || this.stats.range === 0) {
            return true;
        }
        return this._rangedAttacked;
    }

    /**
     * Set whether this piece has performed a ranged attack this turn.
     */
    set rangedAttacked(rangedAttacked: boolean) {
        this._moved = rangedAttacked;
        this._attacked = rangedAttacked;
        this._rangedAttacked = rangedAttacked;
        if (this.currentRider) {
            if (this.currentRider.moved !== rangedAttacked) {
                this.currentRider.moved = rangedAttacked;
            }
            if (this.currentRider.attacked !== rangedAttacked) {
                this.currentRider.attacked = rangedAttacked;
            }
        }
        if (this.currentMount) {
            if (this.currentMount.moved !== rangedAttacked) {
                this.currentMount.moved = rangedAttacked;
            }
            if (this.currentMount.attacked !== rangedAttacked) {
                this.currentMount.attacked = rangedAttacked;
            }
        }
    }

    /**
     * Get whether this piece is currently engaged in combat, i.e., it can't
     * move away, and must either attack an adjacent enemy or end its turn.
     */
    get engaged(): boolean {
        return this._engaged;
    }

    /**
     * Set whether this piece is currently engaged in combat.
     */
    set engaged(engaged: boolean) {
        this._engaged = engaged;
    }

    /**
     * Set whether this piece is currently engulfed by another piece.
     */
    set engulfed(engulfed: boolean) {
        this._engulfed = engulfed;
        setTimeout(() => {
            if (this._engulfed) {
                this.board.logger.log(
                    `${this.name} was engulfed`,
                    Colour.Magenta
                );
                this.sprite?.setVisible(false);
                this.shadow?.setVisible(false);
            } else {
                this.board.logger.log(
                    `${this.name} was released`,
                    Colour.Green
                );
                this.sprite?.setVisible(true);
                this.shadow?.setVisible(true);
            }
        });
    }

    /**
     * Get whether this piece is currently engulfed by another piece.
     */
    get engulfed(): boolean {
        return this._engulfed;
    }

    /**
     * Get whether this piece is an illusion.
     */
    get illusion(): boolean {
        return this._illusion;
    }

    /**
     * Get whether this piece was raised from the dead. Used mainly to apply a
     * visual tint to the piece, as the mechanical aspects are handled by the
     * `Undead` status, but we don't want _naturally_ undead units to have the 
     * tint.
     */
    get raisedDead(): boolean {
        return this._raisedDead;
    }

    /**
     * Set whether this piece was raised from the dead.
     */
    set raisedDead(raisedDead: boolean) {
        this._raisedDead = raisedDead;
        if (raisedDead) {
            this.sprite.setTint(Piece.RAISED_DEAD_TINT);
        }
    }

    /**
     * Get the stats for this piece, taking into account any status effects.
     */
    get stats(): IUnitStats {
        const stats: IUnitStats = {
            movement: this._properties.movement,
            combat: this._properties.combat,
            rangedCombat: this._properties.rangedCombat,
            range: this._properties.range,
            defense: this._properties.defense,
            maneuverability: this._properties.maneuverability,
            magicResistance: this._properties.magicResistance
        };

        // TODO: This should really be defined by the spell system, maybe by
        // layering additional modifiers on top of the base stats.
        if (this.hasStatus(UnitStatus.ShadowForm)) {
            stats.movement = 3;
            stats.defense = Math.min(stats.defense + 3,9);
        }
        if (this.hasStatus(UnitStatus.MagicSword)) {
            stats.combat = Math.min(stats.combat + 6,9);
        }
        else if (this.hasStatus(UnitStatus.MagicKnife)) {
            stats.combat = Math.min(stats.combat + 3,9);
        }
        if (this.hasStatus(UnitStatus.MagicArmour)) {
            stats.defense = Math.min(stats.defense + 6,9);
        }
        else if (this.hasStatus(UnitStatus.MagicShield)) {
            stats.defense = Math.min(stats.defense + 3,9);
        }
        if (this.hasStatus(UnitStatus.MagicBow)) {
            stats.rangedCombat = 3;
            stats.range = 6;
        }
        if (this.hasStatus(UnitStatus.MagicWings)) {
            stats.movement = 6;
        }
        return stats;
    }

    /**
     * Get the properties of this piece from the original JSON unit definition.
     */
    get properties(): UnitProperties {
        return this._properties;
    }

    /**
     * Get the overall strength of this piece
     */
    get strength(): number {
        let strength: number = 0;
        
        // Start with base melee attack strength
        strength += this.stats.combat;
        
        // Add ranged attack strength if applicable, with range as a bonus
        if (this.stats.rangedCombat > 0) {
            strength += this.stats.rangedCombat + this.stats.range;
        }

        // Add movement range
        strength += this.stats.movement;

        // Higher defense increases strength
        strength += this.stats.defense;

        // Magic resistance doesn't have as big an impact as it's mainly only
        // relevant against wizards
        strength += this.stats.magicResistance / 2;

        // If the unit is undead, add a small bonus
        if (this.hasStatus(UnitStatus.Undead) || this.raisedDead) {
            strength += 2;
        }

        return strength;
    }

    /**
     * Set the current rider of this piece (if any). This is called via the
     * mount/dismount actions.
     */
    set currentRider(rider: Piece | null) {
        if (!rider) {
            this._currentRider = null;
            return;
        }
        if (
            !this.hasStatus(UnitStatus.Mount) &&
            !this.hasStatus(UnitStatus.MountAny)
        ) {
            console.error("Cannot mount an unmountable unit");
            return;
        }
        this._currentRider = rider;
    }

    /**
     * Get the current rider of this piece (if any).
     */
    get currentRider(): Piece | null {
        return this._currentRider;
    }

    set currentMount(mount: Piece | null) {
        this._currentMount = mount;

        // When if we're dismounting, we need to make the piece visible again,
        // but if we still have shadow form, we need to keep it semi-transparent
        const visibleAlpha: number = this.hasStatus(UnitStatus.ShadowForm) ? Piece.SHADOW_FORM_ALPHA : 1;

        this.board.scene.tweens.add({
            targets: [this._sprite, this._shadow, ...this._effects.values()],
            alpha: mount ? 0 : visibleAlpha,
            duration: Piece.DEFAULT_MOVE_DURATION / 2,
        });
    }

    /**
     * Get the piece this piece is mounted on (if any).
     */
    get currentMount(): Piece | null {
        return this._currentMount;
    }

    /**
     * Visually update the position of this piece on the board with a tween for
     * a smooth movement animation.
     * 
     * @param duration Duration of the move animation (in ms).
     * @returns A promise that resolves when the animation is complete.
     */
    async updatePosition(
        duration: number = Piece.DEFAULT_MOVE_DURATION
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!this._sprite) {
                return;
            }

            const isoPosition: Geom.Point = this.board.getIsoPosition(
                this.position
            );

            const difference: number = Board.distance(
                new Geom.Point(this._sprite.x, this._sprite.y),
                isoPosition
            );

            // A little hop for the piece as it moves
            this.board.scene.tweens.add({
                targets: [this._sprite],
                // Limit hop height to 120px no matter how far we move
                displayOriginY: `+${Math.min(120, difference * 1.5)}`,
                duration: duration / 2,
                yoyo: true,
            });

            // Move the piece to the new position
            this.board.scene.tweens.add({
                targets: [this._sprite, this._shadow],
                x: isoPosition.x,
                y: isoPosition.y - this._offsetY,
                duration: duration,
                onUpdateScope: this,
                ease: PMath.Easing.Cubic.InOut,
                onUpdate: () => {
                    this.updateDepth();
                },
                onCompleteScope: this,
                onComplete: () => {
                    this.updateDepth();
                    resolve();
                },
            });
        });
    }

    /**
     * Update the depth of this piece's sprite based on its current Y position.
     */
    protected updateDepth() {
        this._sprite?.setDepth(this._sprite?.y);
    }

    /**
     * Get the depth value for this piece based on its Y position.
     */
    get depth(): number {
        return this._sprite?.y || 0;
    }

    /**
     * Update the facing direction of this piece based on movement from one
     * point to another.
     * 
     * @param fromPoint The starting point of the movement.
     * @param toPoint The ending point of the movement.
     */
    protected updateDirection(
        fromPoint: Geom.Point,
        toPoint: Geom.Point
    ) {
        const isoXOffset: number =
            Board.toIsometric(toPoint).x - Board.toIsometric(fromPoint).x;

        // No change in X direction means no change in facing direction
        if (isoXOffset === 0) {
            return;
        }
        // Otherwise, face left or right based on X offset
        this.direction = isoXOffset < 0 ? UnitDirection.Left : UnitDirection.Right;
    }

    /**
     * Move this piece to the specified point on the board, updating its
     * facing direction accordingly.
     * 
     * @param point The point to move to.
     * @param stepDuration Optional duration for the move animation.
     */
    async moveTo(point: Geom.Point, stepDuration?: number) {
        this.updateDirection(this.position, point);
        this.position = point;
        if (this.currentRider) {
            this.currentRider.position = point;
            this.currentRider.updatePosition(stepDuration);
        }
        if (
            this.currentMount &&
            !Geom.Point.Equals(this.currentMount.position, this.position)
        ) {
            await this.board.dismountPiece(this.id);
        }
        await this.updatePosition(stepDuration);
    }

    /**
     * Spread this piece to adjacent squares, potentially engulfing or
     * destroying any pieces it spreads over.
     * 
     * @returns A promise that resolves when the spread action is complete.
     */
    async spread(): Promise<void> {
        if (!this.hasStatus(UnitStatus.Spreads) || this.dead) {
            throw new Error("Cannot spread a non-spreading or dead piece");
        }
        const spreadAction: SpreadAction = PMath.RND.pick([
            SpreadAction.Spread,
            SpreadAction.Spread,
            SpreadAction.Spread,
            SpreadAction.Spread,
            SpreadAction.Spread,
            SpreadAction.None,
            SpreadAction.None,
            SpreadAction.Shrink,
        ]);
        if (spreadAction === SpreadAction.None) {
            return;
        }
        if (spreadAction === SpreadAction.Shrink) {
            if (this.currentEngulfed) {
                this.currentEngulfed.engulfed = false;
                this.board.logger.log(
                    `${this.currentEngulfed.fullName} was released from ${this.fullName}`,
                    Colour.Green
                );
            }
            await new Promise((resolve, reject) => {
                this.board.scene.tweens.add({
                    targets: this.sprite,
                    duration: Piece.DEFAULT_MOVE_DURATION / 2,
                    scale: { from: 1, to: 0 },
                    onComplete: () => {
                        resolve(0);
                    },
                });
            });
            await this.destroy();
        }
        if (spreadAction === SpreadAction.Spread) {
            const adjacentPoints: Geom.Point[] =
                this.board.getAdjacentPoints(this.position);
            const spreadPoint: Geom.Point =
                PMath.RND.pick(adjacentPoints);
            const spreadPieces: Piece[] = this.board.getPiecesAtPosition(
                spreadPoint,
                (piece: Piece) => !piece.dead
            );

            if (spreadPieces.length > 0) {
                // Don't spread over owned or unspreadable pieces
                if (
                    spreadPieces.some(
                        (piece) =>
                            piece.owner === this.owner || !piece.canBeSpreadOn
                    )
                ) {
                    return;
                }
                // If spreading over a wizard (mounted or otherwise) we should
                // defeat them immediately
                if (
                    spreadPieces.some((piece) =>
                        piece.hasStatus(UnitStatus.Wizard)
                    )
                ) {
                    const killedPiece: Piece = spreadPieces.find((piece) => piece.hasStatus(UnitStatus.Wizard));
                    this.board.logger.log(
                        `${killedPiece.fullName} was destroyed by ${this.fullName}!`,
                        Colour.Red
                    );
                    await killedPiece.kill();
                } else if (this.hasStatus(UnitStatus.Engulfs)) {
                    this.board.logger.log(
                        `${this.fullName} has engulfed ${spreadPieces[0].fullName}`,
                        Colour.Yellow
                    );
                    spreadPieces[0].engulfed = true;
                } else {
                    await Promise.all(
                        spreadPieces.map(async (piece) => {
                            this.board.logger.log(
                                `${piece.fullName} was destroyed by ${this.fullName}`,
                                Colour.Red
                            );
                            // TODO: This should happen in the effect system
                            switch (this.properties.attackType) {
                                case UnitAttackType.Burned:
                                    await this.board.playEffect(
                                        EffectType.DragonFireHit,
                                        piece.sprite.getCenter(),
                                        null,
                                        piece
                                    );
                                    break;
                            }
                            return await piece.destroy();
                        })
                    );
                }
            }

            const unit: any = Piece.getUnitConfig(this.properties.id);

            const newPiece: Piece = await this.board.addPiece({
                type: UnitType.Creature,
                x: spreadPoint.x,
                y: spreadPoint.y,
                properties: {
                    id: this._unitId,
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
                    status: [...(unit.status || [])],
                },
                shadowScale: unit.shadowScale,
                offsetY: unit.offY,
                owner: this.owner,
                illusion: !!this._illusion,
                group: unit.group || "classicunits",
            } as PieceConfig);

            this.board.sound.play(`blob${PMath.RND.integerInRange(1, 2)}`);

            if (spreadPieces.length) {
                if (
                    newPiece.hasStatus(UnitStatus.Engulfs) &&
                    !spreadPieces[0].dead &&
                    !spreadPieces[0].hasStatus(UnitStatus.Wizard)
                ) {
                    newPiece.currentEngulfed = spreadPieces[0];
                } else {
                    await this.board.idleDelay(Piece.DEFAULT_MOVE_DURATION);
                }
            }
        }
    }

    /**
     * Raise this piece from the dead, assigning its new owner in the process.
     * 
     * @param owner The new owner of the raised piece.
     */
    async raiseDead(owner: Player | null): Promise<void> {
        if (!this.dead) {
            throw new Error("Cannot raise a piece that is not dead");
        }
        this.owner = owner;
        this._dead = false;
        this.raisedDead = true;
        if (this.sprite) {
            this.sprite.setVisible(true);
            this.playAnim();
        }
        this.addStatus(UnitStatus.Undead);
    }

    /**
     * Add a status effect to this piece.
     * 
     * @param status The status effect to add.
     * @returns True if the status was added, false if it was already present.
     */
    addStatus(status: UnitStatus): boolean {
        if (!this.hasStatus(status)) {
            this._properties.status.push(status);
            return true;
        }
        return false;
    }

    /**
     * Remove a status effect from this piece.
     * 
     * @param status The status effect to remove.
     * @returns True if the status was removed, false if it was not present.
     */
    removeStatus(status: UnitStatus): boolean {
        if (this.hasStatus(status)) {
            this._properties.status = this._properties.status.filter(
                (s) => s !== status
            );
            return true;
        }
        return false;
    }

    /**
     * Check if this piece has a specific status effect.
     * 
     * @param status The status effect to check for.
     * @returns True if the piece has the status effect, false otherwise.
     */
    hasStatus(status: UnitStatus): boolean {
        return this._properties.status.includes(status);
    }

    /**
     * Check if a point is within this piece's movement range.
     * 
     * @param point The point to check.
     * @returns True if the point is within movement range, false otherwise.
     */
    inMovementRange(point: Geom.Point): boolean {
        // Cannot move to the same point
        if (Geom.Point.Equals(this.position, point)) {
            return false;
        }
        // Mounted units can only move to adjacent squares
        if (this.currentMount) {
            if (Board.distance(this.position, point) > 1.5) {
                return false;
            }
        }
        // Flying units can move anywhere within their movement stat
        if (this.hasStatus(UnitStatus.Flying) && Board.distance(this.position, point, RangeType.Fly) <= this.stats.movement) {
            return true;
        }
        if (!this.board.rangeGizmo.getPathTo(point)) {
            return false;
        }
        return true;
    }

    /**
     * Check if a point is within this piece's attack range.
     * 
     * @param point The point to check.
     * @returns True if the point is within attack range, false otherwise.
     */
    inAttackRange(point: Geom.Point): boolean {
        // If we haven't moved yet, we can attack anywhere within movement
        if (
            !this.moved && // Haven't moved yet
            this.inMovementRange(point) && // Point is within movement range
            (
                this.hasStatus(UnitStatus.Flying) || // Flying units can attack anywhere within movement
                this.board.rangeGizmo.getPathTo(point) // Otherwise, needs a valid path to point
            )
        ) {
            return true;
        }
        // Otherwise, we can only attack adjacent squares
        if (Board.distance(this.position, point) > 1.5) {
            return false;
        }
        return true;
    }

    /**
     * Check if a point is within this piece's ranged attack range.
     * 
     * @param point The point to check.
     * @returns True if the point is within ranged attack range, false otherwise.
     */
    inRangedAttackRange(point: Geom.Point): boolean {
        if (Board.distance(this.position, point, RangeType.RangedAttack) > this.stats.range) {
            return false;
        }
        return true;
    }

    /**
     * Find all pieces that pose a threat to this piece, e.g., pieces that can
     * attack it within the coming turn, or spreading units that are nearby.
     * 
     * @returns A set of pieces that threaten this piece.
     */
    findThreatPieces(): Set<Piece> {
        const threatPieces: Set<Piece> = new Set<Piece>();

        const allPieces: Piece[] = this.board.pieces.filter(
            (piece: Piece) =>
                piece.owner !== this.owner && // Only enemy pieces
                !piece.dead && // Only alive pieces
                !piece.currentRider && // Ignore riders of mounted units
                !piece.engulfed && // Ignore engulfed pieces
                (
                    (piece.canAttackPiece(this) && this.inAttackRange(piece.position)) || // That can attack this piece
                    (piece.canRangedAttackPiece(this) && this.inRangedAttackRange(piece.position)) || // Or ranged attack this piece
                    (piece.hasStatus(UnitStatus.Spreads) && Board.distance(piece.position, this.position) <= 3) // Is a nearby spreading unit
                )
        );

        allPieces.forEach((piece: Piece) => {
            threatPieces.add(piece);
        });

        return threatPieces;
    }

    /**
     * Check if this piece can be selected. A piece cannot be selected if it is
     * dead, has already ended its turn, is a structure, has zero movement,
     * combat, and ranged combat, or is currently engulfed by another piece.
     */
    get canSelect(): boolean {
        if (this._engulfed) {
            return false;
        }
        if (
            (this.hasStatus(UnitStatus.Mount) ||
                this.hasStatus(UnitStatus.MountAny)) &&
            this.currentRider?.owner === this.board.currentPlayer &&
            !this.currentRider.turnOver
        ) {
            return true;
        }
        if (
            this.dead ||
            this.turnOver ||
            this.hasStatus(UnitStatus.Structure) ||
            (this.stats.combat === 0 &&
                this.stats.rangedCombat === 0 &&
                this.stats.movement === 0)
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can be disbelieved (i.e., a potentially illusionary
     * unit)
     */
    get canBeDisbelieved(): boolean {
        return (
            this.type === UnitType.Creature && // Only creatures can be disbelieved
            !this.hasStatus(UnitStatus.Wizard) && // Cannot disbelieve wizards
            !this.hasStatus(UnitStatus.Structure) && // Cannot disbelieve structures
            !this.hasStatus(UnitStatus.Spreads) && // Cannot disbelieve spreading units
            !this.hasStatus(UnitStatus.Tree) // Cannot disbelieve trees
        );
    }

    /**
     * Check if this piece can be spread on by spreading units.
     */
    get canBeSpreadOn(): boolean {
        return (
            (this.type === UnitType.Creature || // Only creatures and wizards can be spread on
                this.type === UnitType.Wizard) && 
            !this.hasStatus(UnitStatus.Engulfs) && // Cannot be spread on if it engulfs
            !this.hasStatus(UnitStatus.Invulnerable) && // Cannot be spread on if invulnerable
            !this.hasStatus(UnitStatus.Structure) && // Cannot be spread on if a structure
            !this.hasStatus(UnitStatus.Tree) // Cannot be spread on if a tree
        );
    }

    /**
     * Check if this piece can have the Subversion spell cast on it.
     */
    get canBeSubverted(): boolean {
        return (
            this.type === UnitType.Creature && // Only creatures can be subverted
            !this.currentRider && // Cannot subvert a unit with an active rider
            !this.currentMount && // Cannot subvert a mounted unit
            !this.hasStatus(UnitStatus.Wizard) && // Cannot subvert wizards
            !this.hasStatus(UnitStatus.Spreads) && // Cannot subvert spreading units
            !this.hasStatus(UnitStatus.Structure) && // Cannot subvert structures
            !this.hasStatus(UnitStatus.Tree) && // Cannot subvert trees
            !this.hasStatus(UnitStatus.Invulnerable) // Cannot subvert invulnerable units
        );
    }

    /**
     * Check if this piece can be magic attacked. Currently only checks for
     * invulnerability, but other statuses could be added in future for this,
     * such as Sanctity.
     */
    get canBeMagicAttacked(): boolean {
        return (
            !this.hasStatus(UnitStatus.Invulnerable) && // Cannot be magic attacked if invulnerable
            !this.hasStatus(UnitStatus.Sanctity) // Cannot be magic attacked if has sanctity
        );
    }

    /**
     * Check if this piece can perform a melee attack.
     * 
     * @returns True if this piece can perform a melee attack, false otherwise.
     */
    get canAttack(): boolean {
        const neighbours: Piece[] = this.getNeighbours();

        if (
            this._dead || // Cannot attack when dead
            this.engulfed || // Cannot attack when engulfed
            this.attacked || // Cannot attack if already attacked
            this.stats.combat === 0 || // Cannot attack with zero combat
            neighbours.length === 0 || // No neighbours to attack
            neighbours.filter((neighbour: Piece) =>
                this.canAttackPiece(neighbour)
            ).length === 0 // Must be in attack range of at least one neighbour
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can move.
     * 
     * @returns True if this piece can move, false otherwise.
     */
    get canMove(): boolean {
        if (
            this._dead || // Cannot move when dead
            this.engulfed || // Cannot move when engulfed
            this.stats.movement === 0 || // Cannot move with zero movement
            this.hasStatus(UnitStatus.Structure) || // Cannot move if a structure
            this.hasStatus(UnitStatus.Tree) // Cannot move if a tree
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can attack a piece that may be undead. Only pieces
     * that are themselves undead or have the `AttackUndead` status can attack
     * other undead pieces.
     * 
     * @param piece The piece to check against.
     * @returns True if this piece can attack the possibly undead piece, false otherwise.
     */
    canAttackPossiblyUndeadPiece(piece: Piece): boolean {
        if (
            piece.hasStatus(UnitStatus.Undead) &&
            !this.hasStatus(UnitStatus.Undead) &&
            !this.hasStatus(UnitStatus.AttackUndead)
        ) { 
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can attack the given piece. Does not check for Undead
     * status; use `canAttackPossiblyUndeadPiece` for that.
     * 
     * @param piece The piece to check against.
     * @returns True if this piece can attack the given piece, false otherwise.
     */
    canAttackPiece(piece: Piece): boolean {
        if (
            this == piece || // Cannot attack self
            this.owner === piece.owner || // Cannot attack own pieces
            piece == this.currentRider || // Cannot attack mounted rider
            this._dead || // Cannot attack when dead
            this.engulfed || // Cannot attack when engulfed
            this.attacked || // Cannot attack if already attacked
            piece.dead || // Cannot attack dead pieces
            piece.engulfed || // Cannot attack engulfed pieces
            piece.currentMount || // Cannot attack mounted pieces
            piece.hasStatus(UnitStatus.Invulnerable) // Cannot attack invulnerable pieces
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can perform a ranged attack.
     * 
     * @returns True if this piece can perform a ranged attack, false otherwise.
     */
    get canRangedAttack(): boolean {
        if (
            this._dead || // Cannot attack when dead
            this.engulfed || // Cannot attack when engulfed
            this.rangedAttacked || // Cannot attack if already attacked
            this.stats.rangedCombat === 0 || // Cannot attack with zero ranged combat
            this.board.pieces.filter((piece: Piece) =>
                this.canRangedAttackPiece(piece) 
            ).length === 0 // Must be in ranged attack range
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can perform a ranged attack on the given piece. Does
     * not check for Undead status; use `canAttackPossiblyUndeadPiece` for that.
     * 
     * @param piece The piece to check against.
     * @returns True if this piece can perform a ranged attack on the given piece, false otherwise.
     */
    canRangedAttackPiece(piece: Piece): boolean {
        if (
            this == piece || // Cannot attack self
            this.owner === piece.owner || // Cannot attack own pieces
            piece == this.currentRider || // Cannot attack mounted rider
            this._dead || // Cannot attack when dead
            this.engulfed || // Cannot attack when engulfed
            piece.dead || // Cannot attack dead pieces
            this.rangedAttacked || // Cannot attack if already attacked
            piece.engulfed || // Cannot attack engulfed pieces
            piece.currentMount || // Cannot attack mounted pieces
            !this.moved || // Must have moved or be in range
            piece.hasStatus(UnitStatus.Invulnerable) || // Cannot attack invulnerable pieces
            !this.inRangedAttackRange(piece.position) || // Must be in ranged attack range
            !this.board.hasLineOfSight(this.position, piece.position) // Must have line of sight
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can mount the given piece.
     * 
     * @param piece The piece to check against.
     * @returns True if this piece can mount the given piece, false otherwise.
     */
    canMountPiece(piece: Piece): boolean {
        if (
            this != piece && // Cannot mount self
            !this._dead && // Cannot mount when dead
            !this.engulfed && // Cannot mount when engulfed
            !piece.dead && // Cannot mount dead pieces
            !this.moved && // Must not have moved
            this.hasStatus(UnitStatus.Wizard) && // Must be a wizard
            !piece.currentRider && // Cannot mount already mounted pieces
            ((piece.hasStatus(UnitStatus.Mount) && piece.owner === this.owner) || // Must be mountable by owner
            piece.hasStatus(UnitStatus.MountAny))// or mountable by anyone (e.g., Magic Wood)
        ) {
            return true;
        }
        return false;
    }

    /**
     * Check if this piece can become engaged in combat with the given piece.
     * 
     * @param piece The piece to check against.
     * @returns True if this piece can engage the given piece, false otherwise.
     */
    canEngagePiece(piece: Piece): boolean {
        if (
            this == piece || // Cannot engage self
            this._dead || // Cannot engage when dead
            this.engulfed || // Cannot engage when engulfed
            piece.engulfed || // Cannot engage engulfed pieces
            piece.dead || // Cannot engage dead pieces
            this.stats.maneuverability === 0 || // Cannot engage with zero maneuverability
            piece.stats.maneuverability === 0 || // Cannot engage pieces with zero maneuverability
            this.currentMount || // Cannot engage when mounted
            piece.currentMount || // Cannot engage mounted pieces
            this.owner === piece.owner
        ) {
            return false;
        }
        return true;
    }

    /**
     * Get the first neighbouring piece that this piece can become engaged with.
     * 
     * @returns The first piece that can be engaged with, or null if none found.
     */
    getFirstEngagingPiece(): Piece | null {
        const neighbours: Piece[] = this.getNeighbours();
        for (const neighbour of neighbours) {
            if (this.canEngagePiece(neighbour)) {
                return neighbour;
            }
        }
        return null;
    }

    /**
     * Engage this piece with the given piece.
     * 
     * @param piece The piece to engage with.
     */
    async engage(piece: Piece): Promise<void> {
        if (this.canEngagePiece(piece)) {
            this.engaged = true;
            this.attacked = false;
            piece.engaged = true;
        }
        this.board.logger.log(
            `${this.name} is engaged with ${piece.name}`,
            Colour.Yellow
        );
        await this.board.sound.playAsync("engaged", {
            delay: Board.DEFAULT_DELAY
        });
    }

    /**
     * Get all neighbouring pieces that are not dead.
     * 
     * @returns An array of non-dead neighbouring pieces.
     */
    getNeighbours(): Piece[] {
        return this.board.getAdjacentPiecesAtPosition(
            this.position,
            (piece: Piece) => !piece.dead
        );
    }

    /**
     * Perform an attack on the given piece.
     * 
     * @param piece The piece to attack.
     * @returns True if the attack was successful, false otherwise.
     */
    async attack(piece: Piece): Promise<boolean> {
        if (this.canAttackPiece(piece)) {
            if (
                !this.canAttackPossiblyUndeadPiece(piece)
            ) {
                this.board.logger.log(
                    `${this.name} cannot attack the undead`,
                    Colour.Cyan
                );
                await this.board.sound.playAsync("undead", {
                    delay: Board.DEFAULT_DELAY
                });
                return false;
            }

            this.updateDirection(this.position, piece.position);
            this.attacked = true;
            this.moved = true;

            const rollSuccess: boolean = this.board.roll(
                this.stats.combat,
                piece.stats.defense
            );

            this.board.sound.play("attackonly");
            this.board.logger.log(
                `${this.name} ${this.properties.attackType} ${piece.name}`,
                Colour.Yellow
            );
            await this.board.playEffect(EffectType.AttackHit, piece.sprite.getCenter(), null, piece);
            await Board.delay(Board.DEFAULT_DELAY);

            // Shadow Form is lost on attacking, regardless of success
            if (this.hasStatus(UnitStatus.ShadowForm)) {
                this.removeStatus(UnitStatus.ShadowForm);
            }

            if (rollSuccess) {
                this.board.logger.log(`${this.fullName} defeated ${piece.fullName}`, Colour.Red);
                this.board.sound.play("killcreature");
                await piece.kill();
                // If the attacked piece was killed and the attacker can move,
                // move into the killed piece's position
                if (
                    this.board.getPiecesAtPosition(
                        piece.position,
                        (piece: Piece) => {
                            return !piece.dead;
                        }
                    ).length === 0 &&
                    this.canMove
                ) {
                    await this.board.movePiece(this.id, piece.position);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Perform a ranged attack on the given piece.
     * 
     * @param piece The piece to attack.
     * @returns True if the attack was successful, false otherwise.
     */
    async rangedAttack(piece: Piece): Promise<boolean> {
        if (this.canRangedAttackPiece(piece)) {
            if (
                !this.canAttackPossiblyUndeadPiece(piece)
            ) {
                await this.board.sound.playAsync("undead", {
                    delay: Board.DEFAULT_DELAY
                });
                this.board.logger.log(
                    `${this.name} cannot attack the undead`,
                    Colour.Cyan
                );
                return false;
            }
            this.updateDirection(this.position, piece.position);

            let beamEffectType: EffectType;
            let hitEffectType: EffectType;
            let beamSound: string;
            let hitSound: string;

            // TODO: Combine this with the same code in AttackSpell
            switch (this.properties.projectileType) {
                case UnitRangedProjectileType.Lightning:
                    beamEffectType = EffectType.LightningBeam;
                    hitEffectType = EffectType.LightningHit;
                    beamSound = "lightning4";
                    hitSound = "lightningexplode";
                    break;
                case UnitRangedProjectileType.DragonFire:
                    beamEffectType = EffectType.DragonFireBeam;
                    hitEffectType = EffectType.DragonFireHit;
                    beamSound = "dragonfire6";
                    hitSound = "dragonfireexplosion";
                    break;
                case UnitRangedProjectileType.BlackDragonFire:
                    beamEffectType = EffectType.BlackDragonFireBeam;
                    hitEffectType = EffectType.BlackDragonFireHit;
                    beamSound = "dragonfire6";
                    hitSound = "dragonfireexplosion";
                    break;
                case UnitRangedProjectileType.MagicBolt:
                    beamEffectType = EffectType.MagicBoltBeam;
                    hitEffectType = EffectType.MagicBoltHit;
                    beamSound = "magicbolt6";
                    hitSound = "magicboltexplode";
                    break;
                case UnitRangedProjectileType.Arrow:
                default:
                    beamEffectType = EffectType.ArrowBeam;
                    hitEffectType = EffectType.ArrowHit;
                    beamSound = "bowfire6";
                    hitSound = "bowhit";
                    break;
            }

            this.board.sound.play(beamSound);
            await this.board.playEffect(
                beamEffectType,
                this.sprite.getCenter(),
                piece.sprite.getCenter(),
                piece
            );

            this.board.sound.play(hitSound);
            await this.board.playEffect(
                hitEffectType,
                piece.sprite.getCenter(),
                null,
                piece
            );

            this.rangedAttacked = true;
            this.attacked = true;
            this.moved = true;

            const rollSuccess: boolean = this.board.roll(
                this.stats.rangedCombat,
                piece.stats.defense
            );

            this.board.logger.log(
                `${this.name} ${this.properties.rangedType} ${piece.name}`,
                Colour.Orange
            );

            await Board.delay(Board.DEFAULT_DELAY / 2);

            if (rollSuccess) {
                if (this.hasStatus(UnitStatus.ShadowForm)) {
                    this.removeStatus(UnitStatus.ShadowForm);
                }
                this.board.sound.play("killcreature");
                this.board.logger.log(
                    `${this.fullName} defeated ${piece.fullName}`,
                    Colour.Red
                );
                await piece.kill();
                return true;
            }
        }
        return false;
    }

    /**
     * Kill this piece.
     * 
     * @param silent Whether to suppress sound effects, e.g., when you just want to apply the status of dead without the effects.
     * @returns A promise that resolves when the kill action is complete.
     */
    async kill(silent: boolean = false): Promise<void> {
        if (this.dead) {
            throw new Error("Cannot kill unit that is already dead");
        }
        if (this.currentRider) {
            await this.currentRider.dismount();
            // A dismounted rider from a killed mount that didn't take its turn
            // gets to take the turn instead
            if (!this.turnOver) {
                this.currentRider.reset();
            }
        }
        if (this.currentEngulfed) {
            this.currentEngulfed.engulfed = false;
            this.currentEngulfed = null;
        }
        this.owner = null;
        this._dead = true;
        if (this.illusion) {
            await this.board.playEffect(
                EffectType.DisbelieveHit,
                this.sprite.getCenter()
            );
            await this.destroy();
        } else if (
            this.hasStatus(UnitStatus.NoCorpse) ||
            this.hasStatus(UnitStatus.Undead)
        ) {
            silent = true;
            await this.board.playEffect(
                EffectType.NoCorpseDeath,
                this.sprite.getCenter()
            );
            await this.destroy();
        }
        if (!silent) {
            this.board.sound.play("killcreature");
        }
        if (!this._sprite) {
            return;
        }
        if (
            this._sprite.texture.has(
                this._properties.id + `_${this._direction}_d`
            )
        ) {
            this._sprite.setDepth(this._sprite.depth - 1);
            this.playAnim();
        } else {
            this._sprite.visible = false;
        }
        this.board.emitBoardUpdateEvent();
        await Board.delay(Board.DEFAULT_DELAY);
    }

    /**
     * Mount this piece upon the given piece.
     * 
     * @param piece The piece to mount.
     */
    async mount(piece: Piece): Promise<void> {
        if (!this.canMountPiece(piece)) {
            throw new Error(`${this.name} cannot mount ${piece.name}`);
        }
        this.moved = true;
        this.attacked = true;
        piece.moved = true;

        this.currentMount = piece;
        piece.currentRider = this;            
        await this.board.movePiece(this.id, piece.position);
        this.board.logger.log(
            `${this.fullName} mounted ${piece.fullName}`
        );
        piece.createShaders(true, this.owner);
    }

    /**
     * Dismount this piece from its current mount.
     */
    async dismount(): Promise<void> {
        if (!this.currentMount) {
            throw new Error(`${this.name} is not mounted`);
        }
        this.currentMount.currentRider = null;

        this.moved = true;
        this.currentMount.turnOver = true;
        this.board.logger.log(
            `${this.fullName} dismounted ${this.currentMount.fullName}`
        );
        this.currentMount.createShaders(true);
        this.currentMount = null;
    }

    /**
     * Destroy this piece, removing it from the board. This a more nuclear
     * option than `kill`, as it removes the piece entirely rather than just
     * marking it as dead. Typically used for Disbelieved illusions or stuff
     * engulfed by Magic Fire.
     * 
     * @returns A promise that resolves when the destroy action is complete.
     */
    async destroy() {
        this._dead = true;
        if (this.currentRider) {
            await this.currentRider.dismount();
        }
        if (this._sprite) {
            this._sprite.destroy();
        }
        if (this._shadow) {
            this._shadow.destroy();
        }
        this._effects.forEach((sprite) => {
            sprite.destroy();
        });

        this.board.removePiece(this.id);
        this.board.emitBoardUpdateEvent();
    }

    /**
     * Reset this piece's state for a new turn.
     */
    reset() {
        this.turnOver = false;
        this.engaged = false;

        if (this.currentRider) {
            this.currentRider.reset();
        }
    }

    /**
     * Play the appropriate animation for this piece based on its state.
     */
    protected playAnim() {
        if (!this._sprite?.anims) {
            return;
        }
        this._sprite.anims.stop();
        if (this._dead) {
            this._sprite.setFrame(this._properties.id + `_${this.direction}_d`);
            return;
        }

        this._sprite.anims.playAfterDelay(
            this._properties.id + `_${this.direction}`,
            Math.random() * 400
        );
        this._sprite.anims.setProgress(Math.random());
    }

    /**
     * Create the shadow sprite for this piece.
     * 
     * @returns The shadow sprite or null if the piece is transparent.
     */
    protected createShadow(): GameObjects.Image | null {
        if (this.hasStatus(UnitStatus.Transparent)) {
            return null;
        }
        if (this._shadow) {
            return this._shadow;
        }
        const isoPosition: Geom.Point = this.board.getIsoPosition(
            this.position
        );

        this._shadow = this.board.scene.add.image(
            isoPosition.x,
            isoPosition.y,
            "board",
            "shadow-" + this._shadowScale
        );

        this.board.getLayer(BoardLayer.Shadows).add(this._shadow);

        this._shadow.setOrigin(0.5, 0.5);
        this._shadow.displayOriginY = -4;

        return this._shadow;
    }

    /**
     * Create the sprite for this piece.
     * 
     * @returns 
     */
    protected createSprite(): GameObjects.Sprite {
        if (this._sprite) {
            return this._sprite;
        }

        const isoPosition: Geom.Point = this.board.getIsoPosition(
            this.position
        );

        const group: string = Piece.getUnitConfig(this._properties.id).group ? this._properties.id : "classicunits";

        this._sprite = this.board.scene.add.sprite(
            isoPosition.x,
            isoPosition.y - this._offsetY,
            group,
            this._properties.id + "_r_0"
        );

        this.updateDepth();

        this._sprite.setOrigin(0.5, 0.5);

        this.playAnim();

        this.board.getLayer(BoardLayer.Pieces).add(this._sprite);

        if (this.hasStatus(UnitStatus.Spreads)) {
            this.board.scene.tweens.add({
                targets: this._sprite,
                duration: Piece.DEFAULT_MOVE_DURATION / 2,
                scale: { from: 0, to: 1 },
            });
        }

        return this._sprite;
    }

    /**
     * Create the owner highlight shaders for this piece.
     * 
     * @param forceUpdate Whether to force update the shaders
     * @param tempOwner Temporary owner for the highlight effect. Used for when mounting a non-owned piece such as Magic Wood.
     * @returns 
     */
    protected createShaders(forceUpdate?: boolean, tempOwner?: Player): void {
        if (!forceUpdate && this._ownerHighlightTween) {
            return;
        }

        this.highlighted = false;
        this._ownerHighlightTween?.stop?.().destroy?.();

        const startColor: Display.Color = new Display.Color(
            0,
            0,
            0
        );
        const endColor: Display.Color =
            Display.Color.ValueToColor(tempOwner?.colour ?? this.owner?.colour ?? 0);

        const postFxPlugin: any = this.board.scene.game.plugins.get(
            "rexcolorreplacepipelineplugin"
        );
        const postFxPipeline = postFxPlugin.add(this._sprite, {
            originalColor: startColor,
            epsilon: 0,
        });

        const tweenColours: Types.Display.ColorObject[] = new Array(
            Piece.DEFAULT_HIGHLIGHT_STEPS
        );
        for (let i = 0; i < Piece.DEFAULT_HIGHLIGHT_STEPS; i++) {
            tweenColours[i] = Display.Color.Interpolate.ColorWithColor(
                startColor,
                endColor,
                Piece.DEFAULT_HIGHLIGHT_STEPS - 1,
                i
            );
        }

        this._ownerHighlightTween = this.board.scene.tweens.addCounter({
            from: 0,
            to: Piece.DEFAULT_HIGHLIGHT_STEPS - 1,
            duration: Piece.DEFAULT_HIGHLIGHT_DURATION,
            repeat: -1,
            yoyo: true,
            onUpdate: (tween) => {
                const newColor: Types.Display.ColorObject =
                    tweenColours[Math.round(tween.getValue())];

                postFxPipeline.newColor = Display.Color.GetColor(
                    newColor.r,
                    newColor.g,
                    newColor.b
                );
            },
        });

        this._ownerHighlightTween.pause();
    }

    /**
     * Get the unit configuration for this piece.
     * 
     * @returns Unit configuration
     */
    public get unitConfig(): UnitConfig {
        return {
            attackType: this.properties.attackType,
            rangedType: this.properties.rangedType,
            projectileType: this.properties.projectileType,
            properties: {
                mov: this.stats.movement,
                com: this.stats.combat,
                rcm: this.stats.rangedCombat,
                rng: this.stats.range,
                def: this.stats.defense,
                mnv: this.stats.maneuverability,
                res: this.stats.magicResistance,
            },
            status: [...this.properties.status],
            name: this.name,
            dead: this.dead,
            wizard: this.type === UnitType.Wizard,
            group: this.properties.group || "classicunits",
        };
    }

    /**
     * Get the raw unit configuration from the units data file by ID.
     * 
     * @param id Unit ID
     * @returns Unit configuration or undefined if not found
     */
    static getUnitConfig(id: string): UnitConfig | undefined {
        return Piece.units[id];
    }

    /**
     * Get the unit properties by unit name.
     * 
     * @param name Unit name
     * @returns Unit properties or null if not found
     */
    static getUnitPropertiesByName(name: string): UnitStats | null {
        let key = "";
        for (let [k, unit] of Object.entries(Piece.units)) {
            if (unit.name.toLowerCase().trim() === name.toLowerCase().trim()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return null;
        }

        const unit: any = this.getUnitConfig(key);

        return {
            id: key,
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
            status: [...(unit.status || [])],
            group: unit.group || "classicunits",
        };
    }

    /**
     * Get the piece properties from the JSON data by unit name.
     * 
     * @param name Unit name
     * @returns Piece properties or undefined if not found
     */
    static getPieceProperties(name: string): any {
        let key = "";
        for (let [k, piece] of Object.entries(Piece.units)) {
            if (piece.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const unit: any = (Piece.units as any)[key];

        return {
            type: UnitType.Creature,
            properties: {
                id: key,
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
                status: [...(unit.status || [])],
            },
            shadowScale: unit.shadowScale,
            offsetY: unit.offY,
            group: unit.group || "classicunits",
        };
    }
}
