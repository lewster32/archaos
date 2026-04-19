import { hatYFix, replaceColors, replaceSkin, searchColors } from "@assets/spritesheets/wizards.json";
import { WizCode } from "@archaos/engine";

import { GameObjects, Textures, Scene } from "phaser";

export class WizardSprite extends GameObjects.Sprite {
    private readonly _wizCode: WizCode;
    constructor(scene: Scene, x: number, y: number, wizCode: WizCode) {
        super(scene, x, y, "wizards");
        this._wizCode = wizCode;

        if (this.texture.manager.exists(this._wizCode.code)) {
            this.setTexture(this._wizCode.code);
        } else {
            this.generateFrames();
        }
    }

    protected generateFrames() {
        const canvas: Textures.CanvasTexture = this.scene.textures.createCanvas(this._wizCode.code, 36, 24);

        canvas.drawFrame("wizards", this._wizCode.wiz * 2, 0, 5 + hatYFix[this._wizCode.wiz]);
        canvas.drawFrame("wizards", this._wizCode.wiz * 2 + 1, 18, 5 + hatYFix[this._wizCode.wiz]);

        WizardSprite.replaceColors(canvas, [
            [searchColors.primaryDark, replaceColors[this._wizCode.pri].dark],
            [searchColors.primaryMid, replaceColors[this._wizCode.pri].mid],
            [searchColors.primaryLight, replaceColors[this._wizCode.pri].light],
            [searchColors.secondaryDark, replaceColors[this._wizCode.sec].dark],
            [searchColors.secondaryMid, replaceColors[this._wizCode.sec].mid],
            [searchColors.secondaryLight, replaceColors[this._wizCode.sec].light],
            [searchColors.skinMid, replaceSkin[this._wizCode.skin].mid],
            [searchColors.skinLight, replaceSkin[this._wizCode.skin].light],
        ]);

        canvas.refresh();

        // Hat
        if (this._wizCode.hat > 0) {
            canvas.drawFrame("hats", this._wizCode.hat * 2, 2, hatYFix[this._wizCode.wiz]);
            canvas.drawFrame("hats", this._wizCode.hat * 2 + 1, 20, hatYFix[this._wizCode.wiz]);
        }

        // Create right/left frames
        canvas.add(`${this._wizCode.code}_r`, 0, 0, 0, canvas.width / 2, canvas.height);
        canvas.add(`${this._wizCode.code}_l`, 0, canvas.width / 2, 0, canvas.width / 2, canvas.height);

        this.setTexture(this._wizCode.code);
    }

    static replaceColors(canvas: Textures.CanvasTexture, replacements: [search: number[], replace: number[]][]) {
        const imgData: ImageData = canvas.context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] !== 255) continue;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            for (const [search, replace] of replacements) {
                if (r === search[0] && g === search[1] && b === search[2]) {
                    data[i] = replace[0];
                    data[i + 1] = replace[1];
                    data[i + 2] = replace[2];
                    break;
                }
            }
        }

        canvas.context.putImageData(imgData, 0, 0);
    }

    public destroy(fromScene?: boolean) {
        if (this.scene?.textures?.exists(this._wizCode.code)) {
            this.scene.textures.remove(this._wizCode.code);
        }
        super.destroy(fromScene);
    }
}
