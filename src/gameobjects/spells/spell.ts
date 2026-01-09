import { spells } from "../../../assets/data/classicspells.json";
import { Board } from "../board";
import { EffectType } from "../effectemitter";
import { Colour } from "../enums/colour";
import { SpellTarget } from "../enums/spelltarget";
import { SpellType } from "../enums/spelltype";
import { UnitStatus } from "../enums/unitstatus";
import { UnitType } from "../enums/unittype";
import { Model } from "../model";
import { Piece } from "../piece";
import type { SpellConfig } from "../configs/spellconfig";
import type { Player } from "../player";
import { CursorType } from "../enums/cursortype";

/**
 * A spell that can be cast by a player's wizard.
 */
export class Spell extends Model {
    protected _board: Board;
    protected _type: SpellType;

    protected _castingPiece: Piece;
    protected _properties: SpellConfig;
    protected _totalCastTimes: number;
    protected _castTimes: number;
    protected _failed: boolean;

    protected _owner: Player;

    constructor(
        board: Board,
        id: number,
        config: SpellConfig,
    ) {
        super(id);

        if (!config) {
            throw new Error("No spell config provided");
        }
        this._board = board;

        if (config.target === SpellTarget.Self && config.id !== "turmoil") {
            this._type = SpellType.Buff;
        }
        else if (config.id == "disbelieve") {
            this._type = SpellType.Disbelieve;
        }
        else {
            this._type = SpellType.Misc;
        }

        this._properties = config;
        this._castTimes = config.castTimes || 1;
        this._totalCastTimes = this._castTimes;
        this._failed = false;
    }

    get spellId(): string {
        return this._properties.id;
    }

    get name(): string {
        return this._properties.name;
    }

    /**
     * The normalised chance of successfully casting this spell based on the
     * current balance of the game world. Clamped between 0.1 and 1 to prevent
     * situations where a spell is impossible to cast.
     * 
     * @return The chance of successfully casting this spell
     */
    get chance(): number {
        if (this.balance === 0) {
            return this._properties.chance;
        }
        let balanceOffset = this._board.balance;
        if (this.balance < 0) {
            balanceOffset *= -1;
        }
        return Phaser.Math.Clamp(
            this._properties.chance + balanceOffset,
            0.1,
            1
        );
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
    get owner(): Player {
        return this._owner;
    }

    /**
     * Set the owner of this spell.
     */
    set owner(owner: Player) {
        this._owner = owner;
        if (this._owner.castingPiece) {
            this._castingPiece = this._owner.castingPiece;
        }
        else {
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
                description += `<br /><span class='c-magenta'>Unlikely to succeed in casting until the world is more chaotic.</span>`;   
            }
            else if (this.balance > 0) {
                description += `<br /><span class='c-cyan'>Unlikely to succeed in casting until the world is more lawful.</span>`;   
            }
            else {
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
    protected inCastingRange(
        point: Phaser.Geom.Point
    ): boolean {
        if (this.range < 0) {
            return true;
        }
        if (this.range === 0) {
            return Phaser.Geom.Point.Equals(this._castingPiece.position, point);
        }
        if (!this._castingPiece) {
            console.error("Spell has no casting piece");
            return false;
        }
        const casterPosition: Phaser.Geom.Point = Phaser.Geom.Point.Clone(
            this._castingPiece.position
        );
        if (Board.distance(casterPosition, point) > this.range) {
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
    protected canCastAtPosition(point: Phaser.Geom.Point, showReason?: boolean): boolean {
        if (this.lineOfSight && !this._board.hasLineOfSight(this._castingPiece.position, point)) {
            if (showReason) {
                this._board.logger.log(
                    `${this.name} requires line of sight to target`,
                    Colour.Magenta
                );
            }
            return false;
        }
        if (this._properties.tree) {
            const neighbourTrees: Piece[] =
                this._board.getAdjacentPiecesAtPosition(point, (p: Piece) =>
                    p.hasStatus(UnitStatus.Tree)
                );
            if (neighbourTrees.length > 0) {
                if (showReason) {
                    this._board.logger.log(
                        `${this.name} cannot be cast adjacent to another tree`,
                        Colour.Magenta
                    );
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
    isValidTarget(target: Phaser.Geom.Point, showReason?: boolean): Phaser.Geom.Point | Piece | null {
        if (!this.inCastingRange(target)) {
            if (showReason) {
                this._board.logger.log(
                    `${this.name} target is out of range`,
                    Colour.Magenta
                );
            }
            return null;
        }
        if (!this.canCastAtPosition(target, showReason)) {
            return null;
        }
        // Only find actively targetable pieces
        const targetPieces: Piece[] = this._board.getPiecesAtPosition(target, (piece: Piece) => {
            return !piece.currentMount && !piece.engulfed;
        });
        const targetLivingPiece: Piece = targetPieces.find((piece: Piece) => !piece.dead);

        if (this._properties.target === SpellTarget.Self) {
            const wizard: Piece = targetPieces.find((piece: Piece) => piece.type === UnitType.Wizard);
            if (!wizard) {
                if (showReason) {
                    this._board.logger.log(
                        `${this.name} can only be cast on your own wizard`,
                        Colour.Magenta
                    );
                }
                return null;
            }
            return wizard;
        }

        // Corpse spells (e.g., raise dead)
        if (this._properties.target === SpellTarget.Corpse) {
            if (targetLivingPiece) {
                if (showReason) {
                    this._board.logger.log(
                        `${this.name} must be cast on a corpse`,
                        Colour.Magenta
                    );
                }
                return null;
            }
            return targetPieces.find((piece: Piece) => piece.dead);
        }

        // Living target spells (e.g., disbelieve, magic bolt etc.)
        if (!targetLivingPiece) {
            if (showReason) {
                if (targetPieces.filter((p: Piece) => p.dead).length === 0) {
                    this._board.logger.log(
                        `${this.name} cannot be cast on empty ground`,
                        Colour.Magenta
                    );
                } else {
                    this._board.logger.log(
                        `${this.name} cannot be cast on a corpse`,
                        Colour.Magenta
                    );
                }
            }
            return null;
        }
        
        const targetEnemyLivingPiece: Piece = targetLivingPiece.owner === this._owner ? null : targetLivingPiece;
        const targetEnemyWizard: Piece = targetEnemyLivingPiece?.type === UnitType.Wizard ? targetEnemyLivingPiece : null;

        if (this._properties.target === SpellTarget.Piece) {
            if (this.properties.castOnEnemyUnit) {
                if (!targetEnemyLivingPiece) {
                    if (showReason) {
                        this._board.logger.log(
                            `${this.name} must be cast on an enemy unit`,
                            Colour.Magenta
                        );
                    }
                    return null;
                }
                if (!this.properties.castOnWizard && targetEnemyWizard) {
                    if (showReason) {
                        this._board.logger.log(
                            `${this.name} cannot be cast on a wizard`,
                            Colour.Magenta
                        );
                    }
                    return null;
                }
                if (this.type === SpellType.Disbelieve) {
                    const disbelievableTarget: Piece = targetEnemyLivingPiece.canDisbelieve ? targetEnemyLivingPiece : null;
                    if (!disbelievableTarget) {
                        if (showReason) {
                            this._board.logger.log(
                                `${this.name} cannot be cast on this unit`,
                                Colour.Magenta
                            );
                        }
                        return null;
                    }
                    return disbelievableTarget;
                }
                if (this.properties.id === "subversion") {
                    const subversionTarget: Piece = targetEnemyLivingPiece.canBeSubverted ? targetEnemyLivingPiece : null;
                    if (!subversionTarget) {
                        if (showReason) {
                            this._board.logger.log(
                                `${this.name} cannot be cast on this unit`,
                                Colour.Magenta
                            );
                        }
                        return null;
                    }
                    return subversionTarget;
                }
                if (this.properties.damage > 0 && targetEnemyLivingPiece?.hasStatus(UnitStatus.Invulnerable)) {
                    if (showReason) {
                        this._board.logger.log(
                            `${this.name} cannot be cast on an invulnerable unit`,
                            Colour.Magenta
                        );
                    }
                    return null;
                }

                return targetEnemyLivingPiece;
            }
            else if (this.properties.castOnFriendlyUnit) {
                if (targetEnemyLivingPiece) {
                    if (showReason) {
                        this._board.logger.log(
                            `${this.name} must be cast on a friendly unit`,
                            Colour.Magenta
                        );
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
        return this._board.rollChance(this.chance);
    }

    /**
     * Cast this spell.
     * 
     * @param owner The player casting the spell
     * @param castingPiece The piece casting the spell
     * @param target The target point or piece of the spell
     * @returns The result of the spell cast
     */
    async cast(
        owner: Player,
        castingPiece: Piece,
        target?: Phaser.Geom.Point | Piece,
    ): Promise<Piece | boolean | null> {
        let castPoint: Phaser.Geom.Point;
        let castPiece: Piece;
        if (target instanceof Phaser.Geom.Point) {
            castPoint = Phaser.Geom.Point.Clone(target);
        } else if (target instanceof Piece) {
            castPiece = target;
            castPoint = Phaser.Geom.Point.Clone(target.position);
        }

        // We only want to check for failure on the first cast of multi-cast
        // spells - if a player succeeds then they get to cast all remaining
        // times.
        if (this._castTimes === this._totalCastTimes && !this.roll()) {
            await this.castFail(owner, castingPiece);
            return null;
        }
        if (this._castTimes === this._totalCastTimes) {
            // TODO: Check how this shift compares to the real game
            this._board.balanceShift += this.balance * 0.025;
        }
        this._castTimes--;

        return await this.doCast(owner, castingPiece, castPoint, [castPiece]);
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
    async doCast(owner: Player, castingPiece: Piece, point?: Phaser.Geom.Point, targets?: Piece[]): Promise<Piece | boolean | null> {
        if (this.type === SpellType.Disbelieve) {
            const target: Piece = targets.find((p: Piece) => p.canDisbelieve);
            if (!target) {
                return false;
            }
            this._board.sound.play("castloop08");
            await this._board.playEffect(
                EffectType.DisbelieveBeam,
                castingPiece.sprite.getCenter(),
                target.sprite.getCenter(),
                target
            );
            if (target.illusion) {
                this._board.sound.play("disbelieve");
                await target.kill();
                this._board.logger.log(
                    `Disbelieve succeeded on illusionary ${target.name}`
                );
                await this._board.idleDelay(Board.DEFAULT_DELAY);
            }
            else {
                this._board.logger.log(
                    `Disbelieve failed on non-illusionary ${target.name}`,
                    Colour.Magenta
                );
                // Inform AI players that this piece is not an illusion
                this._board.players.forEach((player: Player) => {
                    if (player.ai) {
                        player.ai.rememberNonIllusionPiece(target.id);
                    }
                });
                await this._board.idleDelay(Board.DEFAULT_DELAY);
            }
            return true;
        }

        if (this.properties.id === "raise-dead") {
            const target: Piece = targets.find((p: Piece) => p.dead);
            if (!target) {
                return false;
            }
            this._board.sound.play("castloop08");
            await this._board.playEffect(
                EffectType.RaiseDeadBeam,
                castingPiece.sprite.getCenter(),
                target.sprite.getCenter()
            );
            this._board.sound.play("spelleffect");
            await this._board.playEffect(
                EffectType.RaiseDeadHit,
                target.sprite.getCenter(),
                null,
                target
            );
            await target.raiseDead(this.owner);
            this._board.logger.log(
                `${target.name} was reanimated and now belongs to ${owner.name}`,
                Colour.LightBlue
            );
                
            await this._board.idleDelay(Board.DEFAULT_DELAY);
            return true;
        }

        if (this.properties.id === "subversion") {
            const target: Piece = targets.find((p: Piece) => p.owner !== this.owner);
            if (!target) {
                return false;
            }

            const rollSuccess: boolean = this._board.roll(10, target.stats.magicResistance);

            this._board.sound.play("castloop08");
            await this._board.playEffect(
                EffectType.SubversionBeam,
                castingPiece.sprite.getCenter(),
                target.sprite.getCenter()
            );
            if (rollSuccess && !target.illusion) {
                this._board.sound.play("spelleffect");
                await this._board.playEffect(
                    EffectType.SubversionHit,
                    target.sprite.getCenter(),
                    null,
                    target
                );
                target.owner = this.owner;
                this._board.logger.log(
                    `${target.name} was subverted and now belongs to ${owner.name}`
                );
            }
            else {
                this._board.logger.log(
                    `${target.name} resisted ${this.name}`,
                    Colour.Magenta
                );
            }
            await this._board.idleDelay(Board.DEFAULT_DELAY);
            return true;
        }

        if (this.properties.target === SpellTarget.Self) {
            const target: Piece = targets.find((p: Piece) => p.type === UnitType.Wizard && p.owner === this.owner);
            if (!target) {
                return false;
            }

            this._board.sound.play("spelleffect");
            await this._board.playEffect(
                EffectType.WizardCasting,
                target.sprite.getCenter(),
                null,
                target
            );

            if (this.properties.id === "turmoil") {
                for (const piece of this._board.pieces.filter((p: Piece) => !p.dead && !p.currentMount && !p.engulfed)) {
                    const randomEmptySpace: Phaser.Geom.Point = this._board.getRandomEmptySpace();
                    if (randomEmptySpace) {
                        this._board.sound.play("spelleffect");
                        const oldPiecePos: Phaser.Math.Vector2 = piece.sprite.getCenter().clone();
                        const newPiecePos: Phaser.Geom.Point = this._board.getIsoPosition(randomEmptySpace)
                        piece.moveTo(randomEmptySpace, 200);
                        await this._board.playEffect(
                            EffectType.WizardCastBeam,
                            oldPiecePos,
                            newPiecePos,
                            piece
                        );
                    }
                }
            }
            else {
                const statusMap: { [key: string]: UnitStatus } = {
                    "shadow-form": UnitStatus.ShadowForm,
                    "magic-knife": UnitStatus.MagicKnife,
                    "magic-sword": UnitStatus.MagicSword,
                    "magic-shield": UnitStatus.MagicShield,
                    "magic-armour": UnitStatus.MagicArmour,
                    "magic-bow": UnitStatus.MagicBow,
                    "magic-wings": UnitStatus.MagicWings,
                };

                if (this.properties.id in statusMap) {
                    if (!target.addStatus(statusMap[this.properties.id])) {
                        this._board.logger.log(
                            `${target.name} already has ${this.name} - this spell has no effect`,
                            Colour.Magenta
                        );
                        await this._board.idleDelay(Board.DEFAULT_DELAY);
                        return true; 
                    }
                }
            }
            this._board.logger.log(
                `${target.name} successfully cast '${this.name}'`,
                Colour.Green
            );

            await this._board.idleDelay(Board.DEFAULT_DELAY);
            return true;
        }

        return false;
    }

    /**
     * Oh noes, the spell casting has failed.
     * 
     * @param owner The player casting the spell
     * @param castingPiece The piece casting the spell
     * @returns The result of the failed spell cast
     */
    async castFail(owner: Player, castingPiece: Piece): Promise<void> {
        this._failed = true;
        this._castTimes = 0;
        await this._board.playEffect(
            EffectType.WizardCastFail,
            castingPiece.sprite.getCenter(),
            null,
            castingPiece
        );
    }

    /**
     * Show the range of this spell on the board.
     */
    async showRange(show: boolean): Promise<void> {
        if (show) {
            this._board.moveGizmo.showSimpleRange(
                this._castingPiece.position,
                this.range,
                CursorType.RangeCast,
                this.lineOfSight
            );
            return;
        }
        this._board.moveGizmo.reset();
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
            if (this.isValidTarget(piece.position)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get a random spell configuration.
     * 
     * @param gifted Whether the spell is being gifted (allows certain spells)
     * @returns A random spell configuration
     */
    static getRandomSpell(gifted?: boolean): any {
        const spellNames: string[] = Object.values(spells).map(
            (spell: any) => spell.name
        );

        
        // Remove Disbelieve from random pool
        spellNames.splice(spellNames.indexOf("Disbelieve"), 1);

        // TODO: 'Giftable' should be a flag on the spell data itself, and not
        // hardcoded here.
        if (!gifted) {
            spellNames.splice(spellNames.indexOf("Turmoil"), 1);
        }

        return Spell.getSpellProperties(
            spellNames[Math.floor(Math.random() * spellNames.length)]
        );
    }

    /**
     * Get all spells of a given type.
     * 
     * @param type The type of spells to get
     * @returns The spell configurations of the given type
     */
    static getSpellsByType(type: SpellType): string[] {
        const spellsByType: Set<string> = new Set<string>();
        for (let [key, spell] of Object.entries(spells)) {
            const config: SpellConfig = spell as SpellConfig;
            if (config.unitId && type === SpellType.Summon) {
                spellsByType.add(spell.name);
                continue;
            }
            if (config.damage && type === SpellType.Attack) {
                spellsByType.add(spell.name);
                continue;
            }
            if (config.target === SpellTarget.Self && type === SpellType.Buff) {
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
     * TODO: Give this an interface.
     * 
     * @param name The name of the spell
     * @returns The properties of the spell
     */
    static getSpellProperties(name: string): any {
        let key = "";
        for (let [k, spell] of Object.entries(spells)) {
            if (spell.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const spell: SpellConfig = (spells as any)[key];

        return {
            id: key,
            name: spell.name,
            description: spell.description,
            chance: spell.chance,
            balance: spell.balance,
            unitId: spell.unitId,
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
        };
    }
}
