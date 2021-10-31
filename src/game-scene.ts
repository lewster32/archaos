import "phaser";

import "../assets/spritesheets/classicunits.json";
import "../assets/spritesheets/board.json";
import "../assets/spritesheets/cursors.json";

import { units } from "../assets/units/classicunits.json";
import { Board } from "./gameobjects/board";
import { PieceType } from "./gameobjects/enums/piecetype";
import { UnitStatus } from "./gameobjects/enums/unitstatus";
import { Piece } from "./gameobjects/piece";
import { UnitDirection } from "./gameobjects/enums/unitdirection";
import { Player } from "./gameobjects/player";

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

    testGame(): void {
        const board: Board = new Board(this, 1);

        const player: Player = board.addPlayer({
            name: "Lew"
        });

        for (let i = 0; i < 2; i++) {
            for (let [key, unit] of Object.entries(units) as [string, any]) {
                if ((unit.status as any).includes(UnitStatus.Wizard)) {
                    continue;
                }

                const randomEmptySpace: Phaser.Geom.Point =
                    board.getRandomEmptySpace();

                const piece: Piece = board.addPiece({
                    type: PieceType.Creature,
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

        /*
        setInterval(async () => {
            const piece: Piece = board.getPiece(
                Math.floor(Math.random() * board.pieces.length) + 1
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
