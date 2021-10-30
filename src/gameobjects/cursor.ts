import { Board } from "./board";
import { BoardLayer } from "./enums/boardlayer";
import { BoardState } from "./enums/boardstate";
import { CursorType } from "./enums/cursortype";
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
        this._image.setOrigin(.5, .5);
        this._board.getLayer(BoardLayer.Pieces).add(this._image);
        this._type = CursorType.Idle;

        this._position = new Phaser.Geom.Point(0, 0);

        this._board.scene.input.on("pointermove", () => {
            this.update();
        });

        this._board.scene.input.on("pointerup", async () => {
            this.update();
            await this.action();
        });

        this._board.scene.input.keyboard.on("keyup", (event: KeyboardEvent) => {
            if (event.key === "Escape" && this._board.state === BoardState.MovePieces && this._board.selected) {
                this._board.deselectPiece();
                this.update(true);
            }
        });
    }

    update(force?: boolean) {
        if (this._board.state === BoardState.Idle) {
            this._image.setVisible(false);
            return;
        }

        this._image.setVisible(true);

        const pointer: Phaser.Input.Pointer = this._board.scene.input.activePointer;

        const translatedIsoPosition: Phaser.Geom.Point = this.translateCursorPosition(pointer.position);

        if (!force && Phaser.Geom.Point.Equals(translatedIsoPosition, this._position)) {
            return;
        }
        this._position.setTo(translatedIsoPosition.x, translatedIsoPosition.y);

        const isoPosition: Phaser.Geom.Point = this._board.getIsoPosition(
            new Phaser.Geom.Point(
                translatedIsoPosition.x,
                translatedIsoPosition.y
            )
        );

        if (translatedIsoPosition.x < 0 || translatedIsoPosition.y < 0 || translatedIsoPosition.x >= this._board.width || translatedIsoPosition.y >= this._board.height) {
            this._image.setVisible(false);
            return;
        }
        this._image.setVisible(true);

        const hoveredPieces: Piece[] = this._board.getPiecesAtPosition(this._position);

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

                    if (!this._board.selected.inMovementRange(this._position)) {
                        this.type = CursorType.Invalid;
                    }
                    else {
                        if (hoveredPieces.length > 0 && hoveredPieces[0] !== this._board.selected) {
                            this.type = CursorType.Attack;
                        } else {
                            this.type = CursorType.Fly;
                        }
                    }
                } else {
                    if (hoveredPieces.length > 0) {
                        if (!hoveredPieces[0].moved) {
                            this.type = CursorType.Select;
                        }
                        else {
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
    }

    async action() {
        if (this._board.state === BoardState.Idle) {
            return;
        }

        const hoveredPieces: Piece[] = this._board.getPiecesAtPosition(this._position);

        switch (this._board.state) {
            case BoardState.View:
                if (hoveredPieces.length > 0) {
                    this._board.scene.events.emit("piece-info", hoveredPieces[0]);
                }
                break;
            case BoardState.MovePieces:
                if (this._board.selected) {
                    if (hoveredPieces.length > 0 && hoveredPieces[0] === this._board.selected) {
                        return;
                    }

                    if (!this._board.selected.inMovementRange(this._position)) {
                        this.type = CursorType.Invalid;
                        return;
                    }
                    const previousState: BoardState = this._board.state;
                    this._board.state = BoardState.Idle;
                    this.type = CursorType.Idle;

                    await this._board.movePiece(this._board.selected.id, this._position);
                    this._board.selected.moved = true;
                    this._board.deselectPiece();
                    this._board.state = previousState;
                    
                }
                else {
                    if (hoveredPieces.length > 0 && !hoveredPieces[0].moved) {
                        this._board.selectPiece(hoveredPieces[0].id);
                        this.type = CursorType.Fly;
                    }
                }
                break;
        }
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
    private translateCursorPosition(vector: Phaser.Math.Vector2): Phaser.Geom.Point {
        const point: Phaser.Math.Vector2 = new Phaser.Math.Vector2(vector.x, vector.y);

        point.x -= (Board.DEFAULT_CELLSIZE * -1) + (this._board.scene.game.config.width as number) / 2;
        point.y += (Board.DEFAULT_CELLSIZE * -2.5);

        point.y *= 1.6;

        const ly: number = ((2 * point.y - point.x) / 2) - Board.DEFAULT_CELLSIZE;
        const lx: number = (point.x + ly) - Board.DEFAULT_CELLSIZE;

        const ax: number = Math.round(lx / Board.DEFAULT_CELLSIZE) - 1;
        const ay: number = Math.round(ly / Board.DEFAULT_CELLSIZE) - 1;

        point.x = Math.round(ax);
        point.y = Math.round(ay);

        return new Phaser.Geom.Point(point.x, point.y);
    }
}