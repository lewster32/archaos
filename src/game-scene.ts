import "phaser";
import { spells } from "../assets/data/classicspells.json";
import { units } from "../assets/data/classicunits.json";
import "../assets/plugins/rexcolorreplacepipelineplugin.min.js";
import "../assets/spritesheets/board.json";
import "../assets/spritesheets/classicunits.json";
import "../assets/spritesheets/cursors.json";
import "../assets/spritesheets/effects.json";
import { Board } from "./gameobjects/board";
import { SpellConfig } from "./gameobjects/configs/spellconfig";
import { EffectType } from "./gameobjects/effectemitter";
import { UnitType } from "./gameobjects/enums/unittype";
import { Player } from "./gameobjects/player";
import { Wizard } from "./gameobjects/wizard";

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

        this.load.multiatlas(
            "effects",
            "assets/spritesheets/effects.json",
            "assets/spritesheets"
        );

        this.load.spritesheet("wizards", "assets/spritesheets/wizards.png", {
            frameWidth: 18,
            frameHeight: 18,
        });

        this.load.spritesheet("hats", "assets/spritesheets/hats.png", {
            frameWidth: 14,
            frameHeight: 14,
        });

        this.load.plugin(
            "rexcolorreplacepipelineplugin",
            "assets/plugins/rexcolorreplacepipelineplugin.min.js",
            true
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


        this.anims.create({
            key: "sparkle",
            frames: this.anims.generateFrameNames("effects", {
                prefix: "sparkle",
                start: 1,
                end: 3,
            }),
            frameRate: 10,
        });

        this.anims.create({
            key: "dragonfire",
            frames: this.anims.generateFrameNames("effects", {
                prefix: "dragonfire",
                start: 1,
                end: 3,
            }),
            frameRate: 10,
        });

        this.anims.create({
            key: "magicbolt",
            frames: this.anims.generateFrameNames("effects", {
                prefix: "magicbolt",
                start: 1,
                end: 2,
            }),
            frameRate: 10,
        });

        this.anims.create({
            key: "lightning",
            frames: this.anims.generateFrameNames("effects", {
                prefix: "lightning",
                start: 1,
                end: 2,
            }),
            frameRate: 5,
        });

        this.testGame();
    }

    getRandomSpell(): any {
        const spellNames: string[] = Object.values(spells).map((spell: any) => spell.name);

        // Remove Disbelieve from random pool
        spellNames.splice(spellNames.indexOf("Disbelieve"), 1);
        
        return this.getSpellProperties(spellNames[Math.floor(Math.random() * spellNames.length)]);
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
            description: spell.description,
            chance: spell.chance,
            balance: spell.balance,
            unitId: spell.unitId,
            allowIllusion: spell.allowIllusion,
            autoPlace: spell.autoPlace,
            tree: spell.tree,
            castTimes: spell.castTimes,
            range: spell.range,
            damage: spell.damage,
            castOnEnemyUnit: spell.castOnEnemyUnit,
            castOnWizard: spell.castOnWizard,
            lineOfSight: spell.lineOfSight,
            projectile: spell.projectile,
            persist: spell.persist
        };
    }

    getPieceProperties(name: string): any {
        let key = "";
        for (let [k, piece] of Object.entries(units)) {
            if (piece.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const unit: any = (units as any)[key];

        return {
            type: UnitType.Creature,
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
                attackType: unit.attackType || "attacked",
                rangedType: unit.rangedType || "shot",
                status: unit.status || [],
            },
            shadowScale: unit.shadowScale,
            offsetY: unit.offY,
        }
    }

    testGame(): void {
        const board: Board = new Board(this, 1, 13, 13);

        const p1: Player = board.addPlayer({
            name: "Gandalf",
        });

        const p2: Player = board.addPlayer({
            name: "Merlin",
        });


        const p3: Player = board.addPlayer({
            name: "Glinda",
        });

        const p4: Player = board.addPlayer({
            name: "Morgana",
        });

        board.createWizards();

        for (let i = 0; i < 12; i++) {
            board.players.forEach((player: Player) => {
                board.addSpell(player, this.getRandomSpell());
            });
        }

        board.players.forEach((player: Player) => {
            board.addSpell(player, this.getSpellProperties("disbelieve"));
        });

        setTimeout(() => {
            board.startGame();
        }, 1000);

 
    }

    testPieces(): void {
        const board: Board = new Board(this, 1, 11, 11);

        const player: Player = board.addPlayer({
            name: "Gandalf",
        });

        const player2: Player = board.addPlayer({
            name: "Merlin",
        });

        board.addWizard({
            owner: player,
            x: Math.floor(board.width / 2) - 2,
            y: board.height - 3,
            wizCode: "0003030000",
        });

        board.addWizard({
            owner: player2,
            x: Math.floor(board.width / 2),
            y: 3,
            wizCode: "0600000000",
        });

        /**/
        board.addSpell(player, this.getSpellProperties("lightning"));
        board.addSpell(player, this.getSpellProperties("magic bolt"));

        board.addSpell(player2, this.getSpellProperties("lightning"));
        board.addSpell(player2, this.getSpellProperties("magic bolt"));
        /**/

        board.addPiece({
            ...this.getPieceProperties("spectre"),
            owner: player,
            x: 4,
            y: 5
        });

        board.addPiece({
            ...this.getPieceProperties("green dragon"),
            owner: player,
            x: 4,
            y: 3
        });

        board.addPiece({
            ...this.getPieceProperties("golden dragon"),
            owner: player,
            x: 4,
            y: 7
        });

        /*

        board.addPiece({
            ...this.getPieceProperties("ghost"),
            owner: player2,
            x: 5,
            y: 6
        });

        */

        // Test effect
        /**
        setTimeout(async () => {
            console.time("Start cast");
            await board.playEffect(EffectType.DisbelieveBeam,
                board.pieces[0].sprite.getCenter(),
                board.pieces[1].sprite.getCenter()
            );
            await board.playEffect(EffectType.DisbelieveHit,
                board.pieces[1].sprite.getCenter()
            );
            console.timeEnd("Start cast");
        }, 100);
        /**/

        setTimeout(() => {
            board.startGame();
        }, 1000);
    }

    update(): void {}
}
