import { units } from "../../assets/data/classicunits.json";
import { Board } from "./board";
import { PieceConfig } from "./configs/piececonfig";
import { EffectType } from "./effectemitter";
import { Entity } from "./entity";
import { BoardLayer } from "./enums/boardlayer";
import { Colour } from "./enums/colour";
import { CursorType } from "./enums/cursortype";
import { SpreadAction } from "./enums/spreadaction";
import { UnitAttackType } from "./enums/unitattacktype";
import { UnitDirection } from "./enums/unitdirection";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { IUnitProperties, IUnitStats } from "./interfaces/unitproperties";
import { Player } from "./player";

enum PieceState {
    Idle,
    Moving,
    Attacking,
    RangedAttacking,
    TurnOver,
}

export class Piece extends Entity {
    static DEFAULT_MOVE_DURATION: number = 750;
    static DEFAULT_STEP_MOVE_DURATION: number = 300;
    static DEFAULT_HIGHLIGHT_DURATION: number = 600;
    static DEFAULT_HIGHLIGHT_STEPS: number = 5;

    static RAISED_DEAD_TINT: number = 0xb0d9ff;
    static MOVED_DARKEN_AMOUNT: number = 25;

    protected _unitId: string;

    protected _type: UnitType;
    protected _owner: Player | null;
    protected _properties: IUnitProperties;
    protected _shadowScale: number;
    protected _shadow?: Phaser.GameObjects.Image;
    protected _sprite?: Phaser.GameObjects.Sprite;
    protected _effects: Map<UnitStatus, Phaser.GameObjects.Sprite | Phaser.GameObjects.Image>;
    protected _offsetY: number;
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

    protected _currentMount: Piece | null;
    protected _currentRider: Piece | null;

    public currentEngulfed: Piece | null = null;

    protected _ownerHighlightTween: Phaser.Tweens.Tween;

    constructor(board: Board, id: number, config: PieceConfig) {
        super(board, id, config.x, config.y);
        this._type = config.type;
        this._unitId = config.properties.id;

        this._owner = config.owner ?? null;
        this._properties = {
            ...(config.properties ?? {
                id: "",
                name: "Unnamed Unit",
                movement: 1,
                combat: 3,
                rangedCombat: 0,
                range: 0,
                defense: 3,
                maneuverability: 3,
                magicResistance: 3,
                attackType: "hit",
                rangedType: "shot",
                status: [] as UnitStatus[],
            }),
        };

        this._properties.status = [...this.properties.status ?? []];

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
            this._direction = Phaser.Math.RND.pick([
                UnitDirection.Left,
                UnitDirection.Right,
            ]);
        }

        this._dead = false;
        this._engulfed = false;
        this._moved = false;
        this._attacked = false;
        this._rangedAttacked = false;
        this._engaged = false;

        this._state = PieceState.Idle;

        this._currentRider = null;
        this._currentMount = null;

        this._shadowScale = config.shadowScale || 3;
        this._offsetY = config.offsetY || 0;

        this._illusion = !!config.illusion;

        this._effects = new Map();

        setTimeout(() => {
            this.initSprites();
        }, Math.random() * 10);
    }

    protected initSprites() {
        this.createShadow();
        this.createSprite();
        this.createShaders();
    }

    get turnOver(): boolean {
        return (
            (this.moved && !this.canAttack && !this.canRangedAttack) ||
            this.dead ||
            this.engulfed ||
            (this.moved && this.attacked && this.rangedAttacked)
        );
    }

    private _highlighted: boolean = false;

    get highlighted(): boolean {
        return this._highlighted;
    }

    set highlighted(state: boolean) {
        if (!this._ownerHighlightTween) {
            return;
        }
        if (state && this.canSelect) {
            this._highlighted = true;
            this._ownerHighlightTween.play().resume();
            return;
        }
        this._highlighted = false;
        this._ownerHighlightTween.pause().seek(0);
    }

    get defaultTint(): number {
        return this.raisedDead ? Piece.RAISED_DEAD_TINT : 0xffffff;
    }

    set turnOver(state: boolean) {
        this.moved = this.attacked = this.rangedAttacked = state;

        if (state) {
            if (this._raisedDead) {
                this._sprite.setTint(
                    Phaser.Display.Color.ValueToColor(
                        Piece.RAISED_DEAD_TINT
                    ).darken(Piece.MOVED_DARKEN_AMOUNT).color
                );
            } else {
                this._sprite.setTint(
                    Phaser.Display.Color.ValueToColor(0xffffff).darken(
                        Piece.MOVED_DARKEN_AMOUNT
                    ).color
                );
            }
            this.highlighted = false;
        } else {
            if (this._raisedDead) {
                this._sprite.setTint(Piece.RAISED_DEAD_TINT);
            } else {
                this._sprite?.setTint(this.defaultTint);
            }
        }
    }

    get type(): UnitType {
        return this._type;
    }

    get owner(): Player | null {
        return this._owner || null;
    }

    set owner(owner: Player | null) {
        this._owner = owner;
    }

    get direction(): UnitDirection {
        return this._direction;
    }

    set direction(direction: UnitDirection) {
        if (direction != this._direction) {
            this._direction = direction;
            this.playAnim();
        }
    }

    get dead(): boolean {
        return this._dead;
    }

    get name(): string {
        return this._properties?.name || "Unnamed Unit";
    }

    get sprite(): Phaser.GameObjects.Sprite {
        return this._sprite!;
    }

    get shadow(): Phaser.GameObjects.Image {
        return this._shadow!;
    }

    get moved(): boolean {
        if (this.stats.movement === 0 || this._engaged) {
            return true;
        }
        return this._moved;
    }

    set moved(moved: boolean) {
        this._moved = moved;
        if (this.currentRider) {
            if (this.currentRider.moved !== moved) {
                this.currentRider.moved = moved;
            }
        }
    }

    get attacked(): boolean {
        if (this.stats.combat === 0) {
            return true;
        }
        return this._attacked;
    }

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

    get rangedAttacked(): boolean {
        if (this.stats.rangedCombat === 0 || this.stats.range === 0) {
            return true;
        }
        return this._rangedAttacked;
    }

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

    get engaged(): boolean {
        return this._engaged;
    }

    set engaged(engaged: boolean) {
        this._engaged = engaged;
    }

    set engulfed(engulfed: boolean) {
        this._engulfed = engulfed;
        setTimeout(() => {
            if (this._engulfed) {
                this.board.logger.log(
                    `${this.name} was engulfed`,
                    Colour.Magenta
                );
                this.sprite.setVisible(false);
                this.shadow.setVisible(false);
            } else {
                this.board.logger.log(
                    `${this.name} was released`,
                    Colour.Green
                );
                this.sprite.setVisible(true);
                this.shadow.setVisible(true);
            }
        });
    }

    get engulfed(): boolean {
        return this._engulfed;
    }

    get illusion(): boolean {
        return this._illusion;
    }

    get raisedDead(): boolean {
        return this._raisedDead;
    }

    set raisedDead(raisedDead: boolean) {
        this._raisedDead = raisedDead;
        if (raisedDead) {
            this.sprite.setTint(Piece.RAISED_DEAD_TINT);
        }
    }

    get stats(): IUnitStats {
        const stats: IUnitStats = {
            movement: this._properties.movement,
            combat: this._properties.combat,
            rangedCombat: this._properties.rangedCombat,
            range: this._properties.range,
            defense: this._properties.defense,
            maneuverability: this._properties.maneuverability,
            magicResistance: this._properties.magicResistance
        };
        if (this.hasStatus(UnitStatus.ShadowForm)) {
            stats.movement = 3;
            stats.defense = Math.min(stats.defense + 3,9);
        }
        if (this.hasStatus(UnitStatus.MagicSword)) {
            stats.combat = Math.min(stats.combat + 6,9);
        }
        else if (this.hasStatus(UnitStatus.MagicKnife)) {
            stats.combat = Math.min(stats.combat + 3,9);
        }
        if (this.hasStatus(UnitStatus.MagicArmour)) {
            stats.defense = Math.min(stats.defense + 6,9);
        }
        else if (this.hasStatus(UnitStatus.MagicShield)) {
            stats.defense = Math.min(stats.defense + 3,9);
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

    get properties(): IUnitProperties {
        return this._properties;
    }

    set currentRider(rider: Piece | null) {
        if (
            !this.hasStatus(UnitStatus.Mount) &&
            !this.hasStatus(UnitStatus.MountAny)
        ) {
            console.error("Cannot mount an unmountable unit");
            return;
        }
        this._currentRider = rider;
    }

    get currentRider(): Piece | null {
        return this._currentRider;
    }

    set currentMount(mount: Piece | null) {
        this._currentMount = mount;

        this.board.scene.tweens.add({
            targets: [this._sprite, this._shadow, ...this._effects.values()],
            alpha: mount != null ? 0 : 1,
            duration: Piece.DEFAULT_MOVE_DURATION / 2,
        });
    }

    get currentMount(): Piece | null {
        return this._currentMount;
    }

    async updatePosition(
        duration: number = Piece.DEFAULT_MOVE_DURATION
    ): Promise<void> {
        return new Promise((resolve) => {
            if (!this._sprite) {
                return;
            }

            const isoPosition: Phaser.Geom.Point = this.board.getIsoPosition(
                this.position
            );

            this.board.scene.tweens.add({
                targets: [this._sprite],
                displayOriginY: "+" + Board.DEFAULT_CELLSIZE,
                duration: duration / 2,
                yoyo: true,
            });

            this.board.scene.tweens.add({
                targets: [this._sprite, this._shadow],
                x: isoPosition.x,
                y: isoPosition.y - this._offsetY,
                duration: duration,
                onUpdateScope: this,
                ease: Phaser.Math.Easing.Cubic.InOut,
                onUpdate: () => {
                    this.updateDepth();
                },
                onCompleteScope: this,
                onComplete: () => {
                    this.updateDepth();
                    resolve();
                },
            });
        });
    }

    protected updateDepth() {
        this._sprite?.setDepth(this._sprite?.y as number);
    }

    get depth(): number {
        return this._sprite?.y || 0;
    }

    protected updateDirection(
        fromPoint: Phaser.Geom.Point,
        toPoint: Phaser.Geom.Point
    ) {
        const isoXOffset: number =
            Board.toIsometric(toPoint).x - Board.toIsometric(fromPoint).x;
        if (isoXOffset < 0) {
            this.direction = UnitDirection.Left;
        } else if (isoXOffset > 0) {
            this.direction = UnitDirection.Right;
        }
    }

    async moveTo(point: Phaser.Geom.Point, stepDuration?: number) {
        this.updateDirection(this.position, point);
        this.position = point;
        if (this.currentRider) {
            this.currentRider.position = point;
            this.currentRider.updatePosition(0);
        }
        if (
            this.currentMount &&
            !Phaser.Geom.Point.Equals(this.currentMount.position, this.position)
        ) {
            await this.board.dismountPiece(this.id);
        }
        await this.updatePosition(stepDuration);
    }

    async spread(): Promise<void> {
        const spreadAction: SpreadAction = Phaser.Math.RND.pick([
            SpreadAction.Spread,
            SpreadAction.Spread,
            SpreadAction.Spread,
            SpreadAction.Spread,
            SpreadAction.Spread,
            SpreadAction.None,
            SpreadAction.None,
            SpreadAction.Shrink,
        ]);
        if (spreadAction === SpreadAction.None) {
            return;
        }
        if (spreadAction === SpreadAction.Shrink) {
            if (this.currentEngulfed) {
                this.currentEngulfed.engulfed = false;
            }
            await new Promise((resolve, reject) => {
                this.board.scene.tweens.add({
                    targets: this.sprite,
                    duration: Piece.DEFAULT_MOVE_DURATION / 2,
                    scale: { from: 1, to: 0 },
                    onComplete: () => {
                        resolve(0);
                    },
                });
            });
            await this.destroy();
        }
        if (spreadAction === SpreadAction.Spread) {
            const adjacentPoints: Phaser.Geom.Point[] =
                this.board.getAdjacentPoints(this.position);
            const spreadPoint: Phaser.Geom.Point =
                Phaser.Math.RND.pick(adjacentPoints);
            const spreadPieces: Piece[] = this.board.getPiecesAtPosition(
                spreadPoint,
                (piece: Piece) => !piece.dead
            );

            if (spreadPieces.length > 0) {
                // Don't spread over owned or unspreadable pieces
                if (
                    spreadPieces.some(
                        (piece) =>
                            piece.owner === this.owner || !piece.canBeSpreadOn
                    )
                ) {
                    return;
                }
                // If spreading over a wizard (mounted or otherwise) we should
                // defeat them immediately
                if (
                    spreadPieces.some((piece) =>
                        piece.hasStatus(UnitStatus.Wizard)
                    )
                ) {
                    await spreadPieces
                        .find((piece) => piece.hasStatus(UnitStatus.Wizard))!
                        .kill();
                } else if (this.hasStatus(UnitStatus.Engulfs)) {
                    spreadPieces[0].engulfed = true;
                } else {
                    await Promise.all(
                        spreadPieces.map(async (piece) => {
                            this.board.logger.log(
                                `${piece.name} was destroyed by ${this.name}`
                            );
                            switch (this.properties.attackType) {
                                case UnitAttackType.Burned:
                                    await this.board.playEffect(
                                        EffectType.DragonFireHit,
                                        piece.sprite.getCenter(),
                                        null,
                                        piece
                                    );
                                    break;
                            }
                            return await piece.destroy();
                        })
                    );
                }
            }

            const unit: any = Piece.getUnitConfig(this.properties.id);

            const newPiece: Piece = await this.board.addPiece({
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
                    defense: unit.properties.def,
                    maneuverability: unit.properties.mnv,
                    magicResistance: unit.properties.res,
                    attackType: unit.attackType || "attacked",
                    rangedType: unit.rangedType || "shot",
                    status: [...(unit.status || [])],
                },
                shadowScale: unit.shadowScale,
                offsetY: unit.offY,
                owner: this.owner,
                illusion: !!this._illusion,
            });

            this.board.sound.play(`blob${Phaser.Math.RND.integerInRange(1, 2)}`);

            if (spreadPieces.length) {
                if (
                    newPiece.hasStatus(UnitStatus.Engulfs) &&
                    !spreadPieces[0].dead &&
                    !spreadPieces[0].hasStatus(UnitStatus.Wizard)
                ) {
                    newPiece.currentEngulfed = spreadPieces[0];
                } else {
                    await this.board.idleDelay(Piece.DEFAULT_MOVE_DURATION);
                }
            }
        }
    }

    async raiseDead(owner: Player): Promise<void> {
        if (!this.dead) {
            throw new Error("Cannot raise a piece that is not dead");
        }
        this._owner = owner;
        this._dead = false;
        this.raisedDead = true;
        if (this.sprite) {
            this.sprite.setVisible(true);
            this.playAnim();
        }
        this.addStatus(UnitStatus.Undead);
    }

    addStatus(status: UnitStatus): boolean {
        if (!this.hasStatus(status)) {
            this._properties.status.push(status);
            return true;
        }
        return false;
    }

    removeStatus(status: UnitStatus): boolean {
        if (this.hasStatus(status)) {
            this._properties.status = this._properties.status.filter(
                (s) => s !== status
            );
            return true;
        }
        return false;
    }

    hasStatus(status: UnitStatus): boolean {
        return this._properties.status.indexOf(status) !== -1;
    }

    inMovementRange(point: Phaser.Geom.Point): boolean {
        if (
            Phaser.Geom.Point.Equals(this.position, point) ||
            !this.board.moveGizmo.getPathTo(point)
        ) {
            return false;
        }
        return true;
    }

    inAttackRange(point: Phaser.Geom.Point): boolean {
        if (
            !this.moved &&
            this.hasStatus(UnitStatus.Flying) &&
            this.inMovementRange(point)
        ) {
            return true;
        }
        if (Board.distance(this.position, point) > 1.5) {
            return false;
        }
        return true;
    }

    inRangedAttackRange(point: Phaser.Geom.Point): boolean {
        if (Board.distance(this.position, point) > this.stats.range) {
            return false;
        }
        return true;
    }

    get canSelect(): boolean {
        if (this._engulfed) {
            return false;
        }
        if (
            (this.hasStatus(UnitStatus.Mount) ||
                this.hasStatus(UnitStatus.MountAny)) &&
            this.currentRider &&
            this.currentRider.owner === this.board.currentPlayer &&
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

    get canDisbelieve(): boolean {
        return (
            this.type === UnitType.Creature &&
            !this.hasStatus(UnitStatus.Wizard) &&
            !this.hasStatus(UnitStatus.Structure) &&
            !this.hasStatus(UnitStatus.Spreads) &&
            !this.hasStatus(UnitStatus.Tree)
        );
    }

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

    get canBeSubverted(): boolean {
        return (
            this.type === UnitType.Creature &&
            !this.hasStatus(UnitStatus.Wizard) &&
            !this.hasStatus(UnitStatus.Spreads) &&
            !this.hasStatus(UnitStatus.Structure) &&
            !this.hasStatus(UnitStatus.Tree) &&
            !this.hasStatus(UnitStatus.Invulnerable)
        );
    }

    get canAttack(): boolean {
        const neighbours: Piece[] = this.getNeighbours();

        if (
            this._dead ||
            this.engulfed ||
            this.attacked ||
            this.stats.combat === 0 ||
            neighbours.length === 0 ||
            neighbours.filter((neighbour: Piece) =>
                this.canAttackPiece(neighbour)
            ).length === 0
        ) {
            return false;
        }
        return true;
    }

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

    canAttackPiece(piece: Piece): boolean {
        if (
            this == piece ||
            this.owner === piece.owner ||
            this._dead ||
            this.engulfed ||
            piece.dead ||
            this.attacked ||
            piece.hasStatus(UnitStatus.Invulnerable) ||
            !this.inAttackRange(piece.position)
        ) {
            return false;
        }
        return true;
    }

    get canRangedAttack(): boolean {
        if (
            this._dead ||
            this.engulfed ||
            this.rangedAttacked ||
            this.stats.rangedCombat === 0 ||
            this.board.pieces.filter((piece: Piece) =>
                this.canRangedAttackPiece(piece)
            ).length === 0
        ) {
            return false;
        }
        return true;
    }

    canRangedAttackPiece(piece: Piece): boolean {
        if (
            this == piece ||
            piece == this.currentRider ||
            this._dead ||
            this.engulfed ||
            piece.dead ||
            this.rangedAttacked ||
            !this.moved ||
            piece.hasStatus(UnitStatus.Invulnerable) ||
            !this.inRangedAttackRange(piece.position)
        ) {
            return false;
        }
        return true;
    }

    canMountPiece(piece: Piece): boolean {
        if (
            this != piece &&
            !this._dead &&
            !this.engulfed &&
            !piece.dead &&
            !this.moved &&
            this.hasStatus(UnitStatus.Wizard) &&
            !piece.currentRider &&
            ((piece.hasStatus(UnitStatus.Mount) && piece.owner === this.owner) ||
            piece.hasStatus(UnitStatus.MountAny))
        ) {
            return true;
        }
        return false;
    }

    canEngagePiece(piece: Piece): boolean {
        if (
            this == piece ||
            this._dead ||
            this.engulfed ||
            piece.dead ||
            this.stats.maneuverability === 0 ||
            piece.stats.maneuverability === 0 ||
            this.currentMount ||
            piece.currentMount ||
            this.owner === piece.owner
        ) {
            return false;
        }
        return true;
    }

    getFirstEngagingPiece(): Piece | null {
        const neighbours: Piece[] = this.getNeighbours();
        for (const neighbour of neighbours) {
            if (this.canEngagePiece(neighbour)) {
                return neighbour;
            }
        }
        return null;
    }

    async engage(piece: Piece) {
        return new Promise(async (resolve: Function) => {
            if (this.canEngagePiece(piece)) {
                this.engaged = true;
                this.attacked = false;
                piece.engaged = true;
            }
            this.board.sound.play("engaged");
            this.board.logger.log(
                `${this.name} is engaged with ${piece.name}`,
                Colour.Yellow
            );
            setTimeout(() => {
                resolve();
            }, Board.DEFAULT_DELAY);
        });
    }

    getNeighbours(): Piece[] {
        return this.board.getAdjacentPiecesAtPosition(
            this.position,
            (piece: Piece) => !piece.dead
        );
    }

    async attack(piece: Piece): Promise<boolean> {
        if (this.canAttackPiece(piece)) {
            if (
                piece.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.AttackUndead)
            ) {
                this.board.sound.play("undead");
                this.board.logger.log(
                    `${this.name} cannot attack the undead`,
                    Colour.Cyan
                );
                return false;
            }

            this.updateDirection(this.position, piece.position);
            this.attacked = true;
            this.moved = true;

            const rollSuccess: boolean = this.board.roll(
                this.stats.combat,
                piece.stats.defense
            );

            this.board.sound.play("attackonly");
            this.board.logger.log(
                `${this.name} ${this.properties.attackType} ${piece.name}`
            );
            await this.board.playEffect(EffectType.AttackHit, piece.sprite.getCenter(), null, piece);
            await Board.delay(Board.DEFAULT_DELAY);

            if (this.hasStatus(UnitStatus.ShadowForm)) {
                this.removeStatus(UnitStatus.ShadowForm);
            }

            if (rollSuccess) {
                this.board.sound.play("killcreature");
                this.board.logger.log(`${this.name} defeated ${piece.name}`);
                await piece.kill();
                if (
                    this.board.getPiecesAtPosition(
                        piece.position,
                        (piece: Piece) => {
                            return !piece.dead;
                        }
                    ).length === 0 &&
                    this.canMove
                ) {
                    await this.board.movePiece(this.id, piece.position);
                }
                return true;
            }
        }
        return false;
    }

    async rangedAttack(piece: Piece): Promise<boolean> {
        if (this.canRangedAttackPiece(piece)) {
            if (
                piece.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.AttackUndead)
            ) {
                this.board.sound.play("undead");
                this.board.logger.log(
                    `${this.name} cannot attack the undead`,
                    Colour.Cyan
                );
                return false;
            }
            this.updateDirection(this.position, piece.position);

            let beamEffectType: EffectType = EffectType.ArrowBeam;
            let hitEffectType: EffectType = EffectType.ArrowHit;

            switch (this.properties.rangedType) {
                case "burned":
                    beamEffectType = EffectType.DragonFireBeam;
                    hitEffectType = EffectType.DragonFireHit;
                    break;
            }

            this.board.sound.play(beamEffectType === EffectType.DragonFireBeam ? "dragonfire6" : "bowfire6");
            await this.board.playEffect(
                beamEffectType,
                this.sprite.getCenter(),
                piece.sprite.getCenter(),
                piece
            );

            this.board.sound.play(beamEffectType === EffectType.DragonFireBeam ? "dragonfireexplosion" : "bowhit");
            await this.board.playEffect(
                hitEffectType,
                piece.sprite.getCenter(),
                null,
                piece
            );

            this.rangedAttacked = true;
            this.attacked = true;
            this.moved = true;

            const rollSuccess: boolean = this.board.roll(
                this.stats.rangedCombat,
                piece.stats.defense
            );

            this.board.logger.log(
                `${this.name} ${this.properties.rangedType} ${piece.name}`
            );

            if (rollSuccess) {
                if (this.hasStatus(UnitStatus.ShadowForm)) {
                    this.removeStatus(UnitStatus.ShadowForm);
                }
                this.board.sound.play("killcreature");
                this.board.logger.log(`${this.name} defeated ${piece.name}`);
                await piece.kill();
                return true;
            }
        }
        return false;
    }

    async kill(): Promise<void> {
        if (this.dead) {
            throw new Error("Cannot kill unit that is already dead");
        }
        if (this.currentRider) {
            await this.currentRider.dismount();
        }
        if (this.currentEngulfed) {
            this.currentEngulfed.engulfed = false;
            this.currentEngulfed = null;
        }
        this.owner = null;
        this._dead = true;
        if (this.illusion) {
            await this.board.playEffect(
                EffectType.DisbelieveHit,
                this.sprite.getCenter()
            );
            await this.destroy();
        } else if (
            this.hasStatus(UnitStatus.NoCorpse) ||
            this.hasStatus(UnitStatus.Undead)
        ) {
            await this.destroy();
        }
        if (!this._sprite) {
            return;
        }
        if (
            !this._sprite.texture.has(
                this._properties.id + `_${this._direction}_d`
            )
        ) {
            this._sprite.visible = false;
        } else {
            this._sprite.setDepth(this._sprite.depth - 1);
            this.playAnim();
        }
        this.board.emitBoardUpdateEvent();
    }

    async mount(piece: Piece): Promise<void> {
        if (this.canMountPiece(piece)) {
            this.moved = true;
            this.attacked = true;
            piece.moved = true;

            this.currentMount = piece;
            piece.currentRider = this;            
            await this.board.movePiece(this.id, piece.position);
            piece.createShaders(true, this.owner);
        }
    }

    async dismount(): Promise<void> {
        if (this.currentMount) {
            this.currentMount.currentRider = null;

            this.moved = true;
            this.currentMount.turnOver = true;
            this.board.logger.log(
                `${this.name} dismounted ${this.currentMount.name}`
            );
            this.currentMount.createShaders(true);
            this.currentMount = null;
        }
    }

    async destroy() {
        this._dead = true;
        if (this.currentRider) {
            await this.currentRider.dismount();
        }
        if (this._sprite) {
            this._sprite.destroy();
        }
        if (this._shadow) {
            this._shadow.destroy();
        }
        this._effects.forEach((sprite) => {
            sprite.destroy();
        });

        this.board.removePiece(this.id);
        this.board.emitBoardUpdateEvent();
    }

    protected playAnim() {
        if (!this._sprite || !this._sprite.anims) {
            return;
        }
        this._sprite.anims.stop();
        if (this._dead) {
            this._sprite.setFrame(this._properties.id + `_${this.direction}_d`);
            return;
        }

        this._sprite.anims.playAfterDelay(
            this._properties.id + `_${this.direction}`,
            Math.random() * 400
        );
        this._sprite.anims.setProgress(Math.random());
    }

    protected createShadow(): Phaser.GameObjects.Image | null {
        if (this.hasStatus(UnitStatus.Transparent)) {
            return null;
        }
        const isoPosition: Phaser.Geom.Point = this.board.getIsoPosition(
            this.position
        );

        this._shadow = this.board.scene.add.image(
            isoPosition.x,
            isoPosition.y,
            "board",
            "shadow-" + this._shadowScale
        );

        this.board.getLayer(BoardLayer.Shadows).add(this._shadow);

        this._shadow.setOrigin(0.5, 0.5);
        this._shadow.displayOriginY = -4;

        return this._shadow;
    }

    reset() {
        this.turnOver = false;
        this.engaged = false;

        if (this.currentRider) {
            this.currentRider.reset();
        }
    }

    protected createSprite(): Phaser.GameObjects.Sprite {
        if (this._sprite) {
            return this._sprite;
        }

        const isoPosition: Phaser.Geom.Point = this.board.getIsoPosition(
            this.position
        );

        this._sprite = this.board.scene.add.sprite(
            isoPosition.x,
            isoPosition.y - this._offsetY,
            "classicunits",
            this._properties.id + "_r_0"
        );

        this.updateDepth();

        this._sprite.setOrigin(0.5, 0.5);

        this.playAnim();

        this.board.getLayer(BoardLayer.Pieces).add(this._sprite);

        if (this.hasStatus(UnitStatus.Spreads)) {
            this.board.scene.tweens.add({
                targets: this._sprite,
                duration: Piece.DEFAULT_MOVE_DURATION / 2,
                scale: { from: 0, to: 1 },
            });
        }

        return this._sprite;
    }

    protected createShaders(forceUpdate?: boolean, tempOwner?: Player): void {
        if (!forceUpdate && this._ownerHighlightTween) {
            return;
        }

        this.highlighted = false;
        this._ownerHighlightTween?.stop?.().destroy?.();

        const startColor: Phaser.Display.Color = new Phaser.Display.Color(
            0,
            0,
            0
        );
        const endColor: Phaser.Display.Color =
            Phaser.Display.Color.ValueToColor(tempOwner?.colour ?? this.owner?.colour ?? 0);

        const postFxPlugin: any = this.board.scene.game.plugins.get(
            "rexcolorreplacepipelineplugin"
        );
        const postFxPipeline = postFxPlugin.add(this._sprite, {
            originalColor: startColor,
            epsilon: 0,
        });

        const tweenColours: Phaser.Types.Display.ColorObject[] = new Array(
            Piece.DEFAULT_HIGHLIGHT_STEPS
        );
        for (let i = 0; i < Piece.DEFAULT_HIGHLIGHT_STEPS; i++) {
            tweenColours[i] = Phaser.Display.Color.Interpolate.ColorWithColor(
                startColor,
                endColor,
                Piece.DEFAULT_HIGHLIGHT_STEPS - 1,
                i
            );
        }

        this._ownerHighlightTween = this.board.scene.tweens.addCounter({
            from: 0,
            to: Piece.DEFAULT_HIGHLIGHT_STEPS - 1,
            duration: Piece.DEFAULT_HIGHLIGHT_DURATION,
            repeat: -1,
            yoyo: true,
            onUpdate: (tween) => {
                const newColor: Phaser.Types.Display.ColorObject =
                    tweenColours[Math.round(tween.getValue())];

                postFxPipeline.newColor = Phaser.Display.Color.GetColor(
                    newColor.r,
                    newColor.g,
                    newColor.b
                );
            },
        });

        this._ownerHighlightTween.pause();
    }

    static getUnitConfig(id: string): any {
        return (units as any)[id];
    }

    static getUnitPropertiesByName(name: string): any {
        let key = "";
        for (let [k, unit] of Object.entries(units)) {
            if (unit.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const unit: any = this.getUnitConfig(key);

        return {
            id: key,
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
            status: [...(unit.status || [])],
        };
    }

    static getPieceProperties(name: string): any {
        let key = "";
        for (let [k, piece] of Object.entries(units)) {
            if (piece.name.toLowerCase() === name.toLowerCase()) {
                key = k;
                break;
            }
        }

        if (!key) {
            return;
        }

        const unit: any = (units as any)[key];

        return {
            type: UnitType.Creature,
            properties: {
                id: key,
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
                status: [...(unit.status || [])],
            },
            shadowScale: unit.shadowScale,
            offsetY: unit.offY,
        };
    }
}
