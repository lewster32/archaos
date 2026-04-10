import {
    BoardEvent,
    BoardLayer,
    Colour,
    UnitDirection,
    UnitStatus,
    UnitRangedProjectileType,
    Piece as EnginePiece,
    Point,
} from "@archaos/engine";
import type { PieceConfig, Player as EnginePlayer } from "@archaos/engine";
import unitJsonData from "@assets/data/classicunits.json";
import { Board } from "./board";
import { EffectType } from "./effectemitter";
import Phaser from "phaser";
import { Math as PMath, GameObjects, Display, Tweens } from "phaser";
import type { Player } from "./player";
import type { Types } from "phaser";
import { ColorReplaceFilter } from "./filters/colorreplace";

// Populate the engine Piece's static units data from JSON
EnginePiece.units = unitJsonData as any;

/**
 * A game piece on the board. This can be a creature, wizard, structure, etc.
 * Extends the engine Piece with rendering, sound and animation.
 */
export class Piece extends EnginePiece {
    /**
     * Get the board this piece belongs to, narrowed
     * to the client Board type for rendering access.
     */
    get clientBoard(): Board {
        return this._board as unknown as Board;
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

    /** Pixels above the target's isometric tile the attacker hovers. */
    private static readonly HOVER_HEIGHT = 18;

    protected _shadowScale: number;
    protected _shadow?: GameObjects.Image;
    protected _sprite?: GameObjects.Sprite;
    protected _effects: Map<UnitStatus, GameObjects.Sprite | GameObjects.Image>;
    protected _offsetY: number;
    protected _ownerHighlightTween: Tweens.Tween;
    protected _ownerHighlightFilter: ColorReplaceFilter | null = null;

    constructor(board: Board, id: number, config: PieceConfig) {
        super(board as any, id, config);

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
    initSprites() {
        this.createShadow();
        this.createSprite();
        this.createShaders();

        // Perform initial animation to fade the piece in and pop it in slightly
        this.clientBoard.scene.tweens.add({
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
            if (!this._ownerHighlightTween.isDestroyed()) {
                this._ownerHighlightTween.resume();
            }
            return;
        }
        this._highlighted = false;
        if (!this._ownerHighlightTween.isDestroyed()) {
            this._ownerHighlightTween.pause();
            if (this._ownerHighlightFilter) {
                this._ownerHighlightFilter.setNewColor(0, 0, 0);
            }
        }
    }

    /**
     * Get the default tint color for this piece.
     */
    get defaultTint(): number {
        return this.raisedDead ? Piece.RAISED_DEAD_TINT : 0xffffff;
    }

    /**
     * Flash a highlight effect on this piece.
     */
    async flashHighlight(): Promise<void> {
        if (!this._sprite) {
            return;
        }
        for (let i = 0; i < Piece.DEFAULT_FLASH_HIGHLIGHT_STEPS; i++) {
            this._sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
            await Board.delay(Piece.DEFAULT_FLASH_HIGHLIGHT_DURATION);
            this._sprite.setTint(this.owner?.colour ?? 0x000000)
                .setTintMode(Phaser.TintModes.FILL);
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
        super.engulfed = engulfed;
        setTimeout(() => {
            if (this.engulfed) {
                this.clientBoard.logger.log(
                    `${this.name} was engulfed`,
                    Colour.Magenta,
                );
                this.sprite?.setVisible(false);
                this.shadow?.setVisible(false);
            } else {
                this.clientBoard.logger.log(
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
        super.turnOver = state;

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

        this.clientBoard.scene.tweens.add({
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
    get screenPosition(): PMath.Vector2 | null {
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

            const isoPosition: PMath.Vector2 = this.clientBoard.getIsoPosition(
                this.position as unknown as PMath.Vector2,
            );

            const difference: number = Board.distance(
                new PMath.Vector2(this._sprite.x, this._sprite.y),
                isoPosition,
            );

            // A little hop for the piece as it moves
            this.clientBoard.scene.tweens.add({
                targets: [this._sprite],
                displayOriginY: `+${Math.min(120, difference * 1.5)}`,
                duration: duration / 2,
                yoyo: true,
            });

            // Move the piece to the new position
            this.clientBoard.scene.tweens.add({
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
    protected updateDirection(
        fromPoint: PMath.Vector2,
        toPoint: PMath.Vector2,
    ) {
        const isoXOffset: number =
            Board.toIsometric(toPoint).x - Board.toIsometric(fromPoint).x;

        if (isoXOffset === 0) {
            return;
        }
        this.direction =
            isoXOffset < 0 ? UnitDirection.Left : UnitDirection.Right;
    }

    /**
     * Visually tween this piece's sprite to hover above the given
     * board position. Does not update the logical position.
     * Used for fly-attack approach animation.
     */
    async flyApproach(targetPos: PMath.Vector2): Promise<void> {
        return new Promise((resolve) => {
            if (!this._sprite) {
                resolve();
                return;
            }
            const iso = this.clientBoard.getIsoPosition(targetPos);
            const groundY = iso.y - this._offsetY;

            const difference: number = Board.distance(
                new PMath.Vector2(this._sprite.x, this._sprite.y),
                new PMath.Vector2(iso.x, groundY),
            );

            // Face the unit towards the target
            this.updateDirection(
                this.position as unknown as PMath.Vector2,
                targetPos,
            );

            // Arc: swoop upward during the first half then settle at hover height
            this.clientBoard.scene.tweens.add({
                targets: [this._sprite],
                displayOriginY: `+${Math.min(120, difference * 2)}`,
                duration: Piece.DEFAULT_MOVE_DURATION / 2,
                yoyo: true,
            });

            if (this._shadow) {
                this.clientBoard.scene.tweens.add({
                    targets: [this._shadow],
                    x: iso.x,
                    y: groundY,
                    duration: Piece.DEFAULT_MOVE_DURATION,
                    ease: PMath.Easing.Cubic.InOut,
                });
            }

            this.clientBoard.scene.tweens.add({
                targets: [this._sprite],
                x: iso.x,
                y: groundY - Piece.HOVER_HEIGHT,
                duration: Piece.DEFAULT_MOVE_DURATION,
                ease: PMath.Easing.Cubic.InOut,
                onUpdateScope: this,
                onUpdate: () => {
                    // Depth based on ground-plane projection so the hovering
                    // unit sorts correctly relative to other pieces
                    this._sprite?.setDepth(
                        this._sprite.y + Piece.HOVER_HEIGHT,
                    );
                },
                onCompleteScope: this,
                onComplete: () => {
                    this._sprite?.setDepth(groundY);
                    resolve();
                },
            });
        });
    }

    /**
     * Visually tween this piece's sprite back to the given origin
     * board position after a failed fly-attack. Does not update the
     * logical position.
     */
    async flyReturn(
        originPos: PMath.Vector2,
        targetPos: PMath.Vector2,
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!this._sprite) {
                resolve();
                return;
            }
            const iso = this.clientBoard.getIsoPosition(originPos);
            const groundY = iso.y - this._offsetY;

            const difference: number = Board.distance(
                new PMath.Vector2(this._sprite.x, this._sprite.y),
                new PMath.Vector2(iso.x, groundY),
            );

            // Face the unit towards the origin
            this.updateDirection(targetPos, originPos);

            // Arc: swoop upward during the first half then descend to ground
            this.clientBoard.scene.tweens.add({
                targets: [this._sprite],
                displayOriginY: `+${Math.min(120, difference * 2)}`,
                duration: Piece.DEFAULT_MOVE_DURATION / 2,
                yoyo: true,
            });

            if (this._shadow) {
                this.clientBoard.scene.tweens.add({
                    targets: [this._shadow],
                    x: iso.x,
                    y: groundY,
                    duration: Piece.DEFAULT_MOVE_DURATION,
                    ease: PMath.Easing.Cubic.InOut,
                });
            }

            this.clientBoard.scene.tweens.add({
                targets: [this._sprite],
                x: iso.x,
                y: groundY,
                duration: Piece.DEFAULT_MOVE_DURATION,
                ease: PMath.Easing.Cubic.InOut,
                onUpdateScope: this,
                onUpdate: () => {
                    // Piece descends from hover height; keep depth based on
                    // ground-plane projection throughout the return
                    this._sprite?.setDepth(
                        this._sprite.y + Piece.HOVER_HEIGHT,
                    );
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
     * Move this piece to the specified point on the board.
     */
    override async moveTo(point: PMath.Vector2, stepDuration?: number) {
        this.updateDirection(this.position as unknown as PMath.Vector2, point);
        this.position = new Point(point.x, point.y);
        if (this.currentRider) {
            this.currentRider.position = new Point(point.x, point.y);
            (this.currentRider as Piece).updatePosition(stepDuration);
        }
        if (
            this.currentMount &&
            !(this.currentMount.position.x === this.position.x &&
                this.currentMount.position.y === this.position.y)
        ) {
            await this.clientBoard.dismountPiece(this.id);
        }
        await this.updatePosition(stepDuration);
    }

    // ── Combat & actions (mixed logic + rendering) ──────────────────────────

    /**
     * Play the shrink-away animation (tween scale
     * to 0). Used by the spread batch replayer.
     */
    async playShrinkAnimation(): Promise<void> {
        await new Promise<void>((resolve) => {
            this.clientBoard.scene.tweens.add({
                targets: this.sprite,
                duration: Piece.DEFAULT_MOVE_DURATION / 2,
                scale: { from: 1, to: 0 },
                onComplete: () => resolve(),
            });
        });
    }

    /**
     * Raise this piece from the dead, assigning its new owner.
     */
    override async raiseDead(owner: EnginePlayer | null): Promise<void> {
        await super.raiseDead(owner);
        if (this.sprite) {
            this.sprite.setVisible(true);
            this.playAnim();
        }
    }

    /**
     * Engage this piece with the given piece.
     */
    override async engage(piece: EnginePiece): Promise<void> {
        await super.engage(piece);
        await this.clientBoard.sound.playAsync("engaged", {
            delay: Board.DEFAULT_DELAY,
        });
    }

    /**
     * Perform an attack on the given piece.
     */
    override async attack(
        piece: EnginePiece,
        options?: { silentMove?: boolean },
    ): Promise<boolean> {
        if (this.canAttackPiece(piece)) {
            if (!this.canAttackPossiblyUndeadPiece(piece)) {
                this.clientBoard.logger.log(
                    `${this.name} cannot attack the undead`,
                    Colour.Cyan,
                );
                await this.clientBoard.sound.playAsync("undead", {
                    delay: Board.DEFAULT_DELAY,
                });
                return false;
            }

            this.updateDirection(
                this.position as unknown as PMath.Vector2,
                piece.position as unknown as PMath.Vector2,
            );
            this.attacked = true;
            this.moved = true;

            const rollSuccess: boolean = this.clientBoard.roll(
                this.stats.combat,
                piece.stats.defence,
                this.owner as any,
            );

            this.clientBoard.sound.play("attackonly");
            this.clientBoard.logger.log(
                `${this.name} ${this.properties.attackType} ${piece.name}`,
                Colour.Yellow,
            );
            await this.clientBoard.playEffect(
                EffectType.AttackHit,
                (piece as Piece).sprite.getCenter(),
                null,
                piece as Piece,
            );
            await Board.delay(Board.DEFAULT_DELAY);

            // Shadow Form is lost on attacking, regardless of success
            if (this.hasStatus(UnitStatus.ShadowForm)) {
                this.removeStatus(UnitStatus.ShadowForm);
            }

            if (rollSuccess) {
                this.clientBoard.logger.log(
                    `${this.fullName} defeated ${piece.fullName}`,
                    Colour.Red,
                );
                this.clientBoard.sound.play("killcreature");
                await piece.kill();
                if (
                    this.clientBoard.getPiecesAtPosition(
                        piece.position as unknown as PMath.Vector2,
                        (p: Piece) => {
                            return !p.dead;
                        },
                    ).length === 0 &&
                    this.canMove
                ) {
                    await this.clientBoard.movePiece(
                        this.id,
                        piece.position as unknown as PMath.Vector2,
                        options?.silentMove,
                    );
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Perform a ranged attack on the given piece.
     */
    override async rangedAttack(piece: EnginePiece): Promise<boolean> {
        if (this.canRangedAttackPiece(piece)) {
            if (!this.canAttackPossiblyUndeadPiece(piece)) {
                await this.clientBoard.sound.playAsync("undead", {
                    delay: Board.DEFAULT_DELAY,
                });
                this.clientBoard.logger.log(
                    `${this.name} cannot attack the undead`,
                    Colour.Cyan,
                );
                return false;
            }
            this.updateDirection(
                this.position as unknown as PMath.Vector2,
                piece.position as unknown as PMath.Vector2,
            );

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

            this.clientBoard.sound.play(beamSound);
            await this.clientBoard.playEffect(
                beamEffectType,
                this.sprite.getCenter(),
                (piece as Piece).sprite.getCenter(),
                piece as Piece,
            );

            this.clientBoard.sound.play(hitSound);
            await this.clientBoard.playEffect(
                hitEffectType,
                (piece as Piece).sprite.getCenter(),
                null,
                piece as Piece,
            );

            this.rangedAttacked = true;
            this.attacked = true;
            this.moved = true;

            const rollSuccess: boolean = this.clientBoard.roll(
                this.stats.rangedCombat,
                piece.stats.defence,
                this.owner as any,
            );

            this.clientBoard.logger.log(
                `${this.name} ${this.properties.rangedType} ${piece.name}`,
                Colour.Orange,
            );

            await Board.delay(Board.DEFAULT_DELAY / 2);

            if (rollSuccess) {
                if (this.hasStatus(UnitStatus.ShadowForm)) {
                    this.removeStatus(UnitStatus.ShadowForm);
                }
                this.clientBoard.sound.play("killcreature");
                this.clientBoard.logger.log(
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
    override async kill(silent: boolean = false): Promise<void> {
        if (this.dead) {
            throw new Error("Cannot kill unit that is already dead");
        }
        if (this.currentRider) {
            await this.currentRider.dismount();
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
            await this.clientBoard.playEffect(
                EffectType.DisbelieveHit,
                this.sprite.getCenter(),
            );
            await this.destroy();
        } else if (
            this.hasStatus(UnitStatus.NoCorpse) ||
            this.hasStatus(UnitStatus.Undead)
        ) {
            silent = true;
            await this.clientBoard.playEffect(
                EffectType.NoCorpseDeath,
                this.sprite.getCenter(),
            );
            await this.destroy();
        }
        if (!silent) {
            this.clientBoard.sound.play("killcreature");
        }
        if (!this._sprite) {
            this.clientBoard.boardEvents?.emit(BoardEvent.PieceDied, this);
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
        this.clientBoard.emitBoardUpdateEvent();
        await Board.delay(Board.DEFAULT_DELAY);
        this.clientBoard.boardEvents?.emit(BoardEvent.PieceDied, this);
    }

    /**
     * Mount this piece upon the given piece.
     */
    override async mount(piece: EnginePiece): Promise<void> {
        if (!this.canMountPiece(piece)) {
            throw new Error(`${this.name} cannot mount ${piece.name}`);
        }
        this.moved = true;
        this.attacked = true;
        piece.moved = true;

        this.currentMount = piece as Piece;
        piece.currentRider = this;
        await this.clientBoard.movePiece(
            this.id,
            piece.position as unknown as PMath.Vector2,
        );
        this.clientBoard.logger.log(
            `${this.fullName} mounted ${piece.fullName}`,
        );
        (piece as unknown as Piece).createShaders(true, this.owner as any);
    }

    /**
     * Dismount this piece from its current mount.
     */
    override async dismount(): Promise<void> {
        if (!this.currentMount) {
            throw new Error(`${this.name} is not mounted`);
        }
        this.currentMount.currentRider = null;

        this.moved = true;
        this.currentMount.turnOver = true;
        this.clientBoard.logger.log(
            `${this.fullName} dismounted ${this.currentMount.fullName}`,
        );
        this.currentMount.createShaders(true);
        this.currentMount = null;
    }

    /**
     * Destroy this piece, removing it from the board.
     */
    override async destroy() {
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

        this.clientBoard.removePiece(this.id);
        this.clientBoard.emitBoardUpdateEvent();
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
        const isoPosition: PMath.Vector2 = this.clientBoard.getIsoPosition(
            this.position as unknown as PMath.Vector2,
        );

        this._shadow = this.clientBoard.scene.add.image(
            isoPosition.x,
            isoPosition.y,
            "board",
            "shadow-" + this._shadowScale,
        );

        this.clientBoard.getLayer(BoardLayer.Shadows).add(this._shadow);

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

        const isoPosition: PMath.Vector2 = this.clientBoard.getIsoPosition(
            this.position as unknown as PMath.Vector2,
        );

        const group: string = Piece.getUnitConfig(this._properties.id).group
            ? this._properties.id
            : "classicunits";

        this._sprite = this.clientBoard.scene.add.sprite(
            isoPosition.x,
            isoPosition.y - this._offsetY,
            group,
            this._properties.id + "_r_0",
        );

        this.updateDepth();

        this._sprite.setOrigin(0.5, 0.5);

        this.playAnim();

        this.clientBoard.getLayer(BoardLayer.Pieces).add(this._sprite);

        if (this.hasStatus(UnitStatus.Spreads)) {
            this.clientBoard.scene.tweens.add({
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

        this._sprite.enableFilters();
        this._ownerHighlightFilter = new ColorReplaceFilter(
            this._sprite.filterCamera!,
            [0, 0, 0],
            0,
        );
        this._sprite.filters!.internal.add(this._ownerHighlightFilter);

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

        this._ownerHighlightTween = this.clientBoard.scene.tweens.addCounter({
            from: 0,
            to: Piece.DEFAULT_HIGHLIGHT_STEPS - 1,
            duration: Piece.DEFAULT_HIGHLIGHT_DURATION,
            repeat: -1,
            yoyo: true,
            onUpdate: (tween) => {
                const newColor: Types.Display.ColorObject =
                    tweenColours[Math.round(tween.getValue())];

                this._ownerHighlightFilter!.setNewColor(
                    newColor.r / 255,
                    newColor.g / 255,
                    newColor.b / 255,
                );
            },
        });

        this._ownerHighlightTween.pause();
    }
}
