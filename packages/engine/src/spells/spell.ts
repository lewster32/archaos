import { Colour } from "../enums/colour";
import { SpellTarget } from "../enums/spelltarget";
import { SpellType } from "../enums/spelltype";
import { UnitStatus } from "../enums/unitstatus";
import { UnitType } from "../enums/unittype";
import { EngineEvent } from "../enums/engineevent";
import { Model } from "../models/model";
import type { SpellConfig } from "../configs/spellconfig";
import type { IRNG } from "../rng";
import { Point } from "../point";
import spellJsonData from "@assets/data/classicspells.json";

import type { Board } from "../board";
import { distance } from "../pathfinding";
import { EffectType } from "../enums/effecttype";
import { Piece } from "../piece";

import type { Player } from "../player";

/**
 * A valid target for spell casting: a point on the
 * board, a piece, or null (for auto-targeting spells).
 */
export type SpellCastTarget<P extends Piece = Piece> = Point | P | null;

/**
 * A spell that can be cast by a player's wizard.
 */
export class Spell<P extends Piece = Piece> extends Model {
    /**
     * All spell configurations loaded from JSON.
     */
    public static readonly spells: { [key: string]: SpellConfig } = spellJsonData as any;

    /**
     * A reference to the game board.
     */
    protected _board: Board<P>;

    /**
     * The type of this spell.
     */
    protected _type: SpellType;

    /**
     * The piece that is casting this spell.
     */
    protected _castingPiece: P;

    /**
     * The raw properties of this spell.
     */
    protected _properties: SpellConfig;

    /**
     * The total number of times this spell can be cast in a turn.
     */
    protected _totalCastTimes: number;

    /**
     * The number of times this spell can still be cast.
     */
    protected _castTimes: number;

    /**
     * Whether the last casting attempt of this spell failed.
     */
    protected _failed: boolean;

    /**
     * The player who owns this spell.
     */
    protected _owner: Player<P>;

    /**
     * Create a new spell.
     *
     * @param board The game board
     * @param id The unique ID of this spell
     * @param config The configuration of this spell
     */
    constructor(board: Board<P>, id: number, config: SpellConfig) {
        super(id);

        if (!config) {
            throw new Error("No spell config provided");
        }
        this._board = board;

        // Derive spell type from properties
        if (config.target === SpellTarget.Self && config.id !== "turmoil") {
            this._type = SpellType.Buff;
        } else if (config.id == "disbelieve") {
            this._type = SpellType.Disbelieve;
        } else {
            this._type = SpellType.Misc;
        }

        this._properties = config;
        this._castTimes = config.castTimes || 1;
        this._totalCastTimes = this._castTimes;
        this._failed = false;
    }

    /**
     * The unique ID of this spell.
     */
    get spellId(): string {
        return this._properties.id;
    }

    /**
     * The name of this spell.
     */
    get name(): string {
        return this._properties.name;
    }

    /**
     * The normalised chance of successfully casting this spell based on the
     * current alignment of the game universe. Clamped between 0.1 and 1 to
     * prevent situations where a spell is impossible to cast.
     *
     * The alignment adjustment itself is handled by the board's `Alignment`
     * instance — see {@link Alignment.adjustChance} for how the original
     * ('classic') and symmetric modes differ.
     *
     * @return The chance of successfully casting this spell
     */
    get chance(): number {
        if (this.balance === 0) {
            return this._properties.chance;
        }
        const adjusted: number = this._board.alignment.adjustChance(this._properties.chance, this.balance);
        return Math.min(Math.max(adjusted, 0.1), 1);
    }

    /**
     * The type of this spell.
     */
    get type(): SpellType {
        return this._type;
    }

    /**
     * The balance alignment of this spell with negative being chaotic and
     * positive being lawful.
     */
    get balance(): number {
        return this._properties.balance;
    }

    /**
     * The range at which this spell can be cast. A range of 0 means it can
     * only be cast on the casting wizard themselves. A range of -1 means it can
     * be cast anywhere on the board. The default range is 1.5, which allows
     * casting on any of the adjacent tiles, i.e. the default behaviour for
     * summon spells.
     */
    get range(): number {
        return this._properties.range ?? 1.5;
    }

    /**
     * If this is true, the spell will not be removed from the caster's spell
     * list after being cast. The out-of-the-box example of this is the
     * 'Disbelieve' spell.
     */
    get persist(): boolean {
        return this._properties.persist || false;
    }

    /**
     * If this is true, the spell requires line of sight to the target in order
     * to be cast.
     */
    get lineOfSight(): boolean {
        return this._properties.lineOfSight || false;
    }

    /**
     * The raw properties of this spell from the JSON data.
     */
    get properties(): SpellConfig {
        return this._properties;
    }

    /**
     * The total number of times this spell can be cast before it is used up.
     * This is for multi-cast spells like 'Magic Wood' etc.
     */
    get totalCastTimes(): number {
        return this._totalCastTimes;
    }

    /**
     * How many times this spell can still be cast. This decrements each time
     * the spell is cast.
     */
    get castTimes(): number {
        return this._castTimes;
    }

    /**
     * Whether the last casting attempt of this spell failed.
     */
    get failed(): boolean {
        return this._failed;
    }

    /**
     * The player who owns this spell.
     */
    get owner(): Player<P> {
        return this._owner;
    }

    /**
     * Set the owner of this spell.
     */
    set owner(owner: Player<P>) {
        this._owner = owner;
        if (this._owner.castingPiece) {
            this._castingPiece = this._owner.castingPiece;
        } else {
            throw new Error("Owner has no casting piece");
        }
    }

    /**
     * A description of this spell. If there's a low chance of casting success,
     * this will include a note about that.
     */
    get description(): string {
        if (this._properties.description) {
            return this._properties.description;
        }
        let description: string = "";
        if (this.chance < 0.3) {
            if (this.balance < 0) {
                description += `<br /><span class='c-magenta'>Unlikely to succeed in casting until the universe is more chaotic.</span>`;
            } else if (this.balance > 0) {
                description += `<br /><span class='c-cyan'>Unlikely to succeed in casting until the universe is more lawful.</span>`;
            } else {
                description += `<br /><span class='c-magenta'>Unlikely to succeed in casting.</span>`;
            }
        }
        if (description) {
            return description.trim();
        }
        return "";
    }

    /**
     * Reset the cast times of this spell back to the total allowed.
     */
    resetCastTimes(): void {
        this._castTimes = this._totalCastTimes;
    }

    /**
     * Check if a point is within casting range of the casting piece.
     *
     * @param point The point to check
     * @returns Whether the point is within casting range
     */
    protected inCastingRange(point: Point): boolean {
        if (this.range < 0) {
            return true;
        }
        if (this.range === 0) {
            return Point.equals(this._castingPiece.position, point);
        }
        if (!this._castingPiece) {
            console.error("Spell has no casting piece");
            return false;
        }
        const casterPosition: Point = Point.clone(this._castingPiece.position);
        if (distance(casterPosition, point) > this.range) {
            return false;
        }
        return true;
    }

    /**
     * Check if the spell can be cast at the given position.
     *
     * @param point The position to check
     * @param showReason Whether to log the reason if the spell cannot be cast
     * @returns Whether the spell can be cast at the given position
     */
    protected canCastAtPosition(point: Point, showReason?: boolean): boolean {
        if (this.lineOfSight && !this._board.hasLineOfSight(this._castingPiece.position, point)) {
            if (showReason) {
                this._board.logger.log(`${this.name} requires line of sight to target`, Colour.Magenta);
            }
            return false;
        }
        if (this._properties.tree) {
            const neighbourTrees: P[] = this._board.getAdjacentPiecesAtPosition(point, (p: P) =>
                p.hasStatus(UnitStatus.Tree),
            );
            if (neighbourTrees.length > 0) {
                if (showReason) {
                    this._board.logger.log(`${this.name} cannot be cast adjacent to another tree`, Colour.Magenta);
                }
                return false;
            }
        }
        return true;
    }

    /**
     * Validate the target for this spell.
     *
     * @param target The target point to validate
     * @param showReason Whether to log the reason if the target is invalid
     * @returns The valid target point or piece, or null if invalid
     */
    getValidTarget(target: Point | P, showReason?: boolean): SpellCastTarget<P> {
        const targetPoint: Point = Point.isPoint(target) ? target : target.position;
        const targetPiece: P = Piece.isPiece(target) ? target : null;

        if (!this.inCastingRange(targetPoint)) {
            if (showReason) {
                this._board.logger.log(`${this.name} target is out of range`, Colour.Magenta);
            }
            return null;
        }
        if (!this.canCastAtPosition(targetPoint, showReason)) {
            return null;
        }
        // Only find actively targetable pieces
        const targetPieces: P[] = (targetPiece ? [targetPiece] : this._board.getPiecesAtPosition(targetPoint)).filter(
            (piece: P) => {
                return (
                    !piece.currentMount && // Cannot directly target mounted pieces
                    !piece.engulfed
                ); // Nor engulfed pieces
            },
        );

        const targetLivingPiece: P = targetPieces.find((piece: P) => !piece.dead);

        if (this._properties.target === SpellTarget.Self) {
            const wizard: P = targetPieces.find((piece: P) => piece.type === UnitType.Wizard);
            if (wizard?.owner !== this._owner) {
                if (showReason) {
                    this._board.logger.log(`${this.name} can only be cast on your own wizard`, Colour.Magenta);
                }
                return null;
            }
            return wizard;
        }

        // Corpse spells (e.g., raise dead)
        if (this._properties.target === SpellTarget.Corpse) {
            if (
                targetLivingPiece || // Cannot target living pieces
                this._board.getPiecesAtPosition(targetPoint, (p: P) => !p.dead).length > 0 // Cannot target if any living pieces are present on the same tile
            ) {
                if (showReason) {
                    this._board.logger.log(`${this.name} must be cast on a corpse`, Colour.Magenta);
                }
                return null;
            }
            return targetPieces.find((piece: P) => piece.dead);
        }

        // Living target spells (e.g., disbelieve, magic bolt etc.)
        if (!targetLivingPiece) {
            if (showReason) {
                if (targetPieces.filter((p: P) => p.dead).length === 0) {
                    this._board.logger.log(`${this.name} cannot be cast on empty ground`, Colour.Magenta);
                } else {
                    this._board.logger.log(`${this.name} cannot be cast on a corpse`, Colour.Magenta);
                }
            }
            return null;
        }

        const targetEnemyLivingPiece: P = targetLivingPiece.owner === this._owner ? null : targetLivingPiece;
        const targetEnemyWizard: P = targetEnemyLivingPiece?.type === UnitType.Wizard ? targetEnemyLivingPiece : null;

        if (this._properties.target === SpellTarget.Piece) {
            if (this.properties.castOnEnemyUnit) {
                if (!targetEnemyLivingPiece) {
                    if (showReason) {
                        this._board.logger.log(`${this.name} must be cast on an enemy unit`, Colour.Magenta);
                    }
                    return null;
                }
                if (!this.properties.castOnWizard && targetEnemyWizard) {
                    if (showReason) {
                        this._board.logger.log(`${this.name} cannot be cast on a wizard`, Colour.Magenta);
                    }
                    return null;
                }
                if (this.type === SpellType.Disbelieve) {
                    const disbelievableTarget: P = targetEnemyLivingPiece.canBeDisbelieved
                        ? targetEnemyLivingPiece
                        : null;
                    if (!disbelievableTarget) {
                        if (showReason) {
                            this._board.logger.log(`${this.name} cannot be cast on this unit`, Colour.Magenta);
                        }
                        return null;
                    }
                    return disbelievableTarget;
                }
                if (this.properties.id === "subversion") {
                    const subversionTarget: P = targetEnemyLivingPiece.canBeSubverted ? targetEnemyLivingPiece : null;
                    if (!subversionTarget) {
                        if (showReason) {
                            this._board.logger.log(`${this.name} cannot be cast on this unit`, Colour.Magenta);
                        }
                        return null;
                    }
                    return subversionTarget;
                }
                if (this.properties.damage > 0) {
                    if (targetEnemyLivingPiece?.hasStatus(UnitStatus.Invulnerable)) {
                        if (showReason) {
                            this._board.logger.log(
                                `${this.name} cannot be cast on an invulnerable unit`,
                                Colour.Magenta,
                            );
                        }
                        return null;
                    }
                    if (!targetEnemyLivingPiece?.canBeMagicAttacked) {
                        if (showReason) {
                            this._board.logger.log(
                                `${this.name} cannot be cast on a unit protected from magical attacks`,
                                Colour.Magenta,
                            );
                        }
                        return null;
                    }
                }

                return targetEnemyLivingPiece;
            } else if (this.properties.castOnFriendlyUnit) {
                if (targetEnemyLivingPiece) {
                    if (showReason) {
                        this._board.logger.log(`${this.name} must be cast on a friendly unit`, Colour.Magenta);
                    }
                    return null;
                }
                return targetLivingPiece;
            }
        }

        return null;
    }

    /**
     * Roll to determine if the spell casting is successful.
     *
     * @returns Whether the spell casting is successful
     */
    protected roll(): boolean {
        return this._board.rollChance(this.chance, this._owner);
    }

    /**
     * Cast this spell.
     *
     * @param owner The player casting the spell
     * @param castingPiece The piece casting the spell
     * @param target The target point or piece of the spell
     * @returns The result of the spell cast
     */
    async cast(owner: Player<P>, castingPiece: P, target?: Point | P): Promise<P | boolean | null> {
        let castPoint: Point;
        let castPiece: P;
        if (Point.isPoint(target)) {
            castPoint = Point.clone(target);
        } else if (Piece.isPiece(target)) {
            castPiece = target;
            castPoint = Point.clone(target.position);
        }

        // We only want to roll on the first cast of multi-cast spells -
        // the outcome is sealed up-front so doCast can play the full
        // visual sequence without a hitch at the moment of impact.
        if (this._castTimes === this._totalCastTimes) {
            if (this.roll()) {
                this._board.alignment.shift(this.balance);
            } else {
                this._failed = true;
            }
        }
        this._castTimes--;

        const result = await this.doCast(owner, castingPiece, castPoint, [castPiece]);
        return this._failed ? null : result;
    }

    /**
     * The actual implementation of the spell casting logic.
     *
     * @param owner The player casting the spell
     * @param castingPiece The piece casting the spell
     * @param point The target point of the spell
     * @param targets The target pieces of the spell
     * @returns The result of the spell cast
     */
    async doCast(_owner: Player<P>, _castingPiece: P, _point?: Point, _targets?: P[]): Promise<P | boolean | null> {
        return false;
    }

    /**
     * Play the cast-failure fizzle and log the failure. Subclass doCasts
     * invoke this from their failure branch:
     *
     * - Piece-target spells (attacks, subversion, etc.) call it at the
     *   START of doCast with no `castPoint`, so the spell's specific
     *   visuals are suppressed and the fizzle lands on the wizard.
     * - Self-cast spells and summons call it at the END of doCast with
     *   `castPoint` set, so the spell's full visual sequence plays and
     *   then the fizzle lands at the target tile (or the wizard tile for
     *   self-cast).
     *
     * Consumes any remaining cast times so multi-cast spells stop after a
     * single failed attempt. `_failed` is already set by `cast()` before
     * `doCast` runs - subclasses only invoke this when `_failed` is true.
     *
     * @param owner The player casting the spell
     * @param castingPiece The piece casting the spell
     * @param castPoint The target tile of the cast, if any. When absent or
     *     equal to the caster's tile, the fizzle plays on the wizard.
     */
    async castFail(owner: Player<P>, castingPiece: P, castPoint?: Point): Promise<void> {
        this._castTimes = 0;

        const isSelfTarget =
            !castPoint || (castPoint.x === castingPiece.position.x && castPoint.y === castingPiece.position.y);

        if (isSelfTarget) {
            await this._board.events.emitAsync(EngineEvent.EffectRequested, {
                type: EffectType.WizardCastFail,
                pieceId: castingPiece.id,
            });
        } else {
            await this._board.events.emitAsync(EngineEvent.EffectRequested, {
                type: EffectType.WizardCastFail,
                targetPosition: { x: castPoint.x, y: castPoint.y },
            });
        }

        this._board.logger.log(`${owner.name} failed to cast ${this.name}`, Colour.Magenta);
        await this._board.idleDelay();
    }

    /**
     * Show the range of this spell on the board.
     */
    async showRange(show: boolean): Promise<void> {
        if (show) {
            this._board.events.emit(EngineEvent.ShowCastRange, {
                position: this._castingPiece.position,
                range: this.range,
                lineOfSight: this.lineOfSight,
            });
            return;
        }
        this._board.events.emit(EngineEvent.ResetCastRange);
    }

    /**
     * Check if there are any valid targets in range for this spell.
     *
     * @returns True if there are valid targets in range, false otherwise
     */
    public hasValidTargetsInRange(): boolean {
        // If range is 0 we can always target self
        if (this.range === 0) {
            return true;
        }
        if (this.type === SpellType.Buff || this.type === SpellType.Summon) {
            // Buffs and summons can always be cast in range
            return true;
        }
        // Any other range requires checking all pieces on the board for valid
        // targets
        for (let piece of this._board.pieces) {
            if (this.getValidTarget(piece)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get a random spell configuration.
     *
     * @param rng the PRNG instance to use for selection
     * @param gifted Whether the spell is being gifted (allows certain spells)
     * @param filter Optional filter function to select spells
     * @returns A random spell configuration
     */
    static getRandomSpell(rng: IRNG, gifted?: boolean, filter?: (spell: SpellConfig) => boolean): any {
        if (!filter) {
            filter = () => true;
        }
        const spellNames: string[] = Object.values(Spell.spells)
            .filter(filter)
            .filter((spell: SpellConfig) => {
                // Exclude persistent spells like Disbelieve
                if (spell.persist) {
                    return false;
                }
                // All other spells are allowed if gifted
                if (gifted) {
                    return true;
                }
                // Exclude gift-only spells if not gifted
                return !spell.giftOnly;
            })
            .map((spell: SpellConfig) => spell.name);

        return Spell.getSpellProperties(rng.pick(spellNames));
    }

    /**
     * Get all spell configurations.
     *
     * @returns All spell configurations
     */
    static getAllSpells(): SpellConfig[] {
        return Object.values(Spell.spells);
    }

    /**
     * Get all spells of a given type.
     *
     * @param type The type of spells to get
     * @returns The spell configurations of the given type
     */
    static getSpellsByType(type: SpellType): string[] {
        const spellsByType: Set<string> = new Set<string>();
        for (let spell of Object.values(Spell.spells)) {
            if (spell.unitId && type === SpellType.Summon) {
                spellsByType.add(spell.name);
                continue;
            }
            if (spell.damage && type === SpellType.Attack) {
                spellsByType.add(spell.name);
                continue;
            }
            if (spell.target === SpellTarget.Self && type === SpellType.Buff) {
                spellsByType.add(spell.name);
                continue;
            }
            // Misc spells are anything that doesn't fit the other types
            if (type === SpellType.Misc) {
                spellsByType.add(spell.name);
            }
        }
        return Array.from(spellsByType);
    }

    /**
     * Get the spell properties for a given spell name.
     *
     * @param name The name of the spell
     * @returns The properties of the spell
     */
    static getSpellProperties(name: string): any {
        let key = "";
        for (let [k, spell] of Object.entries(Spell.spells)) {
            if (spell.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const spell: SpellConfig = (Spell.spells as any)[key];

        return {
            id: key,
            name: spell.name,
            description: spell.description,
            chance: spell.chance,
            balance: spell.balance,
            unitId: spell.unitId,
            spellFrame: spell.spellFrame,
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
            target: spell.target || SpellTarget.Empty,
            group: spell.group || "classicspells",
            types: spell.types || [],
        };
    }
}
