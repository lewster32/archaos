import {
    WizardConfig,
    BoardLayer,
    UnitDirection,
    UnitStatus,
    WizCode,
    Wizard as EngineWizard,
} from "@archaos/engine";
import {
    wizcodes,
    effectOffsets,
} from "@assets/spritesheets/wizards.json";
import { Board } from "./board";
import { Player } from "./player";
import { EffectType } from "./effectemitter";
import { Piece } from "./piece";
import { WizardSprite } from "./wizardsprite";
import { Math as PMath, Geom, GameObjects, BlendModes, Tweens } from "phaser";

// Populate the engine Wizard's wizcode max bounds from
// spritesheet metadata.
EngineWizard.wizcodeMax = wizcodes.max;

/**
 * A wizard piece on the game board, controlled by a
 * player. Wizards can cast spells and have unique
 * appearances defined by their WizCode. If a wizard
 * dies, their player is defeated and anything currently
 * owned by them on the board will be removed from play.
 *
 * Extends client Piece for rendering; delegates pure
 * game logic (WizCode parsing, placement geometry) to
 * engine Wizard statics.
 */
export class Wizard extends Piece {
    /**
     * Default wizard configuration.
     */
    static readonly DEFAULT_WIZARD_CONFIG =
        EngineWizard.DEFAULT_WIZARD_CONFIG;

    /**
     * Magical weapon statuses.
     */
    static readonly MAGIC_WEAPONS: UnitStatus[] =
        EngineWizard.MAGIC_WEAPONS;

    /**
     * The WizCode for this wizard. Defines their
     * appearance in a compact sharable string form.
     */
    private readonly _wizCode: WizCode;

    /**
     * Create a new Wizard instance with the given
     * configuration. The config is merged atop the
     * default wizard config so it can be partial.
     *
     * @param board The board this wizard belongs to.
     * @param id The unique identifier.
     * @param config The configuration for this wizard.
     */
    constructor(
        board: Board,
        id: number,
        config: WizardConfig,
    ) {
        super(board, id, {
            ...Wizard.DEFAULT_WIZARD_CONFIG,
            ...config,
            properties: {
                ...Wizard.DEFAULT_WIZARD_CONFIG
                    .properties,
                ...config.properties,
            },
        });
        this._wizCode = Wizard.parseWizCode(
            config.wizCode || Wizard.randomWizCode(),
        );
        if (this.owner) {
            this.owner.castingPiece = this;
        } else {
            throw new Error(
                "Wizard must have an owner",
            );
        }
        // Init the sprites again to use the
        // wizard-specific sprite.
        this.initSprites();
    }

    /**
     * Get the name of this wizard. This should
     * typically be the name of the player that owns
     * them.
     */
    get name(): string {
        return this.owner?.name || "Unnamed wizard";
    }

    /**
     * Get the full name of this wizard. As a wizard
     * 'is' the player, this is the same as the name.
     */
    get fullName(): string {
        return this.name;
    }

    /**
     * Get the WizCode string for this wizard, which
     * defines their appearance.
     */
    get wizCode(): string {
        return this._wizCode.code;
    }

    /**
     * Set the direction of this wizard. Some extra
     * logic is needed to flip effect sprites as well.
     *
     * @param direction The new direction.
     */
    set direction(direction: UnitDirection) {
        super.direction = direction;

        this._effects.forEach((sprite, status) => {
            sprite.x =
                this._sprite.x +
                (effectOffsets[status]?.x[
                    this._wizCode.wiz
                ] ?? 0) *
                    (this._direction ===
                    UnitDirection.Left
                        ? -1
                        : 1);
            (
                sprite as GameObjects.Sprite
            ).setFlipX(
                this._direction ===
                    UnitDirection.Left,
            );
        });
    }

    /**
     * Get the direction this wizard is facing.
     */
    get direction(): UnitDirection {
        return super.direction;
    }

    /**
     * Update the position of this wizard's sprite on
     * screen to match its logical position on the
     * board.
     *
     * @param duration The duration of the move
     *                 animation in milliseconds.
     * @returns A promise that resolves when the
     *          animation is complete.
     */
    async updatePosition(
        duration: number = Piece.DEFAULT_MOVE_DURATION,
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!this._sprite) {
                return;
            }

            const isoPosition: Geom.Point =
                this.clientBoard.getIsoPosition(
                    this.position,
                );

            const difference: number =
                Board.distance(
                    new Geom.Point(
                        this._sprite.x,
                        this._sprite.y,
                    ),
                    isoPosition,
                );

            // Animate the wizard and its effects
            // together.
            this.clientBoard.scene.tweens.add({
                targets: [
                    this._sprite,
                    ...this._effects.values(),
                ],
                displayOriginY: `+${Math.min(120, difference * 1.5)}`,
                duration: duration / 2,
                yoyo: true,
            });

            this._effects.forEach(
                (sprite, status) => {
                    this.clientBoard.scene.tweens.add({
                        targets: [sprite],
                        x:
                            isoPosition.x +
                            (effectOffsets[status]?.x[
                                this._wizCode.wiz
                            ] ?? 0) *
                                (this._direction ===
                                UnitDirection.Left
                                    ? -1
                                    : 1),
                        y:
                            isoPosition.y +
                            (effectOffsets[status]?.y[
                                this._wizCode.wiz
                            ] ?? 0),
                        duration: duration,
                        ease: PMath.Easing.Cubic
                            .InOut,
                    });
                },
            );

            this.clientBoard.scene.tweens.add({
                targets: [
                    this._sprite,
                    this._shadow,
                ],
                x: isoPosition.x,
                y:
                    isoPosition.y -
                    this._offsetY,
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
     * Set the wizard's visual direction (i.e., left
     * or right). Wizards don't have idle animations,
     * just a single static frame per direction.
     */
    playAnim() {
        this._sprite?.setFrame(
            `${this._wizCode.code}_${this._direction}`,
        );
    }

    /**
     * Update the rendering depth of this wizard and
     * its effects on the board.
     */
    protected updateDepth() {
        super.updateDepth();
        this._effects.forEach((sprite, status) => {
            if (status === UnitStatus.MagicWings) {
                sprite.setDepth(
                    this.sprite.depth - 1,
                );
            } else {
                sprite.setDepth(
                    this.sprite.depth + 1,
                );
            }
        });
    }

    /**
     * Oh dear, underestimated that King Cobra again,
     * didn't you. Time to kill the wizard off.
     */
    async kill(): Promise<void> {
        // WOBWOBWOBWOBWOBWOB
        this.clientBoard.sound.play("deadwizard1");
        await this.clientBoard.playEffect(
            EffectType.WizardDefeated,
            this.sprite.getCenter(),
            null,
            this,
        );
        // If the wizard is mounted, silently clear
        // the relationship before destroy() so that
        // destroyCreations() killing the mount later
        // doesn't call dismount() on an already-dead
        // wizard.
        if (this._currentMount) {
            this._currentMount.currentRider = null;
            this._currentMount = null;
        }
        const ownedPieceCount: number =
            this.clientBoard
                .getPiecesByOwner(this.owner as any)
                .length;
        await this.destroy();
        await this.owner?.defeat();
        if (ownedPieceCount > 1) {
            await Board.delay(Board.END_TURN_DELAY);
        } else {
            // PCHOWWW
            this.clientBoard.sound.play("disbelieve");
            await Board.delay(Board.DEFAULT_DELAY);
        }
        await this.clientBoard.checkWinCondition();
    }

    /**
     * Add a status to this wizard, applying any
     * visual effects as needed.
     *
     * @param status The status to add.
     * @returns True if the status was added, false
     *          if it was already present.
     */
    addStatus(status: UnitStatus): boolean {
        if (!super.addStatus(status)) {
            return false;
        }
        // Mutually exclusive statuses
        if (status === UnitStatus.MagicShield) {
            this.removeStatus(
                UnitStatus.MagicArmour,
            );
        } else if (
            status === UnitStatus.MagicArmour
        ) {
            this.removeStatus(
                UnitStatus.MagicShield,
            );
        }
        if (status === UnitStatus.MagicKnife) {
            this.removeStatus(
                UnitStatus.MagicSword,
            );
        } else if (
            status === UnitStatus.MagicSword
        ) {
            this.removeStatus(
                UnitStatus.MagicKnife,
            );
        }

        const isoPosition: Geom.Point =
            this.clientBoard.getIsoPosition(this.position);
        let effectSprite:
            | GameObjects.Sprite
            | GameObjects.Image;
        switch (status) {
            // Visual effects
            case UnitStatus.ShadowForm:
                this.sprite?.setAlpha(
                    Piece.SHADOW_FORM_ALPHA,
                );
                break;
            case UnitStatus.MagicKnife:
            case UnitStatus.MagicSword:
            case UnitStatus.MagicBow:
            case UnitStatus.MagicShield:
            case UnitStatus.MagicWings:
                effectSprite =
                    this.clientBoard.scene.add.sprite(
                        isoPosition.x +
                            (effectOffsets[status]?.x[
                                this._wizCode.wiz
                            ] ?? 0) *
                                (this._direction ===
                                UnitDirection.Left
                                    ? -1
                                    : 1),
                        isoPosition.y +
                            (effectOffsets[status]?.y[
                                this._wizCode.wiz
                            ] ?? 0),
                        "effects",
                    );
                (
                    effectSprite as GameObjects.Sprite
                ).anims.play({
                    key: status.toLowerCase(),
                    repeat: -1,
                });
                effectSprite.setOrigin(0.5, 0.5);
                effectSprite.setFlipX(
                    this._direction ===
                        UnitDirection.Left,
                );
                effectSprite.setBlendMode(
                    BlendModes.ADD,
                );
                this.clientBoard
                    .getLayer(BoardLayer.Pieces)
                    .add(effectSprite);
                this._effects.set(
                    status,
                    effectSprite,
                );
                this.updateDepth();
                break;
            case UnitStatus.MagicArmour:
                effectSprite =
                    this.clientBoard.scene.add.image(
                        isoPosition.x +
                            (effectOffsets[status]?.x[
                                this._wizCode.wiz
                            ] ?? 0) *
                                (this._direction ===
                                UnitDirection.Left
                                    ? -1
                                    : 1),
                        isoPosition.y +
                            (effectOffsets[status]?.y[
                                this._wizCode.wiz
                            ] ?? 0),
                        "magic-armour",
                        this._wizCode.wiz,
                    );
                effectSprite.setOrigin(0.5, 0.6);
                effectSprite.setFlipX(
                    this._direction ===
                        UnitDirection.Left,
                );
                effectSprite.setBlendMode(
                    BlendModes.ADD,
                );
                this.clientBoard
                    .getLayer(BoardLayer.Pieces)
                    .add(effectSprite);
                this._effects.set(
                    status,
                    effectSprite,
                );
                effectSprite.setData(
                    "_effectTween",
                    this.clientBoard.scene.tweens.add({
                        targets: [effectSprite],
                        duration: 500,
                        yoyo: true,
                        ease: "Stepped",
                        easeParams: [3],
                        alpha: { from: 0.2, to: 1 },
                        loop: -1,
                    }),
                );
                this.updateDepth();
                break;
        }

        // We fly now.
        if (status === UnitStatus.MagicWings) {
            this.addStatus(UnitStatus.Flying);
        }

        // Any magical weapon lets us attack the
        // undead.
        if (
            Wizard.MAGIC_WEAPONS.includes(status)
        ) {
            this.addStatus(UnitStatus.AttackUndead);
        }

        // If we're mounted, hide all effects
        if (this.currentMount) {
            this._effects.forEach((effect) => {
                effect.setVisible(false);
            });
        }

        return true;
    }

    /**
     * Remove a status from this wizard, removing any
     * visual effects as needed.
     *
     * @param status The status to remove.
     * @returns True if the status was removed, false
     *          if it was not present.
     */
    removeStatus(status: UnitStatus): boolean {
        if (!super.removeStatus(status)) {
            return false;
        }
        switch (status) {
            // Visual effects
            case UnitStatus.ShadowForm:
                this.sprite.setAlpha(1);
                break;
            case UnitStatus.MagicKnife:
            case UnitStatus.MagicSword:
            case UnitStatus.MagicBow:
            case UnitStatus.MagicShield:
            case UnitStatus.MagicWings:
            case UnitStatus.MagicArmour: {
                if (!this._effects.has(status)) {
                    break;
                }
                const sprite:
                    | GameObjects.Sprite
                    | GameObjects.Image =
                    this._effects.get(status);
                if (sprite) {
                    try {
                        if (
                            sprite.getData(
                                "_effectTween",
                            ) instanceof Tweens.Tween
                        ) {
                            (
                                sprite.getData(
                                    "_effectTween",
                                ) as Tweens.Tween
                            )
                                ?.stop()
                                ?.destroy();
                        }
                    } catch {
                        // Ignore
                    }
                    sprite.destroy();
                }
                this._effects.delete(status);
                break;
            }
        }

        // We stop flying now.
        if (status === UnitStatus.MagicWings) {
            this.removeStatus(UnitStatus.Flying);
        }

        // Losing all magical weapons means we can
        // no longer attack the undead.
        if (
            Wizard.MAGIC_WEAPONS.includes(status)
        ) {
            this.removeStatus(status);
            if (
                Wizard.MAGIC_WEAPONS.some((s) =>
                    this.hasStatus(s),
                ) === false
            ) {
                this.removeStatus(
                    UnitStatus.AttackUndead,
                );
            }
        }

        return true;
    }

    /**
     * Mount this wizard onto a piece, hiding any
     * effects while mounted.
     * @param piece The piece to mount.
     */
    async mount(piece: Piece): Promise<void> {
        await super.mount(piece);

        // Hide all effects while mounted.
        this._effects.forEach((sprite) => {
            sprite.setVisible(false);
        });

        this._sprite.setVisible(false);
    }

    /**
     * Dismount this wizard from its current mount,
     * showing any effects again.
     */
    async dismount(): Promise<void> {
        this._sprite.setVisible(true);
        await super.dismount();

        // Show all effects again.
        this._effects.forEach((sprite) => {
            sprite.setVisible(true);
        });
    }

    /**
     * Create the sprite for this wizard on the board.
     *
     * @returns The created Phaser sprite.
     */
    createSprite(): GameObjects.Sprite {
        if (this._sprite) {
            return this._sprite;
        }

        const isoPosition: Geom.Point =
            this.clientBoard.getIsoPosition(this.position);

        this._sprite = new WizardSprite(
            this.clientBoard.scene,
            isoPosition.x,
            isoPosition.y,
            this._wizCode,
        );

        this.updateDepth();

        this._sprite.setOrigin(0.5, 0.6);

        this.clientBoard
            .getLayer(BoardLayer.Pieces)
            .add(this._sprite);

        this.playAnim();

        return this._sprite;
    }

    createShadow(): GameObjects.Image | null {
        // Wizards have a unit-glow effect instead of
        // a shadow.
        if (this._shadow) {
            return this._shadow;
        }
        const isoPosition: Geom.Point =
            this.clientBoard.getIsoPosition(this.position);

        this._shadow =
            this.clientBoard.scene.add.image(
                isoPosition.x,
                isoPosition.y,
                "unit-glow",
            );

        // Tint the glow to match the wizard's owner
        // colour.
        this._shadow.setTint(this.owner?.colour);

        // Make additive
        this._shadow.setBlendMode(BlendModes.ADD);

        // Add repeating tween to pulse the glow
        this.clientBoard.scene.tweens.add({
            targets: [this._shadow],
            duration: 1000,
            yoyo: true,
            ease: "Stepped",
            easeParams: [5],
            alpha: { from: 0, to: 1 },
            loop: -1,
        });

        this.clientBoard
            .getLayer(BoardLayer.Shadows)
            .add(this._shadow);

        this._shadow.setOrigin(0.5, 0.5);
        this._shadow.displayOriginY = -3;

        return this._shadow;
    }

    /**
     * Parse a WizCode string into its components.
     * Delegates to engine Wizard.
     */
    static parseWizCode(wizCode: string): WizCode {
        return EngineWizard.parseWizCode(wizCode);
    }

    /**
     * Create and place wizards for all players.
     * Delegates to engine Wizard.
     */
    static createAll(
        board: Board,
        players: Player[],
    ): void {
        EngineWizard.createAll(
            board as any, players as any,
        );
    }

    /**
     * YOLO WizCode generator. Delegates to engine
     * Wizard.
     *
     * @returns A random WizCode string.
     */
    public static randomWizCode(): string {
        return EngineWizard.randomWizCode();
    }
}
