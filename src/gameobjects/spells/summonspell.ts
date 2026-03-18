import { Board } from "../board";
import { SpellConfig } from "../configs/spellconfig";
import { EffectType } from "../effectemitter";
import { Colour } from "../enums/colour";
import { SpellTarget } from "../enums/spelltarget";
import { SpellType } from "../enums/spelltype";
import { UnitRangedProjectileType } from "../enums/unitrangedprojectiletype";
import { UnitType } from "../enums/unittype";
import { UnitConfig } from "../interfaces/ui";
import { Piece } from "../piece";
import { Player } from "../player";
import { Spell } from "./spell";
import { Geom, Math as PMath } from "phaser";
import { UnitStatus } from "../enums/unitstatus";

/**
 * A spell that summons a unit onto the board.
 */
export class SummonSpell extends Spell {

    protected _illusion: boolean;

    constructor(board: Board, id: number, config: SpellConfig) {
        super(board, id, config);
        this._illusion = false;
        this._type = SpellType.Summon;
    }

    get unitId(): string {
        return this._properties.unitId || this._properties.unit?.id || "";
    }

    get spellFrame(): number {
        return this._properties.spellFrame ?? 0;
    }

    get unitProperties(): UnitConfig {
        return Piece.getUnitConfig(this.unitId);
    }

    get illusion() {
        return this._illusion;
    }

    set illusion(state: boolean) {
        this._illusion = state;
    }

    get allowIllusion(): boolean {
        return (
            (
                this._properties.allowIllusion === undefined || // Default to true
                this._properties.allowIllusion === true 
            )
        );
    }

    get description(): string {
        let description: string = "";

        const unitConfig: any = Piece.getUnitConfig(this.unitId);
        
        if (this.castTimes === 1)  {
            description += ` Summon ${unitConfig.indefiniteArticle || (/^[aeiou]/i.test(unitConfig.name) ? "an" : "a")} ${unitConfig.name}.`;
        }
        if (unitConfig?.status?.includes("undead")) {
            description += ` Undead units cannot usually be attacked by the living.`;
        }
        if (unitConfig?.status?.includes("mount")) {
            if (unitConfig?.status?.includes("struct")) {
                description += ` Can be occupied by the owning wizard.`;
            }
            else {  
                description += ` Can be ridden by the owning wizard.`;
            }
        }
        if (unitConfig?.status?.includes("expires")) {
            description += ` Has a random chance to expire each turn.`;
            if (unitConfig?.status?.includes("expiresGivesSpell")) {
                description += ` Will only expire if a wizard is currently mounted, and upon doing so, grants a new spell to that player.`;
            }
        }

        return `${description} ${super.description}`.trim();
    }

    protected roll(): boolean {
        return this.illusion || this._board.rollChance(this.chance)
    }

    getValidTarget(target: Geom.Point | Piece, showReason?: boolean): Geom.Point | null {
        if (Piece.isPiece(target)) {
            if (showReason) {
                this._board.logger.log(
                    `${this.name} cannot be cast in occupied positions`,
                    Colour.Magenta
                );
            }
            return null;
        }
        const targetPoint: Geom.Point = target;
        if (!this.inCastingRange(targetPoint)) {
            if (showReason) {
                this._board.logger.log(
                    `${this.name} target is out of range`,
                    Colour.Magenta
                );
            }
            return null;
        }
        if (!this.canCastAtPosition(targetPoint, showReason)) {
            return null;
        }

        const targetPieces: Piece[] = this._board.getPiecesAtPosition(targetPoint, (piece: Piece) => {
            return !piece.currentMount && !piece.engulfed && !piece.dead;
        });

        // Summon spells
        if (this._properties.target === SpellTarget.Empty) {
            if (targetPieces.length > 0) {
                if (showReason) {
                    this._board.logger.log(
                        `${this.name} must be cast in an empty position`,
                        Colour.Magenta
                    );
                }
                return null;
            }
            return target;
        }

        return null;
    }

    async doCast(
        owner: Player,
        castingPiece: Piece,
        point: Geom.Point
    ): Promise<Piece> {
        const unit: any = Piece.getUnitConfig(this.unitId);

        this._board.sound.play("castloop08");
        await this._board.playEffect(
            EffectType.WizardCasting,
            castingPiece.sprite.getCenter()
        );

        await this._board.playEffect(
            EffectType.WizardCastBeam,
            castingPiece.sprite.getCenter(),
            this._board.getIsoPosition(point),
            castingPiece
        );

        const newPiece: Piece = await this._board.addPiece({
            type: UnitType.Creature,
            x: point.x,
            y: point.y,
            properties: {
                id: this.unitId,
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
                projectileType: unit.projectileType || UnitRangedProjectileType.Arrow,
                status: unit.status || [],
            },
            shadowScale: unit.shadowScale,
            offsetY: unit.offY,
            owner: owner,
            illusion: !!this._illusion,
            group: unit.group || "classicunits",
        });

        this._board.sound.play("spelleffect");
        await this._board.playEffect(
            EffectType.SummonPiece,
            this._board.getIsoPosition(point),
            null,
            newPiece
        );

        newPiece.turnOver = true;

        this._board.logger.log(
            `${owner.name} successfully casts '${this.name}'`,
            Colour.Green
        );

        return newPiece;
    }

    /**
     * Automatically casts this summon spell for the given player, selecting
     * the best available tile each cast based on spell properties and current
     * board state. Called by `ComputerWizard.autoCastSpell` for AI players,
     * and by `Rules.doAutoCastSpell` for auto-placed spells (e.g. Magic Wood
     * cast by a human player).
     *
     * @param player the player casting this spell
     * @returns true if the spell was cast at least partially, false if it had
     *          to be cancelled entirely before any cast succeeded
     */
    async autoCast(player: Player): Promise<boolean> {
        const isSpreading: boolean =
            this.unitProperties?.status?.includes(UnitStatus.Spreads) ?? false;
        const isWall: boolean = this.name === 'Wall';
        const wizardPos: Geom.Point | null = player.castingPiece?.position ?? null;
        // Track the last two wall positions across casts to infer run direction.
        let lastWallPt: Geom.Point | null = null;
        let prevWallPt: Geom.Point | null = null;
        let successfullyCast: boolean = false;

        while (this.castTimes > 0) {
            // Re-collect valid tiles every iteration — board state changes
            // after each cast (e.g. trees cannot be adjacent to other trees).
            const validTiles: Geom.Point[] = [];
            for (let xx = 0; xx < this._board.width; xx++) {
                for (let yy = 0; yy < this._board.height; yy++) {
                    const pt = new Geom.Point(xx, yy);
                    if (this.getValidTarget(pt, false)) {
                        validTiles.push(pt);
                    }
                }
            }

            if (!validTiles.length) {
                console.debug(`${player.name} has no valid tiles to cast ${this.name}`);
                if (successfullyCast) {
                    player.discardSpell();
                }
                this._board.sound.play("cancel");
                return false;
            }

            let chosenTile: Geom.Point;

            if (isSpreading &&
                this._board.rollChance(0.5 + (player.ai?.difficulty ?? 0) * 0.5)) {
                chosenTile = this.selectSpreadingTile(player, wizardPos, validTiles);
            } else if (this.properties.autoPlace) {
                chosenTile = this.selectMagicWoodTile(wizardPos, validTiles);
            } else if (this.properties.tree &&
                this.unitProperties?.properties.com > 0) {
                chosenTile = this.selectShadowWoodTile(player, wizardPos, validTiles);
            } else if (isWall) {
                const result = this.trySelectWallTile(
                    player, wizardPos, validTiles, lastWallPt, prevWallPt
                );
                if (result === null) {
                    console.debug(
                        `${player.name} cancelled remaining wall casts — ` +
                        `all valid tiles are adjacent to wizard`
                    );
                    if (successfullyCast) {
                        player.discardSpell();
                    } else {
                        this._board.sound.play("cancel");
                    }
                    return successfullyCast;
                }
                prevWallPt = lastWallPt;
                lastWallPt = result;
                chosenTile = result;
            } else {
                console.debug(
                    `${player.name} is casting ${this.name} with no special ` +
                    `placement, ${validTiles.length} valid tiles`
                );
                chosenTile = PMath.RND.pick(validTiles);
            }

            await this._board.rules.doCastSpell(this._board, chosenTile);
            successfullyCast = true;
        }

        if (successfullyCast) {
            player.discardSpell();
        }
        return true;
    }

    /**
     * Selects a tile for a spreading unit (e.g. Gooey Blob). Prefers tiles
     * near enemies so the spread engulfs them; falls back to tiles far from
     * the wizard when no enemies are present.
     */
    private selectSpreadingTile(
        player: Player,
        wizardPos: Geom.Point | null,
        validTiles: Geom.Point[]
    ): Geom.Point {
        const enemies: Piece[] = this._board.pieces.filter(
            (p: Piece) => p.owner !== player && !p.dead
        );
        if (enemies.length > 0) {
            validTiles.sort((a, b) => {
                const nearestA = Math.min(
                    ...enemies.map(e => Board.distance(a, e.position))
                );
                const nearestB = Math.min(
                    ...enemies.map(e => Board.distance(b, e.position))
                );
                return nearestA - nearestB; // ascending: closest to enemy first
            });
        } else if (wizardPos) {
            // No enemies — at least cast away from ourselves
            validTiles.sort((a, b) =>
                Board.distance(b, wizardPos) - Board.distance(a, wizardPos)
            );
        }
        return PMath.RND.weightedPick(validTiles); // favours earlier (better) entries
    }

    /**
     * Selects a tile for Magic Wood. Clusters trees near the casting wizard
     * so the wizard can quickly mount them for protection or escape.
     * The no-adjacent-tree rule prevents over-clustering.
     */
    private selectMagicWoodTile(
        wizardPos: Geom.Point | null,
        validTiles: Geom.Point[]
    ): Geom.Point {
        if (wizardPos) {
            validTiles.sort((a, b) =>
                Board.distance(a, wizardPos) - Board.distance(b, wizardPos)
            );
        }
        // Favour closer tiles much more heavily to create tight clusters
        return Board.weightedRandomPick(validTiles, -4);
    }

    /**
     * Selects a tile for Shadow Wood. Scores tiles by how well they block
     * enemy line-of-sight to the wizard, and by proximity to enemies so the
     * trees can attack them in melee each turn.
     */
    private selectShadowWoodTile(
        player: Player,
        wizardPos: Geom.Point | null,
        validTiles: Geom.Point[]
    ): Geom.Point {
        const enemies: Piece[] = this._board.pieces.filter(
            (p: Piece) => p.owner !== player && !p.dead
        );
        if (enemies.length > 0 && wizardPos) {
            const scores: Map<Geom.Point, number> = new Map();
            for (const tile of validTiles) {
                let score = 0;
                for (const enemy of enemies) {
                    score += this.scoreLoSBlock(tile, enemy.position, wizardPos);
                    // Proximity bonus: Shadow Wood attacks adjacent enemies
                    score += Math.max(0, 3 - Board.distance(tile, enemy.position));
                }
                scores.set(tile, score);
            }
            // Sort descending — best tile at index 0 for weightedPick
            validTiles.sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
        }
        // Favour higher-scoring tiles, but still allow some randomness so
        // placement isn't too predictable
        return Board.weightedRandomPick(validTiles, -4);
    }

    /**
     * Attempts to select a tile for a Wall segment. Hard-filters tiles
     * adjacent to the wizard (Chebyshev ≤ 1) to prevent self-enclosure,
     * then scores remaining candidates for LoS blocking and contiguity with
     * the previous segment.
     *
     * Returns null when no safe candidates exist — the caller should cancel
     * remaining wall casts in that case rather than falling back to unsafe tiles.
     */
    private trySelectWallTile(
        player: Player,
        wizardPos: Geom.Point | null,
        validTiles: Geom.Point[],
        lastWallPt: Geom.Point | null,
        prevWallPt: Geom.Point | null
    ): Geom.Point | null {
        const candidates: Geom.Point[] = wizardPos
            ? validTiles.filter(t =>
                Math.max(
                    Math.abs(t.x - wizardPos.x),
                    Math.abs(t.y - wizardPos.y)
                ) > 1
            )
            : validTiles.slice();

        if (candidates.length === 0) {
            return null;
        }

        const difficulty: number = player.ai?.difficulty ?? 0.5;
        const enemies: Piece[] = this._board.pieces.filter(
            (p: Piece) => p.owner !== player && !p.dead
        );

        if (enemies.length > 0 && wizardPos &&
            this._board.rollChance(0.3 + difficulty * 0.7)) {

            // Infer run direction from the previous two wall positions
            let wallDirX = 0;
            let wallDirY = 0;
            if (lastWallPt && prevWallPt) {
                wallDirX = lastWallPt.x - prevWallPt.x;
                wallDirY = lastWallPt.y - prevWallPt.y;
            }

            const scores: Map<Geom.Point, number> = new Map();
            for (const tile of candidates) {
                let score = 0;

                // LoS-blocking score
                for (const enemy of enemies) {
                    score += this.scoreLoSBlock(tile, enemy.position, wizardPos);
                }

                // Contiguity: prefer tiles touching the last placed wall
                if (lastWallPt) {
                    const chebyDist = Math.max(
                        Math.abs(tile.x - lastWallPt.x),
                        Math.abs(tile.y - lastWallPt.y)
                    );
                    if (chebyDist === 1) {
                        score += 4;
                        // Direction: reward straight runs and clean 90-degree turns
                        if (wallDirX !== 0 || wallDirY !== 0) {
                            const tdx = tile.x - lastWallPt.x;
                            const tdy = tile.y - lastWallPt.y;
                            if (tdx === wallDirX && tdy === wallDirY) {
                                score += 3; // straight continuation
                            } else if (tdx * wallDirX + tdy * wallDirY === 0) {
                                score += 1; // 90-degree turn
                            }
                        }
                    }
                }

                scores.set(tile, score);
            }
            candidates.sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
        }

        return Board.weightedRandomPick(candidates, -8); // favour higher-scoring tiles, but with some randomness
    }

    /**
     * Scores a candidate tile by how well it lies on the line segment between
     * `fromPos` (an enemy) and `toPos` (the wizard). Returns a value in [0, 3]:
     * highest when the tile is exactly on the segment, zero when it is more
     * than 1.5 grid units away from it. Used by Shadow Wood and Wall to rank
     * tiles for line-of-sight blocking.
     */
    private scoreLoSBlock(
        tile: Geom.Point,
        fromPos: Geom.Point,
        toPos: Geom.Point
    ): number {
        const ewx = toPos.x - fromPos.x;
        const ewy = toPos.y - fromPos.y;
        const etx = tile.x - fromPos.x;
        const ety = tile.y - fromPos.y;
        const len2 = ewx * ewx + ewy * ewy;
        if (len2 === 0) return 0;
        const proj = (etx * ewx + ety * ewy) / len2;
        if (proj <= 0.05 || proj >= 0.95) return 0;
        const perpDist = Math.hypot(etx - proj * ewx, ety - proj * ewy);
        return Math.max(0, 1.5 - perpDist) * 2;
    }
}