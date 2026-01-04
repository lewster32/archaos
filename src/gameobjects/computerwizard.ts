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
    private _board: Board;

    /**
     * The player this computer wizard is controlling.
     */
    private _player: Player;

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
        // For now, just pick a random spell from the player's spell list
        let spells: Spell[] = this._player.spells.filter((spell: Spell) => {
            // Only consider mobile summon spells for now
            return spell.type === SpellType.Summon;
        });

        if (spells.length === 0) {
            return false;
        }

        // Rank spells by how likely they are to cast to play conservatively
        spells.sort((a, b) => {
            return (a.chance > b.chance) ? -1 : (a.chance < b.chance) ? 1 : 0;
        })

        const pickedSpell: SummonSpell = Phaser.Math.RND.weightedPick(spells) as SummonSpell;
        
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
    }

    /**
     * Casts the currently selected spell.
     */
    async castSpell(): Promise<boolean> {
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
                            const pt: Phaser.Geom.Point = new Phaser.Geom.Point(xx, yy);
                            if (summonSpell.isValidTarget(
                                pt,
                                false
                            )) {
                                validTiles.push(pt);
                            }
                        }
                    }
                    if (validTiles.length === 0) {
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
            }
        }
        return false;
    }

    async moveUnit(piece: Piece): Promise<boolean> {
        await this._board.selectPiece(piece.id);

        if (piece.engaged) {
            // Try to attack the engaged enemy if possible
            const engagedEnemies: Piece[] = this._board.getAdjacentPiecesAtPosition(
                piece.position,
                (p: Piece) => {
                    return p.owner !== this._player && piece.canAttackPiece(p);
                }
            );
            if (engagedEnemies.length > 0) {
                const target: Piece = Phaser.Math.RND.pick(engagedEnemies);
                await this._board.attackPiece(piece.id, target.id);
            }
        }
        if (!piece.attacked && piece.canAttack) {
            // Try to attack a random target in range
            const potentialAttackTargets: Piece[] = this._board.getAdjacentPiecesAtPosition(
                piece.position,
                (p: Piece) => {
                    return p.owner !== this._player && piece.canAttackPiece(p);
                }
            );
            if (potentialAttackTargets.length > 0) {
                const target: Piece = Phaser.Math.RND.pick(potentialAttackTargets);
                await this._board.attackPiece(piece.id, target.id);
            }
        }
        if (!piece.moved && piece.canMove) {
            // Move to a random reachable position
            const reachableTiles: Phaser.Geom.Point[] = Array.from(this._board.moveGizmo.getAllValidPaths().values()).map((path: Path) => {
                return path.nodes.at(-1)!.pos;
            });
            if (reachableTiles.length === 0) {
                return false;
            }
            const movePt: Phaser.Geom.Point = Phaser.Math.RND.pick(reachableTiles);
            await this._board.movePiece(piece.id, movePt);
            if (piece.engaged) {
                await this.moveUnit(piece);
            }
        }
        if (!piece.rangedAttacked && piece.canRangedAttack) {
            // Try to attack a random target in range
            const rangedTargets: Piece[] = this._board.pieces
                .filter((p: Piece) => {
                    return p.owner !== this._player && // Enemy piece
                    piece.canRangedAttackPiece(p) && // In ranged attack range
                    (!p.hasStatus(UnitStatus.Undead) || piece.hasStatus(UnitStatus.AttackUndead) || piece.hasStatus(UnitStatus.Undead)); // Can be attacked
                }).toSorted((a: Piece, b: Piece) => {
                    // Prefer wizard targets
                    if (a.type === UnitType.Wizard && b.type !== UnitType.Wizard) {
                        return -1;
                    }
                    if (a.type !== UnitType.Wizard && b.type === UnitType.Wizard) {
                        return 1;
                    }
                    return 0;
                });
            if (rangedTargets.length > 0) {
                const target: Piece = Phaser.Math.RND.weightedPick(rangedTargets);
                await this._board.rangedAttackPiece(piece.id, target.id);
                return true;
            }
        }

        return true;
    }

    async moveAllUnits(): Promise<boolean> {
        const pieces: Piece[] = this._board.getPiecesByOwner(this._player)
            .filter((p: Piece) => {
                return (!p.moved && p.canMove) || (!p.attacked && (p.canAttack || p.canRangedAttack));
            }); 

        for (const piece of pieces) {
            if (this._board.state === BoardState.GameOver) {
                break;
            }
            await this.moveUnit(piece);
        }
        return true;
    }
}
