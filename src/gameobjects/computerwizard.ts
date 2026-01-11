import { SpellType } from "./enums/spelltype";
import { Piece } from "./piece";
import { Path } from "./rangegizmo";
import { UnitType } from "./enums/unittype";
import { UnitStatus } from "./enums/unitstatus";
import { BoardState } from "./enums/boardstate";
import { AttackSpell } from "./spells/attackspell";
import { Board } from "./board";
import type { Player } from "./player";
import type { Spell } from "./spells/spell";
import type { SummonSpell } from "./spells/summonspell";
import { SpellTarget } from "./enums/spelltarget";

/**
 * This contains AI logic for computer-controlled wizards. Each computer player
 * receives a ComputerWizard instance that determines its actions each turn.
 */
export class ComputerWizard {
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
     * The difficulty level of the computer wizard, from 0 (easiest) to 1 (hardest).
     */
    private readonly _difficulty: number = 0.5;

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
     * Given a list of spells, finds all valid targets for each spell.
     * 
     * @param spells the spells to find targets for
     */
    protected findSpellTargets(spells: Spell[]): Map<Spell, Piece[]> {
        const targets: Map<Spell, Piece[]> = new Map();

        // Loop over all of the board pieces, and ask each spell if it can
        // target that piece
        for (const spell of spells) {
            for (let piece of this._board.pieces) {
                if (spell.isValidTarget(piece.position, false)) {
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
            return spell.type === SpellType.Attack && spell.properties.destroyWizardCreatures;
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
                        const ownerUnits: Piece[] = this._board
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
     * Causes the computer wizard to forget some of its knowledge about
     * illusions over time.
     */
    private forgetIllusionKnowledge(): void {
        // Small chance to forget a known non-illusion piece each turn
        const forgetChance: number = 0.1 * (1 - this._difficulty); // Harder difficulties forget less often
        for (const pieceId of this._knownNonIllusionPieces) {
            if (this._board.rollChance(forgetChance)) {
                this._knownNonIllusionPieces.delete(pieceId);
                console.debug(`${this._player.name} has forgotten that piece ID ${pieceId} is not an illusion`);
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
        const rememberChance: number = 0.2 * (1 - this._difficulty); // Harder difficulties remember more often
        if (this._board.rollChance(rememberChance)) {
            console.debug(`${this._player.name} failed to notice that piece ID ${pieceId} is not an illusion`);
            return;
        }
        console.debug(`${this._player.name} has learned from another player that piece ID ${pieceId} is not an illusion`);
        this._knownNonIllusionPieces.add(pieceId);
    }

    /**
     * Selects a spell for the computer wizard to cast.
     */
    async selectSpell(): Promise<boolean> {
        this._board.cursor.enabled = false;
        // Possibly forget some illusion knowledge
        this.forgetIllusionKnowledge();
        try {
            // For now, just pick a random spell from the player's spell list
            // let spells: Spell[] = this._player.spells.filter((spell: Spell) => {
            //     return (
            //         spell.type === SpellType.Summon ||
            //         spell.type === SpellType.Buff ||
            //         spell.type === SpellType.Attack ||
            //         spell.type === SpellType.Disbelieve
            //     );
            // });
            let spells: Spell[] = this._player.spells;

            if (!spells.length) {
                console.debug(`${this._player.name} has no spells to cast`);
                this._board.sound.play("cancel");
                return false;
            }

            // Filter out any spells that have no valid targets
            const validSpellsTargets: Map<Spell, Piece[]> = this.findSpellTargets(spells);
            spells = spells.filter((spell: Spell) => {
                return spell.properties.unitId || // Summon spells are always valid
                    spell.properties.target === 'self' || // Self-targeting spells are always valid
                    validSpellsTargets.get(spell)?.length > 0; // Has valid targets
            });

            // Filter out Disbelieve if there are no valid targets
            const disbelieveSpell: Spell | undefined = spells.find((spell: Spell) => {
                return spell.type === SpellType.Disbelieve;
            });
            if (disbelieveSpell) {
                const potentialTargets: Piece[] = this._board.pieces
                    .filter((p: Piece) => {
                        return (
                            p.owner !== this._player && // Enemy piece
                            !p.dead && // Not dead
                            p.canDisbelieve && // Can be disbelieved
                            !this._knownNonIllusionPieces.has(p.id) // Not already known to be non-illusion
                        );
                    });
                if (potentialTargets.length === 0) {
                    // No valid targets for Disbelieve, remove it from the list
                    spells = spells.filter((spell: Spell) => {
                        return spell.type !== SpellType.Disbelieve;
                    });
                }
            }

            if (!spells.length) {
                console.debug(`${this._player.name} has no valid spells to cast`);
                this._board.sound.play("cancel");
                return false;
            }

            // Rank spells by how likely they are to cast to play conservatively
            spells.sort((a, b) => {
                return a.chance > b.chance ? -1 : a.chance < b.chance ? 1 : 0;
            });

            const pickedSpell: SummonSpell = Phaser.Math.RND.weightedPick(
                spells
            ) as SummonSpell;

            // The lower the spell's cast chance, the more likely we are to cast
            // it as an illusion
            if (pickedSpell.allowIllusion) {
                const roll: number = Phaser.Math.RND.realInRange(0.1, 1);
                if (roll > pickedSpell.chance) {
                    pickedSpell.illusion = true;
                } else {
                    pickedSpell.illusion = false;
                }
            }

            await this._player.pickSpell(pickedSpell.id);
            return true;
        } catch (error) {
            console.error(`Error selecting spell for ${this._player.name}:`, error);
            return false;
        } finally {
            this._board.cursor.enabled = true;
        }
    }

    /**
     * Casts the currently selected spell.
     */
    async castSpell(): Promise<boolean> {
        this._board.cursor.enabled = false;
        try {
            const spell: Spell | null = await this._player.useSpell();
            let successfullyCast: boolean = false;
            if (spell) {
                if (spell.type === SpellType.Summon) {
                    const summonSpell: SummonSpell = spell as SummonSpell;
                    let summonPt: Phaser.Geom.Point | null = null;
                    while (spell.castTimes > 0) {
                        // Find a random valid tile on the board to summon onto. We
                        // do this each time because the casting of a spell can
                        // change which board tiles are valid (e.g., trees cannot
                        // be cast adjacent to other trees).
                        const validTiles: Phaser.Geom.Point[] = [];
                        for (let xx = 0; xx < this._board.width; xx++) {
                            for (let yy = 0; yy < this._board.height; yy++) {
                                const pt: Phaser.Geom.Point = new Phaser.Geom.Point(
                                    xx,
                                    yy
                                );
                                if (summonSpell.isValidTarget(pt, false)) {
                                    validTiles.push(pt);
                                }
                            }
                        }
                        if (!validTiles.length) {
                            console.debug(`${this._player.name} has no valid tiles to cast ${spell.name}`);
                            if (successfullyCast) {
                                this._player.discardSpell();
                            }
                            this._board.sound.play("cancel");
                            return false;
                        }
                        summonPt = Phaser.Math.RND.pick(validTiles);

                        await this._board.rules.doCastSpell(
                            this._board,
                            spell,
                            summonPt
                        );
                        successfullyCast = true;
                    }
                    return true;
                } else if (spell.type === SpellType.Buff) {
                    await this._board.rules.doCastSpell(
                        this._board,
                        spell,
                        this._player.castingPiece
                    );
                    return true;
                } else if (spell.type === SpellType.Attack) {
                    const attackSpell: AttackSpell = spell as AttackSpell;
                    console.debug(`${this._player.name} is casting attack spell ${spell.name}`);
                    while (attackSpell.castTimes > 0) {
                        const targets: Piece[] = (this.findSpellTargets([attackSpell]).get(attackSpell) || [])
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
                        if (targets.length) {
                            console.debug(`${this._player.name} has ${targets.length} valid targets to cast ${spell.name}`);
                        }
                        else {
                            console.debug(`${this._player.name} has no valid targets to cast ${spell.name}`);
                            if (successfullyCast) {
                                this._player.discardSpell();
                            }
                            this._board.sound.play("cancel");
                            return false;
                        }
                        const target: Piece = Phaser.Math.RND.weightedPick(targets);
                        await this._board.rules.doCastSpell(
                            this._board,
                            spell,
                            target
                        );
                        successfullyCast = true;
                    }
                    return true;
                } else if (spell.type === SpellType.Disbelieve) {
                    console.debug(`${this._player.name} is casting Disbelieve`);
                    const potentialTargets: Piece[] = this._board.pieces
                        .filter((p: Piece) => {
                            return (
                                p.owner !== this._player && // Enemy piece
                                !p.dead && // Not dead
                                p.canDisbelieve && // Can be disbelieved
                                !this._knownNonIllusionPieces.has(p.id) // Not already known to be non-illusion
                            );
                        });

                    if (!potentialTargets.length) {
                        console.debug(`${this._player.name} has no valid targets to cast Disbelieve`);
                        this._board.sound.play("cancel");
                        return false;
                    }

                    const target: Piece = Phaser.Math.RND.pick(potentialTargets);
                    await this._board.rules.doCastSpell(
                        this._board,
                        spell,
                        target
                    );
                    return true;
                } else if (spell.type === SpellType.Misc) {
                    if (spell.properties.target === 'self') {
                        await this._board.rules.doCastSpell(
                            this._board,
                            spell,
                            this._player.castingPiece
                        );
                        return true;
                    }
                    else if ([SpellTarget.Piece, SpellTarget.Corpse].includes(spell.properties.target)) {
                        const potentialTargets: Piece[] = this._board.pieces
                            .filter((p: Piece) => {
                                return (
                                    spell.isValidTarget(p.position, false)
                                );
                            });

                        if (!potentialTargets.length) {
                            console.debug(`${this._player.name} has no valid targets to cast ${spell.name}`);
                            this._board.sound.play("cancel");
                            return false;
                        }
                        const target: Piece = Phaser.Math.RND.pick(potentialTargets);
                        await this._board.rules.doCastSpell(
                            this._board,
                            spell,
                            target
                        );
                        return true;
                    }
                }
            }
            this._board.sound.play("cancel");
            return false;
        } catch (error) {
            console.error(`Error casting spell for ${this._player.name}:`, error);
            return false;
        } finally {
            this._board.cursor.enabled = true;
        }
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
            console.debug(`${piece.owner.name}'s ${piece.name} is engaged`);
            // Try to attack the engaged enemy if possible
            const engagedEnemies: Piece[] =
                this._board.getAdjacentPiecesAtPosition(
                    piece.position,
                    (p: Piece) => {
                        return (
                            p.owner !== this._player && // Enemy piece
                            !p.currentMount && // Not mounted
                            piece.canAttackPiece(p)
                        ); // Can attack engaged piece
                    }
                );
            if (engagedEnemies.length > 0) {
                const target: Piece = Phaser.Math.RND.pick(engagedEnemies);
                console.debug(`${piece.owner.name}'s ${piece.name} attacks engaged target ${target.name}`);
                await this._board.attackPiece(piece.id, target.id);
            }
            else {
                console.debug(`No engaged targets found for ${piece.owner.name}'s ${piece.name}`);
            }
        }
        else {
            console.debug(`${piece.owner.name}'s ${piece.name} is not engaged`);
        }
        // 50/50 chance to run instead of attack if not engaged. If the unit
        // cannot move (e.g., a Shadow Wood) it has a much higher chance to
        // attack.
        const willAttack: boolean = this._board.rollChance(piece.canMove ? 0.5 : 0.1);
        if (!willAttack) {
            console.debug(`${piece.owner.name}'s ${piece.name} will skip attacking this turn`);
        }
        if (!piece.attacked && piece.canAttack && willAttack) {
            // Try to attack a random hostile target in range
            const potentialAttackTargets: Piece[] = this._board
                .getAdjacentPiecesAtPosition(piece.position, (p: Piece) => {
                    return (
                        p.owner !== this._player && // Enemy piece
                        !p.currentMount && // Not mounted
                        piece.canAttackPiece(p) && // Can attack target
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
                const target: Piece = Phaser.Math.RND.weightedPick(
                    potentialAttackTargets
                );
                console.debug(`${piece.owner.name}'s ${piece.name} attacks target ${target.name}`);
                await this._board.attackPiece(piece.id, target.id);
            }
            else {
                console.debug(`No attack targets found for ${piece.owner.name}'s ${piece.name}`);
            }
        }
        else {
            console.debug(`${piece.owner.name}'s ${piece.name} cannot attack or has already attacked`);
        }
        if (!piece.moved && piece.canMove) {
            // Special case: if this is a wizard and there are mountable units
            // adjacent, mount one of them
            if (piece.type === UnitType.Wizard && piece.currentMount == null) {
                const mountablePieces: Piece[] =
                    this._board.getAdjacentPiecesAtPosition(
                        piece.position,
                        (p: Piece) => {
                            return piece.canMountPiece(p); // Can mount the piece
                        }
                    );
                if (mountablePieces.length > 0) {
                    const mountable: Piece =
                        Phaser.Math.RND.pick(mountablePieces);
                    console.debug(`${piece.owner.name}'s ${piece.name} mounts ${mountable.owner.name}'s ${mountable.name}`);
                    await this._board.mountPiece(piece.id, mountable.id);
                    // Select the mountable if it can attack or ranged attack
                    if ((mountable.canAttack && !mountable.attacked) || (mountable.canRangedAttack && !mountable.rangedAttacked)) {
                        await this._board.selectPiece(mountable.id);
                    }
                    return true;
                }
                else {
                    console.debug(`No friendly mountables found for ${piece.owner.name}'s ${piece.type}`);
                }
            }

            // Move to a random reachable position
            const reachableTiles: Phaser.Geom.Point[] = Array.from(
                this._board.moveGizmo.getAllValidPaths().values()
            ).map((path: Path) => {
                return path.nodes.at(-1)!.pos;
            }).filter((pt: Phaser.Geom.Point) => {
                // Ignore tile the piece is currently on
                return !(pt.x === piece.position.x && pt.y === piece.position.y);
            });
            if (reachableTiles.length === 0) {
                console.debug(`No reachable tiles for ${piece.owner.name}'s ${piece.name}`);
                this._board.sound.play("cancel");
                return false;
            }
            const movePt: Phaser.Geom.Point =
                Phaser.Math.RND.pick(reachableTiles);
            console.debug(`${piece.owner.name}'s ${piece.name} moves to (${movePt.x}, ${movePt.y})`);
            await this._board.movePiece(piece.id, movePt);
            if (piece.engaged) {
                console.debug(`${piece.owner.name}'s ${piece.name} is now engaged after moving`);
                await this.moveUnit(piece);
            }
        }
        if (!piece.rangedAttacked && piece.canRangedAttack) {
            // Try to attack a random target in range
            const rangedTargets: Piece[] = this._board.pieces
                .filter((p: Piece) => {
                    return (
                        p.owner !== this._player && // Enemy piece
                        p.stats.combat > 0 && // Can potentially deal damage back
                        !p.currentMount && // Not mounted (can't target riders without killing the mount first)
                        (!p.hasStatus(UnitStatus.Undead) ||
                            piece.hasStatus(UnitStatus.AttackUndead) ||
                            piece.hasStatus(UnitStatus.Undead)) && // Can be attacked
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
                    Phaser.Math.RND.weightedPick(rangedTargets);
                console.debug(`${piece.owner.name}'s ${piece.name} performs ranged attack on target ${target.name}`);
                await this._board.rangedAttackPiece(piece.id, target.id);
                return true;
            }
            else {
                console.debug(`No ranged attack targets found for ${piece.owner.name}'s ${piece.name}`);
            }
        } else {
            console.debug(`${piece.owner.name}'s ${piece.name} cannot ranged attack or has already ranged attacked`);
        }
        
        return true;
    }

    /**
     * Moves all units for the computer wizard. This includes moving, attacking,
     * and ranged attacking as appropriate.
     */
    async moveAllUnits(): Promise<void> {
        this._board.cursor.enabled = false;
        try {
            const pieces: Piece[] = this._board
                .getPiecesByOwner(this._player)
                .filter((p: Piece) => {
                    return (
                        !p.currentMount && // Not mounted - mounted units move with their mounts
                        (
                            (!p.moved && p.canMove) || // Is able to move
                            (!p.attacked && (p.canAttack || p.canRangedAttack)) // Is able to attack
                        ) 
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
                await this.moveUnit(piece);
                piece.turnOver = true;
            }
        } finally {
            this._board.cursor.enabled = true;
        }
    }
}
