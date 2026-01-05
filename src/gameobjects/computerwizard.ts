import { SpellType } from "./enums/spelltype";
import type { Board } from "./board";
import type { Player } from "./player";
import type { Spell } from "./spells/spell";
import type { SummonSpell } from "./spells/summonspell";
import { Piece } from "./piece";
import { Path } from "./rangegizmo";
import { UnitType } from "./enums/unittype";
import { UnitStatus } from "./enums/unitstatus";
import { BoardState } from "./enums/boardstate";

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
     * Creates a new ComputerWizard instance.
     *
     * @param board a reference to the game board
     * @param player the player this computer wizard is controlling
     */
    constructor(board: Board, player: Player) {
        this._board = board;
        this._player = player;
    }

    /**
     * Selects a spell for the computer wizard to cast.
     */
    async selectSpell(): Promise<boolean> {
        this._board.cursor.enabled = false;
        try {
            // For now, just pick a random spell from the player's spell list
            let spells: Spell[] = this._player.spells.filter((spell: Spell) => {
                return (
                    spell.type === SpellType.Summon || spell.type === SpellType.Buff
                );
            });

            if (spells.length === 0) {
                return false;
            }

            // Rank spells by how likely they are to cast to play conservatively
            spells.sort((a, b) => {
                return a.chance > b.chance ? -1 : a.chance < b.chance ? 1 : 0;
            });

            const pickedSpell: SummonSpell = Phaser.Math.RND.weightedPick(
                spells
            ) as SummonSpell;

            // The lower the spell's cast chance, the more likely we are to cast it
            // as an illusion
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
                        if (validTiles.length === 0) {
                            console.debug(`${this._player.name} has no valid tiles to cast ${spell.name}`);
                            return false;
                        }
                        summonPt = Phaser.Math.RND.pick(validTiles);

                        await this._board.rules.doCastSpell(
                            this._board,
                            spell,
                            summonPt
                        );
                    }
                    return true;
                } else if (spell.type === SpellType.Buff) {
                    await this._board.rules.doCastSpell(
                        this._board,
                        spell,
                        this._player.castingPiece
                    );
                    return true;
                }
            }
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
        if (!piece.attacked && piece.canAttack) {
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
            // Special case: if this is a wizard and there are friendly
            // mountables nearby, try to move onto one
            if (piece.type === UnitType.Wizard && piece.currentMount == null) {
                const friendlyMountables: Piece[] =
                    this._board.getAdjacentPiecesAtPosition(
                        piece.position,
                        (p: Piece) => {
                            return (
                                p.owner === this._player && // Friendly piece
                                (p.hasStatus(UnitStatus.Mount) || p.hasStatus(UnitStatus.MountAny)) &&
                                p.currentRider == null && // Is currently riderless
                                !p.currentMount // Not already itself mounted (cue infinite stack of horses)
                            ); 
                        }
                    );
                if (friendlyMountables.length > 0) {
                    const mountable: Piece =
                        Phaser.Math.RND.pick(friendlyMountables);
                    console.debug(`${piece.owner.name}'s ${piece.name} mounts friendly piece ${mountable.name}`);
                    await this._board.mountPiece(piece.id, mountable.id);
                    // Select the mountable in case it can still do something
                    // (typically, a ranged attack after being mounted)
                    await this._board.selectPiece(mountable.id);
                    return true;
                }
                else {
                    console.debug(`No friendly mountables found for ${piece.owner.name}'s ${piece.name}`);
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
                        p.currentMount === null && // Not mounted - mounted units move with their mounts
                        ((!p.moved && p.canMove) || // Is able to move
                            (!p.attacked && (p.canAttack || p.canRangedAttack))) // Is able to attack
                    );
                });

            if (pieces.length === 0) {
                console.debug(`${this._player.name} has no pieces to move`);
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
