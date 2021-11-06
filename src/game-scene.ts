import "phaser";

import "../assets/spritesheets/classicunits.json";
import "../assets/spritesheets/classicspells.json";
import "../assets/spritesheets/board.json";
import "../assets/spritesheets/cursors.json";

import { units } from "../assets/data/classicunits.json";
import { spells } from "../assets/data/classicspells.json";

import { Board } from "./gameobjects/board";
import { Player } from "./gameobjects/player";
import { Wizard } from "./gameobjects/wizard";
import { Piece } from "./gameobjects/piece";
import { BoardState } from "./gameobjects/enums/boardstate";
import { UnitDirection } from "./gameobjects/enums/unitdirection";
import { UnitType } from "./gameobjects/enums/unittype";
import { UnitStatus } from "./gameobjects/enums/unitstatus";
import { SpellConfig } from "./gameobjects/configs/spellconfig";
import { Spell } from "./gameobjects/spell";
import { BoardPhase } from "./gameobjects/enums/boardphase";

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
            "classicspells",
            "assets/spritesheets/classicspells.json",
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

    getSpellProperties(name: string): any {
        let key = "";
        for (let [k, spell] of Object.entries(spells)) {
            if (spell.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const spell: SpellConfig = (spells as any)[key];

        return {
            id: key,
            name: spell.name,
            chance: spell.chance,
            balance: spell.balance,
            unitId: spell.unitId,
            allowIllusion: spell.allowIllusion,
            autoPlace: spell.autoPlace,
            tree: spell.tree,
            castTimes: spell.castTimes,
            range: spell.range,
            damage: spell.damage,
            lineOfSight: spell.lineOfSight
        };
    }

    testGame(): void {
        const board: Board = new Board(this, 1, 13, 13);

        const player: Player = board.addPlayer({
            name: "Lew"
        });

        const player2: Player = board.addPlayer({
            name: "Not Lew"
        });


        board.addWizard({
            owner: player,
            x: Math.floor(board.width / 2),
            y: board.height - 1,
            wizCode: "0003030000"
        });


        board.addWizard({
            owner: player2,
            x: Math.floor(board.width / 2),
            y: 0,
            wizCode: "0600000000"
        });

        const spell1: Spell = board.addSpell(player, this.getSpellProperties("shadow wood"));
        player.pickSpell(spell1);

        const spell2: Spell = board.addSpell(player2, this.getSpellProperties("manticore"));
        player2.pickSpell(spell2);


        setTimeout(() => {
            board.startGame();
        }, 1000);


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
