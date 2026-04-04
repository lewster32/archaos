import {
    BoardEvent,
    BoardLayer,
    Colour,
    RangeType,
    SpreadAction,
    UnitAttackType,
    UnitDirection,
    UnitStatus,
    UnitType,
    UnitRangedProjectileType,
    Piece as EnginePiece,
} from "@archaos/engine";
import type { PieceConfig } from "@archaos/engine";
import unitJsonData from "../../assets/data/classicunits.json";
import { Board } from "./board";
import { EffectType } from "./effectemitter";
import { Math as PMath, GameObjects, Geom, Display, Tweens } from "phaser";
import type { Player } from "./player";
import type { Types } from "phaser";

// Populate the engine Piece's static units data from JSON
EnginePiece.units = unitJsonData as any;

/**
 * A game piece on the board. This can be a creature, wizard, structure, etc.
 * Extends the engine Piece with rendering, sound and animation.
 */
export class Piece extends EnginePiece {
    /**
     * Get the board this piece belongs to, narrowed
     * to the client Board type.
     */
    override get board(): Board {
        return this._board as Board;
    }

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

    protected _shadowScale: number;
    protected _shadow?: GameObjects.Image;
    protected _sprite?: GameObjects.Sprite;
    protected _effects: Map<UnitStatus, GameObjects.Sprite | GameObjects.Image>;
    protected _offsetY: number;
    protected _ownerHighlightTween: Tweens.Tween;

    constructor(board: Board, id: number, config: PieceConfig) {
        super(board, id, config);

        this._shadowScale = config.shadowScale || 3;
        this._offsetY = config.offsetY || 0;

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

        // Perform initial animation to fade the piece in and pop it in slightly
        this.board.scene.tweens.add({
            targets: [this._sprite, this._shadow, ...this._effects.values()],
            alpha: { from: 0, to: 1 },
            duration: Piece.DEFAULT_MOVE_DURATION / 2,
            ease: PMath.Easing.Cubic.Out,
        });
    }

    // ── Visual state: highlighted ───────────────────────────────────────────

    /**
     * Whether this piece is currently highlighted on the board.
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
            if (!this._ownerHighlightTween?.isDestroyed) {
                this._ownerHighlightTween.play().resume();
            }
            return;
        }
        this._highlighted = false;
        if (!this._ownerHighlightTween?.isDestroyed) {
            this._ownerHighlightTween.stop();
        }
    }

    /**
     * Flash a highlight effect on this piece.
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

    // ── Overridden setters with visual side effects ─────────────────────────

    /**
     * Set the facing direction of this piece, triggering animation.
     */
    override set direction(direction: UnitDirection) {
        if (direction != this._direction) {
            this._direction = direction;
            this.playAnim();
        }
    }

    override get direction(): UnitDirection {
        return this._direction;
    }

    /**
     * Set whether this piece is currently engulfed by another piece.
     */
    override set engulfed(engulfed: boolean) {
        this._engulfed = engulfed;
        setTimeout(() => {
            if (this._engulfed) {
                this.board.logger.log(
                    `${this.name} was engulfed`,
                    Colour.Magenta,
                );
                this.sprite?.setVisible(false);
                this.shadow?.setVisible(false);
            } else {
                this.board.logger.log(
                    `${this.name} was released`,
                    Colour.Green,
                );
                this.sprite?.setVisible(true);
                this.shadow?.setVisible(true);
            }
        });
    }

    override get engulfed(): boolean {
        return this._engulfed;
    }

    /**
     * Set whether this piece was raised from the dead.
     */
    override set raisedDead(raisedDead: boolean) {
        this._raisedDead = raisedDead;
        if (raisedDead) {
            this.sprite.setTint(Piece.RAISED_DEAD_TINT);
        }
    }

    override get raisedDead(): boolean {
        return this._raisedDead;
    }

    /**
     * End this piece's turn, marking all of its action flags as complete and
     * tinting it slightly darker.
     */
    override set turnOver(state: boolean) {
        this.moved = this.attacked = this.rangedAttacked = state;

        // Don't apply the turn over tint if the piece has no valid actions;
        // prevents Magic Fire, Dark Citadel etc. from always being shaded
        if (!this.canPerformActions) {
            return;
        }
        if (state) {
            if (this._raisedDead) {
                this._sprite.setTint(
                    Display.Color.ValueToColor(Piece.RAISED_DEAD_TINT).darken(
                        Piece.MOVED_DARKEN_AMOUNT,
                    ).color,
                );
            } else {
                this._sprite.setTint(
                    Display.Color.ValueToColor(0xffffff).darken(
                        Piece.MOVED_DARKEN_AMOUNT,
                    ).color,
                );
            }
            this.highlighted = false;
        } else if (this._raisedDead) {
            this._sprite.setTint(Piece.RAISED_DEAD_TINT);
        } else {
            this._sprite?.setTint(this.defaultTint);
        }
    }

    override get turnOver(): boolean {
        return (
            (this.moved && !this.canAttack && !this.canRangedAttack) ||
            this.dead ||
            this.engulfed ||
            (this.moved && this.attacked && this.rangedAttacked)
        );
    }

    /**
     * Set the current mount. Handles visual fade in/out.
     */
    override set currentMount(mount: Piece | null) {
        this._currentMount = mount;

        // When dismounting, make the piece visible again,
        // but if we still have shadow form, keep it semi-transparent
        const visibleAlpha: number = this.hasStatus(UnitStatus.ShadowForm)
            ? Piece.SHADOW_FORM_ALPHA
            : 1;

        this.board.scene.tweens.add({
            targets: [this._sprite, this._shadow, ...this._effects.values()],
            alpha: mount ? 0 : visibleAlpha,
            duration: Piece.DEFAULT_MOVE_DURATION / 2,
        });
    }

    override get currentMount(): Piece | null {
        return this._currentMount as Piece | null;
    }

    // ── Sprite getters ──────────────────────────────────────────────────────

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
     * Get the current screen position of this piece's sprite.
     */
    get screenPosition(): Geom.Point | null {
        return this.sprite?.getCenter() || null;
    }

    /**
     * Get the depth value for this piece based on its Y position.
     */
    get depth(): number {
        return this._sprite?.y || 0;
    }

    // ── Movement & position (rendering) ─────────────────────────────────────

    /**
     * Visually update the position of this piece on the board with a tween.
     */
    async updatePosition(
        duration: number = Piece.DEFAULT_MOVE_DURATION,
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!this._sprite) {
                return;
            }

            const isoPosition: Geom.Point = this.board.getIsoPosition(
                this.position,
            );

            const difference: number = Board.distance(
                new Geom.Point(this._sprite.x, this._sprite.y),
                isoPosition,
            );

            // A little hop for the piece as it moves
            this.board.scene.tweens.add({
                targets: [this._sprite],
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
     * Update the facing direction of this piece based on movement from one
     * point to another.
     */
    protected updateDirection(fromPoint: Geom.Point, toPoint: Geom.Point) {
        const isoXOffset: number =
            Board.toIsometric(toPoint).x - Board.toIsometric(fromPoint).x;

        if (isoXOffset === 0) {
            return;
        }
        this.direction =
            isoXOffset < 0 ? UnitDirection.Left : UnitDirection.Right;
    }

    /**
     * Move this piece to the specified point on the board.
     */
    async moveTo(point: Geom.Point, stepDuration?: number) {
        this.updateDirection(this.position, point);
        this.position = point;
        if (this.currentRider) {
            this.currentRider.position = point;
            (this.currentRider as Piece).updatePosition(stepDuration);
        }
        if (
            this.currentMount &&
            !Geom.Point.Equals(this.currentMount.position, this.position)
        ) {
            await this.board.dismountPiece(this.id);
        }
        await this.updatePosition(stepDuration);
    }

    // ── Range checks (uses Board statics) ───────────────────────────────────

    /**
     * Check if a point is within this piece's movement range.
     */
    inMovementRange(point: Geom.Point): boolean {
        if (Geom.Point.Equals(this.position, point)) {
            return false;
        }
        if (this.currentMount) {
            if (Board.distance(this.position, point) > 1.5) {
                return false;
            }
        }
        if (
            this.hasStatus(UnitStatus.Flying) &&
            Board.distance(this.position, point, RangeType.Fly) <=
                this.stats.movement
        ) {
            return true;
        }
        if (!this.board.rangeGizmo.getPathTo(point)) {
            return false;
        }
        return true;
    }

    /**
     * Check if a point is within this piece's attack range.
     */
    inAttackRange(point: Geom.Point): boolean {
        if (
            !this.moved &&
            this.inMovementRange(point) &&
            (this.hasStatus(UnitStatus.Flying) ||
                this.board.rangeGizmo.getPathTo(point))
        ) {
            return true;
        }
        if (Board.distance(this.position, point) > 1.5) {
            return false;
        }
        return true;
    }

    /**
     * Find all pieces that pose a threat to this piece.
     */
    findThreatPieces(): Set<Piece> {
        const threatPieces: Set<Piece> = new Set<Piece>();

        const allPieces: Piece[] = this.board.pieces.filter(
            (piece: Piece) =>
                piece.owner !== this.owner &&
                !piece.dead &&
                !piece.currentRider &&
                !piece.engulfed &&
                ((piece.canAttackPiece(this) &&
                    this.inAttackRange(piece.position)) ||
                    (piece.canRangedAttackPiece(this) &&
                        this.inRangedAttackRange(piece.position)) ||
                    (piece.hasStatus(UnitStatus.Spreads) &&
                        Board.distance(piece.position, this.position) <= 3)),
        );

        allPieces.forEach((piece: Piece) => {
            threatPieces.add(piece);
        });

        return threatPieces;
    }

    // ── Combat & actions (mixed logic + rendering) ──────────────────────────

    /**
     * Spread this piece to adjacent squares.
     */
    async spread(): Promise<void> {
        if (!this.hasStatus(UnitStatus.Spreads) || this.dead) {
            throw new Error("Cannot spread a non-spreading or dead piece");
        }
        const spreadAction: SpreadAction = this.board.rng.weightedRandomPick([
            SpreadAction.Shrink,
            SpreadAction.None,
            SpreadAction.Spread,
        ], 1.75, true);
        if (spreadAction === SpreadAction.None) {
            return;
        }
        if (spreadAction === SpreadAction.Shrink) {
            if (this.currentEngulfed) {
                this.currentEngulfed.engulfed = false;
                this.board.logger.log(
                    `${this.currentEngulfed.fullName} was released from ${this.fullName}`,
                    Colour.Green,
                );
            }
            await new Promise((resolve) => {
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
            const adjacentPoints: Geom.Point[] = this.board.getAdjacentPoints(
                this.position,
            );
            const spreadPoint: Geom.Point = this.board.rng.pick(adjacentPoints);
            const spreadPieces: Piece[] = this.board.getPiecesAtPosition(
                spreadPoint,
                (piece: Piece) => !piece.dead,
            );

            if (spreadPieces.length > 0) {
                if (
                    spreadPieces.some(
                        (piece) =>
                            piece.owner === this.owner || !piece.canBeSpreadOn,
                    )
                ) {
                    return;
                }
                if (
                    spreadPieces.some((piece) =>
                        piece.hasStatus(UnitStatus.Wizard),
                    )
                ) {
                    const killedPiece: Piece = spreadPieces.find((piece) =>
                        piece.hasStatus(UnitStatus.Wizard),
                    );
                    this.board.logger.log(
                        `${killedPiece.fullName} was destroyed by ${this.fullName}!`,
                        Colour.Red,
                    );
                    await killedPiece.kill();
                } else if (this.hasStatus(UnitStatus.Engulfs)) {
                    this.board.logger.log(
                        `${this.fullName} has engulfed ${spreadPieces[0].fullName}`,
                        Colour.Yellow,
                    );
                    spreadPieces[0].engulfed = true;
                } else {
                    await Promise.all(
                        spreadPieces.map(async (piece) => {
                            this.board.logger.log(
                                `${piece.fullName} was destroyed by ${this.fullName}`,
                                Colour.Red,
                            );
                            switch (this.properties.attackType) {
                                case UnitAttackType.Burned:
                                    await this.board.playEffect(
                                        EffectType.DragonFireHit,
                                        piece.sprite.getCenter(),
                                        null,
                                        piece,
                                    );
                                    break;
                            }
                            return await piece.destroy();
                        }),
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
                    defence: unit.properties.def,
                    manoeuvrability: unit.properties.mnv,
                    magicResistance: unit.properties.res,
                    attackType: unit.attackType || "attacked",
                    rangedType: unit.rangedType || "shot",
                    projectileType:
                        unit.projectileType || UnitRangedProjectileType.Arrow,
                    status: [...(unit.status || [])],
                },
                shadowScale: unit.shadowScale,
                offsetY: unit.offY,
                owner: this.owner,
                illusion: !!this._illusion,
                group: unit.group || "classicunits",
            } as PieceConfig);

            this.board.sound.play(`blob${Math.random() < 0.5 ? 1 : 2}`);

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
     * Raise this piece from the dead, assigning its new owner.
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
     * Engage this piece with the given piece.
     */
    async engage(piece: Piece): Promise<void> {
        if (this.canEngagePiece(piece)) {
            this.engaged = true;
            this.attacked = false;
            piece.engaged = true;
        }
        this.board.logger.log(
            `${this.name} is engaged with ${piece.name}`,
            Colour.Yellow,
        );
        await this.board.sound.playAsync("engaged", {
            delay: Board.DEFAULT_DELAY,
        });
    }

    /**
     * Perform an attack on the given piece.
     */
    async attack(piece: Piece): Promise<boolean> {
        if (this.canAttackPiece(piece)) {
            if (!this.canAttackPossiblyUndeadPiece(piece)) {
                this.board.logger.log(
                    `${this.name} cannot attack the undead`,
                    Colour.Cyan,
                );
                await this.board.sound.playAsync("undead", {
                    delay: Board.DEFAULT_DELAY,
                });
                return false;
            }

            this.updateDirection(this.position, piece.position);
            this.attacked = true;
            this.moved = true;

            const rollSuccess: boolean = this.board.roll(
                this.stats.combat,
                piece.stats.defence,
                this.owner,
            );

            this.board.sound.play("attackonly");
            this.board.logger.log(
                `${this.name} ${this.properties.attackType} ${piece.name}`,
                Colour.Yellow,
            );
            await this.board.playEffect(
                EffectType.AttackHit,
                piece.sprite.getCenter(),
                null,
                piece,
            );
            await Board.delay(Board.DEFAULT_DELAY);

            // Shadow Form is lost on attacking, regardless of success
            if (this.hasStatus(UnitStatus.ShadowForm)) {
                this.removeStatus(UnitStatus.ShadowForm);
            }

            if (rollSuccess) {
                this.board.logger.log(
                    `${this.fullName} defeated ${piece.fullName}`,
                    Colour.Red,
                );
                this.board.sound.play("killcreature");
                await piece.kill();
                if (
                    this.board.getPiecesAtPosition(
                        piece.position,
                        (p: Piece) => {
                            return !p.dead;
                        },
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
     */
    async rangedAttack(piece: Piece): Promise<boolean> {
        if (this.canRangedAttackPiece(piece)) {
            if (!this.canAttackPossiblyUndeadPiece(piece)) {
                await this.board.sound.playAsync("undead", {
                    delay: Board.DEFAULT_DELAY,
                });
                this.board.logger.log(
                    `${this.name} cannot attack the undead`,
                    Colour.Cyan,
                );
                return false;
            }
            this.updateDirection(this.position, piece.position);

            let beamEffectType: EffectType;
            let hitEffectType: EffectType;
            let beamSound: string;
            let hitSound: string;

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
                piece,
            );

            this.board.sound.play(hitSound);
            await this.board.playEffect(
                hitEffectType,
                piece.sprite.getCenter(),
                null,
                piece,
            );

            this.rangedAttacked = true;
            this.attacked = true;
            this.moved = true;

            const rollSuccess: boolean = this.board.roll(
                this.stats.rangedCombat,
                piece.stats.defence,
                this.owner,
            );

            this.board.logger.log(
                `${this.name} ${this.properties.rangedType} ${piece.name}`,
                Colour.Orange,
            );

            await Board.delay(Board.DEFAULT_DELAY / 2);

            if (rollSuccess) {
                if (this.hasStatus(UnitStatus.ShadowForm)) {
                    this.removeStatus(UnitStatus.ShadowForm);
                }
                this.board.sound.play("killcreature");
                this.board.logger.log(
                    `${this.fullName} defeated ${piece.fullName}`,
                    Colour.Red,
                );
                await piece.kill();
                return true;
            }
        }
        return false;
    }

    /**
     * Kill this piece.
     */
    async kill(silent: boolean = false): Promise<void> {
        if (this.dead) {
            throw new Error("Cannot kill unit that is already dead");
        }
        if (this.currentRider) {
            await (this.currentRider as Piece).dismount();
            if (!this.turnOver) {
                this.currentRider.reset();
            }
        }
        if (this.currentEngulfed) {
            this.currentEngulfed.engulfed = false;
            this.currentEngulfed = null;
        }
        this._dead = true;
        this.owner = null;
        if (this.illusion) {
            await this.board.playEffect(
                EffectType.DisbelieveHit,
                this.sprite.getCenter(),
            );
            await this.destroy();
        } else if (
            this.hasStatus(UnitStatus.NoCorpse) ||
            this.hasStatus(UnitStatus.Undead)
        ) {
            silent = true;
            await this.board.playEffect(
                EffectType.NoCorpseDeath,
                this.sprite.getCenter(),
            );
            await this.destroy();
        }
        if (!silent) {
            this.board.sound.play("killcreature");
        }
        if (!this._sprite) {
            this.board.boardEvents?.emit(BoardEvent.PieceDied, this);
            return;
        }
        if (
            this._sprite.texture.has(
                this._properties.id + `_${this._direction}_d`,
            )
        ) {
            this._sprite.setDepth(this._sprite.depth - 1);
            this.playAnim();
        } else {
            this._sprite.visible = false;
        }
        this.board.emitBoardUpdateEvent();
        await Board.delay(Board.DEFAULT_DELAY);
        this.board.boardEvents?.emit(BoardEvent.PieceDied, this);
    }

    /**
     * Mount this piece upon the given piece.
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
        this.board.logger.log(`${this.fullName} mounted ${piece.fullName}`);
        piece.createShaders(true, this.owner);
    }

    /**
     * Dismount this piece from its current mount.
     */
    async dismount(): Promise<void> {
        if (!this.currentMount) {
            throw new Error(`${this.name} is not mounted`);
        }
        (this.currentMount as Piece).currentRider = null;

        this.moved = true;
        this.currentMount.turnOver = true;
        this.board.logger.log(
            `${this.fullName} dismounted ${this.currentMount.fullName}`,
        );
        (this.currentMount as Piece).createShaders(true);
        this.currentMount = null;
    }

    /**
     * Destroy this piece, removing it from the board.
     */
    async destroy() {
        this._dead = true;
        if (this.currentRider) {
            await (this.currentRider as Piece).dismount();
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

    // ── Rendering methods ───────────────────────────────────────────────────

    /**
     * Play the appropriate animation for this piece.
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
            Math.random() * 400,
        );
        this._sprite.anims.setProgress(Math.random());
    }

    /**
     * Create the shadow sprite for this piece.
     */
    protected createShadow(): GameObjects.Image | null {
        if (this.hasStatus(UnitStatus.Transparent)) {
            return null;
        }
        if (this._shadow) {
            return this._shadow;
        }
        const isoPosition: Geom.Point = this.board.getIsoPosition(
            this.position,
        );

        this._shadow = this.board.scene.add.image(
            isoPosition.x,
            isoPosition.y,
            "board",
            "shadow-" + this._shadowScale,
        );

        this.board.getLayer(BoardLayer.Shadows).add(this._shadow);

        this._shadow.setOrigin(0.5, 0.5);
        this._shadow.displayOriginY = -4;

        return this._shadow;
    }

    /**
     * Create the sprite for this piece.
     */
    protected createSprite(): GameObjects.Sprite {
        if (this._sprite) {
            return this._sprite;
        }

        const isoPosition: Geom.Point = this.board.getIsoPosition(
            this.position,
        );

        const group: string = Piece.getUnitConfig(this._properties.id).group
            ? this._properties.id
            : "classicunits";

        this._sprite = this.board.scene.add.sprite(
            isoPosition.x,
            isoPosition.y - this._offsetY,
            group,
            this._properties.id + "_r_0",
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
     */
    protected createShaders(forceUpdate?: boolean, tempOwner?: Player): void {
        if (!forceUpdate && this._ownerHighlightTween) {
            return;
        }

        this.highlighted = false;
        this._ownerHighlightTween?.stop?.().destroy?.();

        const startColor: Display.Color = new Display.Color(0, 0, 0);
        const endColor: Display.Color = Display.Color.ValueToColor(
            tempOwner?.colour ?? this.owner?.colour ?? 0,
        );

        const postFxPlugin: any = this.board.scene.game.plugins.get(
            "rexcolorreplacepipelineplugin",
        );
        const postFxPipeline = postFxPlugin.add(this._sprite, {
            originalColor: startColor,
            epsilon: 0,
        });

        const tweenColours: Types.Display.ColorObject[] =
            Array.from<Types.Display.ColorObject>({
                length: Piece.DEFAULT_HIGHLIGHT_STEPS,
            });
        for (let i = 0; i < Piece.DEFAULT_HIGHLIGHT_STEPS; i++) {
            tweenColours[i] = Display.Color.Interpolate.ColorWithColor(
                startColor,
                endColor,
                Piece.DEFAULT_HIGHLIGHT_STEPS - 1,
                i,
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
                    newColor.b,
                );
            },
        });

        this._ownerHighlightTween.pause();
    }
}
