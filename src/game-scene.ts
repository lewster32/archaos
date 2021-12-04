import "phaser";
import { spells } from "../assets/data/classicspells.json";
import { units } from "../assets/data/classicunits.json";
import rexcolorreplacepipelineplugin from "../assets/plugins/rexcolorreplacepipelineplugin.min.js?url";
import boardJson from "../assets/spritesheets/board.json?url";
import boardAtlas from "../assets/spritesheets/board.png";
import classicunitsJson from "../assets/spritesheets/classicunits.json?url";
import classicunitsAtlas from "../assets/spritesheets/classicunits.png";
import cursorsJson from "../assets/spritesheets/cursors.json?url";
import cursorsAtlas from "../assets/spritesheets/cursors.png";
import effectsJson from "../assets/spritesheets/effects.json?url";
import effectsAtlas from "../assets/spritesheets/effects.png";
import hatsSheet from "../assets/spritesheets/hats.png";
import wizardsSheet from "../assets/spritesheets/wizards.png";
import magicArmourSheet from "../assets/spritesheets/magic-armour.png";
import classicSoundsJson from "../assets/sounds/chaossounds.json?url";
import classicSoundsAc3 from "../assets/sounds/chaossounds.ac3?url";
import classicSoundsM4a from "../assets/sounds/chaossounds.m4a?url";
import classicSoundsMp3 from "../assets/sounds/chaossounds.mp3?url";
import classicSoundsOgg from "../assets/sounds/chaossounds.ogg?url";

import { Board } from "./gameobjects/board";
import { UnitType } from "./gameobjects/enums/unittype";
import { Player } from "./gameobjects/player";
import { Spell } from "./gameobjects/spells/spell";
import { Piece } from "./gameobjects/piece";

export class GameScene extends Phaser.Scene {
    board: Board;

    constructor() {
        super({
            key: "GameScene",
        });
    }

    preload(): void {
        this.load.atlas("classicunits", classicunitsAtlas, classicunitsJson);

        this.load.atlas("board", boardAtlas, boardJson);

        this.load.atlas("cursors", cursorsAtlas, cursorsJson);

        this.load.atlas("effects", effectsAtlas, effectsJson);

        this.load.spritesheet("wizards", wizardsSheet, {
            frameWidth: 18,
            frameHeight: 18,
        });

        this.load.spritesheet("magic-armour", magicArmourSheet, {
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

        this.load.audioSprite("classicsounds", classicSoundsJson, [
            classicSoundsAc3, classicSoundsM4a, classicSoundsMp3, classicSoundsOgg
            ]
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

        [
            "magicbow",
            "magicknife",
            "magicsword",
            "magicshield",
            "magicwings",
        ].forEach((key: string) => {
            this.anims.create({
                key: key,
                frames: this.anims.generateFrameNames("effects", {
                    prefix: key,
                    start: 1,
                    end: 4,
                }),
                frameRate: 5,
            });
        });

        this.game.events.on("start-game", (data) => { 
            this.startGame(data);
            // this.testPieces();
        });

        // this.testGame();
    }

    startGame(data: any): void {
        if (this.board) {
            this.board.destroy();
        }
        this.board = new Board(this, 1, data?.board?.width, data?.board?.height);

        for (let player of data?.players) {
            this.board.addPlayer({
                name: player
            });
        }

        this.board.createWizards();

        for (let i = 0; i < (data?.spellCount ?? 12) - 1; i++) {
            this.board.players.forEach((player: Player) => {
                this.board.addSpell(player, Spell.getRandomSpell());
            });
        }

        this.board.players.forEach((player: Player) => {
            this.board.addSpell(player, Spell.getSpellProperties("disbelieve"));
        });


        setTimeout(() => {
            this.board.startGame();
        }, Board.DEFAULT_DELAY);
    }

    testGame(): void {
        this.board = new Board(this, 1, 13, 13);

        const p1: Player = this.board.addPlayer({
            name: "Gandalf",
        });

        const p2: Player = this.board.addPlayer({
            name: "Merlin",
        });

        const p3: Player = this.board.addPlayer({
            name: "Glinda",
        });

        const p4: Player = this.board.addPlayer({
            name: "Morgana",
        });

        this.board.createWizards();

        for (let i = 0; i < 12; i++) {
            this.board.players.forEach((player: Player) => {
                this.board.addSpell(player, Spell.getRandomSpell());
            });
        }

        this.board.players.forEach((player: Player) => {
            this.board.addSpell(player, Spell.getSpellProperties("disbelieve"));
        });

        setTimeout(() => {
            this.board.startGame();
        }, 1000);
    }

    testPieces(): void {
        this.board = new Board(this, 1, 8, 8);

        const player: Player = this.board.addPlayer({
            name: "Gandalf",
        });

        const player2: Player = this.board.addPlayer({
            name: "Merlin",
        });

        /** *
        const wizards = [];

        for (let i = 0; i < 8; i++) {
            wizards.push(board.addWizard({
                owner: player,
                x: 0,
                y: i,
                wizCode: `${i.toString(16).padStart(2, "0")}03030000`,
            }));
            wizards.push(board.addWizard({
                owner: player,
                x: 1,
                y: i,
                wizCode: `${(15 - i).toString(16).padStart(2, "0")}03030000`,
            }));

            wizards.push(board.addWizard({
                owner: player2,
                x: board.width - 1,
                y: i,
                wizCode: `${i.toString(16).padStart(2, "0")}00000000`,
            }));
            wizards.push(board.addWizard({
                owner: player2,
                x: board.width - 2,
                y: i,
                wizCode: `${(15 - i).toString(16).padStart(2, "0")}00000000`,
            }));
        }

        
        /**
        setTimeout(() => {
            wizards.forEach((wizard: Wizard) => {
                setTimeout(() => {
                    if (Math.random() > 0.7) {
                        wizard.addStatus(UnitStatus.MagicBow);
                        wizard.addStatus(UnitStatus.MagicWings);
                    } else if (Math.random() > 0.7) {
                        wizard.addStatus(UnitStatus.MagicKnife);
                    } else if (Math.random() > 0.7) {
                        wizard.addStatus(UnitStatus.MagicShield);
                    } else {
                        wizard.addStatus(UnitStatus.MagicSword);
                    }
                    wizard.addStatus(UnitStatus.MagicArmour);
                }, Math.random() * 1000);

            });
        }, 500);
        /**/

        /**/
        this.board.addWizard({
            owner: player,
            x: Math.floor(this.board.width / 2) - 2,
            y: this.board.height - 1,
            wizCode: "0003030000",
        });

        this.board.addWizard({
            owner: player2,
            x: Math.floor(this.board.width / 2),
            y: 7,
            wizCode: "0600000000",
        });

        /**/
        this.board.addSpell(player, Spell.getSpellProperties("turmoil"));
        // board.addSpell(player, Spell.getSpellProperties("lightning"));
        // board.addSpell(player, Spell.getSpellProperties("vengeance"));
        //board.addSpell(player, Spell.getSpellProperties("dark power"));
        /**/
        /**/

        /**
        setTimeout(() => {
            player2.castingPiece.addStatus(UnitStatus.MagicShield);
        }, 1000);

        setTimeout(() => {
            player2.castingPiece.addStatus(UnitStatus.MagicArmour);
        }, 2000);
        /**/

        /**
        setTimeout(() => { 
            player.castingPiece.removeStatus(UnitStatus.MagicArmour);
        }, 4000);
        /**/
        
        /**
        board.addSpell(player2, Spell.getSpellProperties("magic castle"));
        board.addSpell(player2, Spell.getSpellProperties("dark citadel"));
        /**/

        /**/
        this.board.addPiece({
            ...Piece.getPieceProperties("vampire"),
            owner: player,
            x: 2,
            y: 6
        });
        /**/

        /*
        board.addPiece({
            ...Piece.getPieceProperties("magic fire"),
            owner: player2,
            x: 4,
            y: 3
        });
        */

        /**/
        this.board.addPiece({
            ...Piece.getPieceProperties("giant"),
            owner: player2,
            x: 5,
            y: 6
        });


        this.board.addPiece({
            ...Piece.getPieceProperties("horse"),
            owner: player2,
            x: 4,
            y: 2
        });

        setTimeout(async () => {
            (await this.board.addPiece({
                ...Piece.getPieceProperties("orc"),
                owner: player,
                x: 1,
                y: 7
            }));
        },0);

        /**/

        /*
        board.addPiece({
            ...Piece.getPieceProperties("giant"),
            owner: player2,
            x: 5,
            y: 3
        });
        */

        /*

        board.addPiece({
            ...Piece.getPieceProperties("ghost"),
            owner: player2,
            x: 5,
            y: 6
        });

        */

        // Test effect
        /**
        setTimeout(async () => {
            console.time("Effect");
            await board.playEffect(EffectType.ArrowBeam,
                board.pieces[0].sprite.getCenter(),
                board.pieces[1].sprite.getCenter()
            );
            await board.playEffect(EffectType.ArrowHit,
                board.pieces[1].sprite.getCenter(),
                null,
                board.pieces[1]
            );
            console.timeEnd("Effect");
        }, 100);
        /**/

        setTimeout(() => {
            this.board.startGame();
        }, 1000);
    }

    update(): void {}
}
