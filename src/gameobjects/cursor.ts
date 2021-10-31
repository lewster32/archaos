import { Board } from "./board";
import { ActionType } from "./enums/actiontype";
import { BoardLayer } from "./enums/boardlayer";
import { BoardState } from "./enums/boardstate";
import { CursorType } from "./enums/cursortype";
import { InputType } from "./enums/inputtype";
import { UnitStatus } from "./enums/unitstatus";
import { Piece } from "./piece";

export class Cursor {
    private _position: Phaser.Geom.Point;
    private _image: Phaser.GameObjects.Image;
    private _board: Board;
    private _type: CursorType;

    static OFFSET: Phaser.Geom.Point = new Phaser.Geom.Point(0, 0);

    constructor(board: Board) {
        this._board = board;

        this._image = this._board.scene.add.image(0, 0, "cursors", "idle");
        this._image.setOrigin(0.5, 0.5);
        this._board.getLayer(BoardLayer.Pieces).add(this._image);
        this._type = CursorType.Idle;

        this._position = new Phaser.Geom.Point(0, 0);

        this._board.scene.input.on("pointermove", async () => {
            await this.update();
        });

        this._board.scene.input.on("pointerup", async () => {
            await this.action(InputType.Click);
        });

        this._board.scene.input.keyboard.on(
            "keyup",
            async (event: KeyboardEvent) => {
                if (event.key === "Escape") {
                    await this.action(InputType.Cancel);
                }
            }
        );

        setTimeout(async () => {
            await this.update(true);
        }, 0);
    }

    get position(): Phaser.Geom.Point {
        return this._position;
    }

    async update(force?: boolean): Promise<ActionType> {
        const pointer: Phaser.Input.Pointer =
            this._board.scene.input.activePointer;

        const translatedIsoPosition: Phaser.Geom.Point =
            this.translateCursorPosition(pointer.position);

        // Only perform one intent check per tile (unless forced)
        if (
            !force &&
            Phaser.Geom.Point.Equals(translatedIsoPosition, this._position)
        ) {
            return ActionType.None;
        }
        this._position.setTo(translatedIsoPosition.x, translatedIsoPosition.y);

        // Board bounds check
        if (
            this._position.x < 0 ||
            this._position.y < 0 ||
            this._position.x >= this._board.width ||
            this._position.y >= this._board.height
        ) {
            this._image.setVisible(false);
            return ActionType.None;
        }

        this._image.setVisible(true);

        const allowedAction: ActionType = await this._board.rules.processIntent(
            this._board
        );

        const selectedPiece: Piece | null = this._board.selected;

        switch (allowedAction) {
            case ActionType.None:
                this._image.setVisible(false);
                return ActionType.None;
            case ActionType.Idle:
                this.type = CursorType.Idle;
                break;
            case ActionType.Info:
                this.type = CursorType.Info;
                break;
            case ActionType.Invalid:
                this.type = CursorType.Invalid;
                break;
            case ActionType.Select:
                this.type = CursorType.Select;
                break;
            case ActionType.Move:
                if (selectedPiece) {
                    if (selectedPiece.hasStatus(UnitStatus.Flying)) {
                        this.type = CursorType.Fly;
                        break;
                    }
                    this.type = Cursor.getMovementDirectionType(
                        selectedPiece?.position,
                        this._position
                    );
                }
                break;
            case ActionType.Mount:
                this.type = CursorType.Mount;
                break;
            case ActionType.Dismount:
                this.type = CursorType.Dismount;
                break;
            case ActionType.Attack:
                this.type = CursorType.Attack;
                break;
            case ActionType.RangedAttack:
                this.type = CursorType.RangedAttack;
                break;
        }

        const isoPosition: Phaser.Geom.Point = this._board.getIsoPosition(
            new Phaser.Geom.Point(
                translatedIsoPosition.x,
                translatedIsoPosition.y
            )
        );

        this._image.x = isoPosition.x + Cursor.OFFSET.x;
        this._image.y = isoPosition.y + Cursor.OFFSET.y;

        return allowedAction;

        /*
        if (this._board.state === BoardState.Idle) {
            this._image.setVisible(false);
            return;
        }

        this._image.setVisible(true);

        const pointer: Phaser.Input.Pointer =
            this._board.scene.input.activePointer;

        const translatedIsoPosition: Phaser.Geom.Point =
            this.translateCursorPosition(pointer.position);

        if (
            !force &&
            Phaser.Geom.Point.Equals(translatedIsoPosition, this._position)
        ) {
            return;
        }
        this._position.setTo(translatedIsoPosition.x, translatedIsoPosition.y);

        const isoPosition: Phaser.Geom.Point = this._board.getIsoPosition(
            new Phaser.Geom.Point(
                translatedIsoPosition.x,
                translatedIsoPosition.y
            )
        );

        if (
            translatedIsoPosition.x < 0 ||
            translatedIsoPosition.y < 0 ||
            translatedIsoPosition.x >= this._board.width ||
            translatedIsoPosition.y >= this._board.height
        ) {
            this._image.setVisible(false);
            return;
        }
        this._image.setVisible(true);

        const hoveredPieces: Piece[] = this._board.getPiecesAtPosition(
            this._position,
            (piece: Piece) => piece.owner == null
        );

        switch (this._board.state) {
            case BoardState.View:
                if (hoveredPieces.length > 0) {
                    this.type = CursorType.Info;
                } else {
                    this.type = CursorType.Idle;
                }
                break;
            case BoardState.MovePieces:
                if (this._board.selected) {
                    if (
                        hoveredPieces.length > 0 &&
                        hoveredPieces[0] !== this._board.selected
                    ) {
                        if (
                            this._board.selected.canAttack &&
                            this._board.selected.inAttackRange(
                                this._position
                            )
                        ) {
                            this.type = CursorType.Attack;
                        } else if (
                            this._board.selected.canRangedAttack &&
                            this._board.selected.inRangedAttackRange(
                                this._position
                            )
                        ) {
                            this.type = CursorType.RangedAttack;
                        } else {
                            this.type = CursorType.Invalid;
                        }
                    } else {
                        if (this._board.selected.inMovementRange(this._position) && !this._board.selected.moved) {
                            this.type = CursorType.Fly;
                        } else {
                            this.type = CursorType.Invalid;
                        }
                    }
                } else {
                    if (hoveredPieces.length > 0) {
                        if (hoveredPieces[0].canSelect) {
                            this.type = CursorType.Select;
                        } else {
                            this.type = CursorType.Invalid;
                        }
                    } else {
                        this.type = CursorType.Idle;
                    }
                }
                break;
        }

        this._image.x = isoPosition.x + Cursor.OFFSET.x;
        this._image.y = isoPosition.y + Cursor.OFFSET.y;
        */
    }

    async action(input: InputType) {
        const intendedAction: ActionType = await this.update(true);

        const invokedAction: ActionType = await this._board.rules.processAction(
            this._board,
            intendedAction,
            input
        );

        this.update(true);

        const selected: Piece | null = this._board.selected;

        if (
            selected &&
            selected.moved &&
            !selected.canAttack &&
            !selected.canRangedAttack
        ) {
            selected.moved = selected.attacked = selected.rangedAttacked = true;
            this._board.deselectPiece();
        }

        /*
        if (this._board.state === BoardState.Idle) {
            return;
        }

        const hoveredPieces: Piece[] = this._board.getPiecesAtPosition(
            this._position
        );

        switch (this._board.state) {
            case BoardState.View:
                if (hoveredPieces.length > 0) {
                    this._board.scene.events.emit(
                        "piece-info",
                        hoveredPieces[0]
                    );
                }
                break;
            case BoardState.MovePieces:
                if (this._board.selected) {
                    if (
                        hoveredPieces.length > 0 &&
                        hoveredPieces[0] === this._board.selected
                    ) {
                        return;
                    }

                    if (
                        this._board.selected.moved ||
                        !this._board.selected.inMovementRange(this._position)
                    ) {
                        this.type = CursorType.Invalid;
                        return;
                    }
                    const previousState: BoardState = this._board.state;
                    this._board.state = BoardState.Idle;
                    this.type = CursorType.Idle;

                    await this._board.movePiece(
                        this._board.selected.id,
                        this._position
                    );
                    this._board.selected.moved = true;
                    this._board.state = previousState;

                    if (this._board.selected.canAttack) {
                        this.type = CursorType.Attack;
                    } else if (this._board.selected.canRangedAttack) {
                        this.type = CursorType.RangedAttack;
                    } else {
                        this._board.deselectPiece();
                    }
                } else {
                    if (
                        hoveredPieces.length > 0 &&
                        hoveredPieces[0].canSelect
                    ) {
                        this._board.selectPiece(hoveredPieces[0].id);
                        this.type = CursorType.Fly;
                    }
                }
                break;
        }
        */
    }

    set type(type: CursorType) {
        this._type = type;
        this._image.setFrame(type);
        switch (this._type) {
            case CursorType.Idle:
                this._image.setDepth(this._image.y - 8);
                break;
            default:
                this._image.setDepth(this._image.y + 8);
                break;
        }
    }

    get type(): CursorType {
        return this._type;
    }

    /**
     * Make this better :(
     *
     * @param vector
     * @returns
     */
    private translateCursorPosition(
        vector: Phaser.Math.Vector2
    ): Phaser.Geom.Point {
        const point: Phaser.Math.Vector2 = new Phaser.Math.Vector2(
            vector.x,
            vector.y
        );

        point.x -=
            Board.DEFAULT_CELLSIZE * -1 +
            (this._board.scene.game.config.width as number) / 2;
        point.y += Board.DEFAULT_CELLSIZE * -2.5;

        point.y *= 1.6;

        const ly: number = (2 * point.y - point.x) / 2 - Board.DEFAULT_CELLSIZE;
        const lx: number = point.x + ly - Board.DEFAULT_CELLSIZE;

        const ax: number = Math.round(lx / Board.DEFAULT_CELLSIZE) - 1;
        const ay: number = Math.round(ly / Board.DEFAULT_CELLSIZE) - 1;

        point.x = Math.round(ax);
        point.y = Math.round(ay);

        return new Phaser.Geom.Point(point.x, point.y);
    }

    static getMovementDirectionType(
        fromPoint: Phaser.Geom.Point,
        toPoint: Phaser.Geom.Point
    ): CursorType {
        const dx: number = toPoint.x - fromPoint.x;
        const dy: number = toPoint.y - fromPoint.y;

        if (dx === 0 && dy === 1) {
            return CursorType.DownLeft;
        } else if (dx === 1 && dy === 1) {
            return CursorType.Down;
        } else if (dx === 1 && dy === 0) {
            return CursorType.DownRight;
        } else if (dx === 1 && dy === -1) {
            return CursorType.Right;
        } else if (dx === 0 && dy === -1) {
            return CursorType.UpRight;
        } else if (dx === -1 && dy === -1) {
            return CursorType.Up;
        } else if (dx === -1 && dy === 0) {
            return CursorType.UpLeft;
        } else if (dx === -1 && dy === 1) {
            return CursorType.Left;
        } else {
            return CursorType.Invalid;
        }
    }
}
