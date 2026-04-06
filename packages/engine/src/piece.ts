import { Entity } from "./models/entity";
import { BoardEvent } from "./enums/boardevent";
import { Colour } from "./enums/colour";
import { RangeType } from "./enums/rangetype";
import { SpreadAction } from "./enums/spreadaction";
import { UnitDirection } from "./enums/unitdirection";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { UnitRangedProjectileType } from "./enums/unitrangedprojectiletype";
import type { PieceConfig } from "./configs/piececonfig";
import type {
    SpreadResult,
    SpreadShrinkResult,
    SpreadGrowResult,
} from "./actions";
import type { UnitProperties, IUnitStats } from "./interfaces/unitproperties";
import type { UnitConfig, UnitStats } from "./interfaces/ui";
import type { Player } from "./player";
import { distance } from "./pathfinding";
import { Point } from "./point";

// Board is imported only as a type to avoid a circular
// dependency at runtime (Board → Piece → Board).
import type { Board } from "./board";

export enum PieceState {
    Idle,
    Moving,
    Attacking,
    RangedAttacking,
    TurnOver,
}

/**
 * Engine-level game piece. Contains pure game logic: stats,
 * state, validation, and status effects. No Phaser imports.
 *
 * The client Piece extends this class and adds rendering,
 * sound, and animation concerns.
 */
export class Piece extends Entity {
    public static units: { [key: string]: UnitConfig } = {};

    /**
     * Tint color to use when rendering a piece raised from
     * the dead.
     */
    static readonly RAISED_DEAD_TINT: number = 0x55ffcc;

    /**
     * Amount to darken the piece's tint when it has moved
     * this turn.
     */
    static readonly MOVED_DARKEN_AMOUNT: number = 25;

    /**
     * Alpha value to use when rendering a wizard in Shadow
     * Form.
     */
    static readonly SHADOW_FORM_ALPHA: number = 0.4;

    /**
     * The unit ID of this piece, corresponding to the key
     * in the units JSON file.
     */
    protected readonly _unitId: string;

    protected _type: UnitType;
    protected _owner: Player | null;
    protected _properties: UnitProperties;
    protected _direction: UnitDirection;

    protected _dead: boolean;
    protected _raisedDead: boolean;
    protected _engulfed: boolean;
    protected _moved: boolean;
    protected _attacked: boolean;
    protected _rangedAttacked: boolean;
    protected _engaged: boolean;
    protected _illusion: boolean;

    protected _state: PieceState;

    protected _currentMount: Piece | null = null;
    protected _currentRider: Piece | null = null;

    public currentEngulfed: Piece | null = null;

    constructor(board: Board, id: number, config: PieceConfig) {
        super(board, id, config.x, config.y);
        this._type = config.type;
        this._unitId = config.properties.id;

        this._owner = config.owner ?? null;
        this._properties = Object.assign(
            {
                id: "",
                name: "Unnamed Unit",
                movement: 1,
                combat: 3,
                rangedCombat: 0,
                range: 0,
                defence: 3,
                manoeuvrability: 3,
                magicResistance: 3,
                attackType: "hit",
                rangedType: "shot",
                status: [] as UnitStatus[],
                group:
                    Piece.units[config.properties.id]?.group || "classicunits",
            } as UnitProperties,
            config.properties ?? {},
        ) as UnitProperties;

        this._properties.status = [...(this.properties.status ?? [])];

        let directionOffset: number = this.position.x - this.position.y;
        if (directionOffset === 0) {
            directionOffset =
                this.position.x +
                this.position.y -
                (this.board.width / 2 + this.board.height / 2);
        }
        if (directionOffset > 0) {
            this._direction = UnitDirection.Left;
        } else if (directionOffset < 0) {
            this._direction = UnitDirection.Right;
        } else {
            this._direction =
                this.board.rng.frac() < 0.5
                    ? UnitDirection.Left
                    : UnitDirection.Right;
        }

        this._dead = false;
        this._engulfed = false;
        this._raisedDead = false;
        this._moved = false;
        this._attacked = false;
        this._rangedAttacked = false;
        this._engaged = false;

        this._state = PieceState.Idle;

        this._currentRider = null;
        this._currentMount = null;

        this._illusion = !!config.illusion;
    }

    // ── Type, owner, direction ──────────────────────────

    /**
     * Get the type of this piece (creature, wizard,
     * structure, etc.).
     */
    get type(): UnitType {
        return this._type;
    }

    /**
     * Get the owner of this piece (if any).
     */
    get owner(): Player | null {
        return this._owner || null;
    }

    /**
     * Set the owner of this piece.
     */
    set owner(owner: Player | null) {
        this._owner = owner;
    }

    /**
     * Get the facing direction of this piece.
     */
    get direction(): UnitDirection {
        return this._direction;
    }

    /**
     * Set the facing direction of this piece.
     * The client overrides this to trigger animation.
     */
    set direction(direction: UnitDirection) {
        this._direction = direction;
    }

    // ── Dead / name / fullName ──────────────────────────

    /**
     * Get whether this piece is dead.
     */
    get dead(): boolean {
        return this._dead;
    }

    /**
     * Get the name of this piece.
     */
    get name(): string {
        return this._properties?.name || "Unnamed unit";
    }

    /**
     * Get the full name of this piece, including the
     * owner's name.
     */
    get fullName(): string {
        if (this.owner) {
            return `${this.owner.name}'s ${this.name}`;
        }
        return this.name;
    }

    // ── Turn action flags ───────────────────────────────

    /**
     * Get whether this piece has moved this turn.
     */
    get moved(): boolean {
        if (this.stats.movement === 0 || this._engaged) {
            return true;
        }
        return this._moved;
    }

    /**
     * Set whether this piece has moved this turn.
     */
    set moved(moved: boolean) {
        this._moved = moved;
        if (this.currentRider) {
            if (this.currentRider.moved !== moved) {
                this.currentRider.moved = moved;
            }
        }
    }

    /**
     * Get whether this piece has attacked this turn.
     */
    get attacked(): boolean {
        if (this.stats.combat === 0) {
            return true;
        }
        return this._attacked;
    }

    /**
     * Set whether this piece has attacked this turn.
     */
    set attacked(attacked: boolean) {
        this._moved = attacked;
        this._attacked = attacked;
        if (this.currentRider) {
            if (this.currentRider.moved !== attacked) {
                this.currentRider.moved = attacked;
            }
            if (this.currentRider.attacked !== attacked) {
                this.currentRider.attacked = attacked;
            }
        }
    }

    /**
     * Get whether this piece has performed a ranged attack
     * this turn.
     */
    get rangedAttacked(): boolean {
        if (this.stats.rangedCombat === 0 || this.stats.range === 0) {
            return true;
        }
        return this._rangedAttacked;
    }

    /**
     * Set whether this piece has performed a ranged attack
     * this turn.
     */
    set rangedAttacked(rangedAttacked: boolean) {
        this._moved = rangedAttacked;
        this._attacked = rangedAttacked;
        this._rangedAttacked = rangedAttacked;
        if (this.currentRider) {
            if (this.currentRider.moved !== rangedAttacked) {
                this.currentRider.moved = rangedAttacked;
            }
            if (this.currentRider.attacked !== rangedAttacked) {
                this.currentRider.attacked = rangedAttacked;
            }
        }
        if (this.currentMount) {
            if (this.currentMount.moved !== rangedAttacked) {
                this.currentMount.moved = rangedAttacked;
            }
            if (this.currentMount.attacked !== rangedAttacked) {
                this.currentMount.attacked = rangedAttacked;
            }
        }
    }

    /**
     * Get whether this piece is currently engaged in
     * combat.
     */
    get engaged(): boolean {
        return this._engaged;
    }

    /**
     * Set whether this piece is currently engaged in
     * combat.
     */
    set engaged(engaged: boolean) {
        this._engaged = engaged;
    }

    /**
     * Get whether this piece is currently engulfed by
     * another piece.
     */
    get engulfed(): boolean {
        return this._engulfed;
    }

    /**
     * Set whether this piece is currently engulfed.
     * The client overrides this to add visual/logging
     * side effects.
     */
    set engulfed(engulfed: boolean) {
        this._engulfed = engulfed;
    }

    /**
     * Get whether this piece is an illusion.
     */
    get illusion(): boolean {
        return this._illusion;
    }

    /**
     * Get whether this piece was raised from the dead.
     */
    get raisedDead(): boolean {
        return this._raisedDead;
    }

    /**
     * Set whether this piece was raised from the dead.
     * The client overrides this to add visual tinting.
     */
    set raisedDead(raisedDead: boolean) {
        this._raisedDead = raisedDead;
    }

    // ── Stats and properties ────────────────────────────

    /**
     * Get the stats for this piece, taking into account
     * any status effects.
     */
    get stats(): IUnitStats {
        const stats: IUnitStats = {
            movement: this._properties.movement,
            combat: this._properties.combat,
            rangedCombat: this._properties.rangedCombat,
            range: this._properties.range,
            defence: this._properties.defence,
            manoeuvrability: this._properties.manoeuvrability,
            magicResistance: this._properties.magicResistance,
        };

        if (this.hasStatus(UnitStatus.ShadowForm)) {
            stats.movement = 3;
            stats.defence = Math.min(stats.defence + 3, 9);
        }
        if (this.hasStatus(UnitStatus.MagicSword)) {
            stats.combat = Math.min(stats.combat + 6, 9);
        } else if (this.hasStatus(UnitStatus.MagicKnife)) {
            stats.combat = Math.min(stats.combat + 3, 9);
        }
        if (this.hasStatus(UnitStatus.MagicArmour)) {
            stats.defence = Math.min(stats.defence + 6, 9);
        } else if (this.hasStatus(UnitStatus.MagicShield)) {
            stats.defence = Math.min(stats.defence + 3, 9);
        }
        if (this.hasStatus(UnitStatus.MagicBow)) {
            stats.rangedCombat = 3;
            stats.range = 6;
        }
        if (this.hasStatus(UnitStatus.MagicWings)) {
            stats.movement = 6;
        }
        return stats;
    }

    /**
     * Get the properties of this piece from the original
     * JSON unit definition.
     */
    get properties(): UnitProperties {
        return this._properties;
    }

    /**
     * Get the overall strength of this piece.
     */
    get strength(): number {
        let strength: number = 0;

        strength += this.stats.combat;

        if (this.stats.rangedCombat > 0) {
            strength += this.stats.rangedCombat + this.stats.range;
        }

        strength += this.stats.movement;
        strength += this.stats.defence;
        strength += this.stats.magicResistance / 2;

        if (this.hasStatus(UnitStatus.Undead) || this.raisedDead) {
            strength += 2;
        }

        return strength;
    }

    // ── Mount / rider ───────────────────────────────────

    /**
     * Set the current rider of this piece.
     */
    set currentRider(rider: Piece | null) {
        if (!rider) {
            this._currentRider = null;
            return;
        }
        if (
            !this.hasStatus(UnitStatus.Mount) &&
            !this.hasStatus(UnitStatus.MountAny)
        ) {
            console.error("Cannot mount an unmountable unit");
            return;
        }
        this._currentRider = rider;
    }

    /**
     * Get the current rider of this piece (if any).
     */
    get currentRider(): Piece | null {
        return this._currentRider;
    }

    /**
     * Set the current mount of this piece.
     * The client overrides this to add visual effects.
     */
    set currentMount(mount: Piece | null) {
        this._currentMount = mount;
    }

    /**
     * Get the piece this piece is mounted on (if any).
     */
    get currentMount(): Piece | null {
        return this._currentMount;
    }

    // ── Turn state ──────────────────────────────────────

    /**
     * Check if this piece's turn is over.
     */
    get turnOver(): boolean {
        return (
            (this.moved && !this.canAttack && !this.canRangedAttack) ||
            this.dead ||
            this.engulfed ||
            (this.moved && this.attacked && this.rangedAttacked)
        );
    }

    /**
     * End this piece's turn, marking all of its action
     * flags as complete. The client overrides this to add
     * visual tinting.
     */
    set turnOver(state: boolean) {
        this.moved = this.attacked = this.rangedAttacked = state;
    }

    /**
     * Reset this piece's state for a new turn.
     */
    public reset() {
        this.turnOver = false;
        this.engaged = false;

        if (this.currentRider) {
            this.currentRider.reset();
        }
    }

    // ── Direction ───────────────────────────────────

    /**
     * Update the facing direction of this piece based
     * on movement from one point to another.
     */
    protected updateDirection(
        fromPoint: { x: number; y: number },
        toPoint: { x: number; y: number },
    ): void {
        const isoXOffset: number =
            toPoint.x - toPoint.y - (fromPoint.x - fromPoint.y);
        if (isoXOffset === 0) {
            return;
        }
        this.direction =
            isoXOffset < 0 ? UnitDirection.Left : UnitDirection.Right;
    }

    // ── Combat / lifecycle ─────────────────────────

    /**
     * Kill this piece. Handles rider dismount, engulfed
     * release, illusion/undead destruction. Leaves a
     * corpse unless the piece has NoCorpse/Undead status
     * or is an illusion.
     */
    async kill(_silent: boolean = false): Promise<void> {
        if (this._dead) {
            throw new Error("Cannot kill unit that is already dead");
        }
        if (this.currentRider) {
            this.currentRider.dismount();
            if (!this.currentRider.turnOver) {
                this.currentRider.reset();
            }
        }
        if (this.currentEngulfed) {
            this.currentEngulfed.engulfed = false;
            this.currentEngulfed = null;
        }
        this._dead = true;
        this.owner = null;
        if (
            this.illusion ||
            this.hasStatus(UnitStatus.NoCorpse) ||
            this.hasStatus(UnitStatus.Undead)
        ) {
            await this.destroy();
        }
        this._board.boardEvents.emit(BoardEvent.PieceDied, this);
    }

    /**
     * Destroy this piece, removing it from the board.
     * Client overrides to also destroy sprites.
     */
    async destroy(): Promise<void> {
        this._dead = true;
        if (this.currentRider) {
            this.currentRider.dismount();
        }
        this._board.removePiece(this.id);
    }

    /**
     * Engage this piece with the given piece.
     */
    async engage(piece: Piece): Promise<void> {
        if (this.canEngagePiece(piece)) {
            this.engaged = true;
            this.attacked = false;
            piece.engaged = true;
        }
        this.board.logger.log(
            `${this.name} is engaged with ${piece.name}`,
            Colour.Yellow,
        );
    }

    /**
     * Perform a melee attack on the given piece.
     * Returns true if the attack killed the target.
     * Client overrides for animation.
     */
    async attack(piece: Piece, _options?: any): Promise<boolean> {
        if (!this.canAttackPiece(piece)) {
            return false;
        }
        if (!this.canAttackPossiblyUndeadPiece(piece)) {
            this._board.logger.log(
                `${this.name} cannot attack the undead`,
                Colour.Cyan,
            );
            return false;
        }
        this.updateDirection(this.position, piece.position);
        this.attacked = true;
        this.moved = true;

        const rollSuccess: boolean = this._board.roll(
            this.stats.combat,
            piece.stats.defence,
            this.owner,
        );

        this._board.logger.log(`${this.name} attacks ${piece.name}`);

        // Shadow Form is lost on attacking, regardless
        if (this.hasStatus(UnitStatus.ShadowForm)) {
            this.removeStatus(UnitStatus.ShadowForm);
        }

        if (rollSuccess) {
            this._board.logger.log(
                `${this.fullName} defeated ${piece.fullName}`,
                Colour.Red,
            );
            await piece.kill();
            return true;
        }
        return false;
    }

    /**
     * Perform a ranged attack on the given piece.
     * Returns true if the attack killed the target.
     * Client overrides for animation.
     */
    async rangedAttack(piece: Piece): Promise<boolean> {
        if (!this.canRangedAttackPiece(piece)) {
            return false;
        }
        if (!this.canAttackPossiblyUndeadPiece(piece)) {
            this._board.logger.log(
                `${this.name} cannot attack the undead`,
                Colour.Cyan,
            );
            return false;
        }
        this.updateDirection(this.position, piece.position);
        this.rangedAttacked = true;
        this.attacked = true;
        this.moved = true;

        const rollSuccess: boolean = this._board.roll(
            this.stats.rangedCombat,
            piece.stats.defence,
            this.owner,
        );

        this._board.logger.log(`${this.name} ranged attacks ${piece.name}`);

        if (rollSuccess) {
            // Shadow Form only lost on successful ranged
            if (this.hasStatus(UnitStatus.ShadowForm)) {
                this.removeStatus(UnitStatus.ShadowForm);
            }
            this._board.logger.log(
                `${this.fullName} defeated ${piece.fullName}`,
                Colour.Red,
            );
            await piece.kill();
            return true;
        }
        return false;
    }

    /**
     * Mount this piece upon another piece.
     */
    async mount(piece: Piece): Promise<void> {
        if (!this.canMountPiece(piece)) {
            throw new Error(`${this.name} cannot mount ${piece.name}`);
        }
        this.moved = true;
        this.attacked = true;
        piece.moved = true;
        this.currentMount = piece;
        piece.currentRider = this;
        await this.board.movePiece(this.id, piece.position);
        this._board.logger.log(
            `${this.fullName} mounted ${piece.fullName}`,
        );
    }

    /**
     * Dismount from the current mount.
     */
    async dismount(): Promise<void> {
        if (!this.currentMount) {
            throw new Error(`${this.name} is not mounted`);
        }
        this.currentMount.currentRider = null;
        this.moved = true;
        this.currentMount.turnOver = true;
        this._board.logger.log(
            `${this.fullName} dismounted ${this.currentMount.fullName}`,
        );
        this.currentMount = null;
    }

    /**
     * Move this piece to the specified point on the board.
     * Updates direction, position, and rider position.
     * Dismounts if the current mount is left behind.
     * Client overrides to also animate movement.
     */
    async moveTo(
        point: { x: number; y: number },
        _stepDuration?: number,
    ): Promise<void> {
        this.updateDirection(this.position, point);
        this.position = new Point(point.x, point.y);
        if (this.currentRider) {
            this.currentRider.position = new Point(point.x, point.y);
        }
        if (
            this.currentMount &&
            !Point.equals(this.currentMount.position, this.position)
        ) {
            this._board.dismountPiece(this.id);
        }
    }

    /**
     * Raise this piece from the dead, assigning a new
     * owner. Client overrides to also restore the sprite.
     */
    async raiseDead(owner: Player | null): Promise<void> {
        if (!this.dead) {
            throw new Error("Cannot raise a piece that is not dead");
        }
        this.owner = owner;
        this._dead = false;
        this.raisedDead = true;
        this.addStatus(UnitStatus.Undead);
    }

    /**
     * Spread this piece to an adjacent square. Picks a
     * random spread action (None / Shrink / Spread) and
     * acts accordingly. Client overrides for animations
     * and sound.
     */
    async spread(): Promise<SpreadResult> {
        if (!this.hasStatus(UnitStatus.Spreads) || this.dead) {
            throw new Error("Cannot spread a non-spreading or dead piece");
        }

        const spreadAction: SpreadAction = this._board.rng.weightedRandomPick(
            [SpreadAction.Shrink, SpreadAction.None, SpreadAction.Spread],
            1.75,
            true,
        );

        if (spreadAction === SpreadAction.None) {
            return { action: "none" };
        }

        if (spreadAction === SpreadAction.Shrink) {
            const result: SpreadShrinkResult = {
                action: "shrink",
                pieceId: this.id,
            };
            if (this.currentEngulfed) {
                this.currentEngulfed.engulfed = false;
                result.releasedPieceId = this.currentEngulfed.id;
                this._board.logger.log(
                    `${this.currentEngulfed.fullName}` +
                        ` was released from ` +
                        `${this.fullName}`,
                    Colour.Green,
                );
            }
            await this.destroy();
            return result;
        }

        // SpreadAction.Spread
        const adjacentPoints: Point[] = this._board.getAdjacentPoints(
            this.position,
        );
        const spreadPoint: Point = this._board.rng.pick(adjacentPoints);
        const spreadPieces: Piece[] = this._board.getPiecesAtPosition(
            spreadPoint,
            (piece: Piece) => !piece.dead,
        );

        const result: SpreadGrowResult = {
            action: "spread",
            pieceId: this.id,
            targetPoint: {
                x: spreadPoint.x,
                y: spreadPoint.y,
            },
            destroyedPieceIds: [],
            newPieceConfig: null,
            newPieceId: -1,
        };

        if (spreadPieces.length > 0) {
            if (
                spreadPieces.some(
                    (piece) =>
                        piece.owner === this.owner || !piece.canBeSpreadOn,
                )
            ) {
                return { action: "none" };
            }
            if (
                spreadPieces.some((piece) => piece.hasStatus(UnitStatus.Wizard))
            ) {
                const killedPiece = spreadPieces.find((piece) =>
                    piece.hasStatus(UnitStatus.Wizard),
                );
                this._board.logger.log(
                    `${killedPiece.fullName} was ` +
                        `destroyed by ` +
                        `${this.fullName}!`,
                    Colour.Red,
                );
                await killedPiece.kill();
                result.killedPieceId = killedPiece.id;
            } else if (this.hasStatus(UnitStatus.Engulfs)) {
                this._board.logger.log(
                    `${this.fullName} has engulfed ` +
                        `${spreadPieces[0].fullName}`,
                    Colour.Yellow,
                );
                spreadPieces[0].engulfed = true;
                result.engulfedPieceId = spreadPieces[0].id;
            } else {
                for (const piece of spreadPieces) {
                    this._board.logger.log(
                        `${piece.fullName} was ` +
                            `destroyed by ` +
                            `${this.fullName}`,
                        Colour.Red,
                    );
                    await piece.destroy();
                    result.destroyedPieceIds.push(piece.id);
                }
            }
        }

        const unit: any = Piece.getUnitConfig(this._properties.id);

        const pieceConfig: PieceConfig = {
            type: UnitType.Creature,
            x: spreadPoint.x,
            y: spreadPoint.y,
            properties: {
                id: this._unitId,
                name: unit.name,
                movement: unit.properties.mov,
                combat: unit.properties.com,
                rangedCombat: unit.properties.rcm,
                range: unit.properties.rng,
                defence: unit.properties.def,
                manoeuvrability: unit.properties.mnv,
                magicResistance: unit.properties.res,
                attackType: unit.attackType || "attacked",
                rangedType: unit.rangedType || "shot",
                projectileType:
                    unit.projectileType || UnitRangedProjectileType.Arrow,
                status: [...(unit.status || [])],
            },
            shadowScale: unit.shadowScale,
            offsetY: unit.offY,
            owner: this.owner,
            illusion: !!this._illusion,
            group: unit.group || "classicunits",
        } as PieceConfig;
        result.newPieceConfig = pieceConfig;

        const newPiece: Piece = await this._board.addPiece(pieceConfig);
        result.newPieceId = newPiece.id;

        if (
            spreadPieces.length > 0 &&
            newPiece.hasStatus(UnitStatus.Engulfs) &&
            !spreadPieces[0].dead &&
            !spreadPieces[0].hasStatus(UnitStatus.Wizard)
        ) {
            newPiece.currentEngulfed = spreadPieces[0];
            result.newPieceEngulfedId = spreadPieces[0].id;
        }

        return result;
    }

    // ── Status effects ──────────────────────────────────

    /**
     * Add a status effect to this piece.
     *
     * @param status The status effect to add.
     * @returns True if the status was added.
     */
    addStatus(status: UnitStatus): boolean {
        if (!this.hasStatus(status)) {
            this._properties.status.push(status);
            return true;
        }
        return false;
    }

    /**
     * Remove a status effect from this piece.
     *
     * @param status The status effect to remove.
     * @returns True if the status was removed.
     */
    removeStatus(status: UnitStatus): boolean {
        if (this.hasStatus(status)) {
            this._properties.status = this._properties.status.filter(
                (s) => s !== status,
            );
            return true;
        }
        return false;
    }

    /**
     * Check if this piece has a specific status effect.
     */
    hasStatus(status: UnitStatus): boolean {
        return this._properties.status.includes(status);
    }

    /**
     * Check if this piece has any of the specified status
     * effects.
     */
    hasAnyStatus(statuses: UnitStatus[]): boolean {
        return statuses.some((status) => this.hasStatus(status));
    }

    /**
     * Check if this piece has all of the specified status
     * effects.
     */
    hasAllStatuses(statuses: UnitStatus[]): boolean {
        return statuses.every((status) => this.hasStatus(status));
    }

    // ── Capability checks ───────────────────────────────

    /**
     * Check if this piece can perform any valid actions
     * this turn.
     */
    get canPerformActions(): boolean {
        if (this.dead || this.engulfed) {
            return false;
        }
        if (
            this.stats.movement > 0 ||
            this.stats.combat > 0 ||
            this.stats.rangedCombat > 0
        ) {
            return true;
        }
        return false;
    }

    /**
     * Check if this piece can be selected.
     */
    get canSelect(): boolean {
        if (this._engulfed) {
            return false;
        }
        if (
            (this.hasStatus(UnitStatus.Mount) ||
                this.hasStatus(UnitStatus.MountAny)) &&
            this.currentRider?.owner === this.board.currentPlayer &&
            !this.currentRider.turnOver
        ) {
            return true;
        }
        if (
            this.dead ||
            this.turnOver ||
            this.hasStatus(UnitStatus.Structure) ||
            (this.stats.combat === 0 &&
                this.stats.rangedCombat === 0 &&
                this.stats.movement === 0)
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can be disbelieved.
     */
    get canBeDisbelieved(): boolean {
        return (
            this.type === UnitType.Creature &&
            !this.hasStatus(UnitStatus.Wizard) &&
            !this.hasStatus(UnitStatus.Structure) &&
            !this.hasStatus(UnitStatus.Spreads) &&
            !this.hasStatus(UnitStatus.Tree)
        );
    }

    /**
     * Check if this piece can be spread on.
     */
    get canBeSpreadOn(): boolean {
        return (
            (this.type === UnitType.Creature ||
                this.type === UnitType.Wizard) &&
            !this.hasStatus(UnitStatus.Engulfs) &&
            !this.hasStatus(UnitStatus.Invulnerable) &&
            !this.hasStatus(UnitStatus.Structure) &&
            !this.hasStatus(UnitStatus.Tree)
        );
    }

    /**
     * Check if this piece can have the Subversion spell
     * cast on it.
     */
    get canBeSubverted(): boolean {
        return (
            this.type === UnitType.Creature &&
            !this.currentRider &&
            !this.currentMount &&
            !this.hasStatus(UnitStatus.Wizard) &&
            !this.hasStatus(UnitStatus.Spreads) &&
            !this.hasStatus(UnitStatus.Structure) &&
            !this.hasStatus(UnitStatus.Tree) &&
            !this.hasStatus(UnitStatus.Invulnerable)
        );
    }

    /**
     * Check if this piece can be magic attacked.
     */
    get canBeMagicAttacked(): boolean {
        return (
            !this.hasStatus(UnitStatus.Invulnerable) &&
            !this.hasStatus(UnitStatus.Sanctity)
        );
    }

    /**
     * Check if this piece can perform a melee attack.
     */
    get canAttack(): boolean {
        const neighbours: Piece[] = this.getNeighbours();

        if (
            this._dead ||
            this.engulfed ||
            this.attacked ||
            this.stats.combat === 0 ||
            neighbours.length === 0 ||
            neighbours.filter((neighbour: Piece) =>
                this.canAttackPiece(neighbour),
            ).length === 0
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can move.
     */
    get canMove(): boolean {
        if (
            this._dead ||
            this.engulfed ||
            this.stats.movement === 0 ||
            this.hasStatus(UnitStatus.Structure) ||
            this.hasStatus(UnitStatus.Tree)
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can perform a ranged attack.
     */
    get canRangedAttack(): boolean {
        if (
            this._dead ||
            this.engulfed ||
            this.rangedAttacked ||
            this.stats.rangedCombat === 0 ||
            this.board.pieces.filter((piece: Piece) =>
                this.canRangedAttackPiece(piece),
            ).length === 0
        ) {
            return false;
        }
        return true;
    }

    // ── Piece-to-piece checks ───────────────────────────

    /**
     * Check if this piece can attack a piece that may be
     * undead.
     */
    canAttackPossiblyUndeadPiece(piece: Piece): boolean {
        if (
            piece.hasStatus(UnitStatus.Undead) &&
            !this.hasStatus(UnitStatus.Undead) &&
            !this.hasStatus(UnitStatus.AttackUndead)
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can attack the given piece.
     */
    canAttackPiece(piece: Piece): boolean {
        if (
            this == piece ||
            this.owner === piece.owner ||
            piece == this.currentRider ||
            this._dead ||
            this.engulfed ||
            this.attacked ||
            piece.dead ||
            piece.engulfed ||
            piece.currentMount ||
            piece.hasStatus(UnitStatus.Invulnerable)
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can perform a ranged attack on
     * the given piece.
     */
    canRangedAttackPiece(piece: Piece): boolean {
        if (
            this == piece ||
            this.owner === piece.owner ||
            piece == this.currentRider ||
            this._dead ||
            this.engulfed ||
            piece.dead ||
            this.rangedAttacked ||
            piece.engulfed ||
            piece.currentMount ||
            !this.moved ||
            piece.hasStatus(UnitStatus.Invulnerable) ||
            !this.inRangedAttackRange(piece.position) ||
            !this.board.hasLineOfSight(this.position, piece.position)
        ) {
            return false;
        }
        return true;
    }

    /**
     * Check if this piece can mount the given piece.
     */
    canMountPiece(piece: Piece): boolean {
        if (
            this != piece &&
            !this._dead &&
            !this.engulfed &&
            !piece.dead &&
            !this.moved &&
            this.hasStatus(UnitStatus.Wizard) &&
            !piece.currentRider &&
            ((piece.hasStatus(UnitStatus.Mount) &&
                piece.owner === this.owner) ||
                piece.hasStatus(UnitStatus.MountAny))
        ) {
            return true;
        }
        return false;
    }

    /**
     * Check if this piece can become engaged in combat
     * with the given piece.
     */
    canEngagePiece(piece: Piece): boolean {
        if (
            this == piece ||
            this._dead ||
            this.engulfed ||
            piece.engulfed ||
            piece.dead ||
            this.stats.manoeuvrability === 0 ||
            piece.stats.manoeuvrability === 0 ||
            this.currentMount ||
            piece.currentMount ||
            this.owner === piece.owner
        ) {
            return false;
        }
        return true;
    }

    // ── Neighbour / range queries ───────────────────────

    /**
     * Get all neighbouring pieces that are not dead.
     */
    getNeighbours(): Piece[] {
        return this.board.getAdjacentPiecesAtPosition(
            this.position,
            (piece: Piece) => !piece.dead,
        );
    }

    /**
     * Get the first neighbouring piece that this piece can
     * become engaged with.
     */
    getFirstEngagingPiece(): Piece | null {
        const neighbours: Piece[] = this.getNeighbours();
        for (const neighbour of neighbours) {
            if (this.canEngagePiece(neighbour)) {
                return neighbour;
            }
        }
        return null;
    }

    /**
     * Find all pieces that pose a threat to this piece.
     */
    findThreatPieces(): Set<Piece> {
        const threats = new Set<Piece>();
        for (const piece of this.board.pieces) {
            if (
                piece.owner === this.owner ||
                piece.dead ||
                piece.currentRider ||
                piece.engulfed
            ) {
                continue;
            }
            const melee =
                piece.canAttackPiece(this) &&
                this.inAttackRange(piece.position);
            const ranged =
                piece.canRangedAttackPiece(this) &&
                this.inRangedAttackRange(piece.position);
            const spreads =
                piece.hasStatus(UnitStatus.Spreads) &&
                distance(piece.position, this.position) <= 3;
            if (melee || ranged || spreads) {
                threats.add(piece);
            }
        }
        return threats;
    }

    /**
     * Check if a point is within this piece's ranged
     * attack range.
     */
    inRangedAttackRange(point: { x: number; y: number }): boolean {
        // Inline distance calculation for ranged attacks
        // to avoid importing Board (circular dependency).
        // This mirrors Board.distance with RangeType
        // other than Foot.
        const dx = Math.abs(this.position.x - point.x);
        const dy = Math.abs(this.position.y - point.y);
        const dist =
            Math.max(dx, dy) - Math.min(dx, dy) + Math.min(dx, dy) * 1.5;
        return dist <= this.stats.range;
    }

    /**
     * Check if a point is within this piece's movement
     * range. Uses rangeGizmo path checking for ground
     * units, and fly-distance for flying units.
     */
    inMovementRange(point: { x: number; y: number }): boolean {
        if (Point.equals(this.position, new Point(point.x, point.y))) {
            return false;
        }
        if (this.currentMount) {
            if (distance(this.position, new Point(point.x, point.y)) > 1.5) {
                return false;
            }
        }
        if (this.hasStatus(UnitStatus.Flying)) {
            return (
                distance(
                    this.position,
                    new Point(point.x, point.y),
                    RangeType.Fly,
                ) <= this.stats.movement
            );
        }
        if (!this.board.rangeGizmo.getPathTo(point)) {
            return false;
        }
        return true;
    }

    /**
     * Check if a point is within this piece's attack
     * range (melee). A piece can attack into squares it
     * could move to, or any immediately adjacent square.
     */
    inAttackRange(point: { x: number; y: number }): boolean {
        if (
            !this.moved &&
            this.inMovementRange(point) &&
            (this.hasStatus(UnitStatus.Flying) ||
                this.board.rangeGizmo.getPathTo(point))
        ) {
            return true;
        }
        if (distance(this.position, new Point(point.x, point.y)) > 1.5) {
            return false;
        }
        return true;
    }

    // ── Unit config ─────────────────────────────────────

    /**
     * Get the unit configuration for this piece.
     */
    public get unitConfig(): UnitConfig {
        return {
            attackType: this.properties.attackType,
            rangedType: this.properties.rangedType,
            projectileType: this.properties.projectileType,
            properties: {
                mov: this.stats.movement,
                com: this.stats.combat,
                rcm: this.stats.rangedCombat,
                rng: this.stats.range,
                def: this.stats.defence,
                mnv: this.stats.manoeuvrability,
                res: this.stats.magicResistance,
            },
            status: [...this.properties.status],
            name: this.name,
            dead: this.dead,
            wizard: this.type === UnitType.Wizard,
            group: this.properties.group || "classicunits",
        };
    }

    /**
     * Get the raw unit configuration from the units data
     * file by ID.
     */
    static getUnitConfig(id: string): UnitConfig | undefined {
        return Piece.units[id];
    }

    /**
     * Get the unit properties by unit name.
     */
    static getUnitPropertiesByName(name: string): UnitStats | null {
        let key = "";
        for (let [k, unit] of Object.entries(Piece.units)) {
            if (unit.name.toLowerCase().trim() === name.toLowerCase().trim()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return null;
        }

        const unit: any = this.getUnitConfig(key);

        return {
            id: key,
            name: unit.name,
            movement: unit.properties.mov,
            combat: unit.properties.com,
            rangedCombat: unit.properties.rcm,
            range: unit.properties.rng,
            defence: unit.properties.def,
            manoeuvrability: unit.properties.mnv,
            magicResistance: unit.properties.res,
            attackType: unit.attackType || "attacked",
            rangedType: unit.rangedType || "shot",
            projectileType:
                unit.projectileType || UnitRangedProjectileType.Arrow,
            status: [...(unit.status || [])],
            group: unit.group || "classicunits",
        };
    }

    /**
     * Get the piece properties from the JSON data by
     * unit name.
     */
    static getPieceProperties(name: string): any {
        let key = "";
        for (let [k, piece] of Object.entries(Piece.units)) {
            if (piece.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const unit: any = (Piece.units as any)[key];

        return {
            type: UnitType.Creature,
            properties: {
                id: key,
                name: unit.name,
                movement: unit.properties.mov,
                combat: unit.properties.com,
                rangedCombat: unit.properties.rcm,
                range: unit.properties.rng,
                defence: unit.properties.def,
                manoeuvrability: unit.properties.mnv,
                magicResistance: unit.properties.res,
                attackType: unit.attackType || "attacked",
                rangedType: unit.rangedType || "shot",
                projectileType:
                    unit.projectileType || UnitRangedProjectileType.Arrow,
                status: [...(unit.status || [])],
            },
            shadowScale: unit.shadowScale,
            offsetY: unit.offY,
            group: unit.group || "classicunits",
        };
    }

    /**
     * Check if the given object is a Piece instance.
     */
    static isPiece(obj: unknown): obj is Piece {
        return obj instanceof Piece;
    }
}
