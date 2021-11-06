import { Board } from "./board";
import { PieceConfig } from "./configs/piececonfig";
import { Entity } from "./entity";
import { BoardLayer } from "./enums/boardlayer";
import { UnitType } from "./enums/unittype";
import { UnitDirection } from "./enums/unitdirection";
import { UnitStatus } from "./enums/unitstatus";
import { IUnitProperties } from "./interfaces/unitproperties";
import { Player } from "./player";
import { Wizard } from "./wizard";
import { units } from "../../assets/data/classicunits.json";

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

    protected _currentMount: Piece | null;
    protected _currentRider: Piece | null;

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
            status: [] as UnitStatus[],
        };

        this._direction =
            this.position.x - this.position.y > 0
                ? UnitDirection.Left
                : UnitDirection.Right;

        this._dead = false;
        this._moved = false;
        this._attacked = false;
        this._rangedAttacked = false;
        this._engaged = false;

        this._currentRider = null;
        this._currentMount = null;

        this._shadowScale = config.shadowScale || 3;
        this._offsetY = config.offsetY || 0;

        setTimeout(() => {
            this.initSprites();
        }, Math.random() * 20);
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
            (this.moved && this.attacked && this.rangedAttacked)
        );
    }

    set turnOver(state: boolean) {
        this.moved = this.attacked = this.rangedAttacked = state;

        if (state) {
            this._sprite?.setTint(0x7f7f7f);
        } else {
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
        if (this.currentRider) {
            this.currentRider.moved = moved;
        }
    }

    get attacked(): boolean {
        if (this.properties.combat === 0) {
            return true;
        }
        return this._attacked;
    }

    set attacked(attacked: boolean) {
        this._attacked = attacked;
        if (this.currentRider) {
            this.currentRider.attacked = attacked;
        }
    }

    get rangedAttacked(): boolean {
        if (this.properties.rangedCombat === 0 || this.properties.range === 0) {
            return true;
        }
        return this._rangedAttacked;
    }

    set rangedAttacked(rangedAttacked: boolean) {
        this._rangedAttacked = rangedAttacked;
        if (this.currentRider) {
            this.currentRider.turnOver = true;
        }
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
            targets: [this._sprite, this._shadow],
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
                targets: this._sprite,
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

    async moveTo(point: Phaser.Geom.Point) {
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
        await this.updatePosition();
    }

    hasStatus(status: UnitStatus): boolean {
        return this._properties.status.indexOf(status) !== -1;
    }

    inMovementRange(point: Phaser.Geom.Point): boolean {
        if (
            Phaser.Geom.Point.Equals(this.position, point) ||
            Board.distance(this.position, point) >
                this.properties.movement + 0.5
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
            (this.hasStatus(UnitStatus.Mount) ||
                this.hasStatus(UnitStatus.MountAny)) &&
            this.currentRider &&
            !this.currentRider.moved
        ) {
            return true;
        }
        if (
            this.dead ||
            this.turnOver ||
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

    get canMove(): boolean {
        if (
            this._dead ||
            this.properties.movement === 0 ||
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
            piece == this.currentRider ||
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
            this != piece &&
            !this._dead &&
            !piece.dead &&
            !this.moved &&
            this.hasStatus(UnitStatus.Wizard) &&
            ((piece.hasStatus(UnitStatus.Mount) &&
                piece.owner === this.owner) ||
                (piece.hasStatus(UnitStatus.MountAny) && !piece.currentRider))
        ) {
            return true;
        }
        return false;
    }

    canEngagePiece(piece: Piece): boolean {
        if (
            this == piece ||
            this._dead ||
            piece.dead ||
            this.properties.maneuverability === 0 ||
            piece.properties.maneuverability === 0 ||
            this.owner === piece.owner
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
            this.updateDirection(this.position, piece.position);
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

            console.log(
                "Attack!",
                this.name,
                attackRoll,
                piece.name,
                defenseRoll
            );

            if (attackRoll > defenseRoll) {
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
                    await this.moveTo(piece.position);
                }
            }
        }
    }

    async rangedAttack(piece: Piece): Promise<void> {
        if (this.canRangedAttackPiece(piece)) {
            this.updateDirection(this.position, piece.position);
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

    async kill(): Promise<void> {
        if (this.dead) {
            throw new Error("Cannot kill unit that is already dead");
        }
        if (this.currentRider) {
            await this.currentRider.dismount();
        }
        this.owner = null;
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

    async mount(piece: Piece): Promise<void> {
        if (this.canMountPiece(piece)) {
            this.turnOver = true;
            this.currentMount = piece;

            piece.currentRider = this;
            piece.moved = true;

            if (piece.canAttack || piece.canRangedAttack) {
                this.board.selectPiece(piece.id);
                this.board.cursor.update(true);
            } else {
                piece.turnOver = true;
            }

            await this.moveTo(piece.position);
        }
    }

    async dismount(): Promise<void> {
        if (this.currentMount) {
            this.currentMount.currentRider = null;

            this.moved = true;
            this.currentMount.turnOver = true;
            this.currentMount = null;
        }
    }

    destroy() {
        this._dead = true;
        if (this._sprite) {
            this._sprite.destroy();
        }
        if (this._shadow) {
            this._shadow.destroy();
        }
        this.board.removePiece(this.id);
    }

    protected playAnim() {
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

        return this._sprite;
    }

    protected createShaders(): void {
        // TODO: Implement shaders
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
            attackDescription: unit.attackType || "attacked",
            rangedDescription: unit.rangedDescription || "shot",
            status: unit.status || [],
        };
    }
}
