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
import unitGlow from "../assets/spritesheets/unit-glow.png";
import classicSoundsJson from "../assets/sounds/chaossounds.json?url";
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
import { UnitStatus } from "./gameobjects/enums/unitstatus";
import { SpellConfig } from "./gameobjects/configs/spellconfig";

export class GameScene extends Scene {
    private board: Board;

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

        this.load.image("unit-glow", unitGlow);

        if (!this.plugins.get("rexcolorreplacepipelineplugin")) {
            this.load.plugin(
                "rexcolorreplacepipelineplugin",
                rexcolorreplacepipelineplugin,
                true
            );
        }

        this.load.audioSprite("classicsounds", classicSoundsJson, [
            classicSoundsOgg,
            classicSoundsMp3,
            classicSoundsM4a,
        ]);

        // Load any enhanced content (additional spells/units)
        this.loadEnhancedData();
    }


    async loadEnhancedData(): Promise<void> {
        // Scan the assets/data/enhanced folder and load all JSON files to find
        // any additional spells and their associated units and textures
        const enhancedSpells: Record<string, any> = import.meta.glob("../assets/data/enhanced/*.json", { eager: true });
        for (let [path, spellData] of Object.entries(enhancedSpells)) {
            const textures: any[] = spellData.spell?.unit?.textures || [];
            console.debug(`Loading enhanced spell ${spellData.spell.name}: ${path}`);

            
            if (textures.length) {
                // Load any additional textures for this unit
                const textureKey: string = spellData.spell.unit.id;
                for (let texture of textures) {
                    const texturePath: string = import.meta.resolve(`../images/units/enhanced/${texture.image}`);
                    this.load.atlas(
                        textureKey,
                        texturePath,
                        texture
                    );
                }
            }

            // Register the spell
            Spell.spells[spellData.spell.id] = spellData.spell;

            // Register the unit (if any)
            if (spellData.spell.unit) {
                Spell.spells[spellData.spell.id].unitId = spellData.spell.unit.id;
                Piece.units[spellData.spell.unit.id] = spellData.spell.unit;
                Piece.units[spellData.spell.unit.id].group = spellData.spell.group;
            }
        }
    }

    create(): void {

        for (let [key, unit] of Object.entries(Piece.units)) {
            for (let direction of ["l", "r"]) {
                this.anims.create({
                    key: `${key}_${direction}`,
                    frames: ((unit as any).animFrames || []).map(
                        (frame: any) => {
                            const group: string = unit.group ? unit.id : "classicunits";
                            return {
                                key: group,
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
        this.game.events.on("start-game", async (data: GameSetupData) => {
            await this.startGame(data);
        });

        // Start a scenario (a predefined board state)
        this.game.events.on("start-scenario", async (scenarioData: GameScenarioData) => {
            await this.startScenario(scenarioData);
        });
    }

    /**
     * Start a new game with the given initialisation data.
     * 
     * @param data Initialisation data for the game.
     */
    async startGame(data: GameSetupData): Promise<void> {
        if (this.board) {
            this.board.destroy();
        }
        this.board = new Board(
            this,
            1,
            data?.board?.width,
            data?.board?.height
        );

        if (data.classicSpells) {
            // Set spell filter to exclude enhanced spells
            this.board.spellFilter = (spell: SpellConfig) => {
                return !spell.group || spell.group === "classicspells";
            };
            console.debug(
                "The following spells will be excluded from random selection:",
                Spell.getAllSpells()
                    .filter(spell => !this.board.spellFilter(spell))
                    .map(spell => spell.name)
                    .join(", ")
            );
        }
        else {
            this.board.spellFilter = () => true;
            console.debug("All spells will be included in random selection.");
        }

        for (let player of data.players) {
            this.board.addPlayer({
                name: player.name,
                computerControlled: player.computerControlled,
            });
        }

        this.board.createWizards();

        for (let i = 0; i < (data?.spellCount ?? 12) - 1; i++) {
            this.board.players.forEach((player: Player) => {
                this.board.addSpell(player, Spell.getRandomSpell(false, this.board.spellFilter));
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
    async startScenario(scenarioData: GameScenarioData): Promise<void> {
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
            const wizard: Wizard = this.board.addWizard({
                owner: currentPlayer,
                x: player.position.x,
                y: player.position.y,
                wizCode: player.wizCode || Wizard.randomWizCode()
            });
            if (player.statuses?.length) {
                for (let statusName of player.statuses) {
                    const status: UnitStatus = UnitStatus[statusName as keyof typeof UnitStatus];
                    wizard.addStatus(status);
                }
            }
            if (scenarioData.corpses?.length) {
                for (let corpseData of scenarioData.corpses) {
                    const pieceProperties = Piece.getPieceProperties(corpseData.type);
                    const piece: Piece = await this.board.addPiece({
                        ...pieceProperties,
                        owner: null,
                        x: corpseData.position.x,
                        y: corpseData.position.y,
                        unitType: pieceProperties.unitType || UnitType.Creature,
                    });
                    if (corpseData.statuses?.length) {
                        for (let statusName of corpseData.statuses) {
                            const status: UnitStatus = UnitStatus[statusName as keyof typeof UnitStatus];
                            piece.addStatus(status);
                        }
                    }
                    if (piece.hasStatus(UnitStatus.NoCorpse)) {
                        this.board.removePiece(piece.id);
                    }
                    else {
                        piece.kill(true);
                    }
                }
            }

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
                    const piece: Piece = await this.board.addPiece({
                        ...pieceProperties,
                        owner: currentPlayer,
                        x: pieceData.position.x,
                        y: pieceData.position.y,
                        unitType: pieceProperties.unitType || UnitType.Creature
                    });
                    if (pieceData.statuses?.length) {
                        for (let statusName of pieceData.statuses) {
                            const status: UnitStatus = UnitStatus[statusName as keyof typeof UnitStatus];
                            if (status === UnitStatus.Undead && !piece.hasStatus(UnitStatus.Undead)) {
                                console.log(`Setting piece ${piece.name} as raised undead`);
                                piece.raisedDead = true;
                            }
                            piece.addStatus(status);
                        }
                    }
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
