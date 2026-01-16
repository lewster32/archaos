import units from "../../assets/data/classicunits.json";
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
    static readonly RAISED_DEAD_TINT: number = 0xb0d9ff;

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
            this._direction = PMath.RND.pick([
                UnitDirection.Left,
                UnitDirection.Right,
            ]);
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
     * Initialize the piece's sprites. Will not create duplicate sprites if
     * they already exist.
     */
    protected initSprites() {
        this.createShadow();
        this.createSprite();
        this.createShaders();
    }

    get turnOver(): boolean {
        return (
            (this.moved && !this.canAttack && !this.canRangedAttack) ||
            this.dead ||
            this.engulfed ||
            (this.moved && this.attacked && this.rangedAttacked)
        );
    }

    private _highlighted: boolean = false;

    get highlighted(): boolean {
        return this._highlighted;
    }

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
        this._ownerHighlightTween.pause().seek(0);
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

    get defaultTint(): number {
        return this.raisedDead ? Piece.RAISED_DEAD_TINT : 0xffffff;
    }

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

    get type(): UnitType {
        return this._type;
    }

    get owner(): Player | null {
        return this._owner || null;
    }

    set owner(owner: Player | null) {
        this._owner = owner;
    }

    get direction(): UnitDirection {
        return this._direction;
    }

    set direction(direction: UnitDirection) {
        if (direction != this._direction) {
            this._direction = direction;
            this.playAnim();
        }
    }

    get dead(): boolean {
        return this._dead;
    }

    get name(): string {
        return this._properties?.name || "Unnamed Unit";
    }

    get sprite(): GameObjects.Sprite {
        return this._sprite;
    }

    get shadow(): GameObjects.Image {
        return this._shadow;
    }

    get moved(): boolean {
        if (this.stats.movement === 0 || this._engaged) {
            return true;
        }
        return this._moved;
    }

    set moved(moved: boolean) {
        this._moved = moved;
        if (this.currentRider) {
            if (this.currentRider.moved !== moved) {
                this.currentRider.moved = moved;
            }
        }
    }

    get attacked(): boolean {
        if (this.stats.combat === 0) {
            return true;
        }
        return this._attacked;
    }

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

    get rangedAttacked(): boolean {
        if (this.stats.rangedCombat === 0 || this.stats.range === 0) {
            return true;
        }
        return this._rangedAttacked;
    }

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

    get engaged(): boolean {
        return this._engaged;
    }

    set engaged(engaged: boolean) {
        this._engaged = engaged;
    }

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

    get engulfed(): boolean {
        return this._engulfed;
    }

    get illusion(): boolean {
        return this._illusion;
    }

    get raisedDead(): boolean {
        return this._raisedDead;
    }

    set raisedDead(raisedDead: boolean) {
        this._raisedDead = raisedDead;
        if (raisedDead) {
            this.sprite.setTint(Piece.RAISED_DEAD_TINT);
        }
    }

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

    get properties(): UnitProperties {
        return this._properties;
    }

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

            this.board.scene.tweens.add({
                targets: [this._sprite],
                displayOriginY: "+" + Board.DEFAULT_CELLSIZE,
                duration: duration / 2,
                yoyo: true,
            });

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

    protected updateDepth() {
        this._sprite?.setDepth(this._sprite?.y);
    }

    get depth(): number {
        return this._sprite?.y || 0;
    }

    protected updateDirection(
        fromPoint: Geom.Point,
        toPoint: Geom.Point
    ) {
        const isoXOffset: number =
            Board.toIsometric(toPoint).x - Board.toIsometric(fromPoint).x;
        if (isoXOffset < 0) {
            this.direction = UnitDirection.Left;
        } else if (isoXOffset > 0) {
            this.direction = UnitDirection.Right;
        }
    }

    async moveTo(point: Geom.Point, stepDuration?: number) {
        this.updateDirection(this.position, point);
        this.position = point;
        if (this.currentRider) {
            this.currentRider.position = point;
            this.currentRider.updatePosition(0);
        }
        if (
            this.currentMount &&
            !Geom.Point.Equals(this.currentMount.position, this.position)
        ) {
            await this.board.dismountPiece(this.id);
        }
        await this.updatePosition(stepDuration);
    }

    async spread(): Promise<void> {
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
                    `${this.currentEngulfed.owner?.name}'s ${this.currentEngulfed.name} was released from ${this.owner?.name}'s ${this.name}`,
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
                        `${killedPiece.owner.name} was destroyed by ${this.owner.name}'s ${this.name}!`,
                        Colour.Red
                    );
                    await killedPiece.kill();
                } else if (this.hasStatus(UnitStatus.Engulfs)) {
                    this.board.logger.log(
                        `${this.owner.name}'s ${this.name} has engulfed ${spreadPieces[0].owner.name}'s ${spreadPieces[0].name}`,
                        Colour.Yellow
                    );
                    spreadPieces[0].engulfed = true;
                } else {
                    await Promise.all(
                        spreadPieces.map(async (piece) => {
                            this.board.logger.log(
                                `${piece.owner.name}'s ${piece.name} was destroyed by ${this.owner.name}'s ${this.name}`,
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
                    status: [...(unit.status || [])],
                },
                shadowScale: unit.shadowScale,
                offsetY: unit.offY,
                owner: this.owner,
                illusion: !!this._illusion,
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

    async raiseDead(owner: Player): Promise<void> {
        if (!this.dead) {
            throw new Error("Cannot raise a piece that is not dead");
        }
        this._owner = owner;
        this._dead = false;
        this.raisedDead = true;
        if (this.sprite) {
            this.sprite.setVisible(true);
            this.playAnim();
        }
        this.addStatus(UnitStatus.Undead);
    }

    addStatus(status: UnitStatus): boolean {
        if (!this.hasStatus(status)) {
            this._properties.status.push(status);
            return true;
        }
        return false;
    }

    removeStatus(status: UnitStatus): boolean {
        if (this.hasStatus(status)) {
            this._properties.status = this._properties.status.filter(
                (s) => s !== status
            );
            return true;
        }
        return false;
    }

    hasStatus(status: UnitStatus): boolean {
        return this._properties.status.includes(status);
    }

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
        if (this.hasStatus(UnitStatus.Flying) && Board.distance(this.position, point) <= this.stats.movement) {
            return true;
        }
        if (!this.board.rangeGizmo.getPathTo(point)) {
            return false;
        }
        return true;
    }

    inAttackRange(point: Geom.Point): boolean {
        // If we haven't moved yet, we can attack anywhere within movement
        if (
            !this.moved && this.inMovementRange(point)
        ) {
            return true;
        }
        // Otherwise, we can only attack adjacent squares
        if (Board.distance(this.position, point) > 1.5) {
            return false;
        }
        return true;
    }

    inRangedAttackRange(point: Geom.Point): boolean {
        if (Board.distance(this.position, point, RangeType.RangedAttack) > this.stats.range) {
            return false;
        }
        return true;
    }

    get canSelect(): boolean {
        if (this._engulfed) {
            return false;
        }
        if (
            (this.hasStatus(UnitStatus.Mount) ||
                this.hasStatus(UnitStatus.MountAny)) &&
            this.currentRider &&
            this.currentRider.owner === this.board.currentPlayer &&
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

    get canDisbelieve(): boolean {
        return (
            this.type === UnitType.Creature && // Only creatures can be disbelieved
            !this.hasStatus(UnitStatus.Wizard) && // Cannot disbelieve wizards
            !this.hasStatus(UnitStatus.Structure) && // Cannot disbelieve structures
            !this.hasStatus(UnitStatus.Spreads) && // Cannot disbelieve spreading units
            !this.hasStatus(UnitStatus.Tree) // Cannot disbelieve trees
        );
    }

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

    get canBeMagicAttacked(): boolean {
        return !this.hasStatus(UnitStatus.Invulnerable) // Cannot be magic attacked if invulnerable
    }

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
            this.owner === piece.owner || // Cannot engage own pieces
            this.hasStatus(UnitStatus.ShadowForm) || // Units with Shadow Form do not engage
            piece.hasStatus(UnitStatus.ShadowForm) // Units with Shadow Form cannot be engaged
        ) {
            return false;
        }
        return true;
    }

    getFirstEngagingPiece(): Piece | null {
        const neighbours: Piece[] = this.getNeighbours();
        for (const neighbour of neighbours) {
            if (this.canEngagePiece(neighbour)) {
                return neighbour;
            }
        }
        return null;
    }

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

    getNeighbours(): Piece[] {
        return this.board.getAdjacentPiecesAtPosition(
            this.position,
            (piece: Piece) => !piece.dead
        );
    }

    async attack(piece: Piece): Promise<boolean> {
        if (this.canAttackPiece(piece)) {
            if (
                piece.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.AttackUndead)
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
                `${this.name} ${this.properties.attackType} ${piece.name}`
            );
            await this.board.playEffect(EffectType.AttackHit, piece.sprite.getCenter(), null, piece);
            await Board.delay(Board.DEFAULT_DELAY);

            // Shadow Form is lost on attacking, regardless of success
            if (this.hasStatus(UnitStatus.ShadowForm)) {
                this.removeStatus(UnitStatus.ShadowForm);
            }

            if (rollSuccess) {
                this.board.logger.log(`${this.name} defeated ${piece.name}`);
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

    async rangedAttack(piece: Piece): Promise<boolean> {
        if (this.canRangedAttackPiece(piece)) {
            if (
                piece.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.AttackUndead)
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

            let beamEffectType: EffectType = EffectType.ArrowBeam;
            let hitEffectType: EffectType = EffectType.ArrowHit;

            switch (this.properties.rangedType) {
                case "burned":
                    beamEffectType = EffectType.DragonFireBeam;
                    hitEffectType = EffectType.DragonFireHit;
                    break;
            }

            this.board.sound.play(beamEffectType === EffectType.DragonFireBeam ? "dragonfire6" : "bowfire6");
            await this.board.playEffect(
                beamEffectType,
                this.sprite.getCenter(),
                piece.sprite.getCenter(),
                piece
            );

            this.board.sound.play(beamEffectType === EffectType.DragonFireBeam ? "dragonfireexplosion" : "bowhit");
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
                `${this.name} ${this.properties.rangedType} ${piece.name}`
            );

            await Board.delay(Board.DEFAULT_DELAY / 2);

            if (rollSuccess) {
                if (this.hasStatus(UnitStatus.ShadowForm)) {
                    this.removeStatus(UnitStatus.ShadowForm);
                }
                this.board.sound.play("killcreature");
                this.board.logger.log(`${this.name} defeated ${piece.name}`);
                await piece.kill();
                return true;
            }
        }
        return false;
    }

    async kill(): Promise<void> {
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
            await this.destroy();
        }
        this.board.sound.play("killcreature");
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
    }

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
            `${this.name} mounted ${piece.name}`
        );
        piece.createShaders(true, this.owner);
    }

    async dismount(): Promise<void> {
        if (!this.currentMount) {
            throw new Error(`${this.name} is not mounted`);
        }
        this.currentMount.currentRider = null;

        this.moved = true;
        this.currentMount.turnOver = true;
        this.board.logger.log(
            `${this.name} dismounted ${this.currentMount.name}`
        );
        this.currentMount.createShaders(true);
        this.currentMount = null;
    }

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

    reset() {
        this.turnOver = false;
        this.engaged = false;

        if (this.currentRider) {
            this.currentRider.reset();
        }
    }

    protected createSprite(): GameObjects.Sprite {
        if (this._sprite) {
            return this._sprite;
        }

        const isoPosition: Geom.Point = this.board.getIsoPosition(
            this.position
        );

        this._sprite = this.board.scene.add.sprite(
            isoPosition.x,
            isoPosition.y - this._offsetY,
            "classicunits",
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
     * Get the raw unit configuration from the units data file by ID.
     * 
     * @param id Unit ID
     * @returns Unit configuration or undefined if not found
     */
    static getUnitConfig(id: string): UnitConfig | undefined {
        return units[id];
    }

    /**
     * Get the unit properties by unit name.
     * 
     * @param name Unit name
     * @returns Unit properties or null if not found
     */
    static getUnitPropertiesByName(name: string): UnitStats | null {
        let key = "";
        for (let [k, unit] of Object.entries(units)) {
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
            status: [...(unit.status || [])],
        };
    }

    static getPieceProperties(name: string): any {
        let key = "";
        for (let [k, piece] of Object.entries(units)) {
            if (piece.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const unit: any = (units as any)[key];

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
                status: [...(unit.status || [])],
            },
            shadowScale: unit.shadowScale,
            offsetY: unit.offY,
        };
    }
}
