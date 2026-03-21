import { SpellType } from "./enums/spelltype";
import { Piece } from "./piece";
import { Path } from "./rangegizmo";
import { UnitType } from "./enums/unittype";
import { UnitStatus } from "./enums/unitstatus";
import { BoardState } from "./enums/boardstate";
import { AttackSpell } from "./spells/attackspell";
import { Board } from "./board";
import type { Player } from "./player";
import { Spell } from "./spells/spell";
import type { SummonSpell } from "./spells/summonspell";
import { SpellTarget } from "./enums/spelltarget";
import { Geom } from "phaser";
import { Colour } from "./enums/colour";
import { CursorType } from "./enums/cursortype";
import { RemotePlayer } from "./interfaces/remoteplayer";

/**
 * This contains AI logic for computer-controlled wizards. Each computer player
 * receives a ComputerWizard instance that determines its actions each turn.
 */
export class ComputerWizard implements RemotePlayer {
    /**
     * The board the computer wizard is playing on.
     */
    private readonly _board: Board;

    /**
     * The player this computer wizard is controlling.
     */
    private readonly _player: Player;

    /**
     * A set of piece IDs that are known to not be illusions. This is used to
     * track which units have been unsuccessfully Disbelieved. There's a small
     * chance that the computer player may 'forget' this information over time,
     * or neglect to record it altogether, to simulate imperfect memory.
     */
    private readonly _knownNonIllusionPieces: Set<number>;

    /**
     * A map of enemy players to their threat priority levels.
     */
    private readonly _enemyPlayerPriorities: Map<Player, number> = new Map();

    /**
     * The difficulty level of the computer wizard, from 0 (easiest) to 1 (hardest).
     */
    private readonly _difficulty: number = 0.5;

    /**
     * The ID of a piece that selectSpell identified as a preferred target
     * for the next spell cast (e.g. a suspected illusion for Disbelieve,
     * or a high-value threat for an attack spell). When set, autoCastSpell
     * will strongly favour this piece via weighted selection. Cleared after
     * use.
     */
    private _preferredTargetId: number | null = null;

    /**
     * Creates a new ComputerWizard instance.
     *
     * @param board a reference to the game board
     * @param player the player this computer wizard is controlling
     */
    constructor(board: Board, player: Player, difficulty?: number) {
        this._board = board;
        this._player = player;
        this._difficulty = difficulty ?? 0.5;
        this._knownNonIllusionPieces = new Set<number>();
    }

    /**
     * Gets the difficulty level of the computer wizard, from 0 (easiest) to 1
     * (hardest).
     */
    public get difficulty(): number {
        return this._difficulty;
    }

    /**
     * Gets or sets the preferred target piece ID for the next spell cast.
     * Set by selectSpell when it identifies a high-priority target,
     * consumed and cleared by autoCastSpell.
     */
    public get preferredTargetId(): number | null {
        return this._preferredTargetId;
    }

    public set preferredTargetId(id: number | null) {
        this._preferredTargetId = id;
    }

    /**
     * Check the players on the board, and evaluate their threat levels based on
     * proximity and strength of their units. This updates
     * `_enemyPlayerPriorities` accordingly.
     */
    protected evaluateEnemyPlayerPriorities(): void {
        this._enemyPlayerPriorities.clear();

        // First of all, who's left to fight?
        const enemyPlayers: Player[] = this._board.players.filter(
            (p: Player) => {
                return p !== this._player && !p.defeated;
            },
        );

        // Evaluate each enemy player
        for (const enemy of enemyPlayers) {
            let threatLevel: number = 0;
            const enemyPieces: Piece[] = this._board
                .getPiecesByOwner(enemy)
                .filter((p: Piece) => {
                    return !p.dead && !p.hasStatus(UnitStatus.Structure);
                });

            for (const enemyPiece of enemyPieces) {
                threatLevel += enemyPiece.strength;
            }
            this._enemyPlayerPriorities.set(enemy, threatLevel);
        }

        // Temper the threat levels based on the average distance to our wizard
        // of the enemy's pieces
        const wizardPiece: Piece | null = this._player.castingPiece;

        if (!wizardPiece) {
            console.error(
                `Cannot evaluate enemy player priorities for ${this._player.name} as they have no wizard`,
            );
            return;
        }

        for (const [enemy, threatLevel] of this._enemyPlayerPriorities) {
            const enemyPieces: Piece[] = this._board
                .getPiecesByOwner(enemy)
                .filter((p: Piece) => {
                    return (
                        !p.dead && // Not dead (corpses aren't usually owned, but just in case)
                        !p.hasStatus(UnitStatus.Structure) && // Not a structure
                        (p.canAttackPiece(wizardPiece) || // Can attack our wizard
                            p.hasStatus(UnitStatus.Spreads)) // Or can spread (which is also dangerous for a wizard)
                    );
                });
            let totalDistance: number = 0;
            if (enemyPieces.length === 0) {
                // No threatening pieces, so just put the enemy wizard into the
                // enemyPieces list
                enemyPieces.push(enemy.castingPiece);
            }
            for (const enemyPiece of enemyPieces) {
                const distance: number = Board.distance(
                    wizardPiece.position,
                    enemyPiece.position,
                );
                totalDistance += distance;
            }
            const averageDistance: number = totalDistance / enemyPieces.length;
            const adjustedThreatLevel: number =
                threatLevel / (averageDistance + 1);
            this._enemyPlayerPriorities.set(enemy, adjustedThreatLevel);
        }

        // Normalise threat levels to 0-1 range, with 1 always being the highest
        // perceived threat
        const maxThreatLevel: number = Math.max(
            ...this._enemyPlayerPriorities.values(),
            1,
        );
        for (const [enemy, threatLevel] of this._enemyPlayerPriorities) {
            this._enemyPlayerPriorities.set(
                enemy,
                threatLevel / maxThreatLevel,
            );
        }

        console.debug(
            `Enemy player threat levels for ${this._player.name}:`,
            Object.fromEntries(this._enemyPlayerPriorities),
        );
    }

    /**
     * Gets the aggression level of the computer wizard, from 0 (least
     * aggressive) to 1 (most aggressive). This affects how likely the computer
     * wizard is to take risks, such as attacking or moving into dangerous
     * positions.
     */
    private get aggression(): number {
        return Math.min(Math.max(this._difficulty + 0.2, 0), 1);
    }

    /**
     * Given a list of spells, finds all valid targets for each spell.
     *
     * @param board the game board to search for targets on
     * @param spells the spells to find targets for
     */
    public static findSpellTargets(
        board: Board,
        spells: Spell[],
    ): Map<Spell, Piece[]> {
        const targets: Map<Spell, Piece[]> = new Map();

        // Loop over all of the board pieces, and ask each spell if it can
        // target that piece
        for (const spell of spells) {
            for (let piece of board.pieces) {
                if (spell.getValidTarget(piece, false)) {
                    if (!targets.has(spell)) {
                        targets.set(spell, []);
                    }
                    targets.get(spell).push(piece);
                }
            }
        }

        // For spells which destroy wizard creatures, filter out any wizard
        // targets whose owner has no other units to target. While they're
        // technically a valid target, it's not strategically sound to do so.
        const justiceSpells: Spell[] = spells.filter((spell: Spell) => {
            return (
                spell.type === SpellType.Attack &&
                spell.properties.destroyWizardCreatures
            );
        });

        // No justice spells, nothing to filter
        if (!justiceSpells.length) {
            return targets;
        }

        // Filter each justice spell's targets
        for (const justiceSpell of justiceSpells) {
            if (targets.has(justiceSpell)) {
                const filteredTargets: Piece[] = [];
                for (const piece of targets.get(justiceSpell)) {
                    if (piece.type === UnitType.Wizard) {
                        const wizardOwner: Player = piece.owner;
                        const ownerUnits: Piece[] = board
                            .getPiecesByOwner(wizardOwner)
                            .filter((p: Piece) => {
                                return p.type !== UnitType.Wizard && !p.dead;
                            });
                        // Only keep this wizard target if its owner has
                        // non-dead, non-wizard units
                        if (ownerUnits.length > 0) {
                            filteredTargets.push(piece);
                        }
                    }
                    targets.set(justiceSpell, filteredTargets);
                }
            }
        }

        return targets;
    }

    /**
     * Finds valid targets for the given spells.
     *
     * @param spells the spells to find targets for
     * @returns a map of spells to their valid targets
     */
    protected findSpellTargets(spells: Spell[]): Map<Spell, Piece[]> {
        return ComputerWizard.findSpellTargets(this._board, spells);
    }

    /**
     * Causes the computer wizard to forget some of its knowledge about
     * illusions over time.
     */
    private forgetIllusionKnowledge(): void {
        // Small chance to forget a known non-illusion piece each turn
        // Graph: https://www.desmos.com/calculator/ismripyway
        const forgetChance: number = Math.min(
            0.001, // Cap at 0.1% minimum chance
            -(0.4 * Math.log(Math.max(0.1, this._difficulty))) * 0.3, // Higher difficulties forget less often; 1 = 0.1%, 0.5 = 8%, 0.1 = ~28%
        );
        for (const pieceId of this._knownNonIllusionPieces) {
            // If we succeed the 'forget' roll, stop tracking this piece as a
            // known non-illusion
            if (this._board.rollChance(forgetChance)) {
                this._knownNonIllusionPieces.delete(pieceId);
                console.debug(
                    `${this._player.name} has forgotten that piece ID ${pieceId} is not an illusion`,
                );
            }
        }
    }

    /**
     * Remembers that a given piece is not an illusion. Has a chance to fail
     * based on the computer wizard's difficulty level.
     *
     * @param pieceId the ID of the piece to remember
     */
    public rememberNonIllusionPiece(pieceId: number): void {
        const rememberChance: number = 0.2 + this._difficulty; // Harder difficulties remember more often
        if (!this._board.rollChance(rememberChance)) {
            console.debug(
                `${this._player.name} failed to notice that piece ID ${pieceId} is not an illusion`,
            );
            return;
        }
        console.debug(
            `${this._player.name} has learned from another player that piece ID ${pieceId} is not an illusion`,
        );
        this._knownNonIllusionPieces.add(pieceId);
    }

    /**
     * Checks if the computer wizard knows that a given piece is not an illusion.
     *
     * @param pieceId the ID of the piece to check
     * @returns true if the piece is known to be non-illusion, false otherwise
     */
    public knowsPieceIsNonIllusion(pieceId: number): boolean {
        return this._knownNonIllusionPieces.has(pieceId);
    }

    /**
     * Looks up the effective casting chance for the spell that summons a unit
     * with the given unit ID, adjusted for the current world balance (chaotic
     * spells are easier on a chaotic board, and vice versa).
     *
     * @param unitId the unit ID to look up
     * @param worldBalance the current world balance from the board
     * @returns the effective casting chance (0.1-1), or null if no matching spell found
     */
    private static getSpellChanceForUnit(
        unitId: string,
        worldBalance: number,
    ): number | null {
        for (const spellConfig of Object.values(Spell.spells)) {
            if (
                spellConfig.unitId === unitId ||
                spellConfig.unit?.id === unitId
            ) {
                // Apply the same world-balance adjustment as Spell.chance
                if (spellConfig.balance === 0) {
                    return spellConfig.chance;
                }
                let balanceOffset: number = worldBalance;
                if (spellConfig.balance < 0) {
                    balanceOffset *= -1;
                }
                return Math.min(
                    Math.max(spellConfig.chance + balanceOffset, 0.1),
                    1,
                );
            }
        }
        return null;
    }

    /**
     * Reorder a targets array so that the preferred target (if present) is
     * first. This causes `weightedPick` to strongly favour it.
     * Returns the array unchanged if no preferred target or not found.
     *
     * @param targets the original targets array
     * @param preferredId the preferred piece ID, or null
     * @returns a new array with the preferred target first, or the original
     */
    static withPreferredFirst(
        targets: Piece[],
        preferredId: number | null,
    ): Piece[] {
        if (preferredId == null) return targets;
        const idx: number = targets.findIndex((p) => p.id === preferredId);
        if (idx <= 0) return targets; // Not found or already first
        return [
            targets[idx],
            ...targets.slice(0, idx),
            ...targets.slice(idx + 1),
        ];
    }

    /**
     * Selects a spell for the computer wizard to cast.
     *
     * @returns whether a spell was successfully selected
     */
    async selectSpell(): Promise<boolean> {
        this._board.cursor.enabled = false;

        // Re-evaluate enemy player priorities as this may impact our spell
        // choices
        this.evaluateEnemyPlayerPriorities();

        // Possibly forget some illusion knowledge
        this.forgetIllusionKnowledge();
        try {
            let spells: Spell[] = this._player.spells;

            if (!spells.length) {
                console.debug(`${this._player.name} has no spells to cast`);
                this._board.sound.play("cancel");
                return false;
            }

            // Filter out any spells that have no valid targets
            const validSpellsTargets: Map<Spell, Piece[]> =
                this.findSpellTargets(spells);
            spells = spells.filter((spell: Spell) => {
                return (
                    spell.properties.unitId ||
                    spell.properties.unit || // Summon spells are always valid
                    spell.properties.target === "self" || // Self-targeting spells are always valid
                    validSpellsTargets.get(spell)?.length > 0
                ); // Has valid targets
            });

            // Filter out Disbelieve if there are no valid targets, or
            // consider preferring it against suspected illusions —
            // high-strength units with low casting chances are more likely
            // to have been cast as illusions
            const disbelieveSpell: Spell | undefined = spells.find(
                (spell: Spell) => {
                    return spell.type === SpellType.Disbelieve;
                },
            );
            if (disbelieveSpell) {
                const potentialTargets: Piece[] = this._board.pieces.filter(
                    (p: Piece) => {
                        return (
                            p.owner !== this._player && // Enemy piece
                            !p.dead && // Not dead
                            p.canBeDisbelieved && // Can be disbelieved
                            !p.raisedDead && // Not raised dead (can't be an illusion)
                            !this._knownNonIllusionPieces.has(p.id) // Not already known to be non-illusion
                        );
                    },
                );
                if (potentialTargets.length === 0) {
                    // No valid targets for Disbelieve, remove it from the list
                    spells = spells.filter((spell: Spell) => {
                        return spell.type !== SpellType.Disbelieve;
                    });
                } else {
                    // Score each potential target by how suspicious it looks:
                    // high strength + low casting chance = likely an illusion
                    const wizardPiece: Piece | null =
                        this._player.castingPiece;
                    if (wizardPiece) {
                        const wizardThreats: Set<Piece> =
                            wizardPiece.findThreatPieces();

                        let bestSuspicion: number = 0;
                        let bestTarget: Piece | null = null;

                        for (const piece of potentialTargets) {
                            const castChance: number | null =
                                ComputerWizard.getSpellChanceForUnit(
                                    piece.properties.id,
                                    this._board.balance,
                                );
                            if (castChance === null) continue;

                            let suspicion: number =
                                piece.strength * (1 - castChance);

                            // Boost if this piece actively threatens our wizard
                            if (wizardThreats.has(piece)) {
                                suspicion *= 2;
                            }

                            if (suspicion > bestSuspicion) {
                                bestSuspicion = suspicion;
                                bestTarget = piece;
                            }
                        }

                        if (bestTarget) {
                            // Normalise to a 0-1 preference, gated by difficulty
                            const disbelievePreference: number = Math.min(
                                (bestSuspicion / 25) * this._difficulty,
                                1,
                            );

                            if (
                                this._board.rollChance(disbelievePreference)
                            ) {
                                console.debug(
                                    `${this._player.name} suspects ${bestTarget.fullName} may be an illusion (suspicion: ${bestSuspicion.toFixed(1)}) and prefers Disbelieve`,
                                );
                                this._preferredTargetId = bestTarget.id;
                                await this._player.pickSpell(
                                    disbelieveSpell.id,
                                );
                                return true;
                            }
                        }
                    }
                }
            }

            // Rank spells by how likely they are to cast to play conservatively
            spells.sort((a, b) => {
                if (a.chance > b.chance) {
                    return -1;
                }
                if (a.chance < b.chance) {
                    return 1;
                }
                return 0;
            });

            const pickedSpell: SummonSpell = this._board.rng.weightedPick(
                spells,
            ) as SummonSpell;

            // The lower the spell's cast chance, the more likely we are to cast
            // it as an illusion
            if (pickedSpell.allowIllusion) {
                const roll: number = this._board.rng.realInRange(0.1, 1);
                if (roll > pickedSpell.chance) {
                    pickedSpell.illusion = true;
                } else {
                    pickedSpell.illusion = false;
                }
            }

            await this._player.pickSpell(pickedSpell.id);
            return true;
        } catch (error) {
            console.error(
                `Error selecting spell for ${this._player.name}:`,
                error,
            );
            return false;
        } finally {
            this._board.cursor.enabled = true;
        }
    }

    /**
     * Automatically casts the currently selected spell for the specified player
     * on the board. Normally used for computer-controlled wizards, but can also
     * be used for auto-casting spells for human players (e.g., Magic Wood)
     *
     * @param board The game board on which the spell is to be cast.
     * @param player The player who is casting the spell.
     * @returns A promise that resolves to true if the spell was cast successfully, false otherwise.
     */
    static async autoCastSpell(board: Board, player: Player): Promise<boolean> {
        board.cursor.enabled = false;
        try {
            // Capture and clear the preferred target set by selectSpell
            const preferredTargetId: number | null =
                player.ai?.preferredTargetId ?? null;
            if (player.ai) {
                player.ai.preferredTargetId = null;
            }

            const spell: Spell | null = await player.useSpell();
            let successfullyCast: boolean = false;
            if (spell) {
                if (spell.type === SpellType.Summon) {
                    return await (spell as SummonSpell).autoCast(player);
                } else if (spell.type === SpellType.Buff) {
                    await board.rules.doCastSpell(board, player.castingPiece);
                    return true;
                } else if (spell.type === SpellType.Attack) {
                    const attackSpell: AttackSpell = spell as AttackSpell;
                    console.debug(
                        `${player.name} is casting attack spell ${spell.name}`,
                    );
                    while (attackSpell.castTimes > 0) {
                        const targets: Piece[] = (
                            ComputerWizard.findSpellTargets(board, [
                                attackSpell,
                            ]).get(attackSpell) || []
                        ).toSorted((a: Piece, b: Piece) => {
                            // Prefer wizard or high strength targets
                            if (
                                a.type === UnitType.Wizard &&
                                b.type !== UnitType.Wizard
                            ) {
                                return -1;
                            }
                            if (
                                a.type !== UnitType.Wizard &&
                                b.type === UnitType.Wizard
                            ) {
                                return 1;
                            }
                            return b.strength - a.strength;
                        });
                        if (!targets.length) {
                            console.debug(
                                `${player.name} has no valid targets to cast ${spell.name}`,
                            );
                            if (successfullyCast) {
                                player.discardSpell();
                            }
                            board.sound.play("cancel");
                            return false;
                        }
                        console.debug(
                            `${player.name} has ${targets.length} valid targets to cast ${spell.name}`,
                        );
                        const target: Piece =
                            board.rng.weightedPick(
                                ComputerWizard.withPreferredFirst(
                                    targets,
                                    preferredTargetId,
                                ),
                            );
                        console.debug(
                            `${player.name} is casting ${spell.name} on target ${target.name}`,
                        );
                        await board.rules.doCastSpell(board, target);
                        successfullyCast = true;
                    }
                    return true;
                } else if (spell.type === SpellType.Disbelieve) {
                    console.debug(`${player.name} is casting Disbelieve`);
                    const potentialTargets: Piece[] = board.pieces.filter(
                        (p: Piece) => {
                            return (
                                p.owner !== player && // Enemy piece
                                !p.dead && // Not dead
                                p.canBeDisbelieved && // Can be disbelieved
                                !player.ai?.knowsPieceIsNonIllusion(p.id) // Not already known to be non-illusion
                            );
                        },
                    );

                    if (!potentialTargets.length) {
                        console.debug(
                            `${player.name} has no valid targets to cast Disbelieve`,
                        );
                        board.sound.play("cancel");
                        return false;
                    }

                    const reordered: Piece[] =
                        ComputerWizard.withPreferredFirst(
                            potentialTargets,
                            preferredTargetId,
                        );
                    const target: Piece =
                        preferredTargetId == null
                            ? board.rng.pick(potentialTargets)
                            : board.rng.weightedPick(reordered);
                    await board.rules.doCastSpell(board, target);
                    return true;
                } else if (spell.type === SpellType.Misc) {
                    if (spell.properties.target === "self") {
                        await board.rules.doCastSpell(
                            board,
                            player.castingPiece,
                        );
                        return true;
                    } else if (
                        [SpellTarget.Piece, SpellTarget.Corpse].includes(
                            spell.properties.target,
                        )
                    ) {
                        const potentialTargets: Piece[] = board.pieces.filter(
                            (p: Piece) => {
                                return spell.getValidTarget(p, false);
                            },
                        );

                        if (!potentialTargets.length) {
                            console.debug(
                                `${player.name} has no valid targets to cast ${spell.name}`,
                            );
                            board.sound.play("cancel");
                            return false;
                        }
                        const miscReordered: Piece[] =
                            ComputerWizard.withPreferredFirst(
                                potentialTargets,
                                preferredTargetId,
                            );
                        const target: Piece =
                            preferredTargetId == null
                                ? board.rng.pick(potentialTargets)
                                : board.rng.weightedPick(miscReordered);
                        await board.rules.doCastSpell(board, target);
                        return true;
                    }
                }
            }
            board.sound.play("cancel");
            return false;
        } catch (error) {
            console.error(`Error casting spell for ${player.name}:`, error);
            return false;
        } finally {
            board.cursor.enabled = true;
        }
    }

    /**
     * Casts the currently selected spell.
     *
     * @returns whether the spell was successfully cast
     */
    async castSpell(): Promise<boolean> {
        return ComputerWizard.autoCastSpell(this._board, this._player);
    }

    /**
     * Moves a single unit for the computer wizard. This includes moving,
     * attacking, and ranged attacking as appropriate.
     *
     * @param piece the piece to move
     * @returns true if the unit was moved successfully, false otherwise
     */
    async moveUnit(piece: Piece): Promise<boolean> {
        await this._board.selectPiece(piece.id);
        await Board.delay(Board.DEFAULT_DELAY / 4);

        if (piece.engaged) {
            console.debug(`${piece.fullName} is engaged`);
            // Try to attack the engaged enemy if possible
            const engagedEnemies: Piece[] =
                this._board.getAdjacentPiecesAtPosition(
                    piece.position,
                    (p: Piece) => {
                        return (
                            p.owner !== this._player && // Enemy piece
                            !p.currentMount && // Not mounted
                            piece.canAttackPiece(p) && // Can attack target
                            piece.canAttackPossiblyUndeadPiece(p) // Can attack target even if undead
                        ); // Can attack engaged piece
                    },
                );
            if (engagedEnemies.length > 0) {
                const target: Piece = this._board.rng.pick(engagedEnemies);
                console.debug(
                    `${piece.fullName} is engaged and attacks ${target.fullName}`,
                );
                await this._board.attackPiece(piece.id, target.id);
            } else {
                console.debug(`No engaged targets found for ${piece.fullName}`);
            }
            // Whether we attacked or not, if we're engaged then we consider our
            // move for the turn done. We may still be able to ranged attack
            // later though, so don't return yet.
            piece.moved = true;
            piece.attacked = true;
        } else {
            console.debug(`${piece.fullName} is not engaged`);
        }

        const willAttack: boolean = this._board.rollChance(this.aggression);
        if (!willAttack) {
            console.debug(`${piece.fullName} will skip attacking this turn`);
        }
        if (!piece.attacked && piece.canAttack && willAttack) {
            // Try to attack a random hostile target in range
            const potentialAttackTargets: Piece[] = this._board
                .getAdjacentPiecesAtPosition(piece.position, (p: Piece) => {
                    return (
                        p.owner !== this._player && // Enemy piece
                        !p.currentMount && // Not mounted
                        piece.canAttackPiece(p) && // Can attack target
                        piece.canAttackPossiblyUndeadPiece(p) && // Can attack target even if undead
                        (p.canAttackPiece(piece) ||
                            p.hasStatus(UnitStatus.Spreads))
                    ); // Target can fight back or is dangerous
                })
                .toSorted((a: Piece, b: Piece) => {
                    // Prefer wizard targets
                    if (
                        a.type === UnitType.Wizard &&
                        b.type !== UnitType.Wizard
                    ) {
                        return -1;
                    }
                    if (
                        a.type !== UnitType.Wizard &&
                        b.type === UnitType.Wizard
                    ) {
                        return 1;
                    }
                    return 0;
                });
            if (potentialAttackTargets.length > 0) {
                const target: Piece = this._board.rng.weightedPick(
                    potentialAttackTargets,
                );
                console.debug(
                    `${piece.fullName} attacks target ${target.name}`,
                );
                await this._board.attackPiece(piece.id, target.id);
                piece.moved = true;
                piece.attacked = true;
            } else {
                console.debug(`No attack targets found for ${piece.fullName}`);
            }
        } else {
            console.debug(
                `${piece.fullName} cannot attack or has already attacked`,
            );
        }
        if (!piece.moved && piece.canMove) {
            // Special case: if this is a wizard and there are mountable units
            // adjacent, consider mounting one of them
            if (piece.type === UnitType.Wizard && piece.currentMount == null) {
                const mountablePieces: Piece[] =
                    this._board.getAdjacentPiecesAtPosition(
                        piece.position,
                        (p: Piece) => {
                            return piece.canMountPiece(p); // Can mount the piece
                        },
                    );
                //
                if (mountablePieces.length > 0) {
                    // Increase chance to mount if the wizard is in danger
                    let modifier: number = 0;
                    if (this._player.castingPiece.findThreatPieces().size > 0) {
                        console.debug(
                            `${piece.fullName} is in danger and more likely to mount`,
                        );
                        modifier = this._difficulty * 0.5; // More likely to mount if in danger
                    }

                    // Wizards usually want to mount, but lower difficulties may
                    // sometimes choose not to (75% for 0, 100% for 1)
                    if (
                        !this._board.rollChance(
                            Math.min(
                                0.75 + (this._difficulty + modifier) * 0.25,
                                1,
                            ),
                        )
                    ) {
                        console.debug(
                            `${piece.fullName} chooses not to mount this turn`,
                        );
                        return false;
                    }
                    const mountable: Piece =
                        this._board.rng.pick(mountablePieces);
                    console.debug(
                        `${piece.fullName} mounts ${mountable.fullName}`,
                    );
                    await this._board.mountPiece(piece.id, mountable.id);
                    // Select the mountable if it can attack or ranged attack
                    if (
                        (mountable.canAttack && !mountable.attacked) ||
                        (mountable.canRangedAttack && !mountable.rangedAttacked)
                    ) {
                        await this._board.selectPiece(mountable.id, true);
                    }
                    return true;
                } else {
                    console.debug(
                        `No friendly mountables found for ${piece.fullName}`,
                    );
                }
            }

            // Special case: if there are any terminal paths and this is a
            // flying unit, attack one of them with a greater chance the higher
            // the difficulty level
            if (
                piece.hasStatus(UnitStatus.Flying) &&
                this._board.rollChance(this.aggression)
            ) {
                const terminalPaths: Set<Path> =
                    this._board.rangeGizmo.getAllTerminalPaths();
                if (terminalPaths.size > 0) {
                    // Search the terminal paths for the first attackable target
                    let targetPiece: Piece | null = null;
                    for (const path of terminalPaths) {
                        const terminalNode = path.nodes?.findLast(
                            (node) => node.terminal,
                        );
                        if (terminalNode) {
                            const pos: Geom.Point = terminalNode.pos;
                            targetPiece =
                                this._board.getPiecesAtPosition(
                                    pos,
                                    (p: Piece) => {
                                        return (
                                            p.owner !== this._player && // Enemy piece
                                            piece.canAttackPossiblyUndeadPiece(
                                                p,
                                            ) && // Can attack target even if undead
                                            piece.canAttackPiece(p)
                                        ); // Can attack target
                                    },
                                )[0] || null;
                            if (targetPiece) {
                                break;
                            }
                        }
                    }
                    // If we found a target, go git it
                    if (targetPiece) {
                        console.debug(
                            `${piece.fullName} flies to attack ${targetPiece.fullName}`,
                        );
                        piece.moved = true;
                        await this._board.attackPiece(piece.id, targetPiece.id);
                        if (!piece.currentMount && piece.engaged) {
                            const firstEngagingPiece: Piece | null =
                                piece.getFirstEngagingPiece();

                            if (firstEngagingPiece) {
                                console.debug(
                                    `${piece.fullName} is now engaged after attacking`,
                                );
                                piece.attacked = false;
                                await this.moveUnit(piece);
                            }
                        }
                        piece.attacked = true;
                        return true;
                    } else {
                        console.debug(
                            `No attackable terminal targets found for ${piece.fullName}`,
                        );
                    }
                } else {
                    console.debug(
                        `No terminal paths found for ${piece.fullName}`,
                    );
                }
            } else {
                console.debug(
                    `${piece.fullName} is not flying or did not roll to attack terminal paths`,
                );
            }

            // Find all valid reachable tiles
            const reachableTiles: Geom.Point[] = Array.from(
                this._board.rangeGizmo.getAllValidPaths(),
            )
                .map((path: Path) => {
                    // Get the last node in the path
                    return path.nodes?.findLast((node) => node.traversable)
                        ?.pos;
                })
                .filter((pt: Geom.Point) => {
                    if (!pt) {
                        return false;
                    }
                    // Ignore tile the piece is currently on
                    return !Geom.Point.Equals(pt, piece.position);
                });
            if (reachableTiles.length === 0) {
                console.debug(`No reachable tiles for ${piece.fullName}`);
                this._board.sound.play("cancel");
                return false;
            }
            // We're going to move to a point, but it may be random or it may
            // be tactical, depending on the difficulty level
            let movePt: Geom.Point = null;

            if (piece === this._player.castingPiece) {
                // Wizard priority 1: seek a mountable unit if unmounted.
                // Higher difficulties do this more reliably (50% at diff 0,
                // 100% at diff 1). Adjacent mounts are already handled above,
                // so we skip any that are already adjacent.
                if (
                    piece.currentMount == null &&
                    this._board.rollChance(0.5 + this._difficulty * 0.5)
                ) {
                    const mountTargets: Piece[] = this._board.pieces.filter(
                        (p: Piece) => {
                            if (p.dead) return false;
                            // Must be mountable by this wizard
                            if (!piece.canMountPiece(p)) return false;
                            // Skip pieces already adjacent (mounting handled separately)
                            return (
                                Board.distance(piece.position, p.position) > 1
                            );
                        },
                    );
                    if (mountTargets.length > 0) {
                        let closestTile: Geom.Point | null = null;
                        let closestDist: number = Infinity;
                        let closestMount: Piece | null = null;
                        for (const tile of reachableTiles) {
                            for (const mount of mountTargets) {
                                const dist: number = Board.distance(
                                    tile,
                                    mount.position,
                                );
                                if (dist < closestDist) {
                                    closestDist = dist;
                                    closestTile = tile;
                                    closestMount = mount;
                                }
                            }
                        }
                        if (closestTile) {
                            console.debug(
                                `${piece.fullName} moves towards mountable unit ${closestMount?.fullName}`,
                            );
                            movePt = closestTile;
                        }
                    }
                }
                // Wizard priority 2: move away from threats when threatened.
                // Higher difficulties do this more reliably (50% at diff 0,
                // 100% at diff 1).
                if (!movePt) {
                    const threats: Set<Piece> = piece.findThreatPieces();
                    if (
                        threats.size > 0 &&
                        this._board.rollChance(0.5 + this._difficulty * 0.5)
                    ) {
                        const threatArray: Piece[] = Array.from(threats);
                        let safestTile: Geom.Point | null = null;
                        let maxMinDistance: number = -Infinity;
                        for (const tile of reachableTiles) {
                            const minDist: number = Math.min(
                                ...threatArray.map((t: Piece) =>
                                    Board.distance(tile, t.position),
                                ),
                            );
                            if (minDist > maxMinDistance) {
                                maxMinDistance = minDist;
                                safestTile = tile;
                            }
                        }
                        if (safestTile) {
                            console.debug(
                                `${piece.fullName} moves away from ${threats.size} threat(s)`,
                            );
                            movePt = safestTile;
                        }
                    }
                }
            } else if (this._board.rollChance(this.aggression)) {
                // Non-wizard: move towards the highest priority enemy
                const highestPriorityEnemy: Player | null =
                    Array.from(this._enemyPlayerPriorities.entries()).toSorted(
                        (a, b) => b[1] - a[1],
                    )[0]?.[0] || null;

                if (highestPriorityEnemy) {
                    // Pick the closest reachable tile to any of that player's
                    // pieces, preferentially targeting wizards
                    let closestTile: Geom.Point | null = null;
                    let closestDistance: number = Infinity;
                    let closestPiece: Piece | null = null;
                    const enemyPieces: Piece[] = this._board
                        .getPiecesByOwner(highestPriorityEnemy)
                        .filter((p: Piece) => {
                            return (
                                !p.dead && // Not dead
                                piece.canAttackPossiblyUndeadPiece(p) && // Can attack target even if undead
                                piece.canAttackPiece(p)
                            ); // Can attack target
                        });
                    for (const tile of reachableTiles) {
                        for (const enemyPiece of enemyPieces) {
                            const distance: number = Board.distance(
                                tile,
                                enemyPiece.position,
                            );
                            // Prefer wizard targets by reducing their effective
                            // distance; the higher the difficulty, the more we
                            // prefer wizards
                            const effectiveDistance: number =
                                enemyPiece.type === UnitType.Wizard
                                    ? distance *
                                      Math.max(0.1, 1 - this.difficulty)
                                    : distance;
                            if (effectiveDistance < closestDistance) {
                                closestDistance = effectiveDistance;
                                closestTile = tile;
                                closestPiece = enemyPiece;
                            }
                        }
                    }
                    if (closestTile) {
                        console.debug(
                            `${piece.fullName} chooses to move tactically towards ${closestPiece?.fullName ?? highestPriorityEnemy.name}`,
                        );
                        movePt = closestTile;
                    } else {
                        console.debug(
                            `Could not find closest tile to enemy pieces for ${piece.fullName}`,
                        );
                    }
                }
            }
            // If we didn't find a tactical move point, pick a random one
            if (!movePt) {
                console.debug(`${piece.fullName} chooses to move randomly`);
                movePt = this._board.rng.pick(reachableTiles);
            }

            console.debug(
                `${piece.fullName} moves to (${movePt.x}, ${movePt.y})`,
            );
            await this._board.movePiece(piece.id, movePt);
            if (piece.engaged) {
                console.debug(`${piece.fullName} is now engaged after moving`);
                await this.moveUnit(piece);
            }
        }
        if (!piece.rangedAttacked && piece.canRangedAttack) {
            // Try to attack a random target in range
            const rangedTargets: Piece[] = this._board.pieces
                .filter((p: Piece) => {
                    return (
                        p.owner !== this._player && // Enemy piece
                        (p.stats.combat > 0 ||
                            p.stats.rangedCombat > 0 ||
                            p.hasStatus(UnitStatus.Spreads)) && // Is potentially dangerous
                        !p.currentMount && // Not mounted (can't target riders without killing the mount first)
                        piece.canAttackPossiblyUndeadPiece(p) &&
                        piece.canRangedAttackPiece(p) // In ranged attack range
                    );
                })
                .toSorted((a: Piece, b: Piece) => {
                    // Prefer wizard targets
                    if (
                        a.type === UnitType.Wizard &&
                        b.type !== UnitType.Wizard
                    ) {
                        return -1;
                    }
                    if (
                        a.type !== UnitType.Wizard &&
                        b.type === UnitType.Wizard
                    ) {
                        return 1;
                    }
                    return 0;
                });
            if (rangedTargets.length > 0) {
                const target: Piece =
                    this._board.rng.weightedPick(rangedTargets);

                this._board.sound.play("bowselecta");
                this._board.logger.log(
                    `${piece.name}'s turn to ranged attack`,
                    Colour.Yellow,
                );
                await this._board.rangeGizmo.showSimpleRange(
                    piece.position,
                    piece.stats.range,
                    CursorType.RangeRangedAttack,
                    true,
                );

                await Board.delay(Board.DEFAULT_DELAY * 1.5);
                console.debug(
                    `${piece.fullName} performs ranged attack on ${target.fullName}`,
                );
                await this._board.rangedAttackPiece(piece.id, target.id);
                return true;
            } else {
                console.debug(
                    `No ranged attack targets found for ${piece.fullName}`,
                );
            }
        } else {
            console.debug(
                `${piece.fullName} cannot ranged attack or has already ranged attacked`,
            );
        }

        return true;
    }

    /**
     * Moves all units for the computer wizard. This includes moving, attacking,
     * and ranged attacking as appropriate.
     */
    async moveAllUnits(): Promise<void> {
        this._board.cursor.enabled = false;

        // Re-evaluate enemy players again, as that may have changed after
        // the spell casting round
        this.evaluateEnemyPlayerPriorities();

        try {
            const pieces: Piece[] = this._board
                .getPiecesByOwner(this._player)
                .filter((p: Piece) => {
                    return (
                        !p.currentMount && // Not mounted - mounted units move with their mounts
                        p.canSelect && // Can be selected
                        !p.hasStatus(UnitStatus.Structure) && // Not a structure
                        !p.dead
                    );
                });

            if (!pieces.length) {
                console.warn(`${this._player.name} has no pieces to move`);
                return;
            }

            for (const piece of pieces) {
                if (this._board.state === BoardState.GameOver) {
                    break;
                }
                if (piece.turnOver) {
                    console.debug(
                        `${piece.fullName} has already taken its turn`,
                    );
                    continue;
                }
                console.debug(`Moving ${piece.fullName}`);
                await this.moveUnit(piece);
                piece.turnOver = true;
            }
        } finally {
            this._board.cursor.enabled = true;
        }
    }
}
