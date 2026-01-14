import units from "../assets/data/classicunits.json";
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
import { Wizard } from "./gameobjects/wizard";
import { BoardPhase } from "./gameobjects/enums/boardphase";
import { GameScenarioData, GameSetupData } from "./gameobjects/interfaces/ui";
import { SpellType } from "./gameobjects/enums/spelltype";

import { Scene } from "phaser";

export class GameScene extends Scene {
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
            classicSoundsAc3,
            classicSoundsM4a,
            classicSoundsMp3,
            classicSoundsOgg,
        ]);
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

        // Start a normal game
        this.game.events.on("start-game", (data: GameSetupData) => {
            this.startGame(data);
        });

        // Start a scenario (a predefined board state)
        this.game.events.on("start-scenario", (scenarioData: GameScenarioData) => {
            this.startScenario(scenarioData);
        });
    }

    /**
     * Start a new game with the given initialisation data.
     * 
     * @param data Initialisation data for the game.
     */
    startGame(data: GameSetupData): void {
        if (this.board) {
            this.board.destroy();
        }
        this.board = new Board(
            this,
            1,
            data?.board?.width,
            data?.board?.height
        );

        for (let player of data.players) {
            this.board.addPlayer({
                name: player.name,
                computerControlled: player.computerControlled,
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

    /**
     * Start a predefined scenario.
     * 
     * @param scenarioData Scenario data to load.
     */
    startScenario(scenarioData: GameScenarioData): void {
        if (this.board) {
            this.board.destroy();
        }
        this.board = new Board(
            this,
            1,
            scenarioData.board.width,
            scenarioData.board.height
        );
        if (!scenarioData.players?.length) {
            throw new Error("Scenario data must include players array");
        }
        for (let player of scenarioData.players) {
            const currentPlayer: Player = this.board.addPlayer({
                name: player.name,
                computerControlled: player.computerControlled || false,
            })
            this.board.addWizard({
                owner: currentPlayer,
                x: player.position.x,
                y: player.position.y,
                wizCode: player.wizCode || Wizard.randomWizCode()
            });
            if (player.spells?.length) {
                for (let spellName of player.spells) {
                    // If spell starts with '*', add all of that type
                    if (spellName.startsWith("*")) {
                        const spellType: string = spellName.substring(1).toLowerCase();
                        const spellsToAdd = Spell.getSpellsByType(Object.values(SpellType).includes(spellType as SpellType) ? spellType as SpellType : SpellType.Summon);
                        console.log(`Adding ${spellsToAdd.length} ${spellType} spells to player ${currentPlayer.name}`);
                        for (let spell of spellsToAdd) {
                            this.board.addSpell(
                                currentPlayer,
                                Spell.getSpellProperties(spell)
                            );
                        }
                    } else {
                        this.board.addSpell(
                            currentPlayer,
                            Spell.getSpellProperties(spellName)
                        );
                    }
                }
            }
            if (player.pieces?.length) {
                for (let pieceData of player.pieces) {
                    const pieceProperties = Piece.getPieceProperties(pieceData.type);
                    this.board.addPiece({
                        ...pieceProperties,
                        owner: currentPlayer,
                        x: pieceData.position.x,
                        y: pieceData.position.y,
                        unitType: pieceProperties.unitType || UnitType.Creature
                    });
                }
            }
        }

        if (scenarioData.cheats) {
            Board.CHEAT_FORCE_HIT = scenarioData.cheats.forceHit ?? null;
            Board.CHEAT_FORCE_CAST = scenarioData.cheats.forceCast ?? null;
            Board.CHEAT_SHORT_DELAY = scenarioData.cheats.shortDelay ?? Board.CHEAT_SHORT_DELAY;
        }

        setTimeout(async () => {
            let phase: BoardPhase = BoardPhase.Idle;
            if (scenarioData.phase.toLowerCase() == "moving") {
                phase = BoardPhase.Spreading;
            }
            await this.board.resumeGame(
                scenarioData.currentPlayerIndex || 0,
                phase
            );
        }, Board.DEFAULT_DELAY);
    }
}
