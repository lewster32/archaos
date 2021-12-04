import {
    wizcodes,
    effectOffsets,
} from "../../assets/spritesheets/wizards.json";
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

export class Wizard extends Piece {
    static DEFAULT_WIZARD_CONFIG: PieceConfig = {
        x: 0,
        y: 0,
        type: UnitType.Wizard,
        properties: {
            movement: 1,
            combat: 3,
            rangedCombat: 0,
            range: 0,
            defense: 3,
            maneuverability: 3,
            magicResistance: 6,
            attackType: "hit",
            rangedType: "shot",
            status: [UnitStatus.Wizard],
        },
    };

    private _wizCode: WizCode;

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
    }

    get name(): string {
        return this.owner?.name || "Unnamed Wizard";
    }

    set direction(direction: UnitDirection) {
        super.direction = direction;

        this._effects.forEach((sprite, status) => {
            sprite.x =
                this._sprite.x +
                (effectOffsets[status]?.x[this._wizCode.wiz] ?? 0) *
                    (this._direction === UnitDirection.Left ? -1 : 1);
            sprite.setFlipX(
                this._direction === UnitDirection.Left ? true : false
            );
        });
    }

    async updatePosition(
        duration: number = Piece.DEFAULT_MOVE_DURATION
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!this._sprite) {
                return;
            }

            const isoPosition: Phaser.Geom.Point = this.board.getIsoPosition(
                this.position
            );

            this.board.scene.tweens.add({
                targets: [this._sprite, ...this._effects.values()],
                displayOriginY: "+" + Board.DEFAULT_CELLSIZE,
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
                    ease: Phaser.Math.Easing.Cubic.InOut,
                });
            });

            this.board.scene.tweens.add({
                targets: [this._sprite, this._shadow],
                x: isoPosition.x,
                y: isoPosition.y - this._offsetY,
                duration: duration,
                onUpdateScope: this,
                ease: Phaser.Math.Easing.Cubic.InOut,
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

    playAnim() {
        this._sprite?.setFrame(`${this._wizCode.code}_${this._direction}`);
    }

    protected updateDepth() {
        super.updateDepth();
        this._effects.forEach((sprite, status) => {
            if (status === UnitStatus.MagicWings) {
                sprite.setDepth(this.sprite.depth - 1);
            } else {
                sprite.setDepth(this.sprite.depth + 1);
            }
        });
    }

    async kill(): Promise<void> {
        this.board.sound.play("deadwizard1");
        await this.board.playEffect(
            EffectType.WizardDefeated,
            this.sprite.getCenter(),
            null,
            this
        );
        await this.destroy();
        await this.owner?.defeat();
        this.board.sound.play("disbelieve");
        setTimeout(async () => {
            await this.board.checkWinCondition();
        }, 500);
    }

    addStatus(status: UnitStatus): boolean {
        if (super.addStatus(status)) {
            console.log(`${this.name} gained ${status}`);
            const isoPosition: Phaser.Geom.Point = this.board.getIsoPosition(
                this.position
            );
            let sprite:Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
            switch (status) {
                // Visual effects
                case UnitStatus.ShadowForm:
                    this.sprite.setAlpha(0.4);
                    break;
                case UnitStatus.MagicKnife:
                case UnitStatus.MagicSword:
                case UnitStatus.MagicBow:
                case UnitStatus.MagicShield:
                case UnitStatus.MagicWings:
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
                    (sprite as Phaser.GameObjects.Sprite).anims.play({
                        key: status.toLowerCase(),
                        repeat: -1,
                    });
                    sprite.setOrigin(0.5, 0.5);
                    sprite.setFlipX(
                        this._direction === UnitDirection.Left ? true : false
                    );
                    sprite.setBlendMode(Phaser.BlendModes.ADD);
                    this.board.getLayer(BoardLayer.Pieces).add(sprite);
                    this._effects.set(status, sprite);
                    this.updateDepth();
                    break;
                case UnitStatus.MagicArmour:
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
                        this._direction === UnitDirection.Left ? true : false
                    );
                    this.board.getLayer(BoardLayer.Pieces).add(sprite);
                    this._effects.set(status, sprite);
                    sprite['_effectTween'] = this.board.scene.tweens.add({
                        targets: [sprite],
                        duration: 500,
                        yoyo: true,
                        ease: "Stepped",
                        easeParams: [3],
                        alpha: {from: 0, to: 1},
                        loop: -1
                    });
                    this.updateDepth();
                    break;
            }

            if (status === UnitStatus.MagicWings) {
                this.addStatus(UnitStatus.Flying);
            }

            if ([UnitStatus.MagicKnife, UnitStatus.MagicSword, UnitStatus.MagicBow].includes(status)) {
                this.addStatus(UnitStatus.AttackUndead);
            }

            if (status === UnitStatus.MagicShield) {
                this.removeStatus(UnitStatus.MagicArmour);
            }
            else if (status === UnitStatus.MagicArmour) {
                this.removeStatus(UnitStatus.MagicShield);
            }

            if (status === UnitStatus.MagicKnife) {
                this.removeStatus(UnitStatus.MagicSword);
            }
            else if (status === UnitStatus.MagicSword) {
                this.removeStatus(UnitStatus.MagicKnife);
            }

            if (this.currentMount) {
                this._effects.forEach((sprite, status) => {
                    sprite.setAlpha(0);
                });
            }

            return true;
        }
        return false;
    }

    removeStatus(status: UnitStatus): boolean {
        if (super.removeStatus(status)) {
            console.log(`${this.name} lost ${status}`);
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
                    if (this._effects.has(status)) {
                        const sprite = this._effects.get(status);
                        if (sprite) {
                            if (sprite['_effectTween']) {
                                sprite['_effectTween'].stop().destroy();
                            }
                            sprite.destroy();
                        }
                        this._effects.delete(status);
                    }
                    break;
            }

            if (status === UnitStatus.MagicWings) {
                this.removeStatus(UnitStatus.Flying);
            }

            if ([UnitStatus.MagicKnife, UnitStatus.MagicSword, UnitStatus.MagicBow].includes(status)) {
                this.removeStatus(status);
                if (
                    !this.hasStatus(UnitStatus.MagicKnife) &&
                    !this.hasStatus(UnitStatus.MagicSword) &&
                    !this.hasStatus(UnitStatus.MagicBow)
                ) {
                    this.removeStatus(UnitStatus.AttackUndead);
                }
            }
            
            return true;
        }

        return false;
    }

    createSprite(): Phaser.GameObjects.Sprite {
        if (this._sprite) {
            return this._sprite;
        }

        const isoPosition: Phaser.Geom.Point = this.board.getIsoPosition(
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

    static parseWizCode(wizCode: string): WizCode {
        if (/[0-9a-f]{10}/i.test(wizCode) === false) {
            throw new Error("Invalid WizCode");
        }

        return {
            code: wizCode,
            wiz: Math.min(parseInt(wizCode.substr(0, 2), 16), wizcodes.max.wiz),
            pri: Math.min(parseInt(wizCode.substr(2, 2), 16), wizcodes.max.pri),
            sec: Math.min(parseInt(wizCode.substr(4, 2), 16), wizcodes.max.sec),
            skin: Math.min(
                parseInt(wizCode.substr(6, 2), 16),
                wizcodes.max.skin
            ),
            hat: Math.min(parseInt(wizCode.substr(8, 2), 16), wizcodes.max.hat),
        };
    }

    static randomWizCode(): string {
        return [
            Phaser.Math.RND.integerInRange(0, wizcodes.max.wiz)
                .toString(16)
                .padStart(2, "0"),
            Phaser.Math.RND.integerInRange(0, wizcodes.max.pri)
                .toString(16)
                .padStart(2, "0"),
            Phaser.Math.RND.integerInRange(0, wizcodes.max.sec)
                .toString(16)
                .padStart(2, "0"),
            Phaser.Math.RND.integerInRange(0, wizcodes.max.skin)
                .toString(16)
                .padStart(2, "0"),
            Phaser.Math.RND.integerInRange(0, wizcodes.max.hat)
                .toString(16)
                .padStart(2, "0"),
        ].join("");
    }
}
