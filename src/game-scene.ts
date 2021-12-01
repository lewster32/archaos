import "phaser";

import rexcolorreplacepipelineplugin from "../assets/plugins/rexcolorreplacepipelineplugin.min.js?url";

import { spells } from "../assets/data/classicspells.json";
import { units } from "../assets/data/classicunits.json";

import boardAtlas from "../assets/spritesheets/board.png";
import boardJson from "../assets/spritesheets/board.json?url";
import classicunitsAtlas from "../assets/spritesheets/classicunits.png";
import classicunitsJson from "../assets/spritesheets/classicunits.json?url";
import cursorsAtlas from "../assets/spritesheets/cursors.png";
import cursorsJson from "../assets/spritesheets/cursors.json?url";
import effectsAtlas from "../assets/spritesheets/effects.png";
import effectsJson from "../assets/spritesheets/effects.json?url";

import wizardsSheet from "../assets/spritesheets/wizards.png";
import hatsSheet from "../assets/spritesheets/hats.png";

import { Board } from "./gameobjects/board";
import { SpellConfig } from "./gameobjects/configs/spellconfig";
import { EffectType } from "./gameobjects/effectemitter";
import { UnitType } from "./gameobjects/enums/unittype";
import { Player } from "./gameobjects/player";
import { Wizard } from "./gameobjects/wizard";
import { SpellTarget } from "./gameobjects/enums/spelltarget";

export class GameScene extends Phaser.Scene {
    constructor() {
        super({
            key: "GameScene",
        });
    }

    preload(): void {
        this.load.atlas(
            "classicunits",
            classicunitsAtlas,
            classicunitsJson
        );

        this.load.atlas(
            "board",
            boardAtlas,
            boardJson
        );

        this.load.atlas(
            "cursors",
            cursorsAtlas,
            cursorsJson
        );

        this.load.atlas(
            "effects",
            effectsAtlas,
            effectsJson
        );

        this.load.spritesheet("wizards", wizardsSheet, {
            frameWidth: 18,
            frameHeight: 18,
        });

        this.load.spritesheet("hats", hatsSheet, {
            frameWidth: 14,
            frameHeight: 14,
        });

        this.load.plugin(
            "rexcolorreplacepipelineplugin",
            rexcolorreplacepipelineplugin,
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

        this.testPieces();
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
            destroyWizardCreatures: spell.destroyWizardCreatures,
            lineOfSight: spell.lineOfSight,
            projectile: spell.projectile,
            persist: spell.persist,
            target: spell.target || SpellTarget.Empty
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
        const board: Board = new Board(this, 1, 15, 15);

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
            y: board.height - 1,
            wizCode: "0003030000",
        });

        board.addWizard({
            owner: player2,
            x: Math.floor(board.width / 2),
            y: 1,
            wizCode: "0600000000",
        });

        /**/
        board.addSpell(player, this.getSpellProperties("orc"));
        board.addSpell(player, this.getSpellProperties("disbelieve"));

        board.addSpell(player2, this.getSpellProperties("orc"));
        board.addSpell(player2, this.getSpellProperties("disbelieve"));
        /**/

        /*
        board.addPiece({
            ...this.getPieceProperties("magic fire"),
            owner: player,
            x: 4,
            y: 5
        });
        */

        board.addPiece({
            ...this.getPieceProperties("magic fire"),
            owner: player2,
            x: 4,
            y: 3
        });

        board.addPiece({
            ...this.getPieceProperties("giant"),
            owner: player2,
            x: 4,
            y: 4
        });

        board.addPiece({
            ...this.getPieceProperties("horse"),
            owner: player2,
            x: 4,
            y: 2
        });

        setTimeout(async () => {
            (await board.addPiece({
                ...this.getPieceProperties("giant"),
                owner: player2,
                x: 4,
                y: 1
            })).kill();
        },0);


        board.addPiece({
            ...this.getPieceProperties("giant"),
            owner: player2,
            x: 5,
            y: 3
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
            console.time("Effect");
            await board.playEffect(EffectType.DragonFireBeam,
                board.pieces[0].sprite.getCenter(),
                board.pieces[1].sprite.getCenter()
            );
            await board.playEffect(EffectType.WizardDefeated,
                board.pieces[1].sprite.getCenter(),
                null,
                board.pieces[1]
            );
            console.timeEnd("Effect");
        }, 100);
        /**/

        setTimeout(() => {
            board.startGame();
        }, 1000);
    }

    update(): void {}
}
