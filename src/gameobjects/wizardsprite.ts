import { WizCode } from "./interfaces/wizcode";
import {
    searchColors,
    replaceColors,
    replaceSkin,
    hatYFix,
} from "../../assets/spritesheets/wizards.json";

export class WizardSprite extends Phaser.GameObjects.Sprite {
    private _wizCode: WizCode;
    constructor(scene: Phaser.Scene, x: number, y: number, wizCode: WizCode) {
        super(scene, x, y, "wizards");
        this._wizCode = wizCode;

        if (this.texture.manager.exists(this._wizCode.code)) {
            this.setTexture(this._wizCode.code);
        } else {
            this.generateFrames();
        }
    }

    protected generateFrames() {
        const canvas: Phaser.Textures.CanvasTexture =
            this.scene.textures.createCanvas(this._wizCode.code, 36, 24);

        canvas.drawFrame(
            "wizards",
            this._wizCode.wiz * 2,
            0,
            5 + hatYFix[this._wizCode.wiz]
        );
        canvas.drawFrame(
            "wizards",
            this._wizCode.wiz * 2 + 1,
            18,
            5 + hatYFix[this._wizCode.wiz]
        );

        // Primary
        WizardSprite.replaceColor(
            canvas,
            searchColors.primaryDark,
            replaceColors[this._wizCode.pri].dark
        );
        WizardSprite.replaceColor(
            canvas,
            searchColors.primaryMid,
            replaceColors[this._wizCode.pri].mid
        );
        WizardSprite.replaceColor(
            canvas,
            searchColors.primaryLight,
            replaceColors[this._wizCode.pri].light
        );

        // Secondary
        WizardSprite.replaceColor(
            canvas,
            searchColors.secondaryDark,
            replaceColors[this._wizCode.sec].dark
        );
        WizardSprite.replaceColor(
            canvas,
            searchColors.secondaryMid,
            replaceColors[this._wizCode.sec].mid
        );
        WizardSprite.replaceColor(
            canvas,
            searchColors.secondaryLight,
            replaceColors[this._wizCode.sec].light
        );

        // Skin
        WizardSprite.replaceColor(
            canvas,
            searchColors.skinMid,
            replaceSkin[this._wizCode.skin].mid
        );
        WizardSprite.replaceColor(
            canvas,
            searchColors.skinLight,
            replaceSkin[this._wizCode.skin].light
        );

        canvas.refresh();

        // Hat
        if (this._wizCode.hat > 0) {
            canvas.drawFrame(
                "hats",
                this._wizCode.hat * 2,
                2,
                hatYFix[this._wizCode.wiz]
            );
            canvas.drawFrame(
                "hats",
                this._wizCode.hat * 2 + 1,
                20,
                hatYFix[this._wizCode.wiz]
            );
        }

        // Create right/left frames
        canvas.add(
            `${this._wizCode.code}_r`,
            0,
            0,
            0,
            canvas.width / 2,
            canvas.height
        );
        canvas.add(
            `${this._wizCode.code}_l`,
            0,
            canvas.width / 2,
            0,
            canvas.width / 2,
            canvas.height
        );

        this.setTexture(this._wizCode.code);
    }

    static replaceColor(
        canvas: Phaser.Textures.CanvasTexture,
        searchColor: number[],
        replaceColor: number[]
    ): Phaser.Textures.CanvasTexture {
        const imgData: ImageData = canvas.context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        );

        for (let i = 0; i < imgData.data.length; i += 4) {
            if (imgData.data[i + 3] === 255) {
                if (
                    imgData.data[i] === searchColor[0] &&
                    imgData.data[i + 1] === searchColor[1] &&
                    imgData.data[i + 2] === searchColor[2]
                ) {
                    imgData.data[i] = replaceColor[0];
                    imgData.data[i + 1] = replaceColor[1];
                    imgData.data[i + 2] = replaceColor[2];
                }
            }
        }
        canvas.context.putImageData(imgData, 0, 0);

        return canvas;
    }
}
