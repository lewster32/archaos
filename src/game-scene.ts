import "phaser";

import "../assets/spritesheets/classicunits.json";
import "../assets/spritesheets/board.json";
import "../assets/spritesheets/cursors.json";

import { units } from "../assets/units/classicunits.json";
import { Board } from "./gameobjects/board";
import { Player } from "./gameobjects/player";
import { Wizard } from "./gameobjects/wizard";
import { Piece } from "./gameobjects/piece";
import { BoardState } from "./gameobjects/enums/boardstate";
import { UnitDirection } from "./gameobjects/enums/unitdirection";
import { UnitType } from "./gameobjects/enums/unittype";
import { UnitStatus } from "./gameobjects/enums/unitstatus";

export class GameScene extends Phaser.Scene {
    constructor() {
        super({
            key: "GameScene",
        });
    }

    preload(): void {
        this.load.multiatlas(
            "classicunits",
            "assets/spritesheets/classicunits.json",
            "assets/spritesheets"
        );
        this.load.multiatlas(
            "board",
            "assets/spritesheets/board.json",
            "assets/spritesheets"
        );
        this.load.multiatlas(
            "cursors",
            "assets/spritesheets/cursors.json",
            "assets/spritesheets"
        );

        this.load.spritesheet(
            "wizards",
            "assets/spritesheets/wizards.png",
            {
                frameWidth: 18,
                frameHeight: 18,
            }
        );

        this.load.spritesheet(
            "hats",
            "assets/spritesheets/hats.png",
            {
                frameWidth: 14,
                frameHeight: 14,
            }
        );
    }

    create(): void {
        for (let [key, unit] of Object.entries(units)) {
            for (let direction of ["l", "r"]) {
                this.anims.create({
                    key: `${key}_${direction}`,
                    frames: ((unit as any).animFrames || []).map(
                        (frame: any) => {
                            return {
                                key: "classicunits",
                                frame: `${key}_${direction}_${frame}`,
                            };
                        }
                    ),
                    frameRate: 9 - ((unit as any).animSpeed || 3),
                    repeat: -1,
                });
            }
        }

        this.testGame();
    }

    getUnitProperties(name: string): any {
        let key = "";
        for (let [k, unit] of Object.entries(units)) {
            if (unit.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const unit: any = (units as any)[key];

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
            attackDescription: unit.attackType || "attacked",
            rangedDescription: unit.rangedDescription || "shot",
            status: unit.status || [],
        };
    }

    testGame(): void {
        const board: Board = new Board(this, 1);

        const player: Player = board.addPlayer({
            name: "Lew"
        });

        const player2: Player = board.addPlayer({
            name: "Not Lew"
        });


        const wiz: Wizard = board.addWizard({
            owner: player,
            x: 0,
            y: 0,
            wizCode: "0000000000"
        });

        board.addWizard({
            owner: player2,
            x: 12,
            y: 12,
            wizCode: "0003030000"
        });

        const mount: Piece = board.addPiece({
            owner: player,
            x: 1,
            y: 1,
            type: UnitType.Creature,
            properties: this.getUnitProperties("centaur")
        });

        board.addPiece({
            owner: player2,
            x: 2,
            y: 2,
            type: UnitType.Creature,
            properties: this.getUnitProperties("giant rat")
        });

        board.addPiece({
            owner: player2,
            x: 8,
            y: 2,
            type: UnitType.Creature,
            properties: this.getUnitProperties("giant rat")
        });

        board.state = BoardState.Move;  
        board.selectPlayer(player.id);

        /*

        for (let i = 0; i < 2; i++) {

            const randomEmptySpace: Phaser.Geom.Point = board.getRandomEmptySpace();

            board.addWizard({
                owner: player,
                x: randomEmptySpace.x,
                y: randomEmptySpace.y,
                wizCode: Wizard.randomWizCode()
            })
        }


        for (let i = 0; i < 1; i++) {
            for (let [key, unit] of Object.entries(units) as [string, any]) {
                if ((unit.status as any).includes(UnitStatus.Wizard)) {
                    continue;
                }

                const randomEmptySpace: Phaser.Geom.Point =
                    board.getRandomEmptySpace();

                const piece: Piece = board.addPiece({
                    type: UnitType.Creature,
                    x: randomEmptySpace.x,
                    y: randomEmptySpace.y,
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
                        attackDescription: unit.attackType || "attacked",
                        rangedDescription: unit.rangedDescription || "shot",
                        status: unit.status || [],
                    },
                    shadowScale: unit.shadowScale,
                    offsetY: unit.offY,
                    owner: player
                });

                piece.direction =
                    Math.random() > 0.5
                        ? UnitDirection.Left
                        : UnitDirection.Right;
            }
        }

        board.state = BoardState.MovePieces;
        board.selectPlayer(player.id);



        setInterval(async () => {
            const piece: Piece = board.getPiece(
                Math.floor(Math.random() * board.pieces.length)
            )!;

            const randomEmptySpace: Phaser.Geom.Point =
                board.getRandomEmptySpace();

            await piece.moveTo(
                new Phaser.Geom.Point(randomEmptySpace.x, randomEmptySpace.y)
            );
        }, Piece.DEFAULT_MOVE_DURATION);

        */
    }

    update(): void {}
}
