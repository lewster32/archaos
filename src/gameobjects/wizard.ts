import { Board } from "./board";
import { PieceConfig, WizardConfig } from "./configs/piececonfig";
import { BoardLayer } from "./enums/boardlayer";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { Piece } from "./piece";

import { wizcodes } from "../../assets/spritesheets/wizards.json";
import { WizCode } from "./interfaces/wizcode";
import { WizardSprite } from "./wizardsprite";
import { UnitDirection } from "./enums/unitdirection";

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
            magicResistance: 3,
            attackDescription: "hit",
            rangedDescription: "shot",
            status: [UnitStatus.Wizard]
        }
    }

    private _wizCode: WizCode;

    constructor(board: Board, id: number, config: WizardConfig) {
        super(board, id, {
            ...Wizard.DEFAULT_WIZARD_CONFIG,
            ...config
        });
        this._wizCode = Wizard.parseWizCode(config.wizCode || Wizard.randomWizCode());
    }

    get name(): string {
        return this.owner?.name || "Unnamed Wizard";
    }

    playAnim() {
        this._sprite?.setFrame(`${this._wizCode.code}_${this._direction}`);
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

        this._sprite.setOrigin(0.5, 0.5);

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
            sec: Math.min(parseInt(wizCode.substr(2, 2), 16), wizcodes.max.sec),
            skin: Math.min(parseInt(wizCode.substr(6, 2), 16), wizcodes.max.skin),
            hat: Math.min(parseInt(wizCode.substr(8, 2), 16), wizcodes.max.hat)
        };
    }

    static randomWizCode(): string {
        return [
            Phaser.Math.RND.integerInRange(0, wizcodes.max.wiz).toString(16).padStart(2, "0"),
            Phaser.Math.RND.integerInRange(0, wizcodes.max.pri).toString(16).padStart(2, "0"),
            Phaser.Math.RND.integerInRange(0, wizcodes.max.sec).toString(16).padStart(2, "0"),
            Phaser.Math.RND.integerInRange(0, wizcodes.max.skin).toString(16).padStart(2, "0"),
            Phaser.Math.RND.integerInRange(0, wizcodes.max.hat).toString(16).padStart(2, "0")
        ].join("");
    }
}