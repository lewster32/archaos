import { Board } from "./board";
import { PieceConfig } from "./configs/piececonfig";
import { Entity } from "./entity";
import { BoardLayer } from "./enums/boardlayer";
import { PieceType } from "./enums/piecetype";
import { UnitDirection } from "./enums/unitdirection";
import { UnitStatus } from "./enums/unitstatus";
import { IUnitProperties } from "./interfaces/unitproperties";
import { Player } from "./player";

export class Piece extends Entity {
    static DEFAULT_MOVE_DURATION: number = 750;
    static NEIGHBOUR_DIRECTIONS: { x: number; y: number }[] = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
    ];

    private _type: PieceType;
    private _owner: Player | null;
    private _properties: IUnitProperties;
    private _shadowScale: number;
    private _shadow?: Phaser.GameObjects.Image;
    private _sprite?: Phaser.GameObjects.Sprite;
    private _offsetY: number;
    private _direction: UnitDirection;

    private _dead: boolean;
    private _moved: boolean;
    private _attacked: boolean;
    private _rangedAttacked: boolean;

    constructor(board: Board, id: number, config: PieceConfig) {
        super(board, id, config.x, config.y);
        this._type = config.type;

        this._owner = config.owner || null;
        this._properties = config.properties;
        this._direction = UnitDirection.Right;

        this._dead = false;
        this._moved = false;
        this._attacked = false;
        this._rangedAttacked = false;

        this._shadowScale = config.shadowScale || 3;
        this._offsetY = config.offsetY || 0;
        this.createShadow();
        this.createSprite();
    }

    get type(): PieceType {
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
        return this._properties.name;
    }

    get sprite(): Phaser.GameObjects.Sprite {
        return this._sprite!;
    }

    get moved(): boolean {
        return this._moved;
    }

    set moved(moved: boolean) {
        this._moved = moved;
        this._sprite?.setTint(moved ? 0x444444 : 0xffffff);
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

    get movementRange(): number {
        return Math.max(this.properties.movement, this.properties.range);
    }

    inMovementRange(point: Phaser.Geom.Point): boolean {
        if (Board.distance(this.position, point) > this.movementRange + .5) {
            return false;
        }
        return true;
    }

    getNeighbours(): Piece[] {
        const neighbours: Piece[] = [];
        const position: Phaser.Geom.Point = Phaser.Geom.Point.Clone(
            this.position
        );
        for (const direction of Piece.NEIGHBOUR_DIRECTIONS) {
            const directionNeighbours: Piece[] = this.board.getPiecesAtPosition(
                new Phaser.Geom.Point(
                    position.x + direction.x,
                    position.y + direction.y
                )
            );
            if (directionNeighbours) {
                neighbours.concat(directionNeighbours);
            }
        }
        return neighbours;
    }

    kill() {
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
