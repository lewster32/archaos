import { Piece } from "./piece";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import type { PieceConfig, WizardConfig } from "./configs/piececonfig";
import type { WizCode } from "./interfaces/wizcode";
import type { Player } from "./player";

// Board is imported only as a type to avoid a circular
// dependency at runtime.
import type { Board } from "./board";

/**
 * Maximum values for each WizCode component, populated
 * from spritesheet metadata by the client at startup.
 */
export interface WizCodeMax {
    wiz: number;
    pri: number;
    sec: number;
    skin: number;
    hat: number;
}

/**
 * Engine-level wizard. Contains pure game logic: WizCode
 * parsing, status mutual-exclusion, placement geometry,
 * and default config. No Phaser imports.
 *
 * The client Wizard extends this class and adds rendering,
 * sound, and animation concerns.
 */
export class Wizard extends Piece {
    /**
     * WizCode max bounds, populated from spritesheet
     * metadata by the client at startup.
     */
    static wizcodeMax: WizCodeMax = {
        wiz: 15,
        pri: 35,
        sec: 35,
        skin: 9,
        hat: 50,
    };

    /**
     * Default wizard configuration. Uses Piece.units["1"]
     * for base stats (populated by the client at startup).
     */
    static get DEFAULT_WIZARD_CONFIG(): PieceConfig {
        const wizardUnit = Piece.units["1"];
        return {
            x: 0,
            y: 0,
            type: UnitType.Wizard,
            properties: {
                movement: wizardUnit?.properties?.mov ?? 1,
                combat: wizardUnit?.properties?.com ?? 3,
                rangedCombat: wizardUnit?.properties?.rcm ?? 0,
                range: wizardUnit?.properties?.rng ?? 0,
                defence: wizardUnit?.properties?.def ?? 3,
                manoeuvrability: wizardUnit?.properties?.mnv ?? 3,
                magicResistance: wizardUnit?.properties?.res ?? 3,
                attackType: wizardUnit?.attackType ?? "hit",
                rangedType: wizardUnit?.rangedType ?? "shot",
                status: [UnitStatus.Wizard],
            },
        };
    }

    /**
     * Magical weapon statuses.
     */
    static readonly MAGIC_WEAPONS: UnitStatus[] = [
        UnitStatus.MagicKnife,
        UnitStatus.MagicSword,
        UnitStatus.MagicBow,
    ];

    /**
     * The WizCode for this wizard. Defines their
     * appearance in a compact sharable string form.
     */
    protected readonly _wizCode: WizCode;

    /**
     * Create a new Wizard instance. The config is merged
     * atop the default wizard config so it can be partial.
     *
     * @param board The board this wizard belongs to.
     * @param id The unique identifier for this wizard.
     * @param config The configuration for this wizard.
     */
    constructor(board: Board, id: number, config: WizardConfig) {
        super(board, id, {
            ...Wizard.DEFAULT_WIZARD_CONFIG,
            ...config,
            properties: {
                ...Wizard.DEFAULT_WIZARD_CONFIG.properties,
                ...config.properties,
            },
        });
        this._wizCode = Wizard.parseWizCode(
            config.wizCode || Wizard.randomWizCode(),
        );
        if (this.owner) {
            this.owner.castingPiece = this as any;
        } else {
            throw new Error("Wizard must have an owner");
        }
    }

    /**
     * Get the name of this wizard. This should typically
     * be the name of the player that owns them.
     */
    get name(): string {
        return this.owner?.name || "Unnamed wizard";
    }

    /**
     * Get the full name of this wizard. As a wizard 'is'
     * the player, this is the same as the name.
     */
    get fullName(): string {
        return this.name;
    }

    /**
     * Get the WizCode string for this wizard, which
     * defines their appearance.
     */
    get wizCode(): string {
        return this._wizCode.code;
    }

    /**
     * Get the parsed WizCode object for this wizard.
     */
    get wizCodeParsed(): WizCode {
        return this._wizCode;
    }

    /**
     * Add a status to this wizard, applying game-logic
     * side effects (mutual exclusion, derived statuses).
     * The client overrides this to add visual effects.
     *
     * @param status The status to add.
     * @returns True if the status was added.
     */
    addStatus(status: UnitStatus): boolean {
        if (!super.addStatus(status)) {
            return false;
        }

        // Mutually exclusive statuses
        if (status === UnitStatus.MagicShield) {
            this.removeStatus(UnitStatus.MagicArmour);
        } else if (status === UnitStatus.MagicArmour) {
            this.removeStatus(UnitStatus.MagicShield);
        }
        if (status === UnitStatus.MagicKnife) {
            this.removeStatus(UnitStatus.MagicSword);
        } else if (status === UnitStatus.MagicSword) {
            this.removeStatus(UnitStatus.MagicKnife);
        }

        // We fly now.
        if (status === UnitStatus.MagicWings) {
            this.addStatus(UnitStatus.Flying);
        }

        // Any magical weapon lets us attack the undead.
        if (Wizard.MAGIC_WEAPONS.includes(status)) {
            this.addStatus(UnitStatus.AttackUndead);
        }

        return true;
    }

    /**
     * Remove a status from this wizard, applying
     * game-logic side effects. The client overrides
     * this to remove visual effects.
     *
     * @param status The status to remove.
     * @returns True if the status was removed.
     */
    removeStatus(status: UnitStatus): boolean {
        if (!super.removeStatus(status)) {
            return false;
        }

        // We stop flying now.
        if (status === UnitStatus.MagicWings) {
            this.removeStatus(UnitStatus.Flying);
        }

        // Losing all magical weapons means we can no
        // longer attack the undead.
        if (Wizard.MAGIC_WEAPONS.includes(status)) {
            this.removeStatus(status);
            if (Wizard.MAGIC_WEAPONS.some((s) => this.hasStatus(s)) === false) {
                this.removeStatus(UnitStatus.AttackUndead);
            }
        }

        return true;
    }

    /**
     * Parse a WizCode string into its components. Any
     * out-of-bounds values are clamped to the maximum
     * allowed for that component.
     *
     * @param wizCode The WizCode string to parse.
     * @returns The parsed wizard configuration object.
     */
    static parseWizCode(wizCode: string): WizCode {
        if (!wizCode?.trim()) {
            throw new Error("WizCode cannot be empty");
        }

        // Normalise
        wizCode = wizCode.toLowerCase().trim();

        // Sense check the WizCode format; it should be
        // exactly 10 hex digits.
        if (!/^[0-9a-f]{10}$/.test(wizCode)) {
            throw new Error("Invalid WizCode");
        }

        const max = Wizard.wizcodeMax;

        return {
            code: wizCode,
            wiz: Math.min(Number.parseInt(wizCode.slice(0, 2), 16), max.wiz),
            pri: Math.min(Number.parseInt(wizCode.slice(2, 4), 16), max.pri),
            sec: Math.min(Number.parseInt(wizCode.slice(4, 6), 16), max.sec),
            skin: Math.min(Number.parseInt(wizCode.slice(6, 8), 16), max.skin),
            hat: Math.min(Number.parseInt(wizCode.slice(8, 10), 16), max.hat),
        };
    }

    /**
     * Create and place wizards for all players at the
     * start of the game. Placement geometry varies by
     * player count (2-8 use fixed arrangements; 9+
     * fall back to farthest-point sampling).
     *
     * @param board   The board to place wizards on.
     * @param players The ordered list of players.
     */
    static createAll(board: Board, players: Player[]): void {
        switch (players.length) {
            // Face-to-face
            case 2:
                board.addWizard({
                    owner: players[0],
                    x: Math.floor(board.width / 2),
                    y: board.height - 2,
                    wizCode: players[0].wizcode,
                });
                board.addWizard({
                    owner: players[1],
                    x: Math.floor(board.width / 2),
                    y: 1,
                    wizCode: players[1].wizcode,
                });
                break;
            case 3:
                // Triangle
                board.addWizard({
                    owner: players[0],
                    x: 1,
                    y: Math.floor(board.height / 2),
                    wizCode: players[0].wizcode,
                });
                board.addWizard({
                    owner: players[1],
                    x: board.width - 2,
                    y: board.height - 2,
                    wizCode: players[1].wizcode,
                });
                board.addWizard({
                    owner: players[2],
                    x: board.width - 2,
                    y: 1,
                    wizCode: players[2].wizcode,
                });
                break;
            case 4:
                // Corners
                board.addWizard({
                    owner: players[0],
                    x: 1,
                    y: board.height - 2,
                    wizCode: players[0].wizcode,
                });
                board.addWizard({
                    owner: players[1],
                    x: 1,
                    y: 1,
                    wizCode: players[1].wizcode,
                });
                board.addWizard({
                    owner: players[2],
                    x: board.width - 2,
                    y: board.height - 2,
                    wizCode: players[2].wizcode,
                });
                board.addWizard({
                    owner: players[3],
                    x: board.width - 2,
                    y: 1,
                    wizCode: players[3].wizcode,
                });
                break;
            case 5:
                // Pentagon
                for (let i = 0; i < 5; i++) {
                    const angle: number = (i / 5) * Math.PI * 2 - Math.PI / 2;
                    const x: number = Math.round(
                        -0.5 +
                            board.width / 2 +
                            (board.width / 2) * Math.cos(angle),
                    );
                    const y: number = Math.round(
                        -0.5 +
                            board.height / 2 +
                            (board.height / 2) * Math.sin(angle),
                    );
                    board.addWizard({
                        owner: players[(i + 2) % 5],
                        x: x,
                        y: y,
                        wizCode: players[(i + 2) % 5].wizcode,
                    });
                }
                break;
            case 6:
                // Hexagon
                for (let i = 0; i < 6; i++) {
                    const angle: number = (i / 6) * Math.PI * 2 - Math.PI / 2;
                    const x: number = Math.round(
                        -0.6 +
                            board.width / 2 +
                            (board.width / 2 + 0.5) * Math.cos(angle),
                    );
                    const y: number = Math.round(
                        -0.5 +
                            board.height / 2 +
                            (board.height / 2 - 0.5) * Math.sin(angle),
                    );
                    board.addWizard({
                        owner: players[(i + 2) % 6],
                        x: x,
                        y: y,
                        wizCode: players[(i + 2) % 6].wizcode,
                    });
                }
                break;
            case 7:
                // Centre + hexagon ring
                board.addWizard({
                    owner: players[0],
                    x: Math.floor(board.width / 2),
                    y: Math.floor(board.height / 2),
                    wizCode: players[0].wizcode,
                });
                for (let i = 1; i < 7; i++) {
                    const angle: number = (i / 6) * Math.PI * 2 - Math.PI / 2;
                    const x: number = Math.round(
                        -0.6 +
                            board.width / 2 +
                            (board.width / 2 + 0.5) * Math.cos(angle),
                    );
                    const y: number = Math.round(
                        -0.5 +
                            board.height / 2 +
                            (board.height / 2 - 0.5) * Math.sin(angle),
                    );
                    board.addWizard({
                        owner: players[((i + 2) % 6) + 1],
                        x: x,
                        y: y,
                        wizCode: players[((i + 2) % 6) + 1].wizcode,
                    });
                }
                break;
            case 8:
                // All corners and middles
                {
                    let playerIndex = 0;
                    for (const xx of [
                        0,
                        Math.floor(board.width / 2),
                        board.width - 1,
                    ]) {
                        for (const yy of [
                            board.height - 1,
                            Math.floor(board.height / 2),
                            0,
                        ]) {
                            if (
                                xx === Math.floor(board.width / 2) &&
                                yy === Math.floor(board.height / 2)
                            ) {
                                continue;
                            }
                            board.addWizard({
                                owner: players[playerIndex],
                                x: xx,
                                y: yy,
                                wizCode: players[playerIndex].wizcode,
                            });
                            playerIndex++;
                        }
                    }
                }
                break;
            default:
                // 9+ players: farthest-point sampling
                {
                    const candidates: {
                        x: number;
                        y: number;
                    }[] = [];
                    for (let x = 1; x < board.width - 1; x++) {
                        for (let y = 1; y < board.height - 1; y++) {
                            candidates.push({
                                x,
                                y,
                            });
                        }
                    }

                    const placed: {
                        x: number;
                        y: number;
                    }[] = [];

                    for (const player of players) {
                        let best: {
                            x: number;
                            y: number;
                        };

                        if (placed.length === 0) {
                            best = board.rng.pick(candidates);
                        } else {
                            let bestMinDist = -1;
                            best = candidates[0];
                            for (const c of candidates) {
                                let minDist = Infinity;
                                for (const p of placed) {
                                    const dx = c.x - p.x;
                                    const dy = c.y - p.y;
                                    const dist = dx * dx + dy * dy;
                                    if (dist < minDist) {
                                        minDist = dist;
                                    }
                                }
                                if (minDist > bestMinDist) {
                                    bestMinDist = minDist;
                                    best = c;
                                }
                            }
                        }

                        const idx = candidates.indexOf(best);
                        candidates.splice(idx, 1);
                        placed.push(best);

                        board.addWizard({
                            owner: player,
                            x: best.x,
                            y: best.y,
                            wizCode: player.wizcode,
                        });
                    }
                }
                break;
        }
    }

    /**
     * YOLO WizCode generator.
     *
     * @returns A random WizCode string.
     */
    public static randomWizCode(): string {
        const max = Wizard.wizcodeMax;
        return [
            Math.floor(Math.random() * (max.wiz + 1))
                .toString(16)
                .padStart(2, "0"),
            Math.floor(Math.random() * (max.pri + 1))
                .toString(16)
                .padStart(2, "0"),
            Math.floor(Math.random() * (max.sec + 1))
                .toString(16)
                .padStart(2, "0"),
            Math.floor(Math.random() * (max.skin + 1))
                .toString(16)
                .padStart(2, "0"),
            Math.floor(Math.random() * (max.hat + 1))
                .toString(16)
                .padStart(2, "0"),
        ]
            .join("")
            .toLowerCase();
    }
}
