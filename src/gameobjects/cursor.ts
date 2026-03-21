import { Board } from "./board";
import { ActionType } from "./enums/actiontype";
import { BoardLayer } from "./enums/boardlayer";
import { BoardState } from "./enums/boardstate";
import { Colour } from "./enums/colour";
import { CursorType } from "./enums/cursortype";
import { EventType } from "./enums/eventtype";
import { InputType } from "./enums/inputtype";
import { UnitStatus } from "./enums/unitstatus";
import { Piece } from "./piece";
import { Geom, GameObjects, Input, Math as PMath } from "phaser";

export class Cursor {
    /**
     * Current cursor position on the board.
     */
    private readonly _position: Geom.Point;

    /**
     * Image representing the cursor.
     */
    private readonly _image: GameObjects.Image;

    /**
     * Reference to the board the cursor is on.
     */
    private readonly _board: Board;

    /**
     * Is the cursor enabled?
     */
    private _enabled: boolean = true;

    /**
     * Current cursor type.
     */
    private _type: CursorType;

    /**
     * Key to use for cancel actions.
     */
    static readonly CANCEL_KEY: string = "Escape";

    /**
     * Offset to apply to cursor image position.
     */
    static readonly OFFSET: Geom.Point = new Geom.Point(0, 0);

    /**
     * Map of direction vectors to cursor types.
     */
    static readonly DIRECTION_MAP: { [key: string]: CursorType } = {
        "0,1": CursorType.DownLeft,
        "1,1": CursorType.Down,
        "1,0": CursorType.DownRight,
        "1,-1": CursorType.Right,
        "0,-1": CursorType.UpRight,
        "-1,-1": CursorType.Up,
        "-1,0": CursorType.UpLeft,
        "-1,1": CursorType.Left,
    };

    /**
     * Create a new Cursor instance.
     *
     * @param board The board the cursor is associated with
     */
    constructor(board: Board) {
        this._board = board;

        this._image = this._board.scene.add.image(0, 0, "cursors", "idle");
        this._image.setOrigin(0.5, 0.5);
        this._board.getLayer(BoardLayer.Pieces).add(this._image);
        this._type = CursorType.Idle;

        this._position = new Geom.Point(0, 0);

        this._board.scene.input.on("pointermove", async () => {
            await this.update();
        });

        this._board.scene.input.on("pointerup", async () => {
            await this.action(InputType.Click);
        });

        this._board.scene.input.keyboard.on(
            "keyup",
            async (event: KeyboardEvent) => {
                if (event.key === Cursor.CANCEL_KEY) {
                    await this.action(InputType.Cancel);
                } else {
                    // Bind 1-8 keys to highlight owned units
                    const keyNumber: number = Number.parseInt(event.key, 10);
                    if (
                        !Number.isNaN(keyNumber) &&
                        keyNumber >= 1 &&
                        keyNumber <= 8
                    ) {
                        this._board.highlightOwnedUnitsForPlayerIndex(
                            keyNumber - 1,
                        );
                    }
                }
            },
        );

        this._board.scene.game.events.on(EventType.Cancel, async () => {
            await this.action(InputType.Cancel);
        });

        setTimeout(async () => {
            await this.update(true);
        }, 0);
    }

    /**
     * Get the current cursor position on the board.
     */
    get position(): Geom.Point {
        return this._position;
    }

    /**
     * Update the cursor position and type based on the current pointer location.
     *
     * @param force Whether to force an update even if the position hasn't changed
     * @returns A promise that resolves to the type of action allowed at the new cursor position
     */
    async update(force?: boolean): Promise<ActionType> {
        if (!this._enabled || this._board.state === BoardState.Busy) {
            return ActionType.None;
        }

        const pointer: Input.Pointer = this._board.scene.input.activePointer;

        const translatedIsoPosition: Geom.Point = this.translateCursorPosition(
            pointer.position,
        );

        // Only perform one intent check per tile (unless forced)
        if (
            !force &&
            Geom.Point.Equals(translatedIsoPosition, this._position)
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

        this._image.setFlipX(false);
        this._image.setVisible(true);

        const allowedAction: ActionType = await this._board.rules.processIntent(
            this._board,
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
            case ActionType.Cast:
                this.type = CursorType.Cast;
                break;
            case ActionType.Move:
                if (selectedPiece) {
                    this._board.rangeGizmo.showPath(this._position);
                    const neighbours: Piece[] =
                        this._board.getAdjacentPiecesAtPosition(
                            this._position,
                            (piece: Piece) => piece !== selectedPiece,
                        );
                    if (
                        neighbours?.some((neighbour: Piece) =>
                            selectedPiece.canEngagePiece(neighbour),
                        )
                    ) {
                        this.type = CursorType.Warning;
                        break;
                    }
                    if (selectedPiece.hasStatus(UnitStatus.Flying)) {
                        this.type = CursorType.Fly;
                        break;
                    }
                    if (selectedPiece.currentMount) {
                        this.type = CursorType.Dismount;
                        break;
                    }
                    this.type = Cursor.getMovementDirectionType(
                        selectedPiece?.position,
                        this._position,
                    );
                }
                break;
            case ActionType.Mount:
                if (selectedPiece.stats.movement > 1) {
                    this._board.rangeGizmo.showPath(this._position);
                }
                this._image.setFlipX(
                    Board.toIsometric(this._position).x <
                        Board.toIsometric(selectedPiece.position).x,
                );
                this.type = CursorType.Mount;
                break;
            case ActionType.Dismount:
                this.type = CursorType.Dismount;
                break;
            case ActionType.Attack:
                if (selectedPiece.stats.movement > 1) {
                    this._board.rangeGizmo.showPath(this._position);
                }
                this.type = CursorType.Attack;
                break;
            case ActionType.RangedAttack:
                this.type = CursorType.RangedAttack;
                break;
        }

        const isoPosition: Geom.Point = this._board.getIsoPosition(
            new Geom.Point(translatedIsoPosition.x, translatedIsoPosition.y),
        );

        this._image.x = isoPosition.x + Cursor.OFFSET.x;
        this._image.y = isoPosition.y + Cursor.OFFSET.y;

        return allowedAction;
    }

    /**
     * Perform an action based on the current cursor position and input type.
     *
     * @param input The type of input that triggered the action, e.g. click or cancel
     * @returns A promise that resolves when the action is complete
     */
    async action(input: InputType): Promise<void> {
        if (!this._enabled || this._board.state === BoardState.Busy) {
            return;
        }

        const intendedAction: ActionType = await this.update(true);

        const actionState: ActionType = await this._board.rules.processAction(
            this._board,
            intendedAction,
            input,
        );

        if (actionState === ActionType.None) {
            return;
        }

        this.update(true);

        const selected: Piece | null = this._board.selected;

        if (selected?.moved) {
            if (!selected.currentRider || selected.currentRider.moved) {
                if (selected.canAttack) {
                    return;
                }
                // TODO: This is problematic - if the unit successfully attacks
                // and kills the target, we have to wait for the move before we
                // can check for ranged attack. This logic doesn't belong in
                // the cursor class.
                if (selected.canRangedAttack) {
                    this._board.sound.play("bowselecta");
                    this._board.logger.log(
                        `${selected.name}'s turn to ranged attack`,
                        Colour.Yellow,
                    );
                    await this._board.rangeGizmo.showSimpleRange(
                        this._board.selected.position,
                        this._board.selected.stats.range,
                        CursorType.RangeRangedAttack,
                        true,
                    );
                } else {
                    selected.turnOver = true;
                    await this._board.deselectPiece();
                }
            }
        }
    }

    /**
     * Set the cursor type and update the image frame.
     *
     * @param type The cursor type to set
     */
    set type(type: CursorType) {
        this._type = type;
        this._image.setFrame(type);
        if (type === CursorType.Idle) {
            this._image.setDepth(this._image.y - 8);
        } else {
            this._image.setDepth(this._image.y + 8);
        }
    }

    /**
     * Get the cursor type.
     */
    get type(): CursorType {
        return this._type;
    }

    /**
     * Enable or disable the cursor.
     */
    set enabled(value: boolean) {
        this._enabled = value;
    }

    /**
     * Check if the cursor is enabled.
     */
    get enabled(): boolean {
        return this._enabled;
    }

    /**
     * Translate the cursor position from screen space to isometric board space.
     *
     * @param vector
     * @returns
     */
    private translateCursorPosition(vector: PMath.Vector2): Geom.Point {
        const point: PMath.Vector2 = new PMath.Vector2(vector.x, vector.y);

        point.x -=
            this._board.scene.game.scale.width / 2 - Board.DEFAULT_CELLSIZE;
        point.y -= Board.DEFAULT_CELLSIZE * 1.5;

        point.x -= this._board.scene.cameras.main.x;

        const ly: number = (2 * point.y - point.x) / 2 - Board.DEFAULT_CELLSIZE;
        const lx: number = point.x + ly - Board.DEFAULT_CELLSIZE;

        const ax: number = Math.round(lx / Board.DEFAULT_CELLSIZE) - 1;
        const ay: number = Math.round(ly / Board.DEFAULT_CELLSIZE) - 1;

        point.x = Math.round(ax);
        point.y = Math.round(ay);

        return new Geom.Point(point.x, point.y);
    }

    /**
     * Get the cursor angle type from a direction index.
     *
     * @param angle Direction index (0-8) where 0 is down-right and increases clockwise back to 8
     * @returns
     */
    static getCursorAngle(angle: number = 0): CursorType {
        switch (angle) {
            case 0:
            case 8:
                return CursorType.DownRight;
            case 1:
                return CursorType.Down;
            case 2:
                return CursorType.DownLeft;
            case 3:
                return CursorType.Left;
            case 4:
                return CursorType.UpLeft;
            case 5:
                return CursorType.Up;
            case 6:
                return CursorType.UpRight;
            case 7:
                return CursorType.Right;
        }
        return CursorType.Idle;
    }

    /**
     * Get the movement direction type from two points.
     *
     * @param fromPoint the starting point
     * @param toPoint the ending point
     * @returns the cursor type representing the direction
     */
    static getMovementDirectionType(
        fromPoint: Geom.Point,
        toPoint: Geom.Point,
    ): CursorType {
        const dx: number = PMath.Clamp(toPoint.x - fromPoint.x, -1, 1);
        const dy: number = PMath.Clamp(toPoint.y - fromPoint.y, -1, 1);

        return Cursor.DIRECTION_MAP[`${dx},${dy}`] ?? CursorType.Invalid;
    }
}
