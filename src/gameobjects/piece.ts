import { Board } from "./board";
import { PieceConfig } from "./configs/piececonfig";
import { Entity } from "./entity";
import { BoardLayer } from "./enums/boardlayer";
import { UnitType } from "./enums/unittype";
import { UnitDirection } from "./enums/unitdirection";
import { UnitStatus } from "./enums/unitstatus";
import { IUnitProperties } from "./interfaces/unitproperties";
import { Player } from "./player";

export class Piece extends Entity {
    static DEFAULT_MOVE_DURATION: number = 750;

    protected _type: UnitType;
    protected _owner: Player | null;
    protected _properties: IUnitProperties;
    protected _shadowScale: number;
    protected _shadow?: Phaser.GameObjects.Image;
    protected _sprite?: Phaser.GameObjects.Sprite;
    protected _offsetY: number;
    protected _direction: UnitDirection;

    protected _dead: boolean;
    protected _moved: boolean;
    protected _attacked: boolean;
    protected _rangedAttacked: boolean;
    protected _engaged: boolean;

    constructor(board: Board, id: number, config: PieceConfig) {
        super(board, id, config.x, config.y);
        this._type = config.type;

        this._owner = config.owner || null;
        this._properties = config.properties || {
            id: "",
            name: "Unnamed Unit",
            movement: 1,
            combat: 3,
            rangedCombat: 0,
            range: 0,
            defense: 3,
            maneuverability: 3,
            magicResistance: 3,
            attackDescription: "hit",
            rangedDescription: "shot",
            status: [] as UnitStatus[]
        };
        this._direction = UnitDirection.Right;

        this._dead = false;
        this._moved = false;
        this._attacked = false;
        this._rangedAttacked = false;
        this._engaged = false;

        this._shadowScale = config.shadowScale || 3;
        this._offsetY = config.offsetY || 0;

        setTimeout(() => {
            this.initSprites();
        });
    }

    initSprites() {
        this.createShadow();
        this.createSprite();
    }

    get turnOver(): boolean {
        return this.moved && this.attacked && this.rangedAttacked;
    }

    set turnOver(state: boolean) {
        this.moved = this.attacked = this.rangedAttacked = state;

        if (state) {
            this._sprite?.setTint(0x7f7f7f);
        }
        else {
            this._sprite?.clearTint();
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
        this._direction = direction;
        this.playAnim();
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

    get moved(): boolean {
        if (this.properties.movement === 0) {
            return true;
        }
        return this._moved;
    }

    set moved(moved: boolean) {
        this._moved = moved;
    }

    get attacked(): boolean {
        if (this.properties.combat === 0) {
            return true;
        }
        return this._attacked;
    }

    set attacked(attacked: boolean) {
        this._attacked = attacked;
    }

    get rangedAttacked(): boolean {
        if (this.properties.rangedCombat === 0 || this.properties.range === 0) {
            return true;
        }
        return this._rangedAttacked;
    }

    set rangedAttacked(rangedAttacked: boolean) {
        this._rangedAttacked = rangedAttacked;
    }

    get engaged(): boolean {
        return this._engaged;
    }

    set engaged(engaged: boolean) {
        this._engaged = engaged;
    }

    get properties(): IUnitProperties {
        return this._properties;
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
                targets: this._sprite,
                displayOriginY: Board.DEFAULT_CELLSIZE,
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

    updateDepth() {
        this._sprite?.setDepth(this._sprite?.y as number);
    }

    get depth(): number {
        return this._sprite?.y || 0;
    }

    async moveTo(point: Phaser.Geom.Point) {
        const isoXOffset: number =
            Board.toIsometric(point).x - Board.toIsometric(this.position).x;
        if (isoXOffset < 0) {
            this.direction = UnitDirection.Left;
        } else if (isoXOffset > 0) {
            this.direction = UnitDirection.Right;
        }
        this.position = point;
        await this.updatePosition();
    }

    hasStatus(status: UnitStatus): boolean {
        return this._properties.status.indexOf(status) !== -1;
    }

    inMovementRange(point: Phaser.Geom.Point): boolean {
        if (
            Board.distance(this.position, point) >
            this.properties.movement + 0.5
        ) {
            return false;
        }
        return true;
    }

    inAttackRange(point: Phaser.Geom.Point): boolean {
        if (!this.moved && this.hasStatus(UnitStatus.Flying) && this.inMovementRange(point)) {
            return true;
        }
        if (Board.distance(this.position, point) > 1.5) {
            return false;
        }
        return true;
    }

    inRangedAttackRange(point: Phaser.Geom.Point): boolean {
        if (
            Board.distance(this.position, point) >
            this.properties.range + 0.5
        ) {
            return false;
        }
        return true;
    }

    get canSelect(): boolean {
        if (
            this.dead ||
            (this.moved && this.attacked && this.rangedAttacked) ||
            this.hasStatus(UnitStatus.Structure) ||
            (this.properties.combat === 0 &&
                this.properties.rangedCombat === 0 &&
                this.properties.movement === 0)
        ) {
            return false;
        }
        return true;
    }

    get canAttack(): boolean {
        const neighbours: Piece[] = this.getNeighbours();

        if (
            this._dead ||
            this.attacked ||
            this.properties.combat === 0 ||
            neighbours.length === 0 ||
            neighbours.filter((neighbour: Piece) =>
                this.canAttackPiece(neighbour)
            ).length === 0
        ) {
            return false;
        }
        return true;
    }

    canAttackPiece(piece: Piece): boolean {
        if (
            this == piece ||
            this._dead ||
            piece.dead ||
            this.attacked ||
            piece.hasStatus(UnitStatus.Invulnerable) ||
            (piece.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.AttackUndead)) ||
            !this.inAttackRange(piece.position)
        ) {
            return false;
        }
        return true;
    }

    get canRangedAttack(): boolean {
        if (
            this._dead ||
            this.rangedAttacked ||
            this.properties.rangedCombat === 0 ||
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
            this._dead ||
            piece.dead ||
            this.rangedAttacked ||
            piece.hasStatus(UnitStatus.Invulnerable) ||
            (piece.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.Undead) &&
                !this.hasStatus(UnitStatus.AttackUndead)) ||
            !this.inRangedAttackRange(piece.position)
        ) {
            return false;
        }
        return true;
    }

    canMountPiece(piece: Piece): boolean {
        if (
            this == piece ||
            this._dead ||
            piece.dead ||
            this.moved ||
            !this.hasStatus(UnitStatus.Wizard) ||
            (piece.hasStatus(UnitStatus.Mount) && piece.owner !== this.owner) ||
            !piece.hasStatus(UnitStatus.MountAny)
        ) {
            return false;
        }
        return true;
    }

    canEngagePiece(piece: Piece): boolean {
        if (
            this == piece ||
            this._dead ||
            piece.dead ||
            this.properties.maneuverability === 0 ||
            piece.properties.maneuverability === 0
            // this.owner === piece.owner
        ) {
            return false;
        }
        return true;
    }

    getNeighbours(): Piece[] {
        return this.board.getAdjacentPiecesAtPosition(
            this.position,
            (piece: Piece) => !piece.dead
        );
    }

    async attack(piece: Piece): Promise<void> {
        if (this.canAttackPiece(piece)) {
            this.attacked = true;
            this.moved = true;
            const attackRoll: number = Phaser.Math.Between(
                0,
                this.properties.combat
            );
            const defenseRoll: number = Phaser.Math.Between(
                0,
                piece.properties.defense
            );

            console.log("Attack!", attackRoll, defenseRoll);

            if (attackRoll > defenseRoll) {
                await piece.kill();
                await this.moveTo(piece.position);
            }
        }
    }

    async rangedAttack(piece: Piece): Promise<void> {
        if (this.canRangedAttackPiece(piece)) {
            this.rangedAttacked = true;
            this.attacked = true;
            this.moved = true;
            const attackRoll: number = Phaser.Math.Between(
                0,
                this.properties.rangedCombat
            );
            const defenseRoll: number = Phaser.Math.Between(
                0,
                piece.properties.defense
            );

            console.log("Ranged Attack!", attackRoll, defenseRoll);

            if (attackRoll > defenseRoll) {
                await piece.kill();
            }
        }
    }

    async kill() {
        if (this.dead) {
            throw new Error("Cannot kill unit that is already dead");
        }
        this._dead = true;
        if (this.hasStatus(UnitStatus.NoCorpse)) {
            this.destroy();
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
            this._sprite.depth -= 1;
            this.playAnim();
        }
    }

    destroy() {
        this._dead = true;
        if (this._sprite) {
            this._sprite.destroy();
        }
        this.board.removePiece(this.id);
    }

    playAnim() {
        if (!this._sprite) {
            return;
        }
        this._sprite.anims.stop();
        if (this._dead) {
            this._sprite.setFrame(this._properties.id + `_${this.direction}_d`);
        } else {
            this._sprite.anims.playAfterDelay(
                this._properties.id + `_${this.direction}`,
                Math.random() * 400
            );
            this._sprite.anims.setProgress(Math.random());
        }
    }

    createShadow(): Phaser.GameObjects.Image | null {
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

    createSprite(): Phaser.GameObjects.Sprite {
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

        return this._sprite;
    }
}
