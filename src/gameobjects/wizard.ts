import {
    wizcodes,
    effectOffsets,
} from "../../assets/spritesheets/wizards.json";
import units from "../../assets/data/classicunits.json";
import { Board } from "./board";
import { PieceConfig, WizardConfig } from "./configs/piececonfig";
import { EffectType } from "./effectemitter";
import { BoardLayer } from "./enums/boardlayer";
import { UnitDirection } from "./enums/unitdirection";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { WizCode } from "./interfaces/wizcode";
import { Piece } from "./piece";
import { WizardSprite } from "./wizardsprite";
import { Math as PMath, Geom, GameObjects, BlendModes, Tweens } from "phaser";

/**
 * Get the Wizard unit configuration
 */
const wizardUnitData = units['1'];

/**
 * A wizard piece on the game board, controlled by a player. Wizards can cast
 * spells and have unique appearances defined by their WizCode. If a wizard
 * dies, their player is defeated and anything currently owned by them on the
 * board will be removed from play.
 */
export class Wizard extends Piece {
    /**
     * Default wizard configuration.
     */
    static readonly DEFAULT_WIZARD_CONFIG: PieceConfig = {
        x: 0,
        y: 0,
        type: UnitType.Wizard,
        properties: {
            movement: wizardUnitData.properties.mov,
            combat: wizardUnitData.properties.com,
            rangedCombat: wizardUnitData.properties.rcm,
            range: wizardUnitData.properties.rng,
            defense: wizardUnitData.properties.def,
            maneuverability: wizardUnitData.properties.mnv,
            magicResistance: wizardUnitData.properties.res,
            attackType: wizardUnitData.attackType,
            rangedType: wizardUnitData.rangedType,
            status: [UnitStatus.Wizard],
        },
    };

    /**
     * Magical weapon statuses.
     */
    static readonly MAGIC_WEAPONS: UnitStatus[] = [
        UnitStatus.MagicKnife,
        UnitStatus.MagicSword,
        UnitStatus.MagicBow,
    ];

    /**
     * The WizCode for this wizard. Defines their appearance in a compact
     * sharable string form.
     */
    private readonly _wizCode: WizCode;

    /**
     * Create a new Wizard instance with the given configuration. The config is
     * merged atop the default wizard config so it can be partial.
     * 
     * @param board The board this wizard belongs to.
     * @param id The unique identifier for this wizard.
     * @param config The configuration for this wizard.
     */
    constructor(board: Board, id: number, config: WizardConfig) {
        super(board, id, {
            ...Wizard.DEFAULT_WIZARD_CONFIG,
            ...config,
        });
        this._wizCode = Wizard.parseWizCode(
            config.wizCode || Wizard.randomWizCode()
        );
        if (this.owner) {
            this.owner.castingPiece = this;
        } else {
            throw new Error("Wizard must have an owner");
        }
        // Init the sprites again to use the wizard-specific sprite.
        this.initSprites();
    }

    /**
     * Get the name of this wizard. This should typically be the name of the
     * player that owns them.
     */
    get name(): string {
        return this.owner?.name || "Unnamed wizard";
    }

    /**
     * Get the full name of this wizard. As a wizard 'is' the player, this is
     * the same as the name.
     */
    get fullName(): string {
        return this.name;
    }

    /**
     * Set the direction of this wizard. Some extra logic is needed to flip
     * effect sprites as well.
     * 
     * @param direction The new direction.
     */
    set direction(direction: UnitDirection) {
        super.direction = direction;

        this._effects.forEach((sprite, status) => {
            sprite.x =
                this._sprite.x +
                (effectOffsets[status]?.x[this._wizCode.wiz] ?? 0) *
                    (this._direction === UnitDirection.Left ? -1 : 1);
            sprite.setFlipX(
                this._direction === UnitDirection.Left
            );
        });
    }

    /**
     * Update the position of this wizard's sprite on screen to match its
     * logical position on the board.
     * 
     * @param duration The duration of the move animation in milliseconds.
     * @returns A promise that resolves when the animation is complete.
     */
    async updatePosition(
        duration: number = Piece.DEFAULT_MOVE_DURATION
    ): Promise<void> {
        return new Promise((resolve) => {
            // No sprite, nothing to animate. Just how much punishment did you
            // take last round to lose your sprite exactly?
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

            // Animate the wizard and its effects together.
            this.board.scene.tweens.add({
                targets: [this._sprite, ...this._effects.values()],
                displayOriginY: `+${Math.min(120, difference * 1.5)}`,
                duration: duration / 2,
                yoyo: true,
            });

            this._effects.forEach((sprite, status) => {
                this.board.scene.tweens.add({
                    targets: [sprite],
                    x:
                        isoPosition.x +
                        (effectOffsets[status]?.x[this._wizCode.wiz] ?? 0) *
                            (this._direction === UnitDirection.Left ? -1 : 1),
                    y:
                        isoPosition.y +
                        (effectOffsets[status]?.y[this._wizCode.wiz] ?? 0),
                    duration: duration,
                    ease: PMath.Easing.Cubic.InOut,
                });
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

    /**
     * Set the wizard's visual direction (i.e., left or right). Wizards don't
     * have idle animations, just a single static frame per direction. Yes, that
     * includes when they're holding items like magic knife and sword. I decided
     * that it was better that the wizard's sprite didn't change like it did in
     * the original game, and instead just added the appropriate item(s) to
     * their body.
     */
    playAnim() {
        this._sprite?.setFrame(`${this._wizCode.code}_${this._direction}`);
    }

    /**
     * Update the rendering depth of this wizard and its effects on the board.
     */
    protected updateDepth() {
        super.updateDepth();
        this._effects.forEach((sprite, status) => {
            // Magic wings go below the wizard, all other effects go above.
            // TODO: Make this defined by the effect itself?
            if (status === UnitStatus.MagicWings) {
                sprite.setDepth(this.sprite.depth - 1);
            } else {
                sprite.setDepth(this.sprite.depth + 1);
            }
        });
    }

    /**
     * Oh dear, underestimated that King Cobra again, didn't you. Time to kill
     * the wizard off in a dramatisation of the iconic original Chaos wizard
     * death sequence.
     */
    async kill(): Promise<void> {
        // WOBWOBWOBWOBWOBWOB
        this.board.sound.play("deadwizard1");
        await this.board.playEffect(
            EffectType.WizardDefeated,
            this.sprite.getCenter(),
            null,
            this
        );
        await this.destroy();
        await this.owner?.defeat();
        // PCHOWWW
        await this.board.sound.playAsync("disbelieve", {
            delay: Board.DEFAULT_DELAY
        });
        return new Promise<void>((resolve) => {
            setTimeout(async () => {
                this.board.checkWinCondition();
                resolve();
            }, Board.END_TURN_DELAY);
        });
    }

    /**
     * Add a status to this wizard, applying any visual effects as needed.
     * 
     * @param status The status to add.
     * @returns True if the status was added, false if it was already present.
     */
    addStatus(status: UnitStatus): boolean {
        if (!super.addStatus(status)) {
            return false;
        }
        // Mutually exclusive statuses - can't have a shield and armour at once,
        // nor knife and sword.
        if (status === UnitStatus.MagicShield) {
            console.debug("Removing Magic Armour due to Magic Shield being added");
            this.removeStatus(UnitStatus.MagicArmour);
        }
        else if (status === UnitStatus.MagicArmour) {
            console.debug("Removing Magic Shield due to Magic Armour being added");
            this.removeStatus(UnitStatus.MagicShield);
        }
        if (status === UnitStatus.MagicKnife) {
            console.debug("Removing Magic Sword due to Magic Knife being added");
            this.removeStatus(UnitStatus.MagicSword);
        }
        else if (status === UnitStatus.MagicSword) {
            console.debug("Removing Magic Knife due to Magic Sword being added");
            this.removeStatus(UnitStatus.MagicKnife);
        }

        const isoPosition: Geom.Point = this.board.getIsoPosition(
            this.position
        );
        let sprite:GameObjects.Sprite | GameObjects.Image;
        switch (status) {
            // Visual effects
            case UnitStatus.ShadowForm:
                // Make the wizard semi-transparent
                this.sprite?.setAlpha(Piece.SHADOW_FORM_ALPHA);
                break;
            case UnitStatus.MagicKnife:
            case UnitStatus.MagicSword:
            case UnitStatus.MagicBow:
            case UnitStatus.MagicShield:
            case UnitStatus.MagicWings:
                // Add an animated effect sprite at the appropriate offset. This
                // is a change to how the original game worked, which just 
                // replaced the wizard sprite entirely. This way multiple
                // effects can be shown at once and the wizard's appearance
                // remains consistent.
                sprite =
                    this.board.scene.add.sprite(
                        isoPosition.x +
                            (effectOffsets[status]?.x[this._wizCode.wiz] ?? 0) *
                                (this._direction === UnitDirection.Left
                                    ? -1
                                    : 1),
                        isoPosition.y +
                            (effectOffsets[status]?.y[this._wizCode.wiz] ?? 0),
                        "effects"
                    ) ;
                (sprite as GameObjects.Sprite).anims.play({
                    key: status.toLowerCase(),
                    repeat: -1,
                });
                sprite.setOrigin(0.5, 0.5);
                sprite.setFlipX(
                    this._direction === UnitDirection.Left
                );
                sprite.setBlendMode(BlendModes.ADD);
                this.board.getLayer(BoardLayer.Pieces).add(sprite);
                this._effects.set(status, sprite);
                this.updateDepth();
                break;
            case UnitStatus.MagicArmour:
                // Similar to the other magic effects, but this one is a static
                // image that overlays the whole wizard and pulses in and out
                // via a tween.
                sprite = this.board.scene.add.image(
                    isoPosition.x +
                    (effectOffsets[status]?.x[this._wizCode.wiz] ?? 0) *
                        (this._direction === UnitDirection.Left
                            ? -1
                            : 1),
                isoPosition.y +
                    (effectOffsets[status]?.y[this._wizCode.wiz] ?? 0),
                    "magic-armour",
                    this._wizCode.wiz
                );
                sprite.setOrigin(0.5, 0.6);
                sprite.setFlipX(
                    this._direction === UnitDirection.Left
                );
                sprite.setBlendMode(BlendModes.ADD);
                this.board.getLayer(BoardLayer.Pieces).add(sprite);
                this._effects.set(status, sprite);
                sprite.setData('_effectTween', this.board.scene.tweens.add({
                    targets: [sprite],
                    duration: 500,
                    yoyo: true,
                    ease: "Stepped",
                    easeParams: [3],
                    alpha: {from: 0.2, to: 1},
                    loop: -1
                }));
                this.updateDepth();
                break;
        }

        // We fly now.
        if (status === UnitStatus.MagicWings) {
            this.addStatus(UnitStatus.Flying);
        }

        // Any magical weapon lets us attack the undead.
        if (Wizard.MAGIC_WEAPONS.includes(status)) {
            this.addStatus(UnitStatus.AttackUndead);
        }

        // If we're mounted, hide all effects so we don't have a horse with
        // wings. Or worse, a Pegasus with two sets of wings.
        if (this.currentMount) {
            this._effects.forEach((sprite, status) => {
                sprite.setVisible(false);
            });
        }

        return true;
    }

    /**
     * Remove a status from this wizard, removing any visual effects as needed.
     * Comparatively few things will remove a wizard's statuses - the main being
     * attacking with Shadow Form causing it to be lost, or the use of a
     * mutually exclusive spell (e.g., Magic Shield vs Magic Armour). Still, we
     * need to handle it properly anyway.
     * 
     * @param status The status to remove.
     * @returns True if the status was removed, false if it was not present.
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
            case UnitStatus.MagicArmour:
                // All of these have effect sprites, so get rid of the
                // appropriate one from the map.
                {
                    if (!this._effects.has(status)) {
                        break;
                    }
                    const sprite: GameObjects.Sprite | GameObjects.Image = this._effects.get(status);
                    if (sprite) {
                        try {
                            if (sprite.getData('_effectTween') instanceof Tweens.Tween) {
                                (sprite.getData('_effectTween') as Tweens.Tween)?.stop()?.destroy();
                            }
                        } catch {
                            // Ignore - probably doesn't have a tween?
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

        // Losing all magical weapons means we can no longer attack the
        // undead.
        if (Wizard.MAGIC_WEAPONS.includes(status)) {
            this.removeStatus(status);
            if (
                Wizard.MAGIC_WEAPONS.some(s => this.hasStatus(s)) === false
            ) {
                this.removeStatus(UnitStatus.AttackUndead);
            }
        }
        
        return true;
    }

    /**
     * Mount this wizard onto a piece, hiding any effects while mounted.
     * @param piece The piece to mount.
     */
    async mount(piece: Piece): Promise<void> {
        await super.mount(piece);

        // Hide all effects while mounted.
        this._effects.forEach((sprite, status) => {
            sprite.setVisible(false);
        });

        this._sprite.setVisible(false);
    }

    /**
     * Dismount this wizard from its current mount, showing any effects again.
     */
    async dismount(): Promise<void> {
        this._sprite.setVisible(true);
        await super.dismount();

        // Show all effects again.
        this._effects.forEach((sprite, status) => {
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

        const isoPosition: Geom.Point = this.board.getIsoPosition(
            this.position
        );

        this._sprite = new WizardSprite(
            this.board.scene,
            isoPosition.x,
            isoPosition.y,
            this._wizCode
        );

        this.updateDepth();

        this._sprite.setOrigin(0.5, 0.6);

        this.board.getLayer(BoardLayer.Pieces).add(this._sprite);

        this.playAnim();

        return this._sprite;
    }

    createShadow(): GameObjects.Image | null {
        // Wizards have a unit-glow effect instead of a shadow.
        if (this._shadow) {
            return this._shadow;
        }
        const isoPosition: Geom.Point = this.board.getIsoPosition(
            this.position
        );

        this._shadow = this.board.scene.add.image(
            isoPosition.x,
            isoPosition.y,
            "unit-glow"
        );

        // Tint the glow to match the wizard's owner colour.
        this._shadow.setTint(this.owner?.colour);

        // Make additive
        this._shadow.setBlendMode(BlendModes.ADD);

        // Add repeating tween to pulse the glow
        this.board.scene.tweens.add({
            targets: [this._shadow],
            duration: 1000,
            yoyo: true,
            ease: "Stepped",
            easeParams: [5],
            alpha: {from: 0, to: 1},
            loop: -1,
        });

        this.board.getLayer(BoardLayer.Shadows).add(this._shadow);

        this._shadow.setOrigin(0.5, 0.5);
        this._shadow.displayOriginY = -3;

        return this._shadow;
    }

    /**
     * Parse a WizCode string into its components. Any out-of-bounds values are
     * clamped to the maximum allowed for that component at time of writing,
     * allowing for forwards compatibility.
     * 
     * @param wizCode The WizCode string to parse.
     * @returns The parsed wizard configuration object.
     */
    static parseWizCode(wizCode: string): WizCode {
        if (!wizCode?.trim()) {
            throw new Error("WizCode cannot be empty");
        }

        // Normalise
        wizCode = wizCode.toLowerCase().trim();

        // Sense check the WizCode format; it should be exactly 10 hex digits.
        if (!/[0-9a-f]{10}/.test(wizCode)) {
            throw new Error("Invalid WizCode");
        }

        return {
            code: wizCode,
            wiz: Math.min(Number.parseInt(wizCode.slice(0, 2), 16), wizcodes.max.wiz),
            pri: Math.min(Number.parseInt(wizCode.slice(2, 4), 16), wizcodes.max.pri),
            sec: Math.min(Number.parseInt(wizCode.slice(4, 6), 16), wizcodes.max.sec),
            skin: Math.min(
                Number.parseInt(wizCode.slice(6, 8), 16),
                wizcodes.max.skin
            ),
            hat: Math.min(Number.parseInt(wizCode.slice(8, 10), 16), wizcodes.max.hat),
        };
    }

    /**
     * YOLO WizCode generator. Because some people are not very discerning.
     * 
     * @returns A random WizCode string.
     */
    public static randomWizCode(): string {
        return [
            PMath.RND.integerInRange(0, wizcodes.max.wiz)
                .toString(16)
                .padStart(2, "0"),
            PMath.RND.integerInRange(0, wizcodes.max.pri)
                .toString(16)
                .padStart(2, "0"),
            PMath.RND.integerInRange(0, wizcodes.max.sec)
                .toString(16)
                .padStart(2, "0"),
            PMath.RND.integerInRange(0, wizcodes.max.skin)
                .toString(16)
                .padStart(2, "0"),
            PMath.RND.integerInRange(0, wizcodes.max.hat)
                .toString(16)
                .padStart(2, "0"),
        ].join("").toLowerCase();
    }
}
