import { Board } from "../board";
import { ActionType } from "../enums/actiontype";
import { BoardState } from "../enums/boardstate";
import { EventType } from "../enums/eventtype";
import { InputType } from "../enums/inputtype";
import { Piece } from "../piece";

export class Rules {
    private static instance: Rules;

    constructor() {}

    public static getInstance(): Rules {
        if (!Rules.instance) {
            Rules.instance = new Rules();
        }
        return Rules.instance;
    }

    async processIntent(board: Board): Promise<ActionType> {
        if (board.state === BoardState.Idle) {
            return ActionType.None;
        }

        const hoveredPieces: Piece[] = board.getPiecesAtPosition(
            board.cursor.position
        );

        if (board.state === BoardState.View) {
            if (hoveredPieces.length > 0) {
                return ActionType.Info;
            }
            return ActionType.Idle;
        }

        if (!board.currentPlayer) {
            return ActionType.Idle;
        }

        const currentAliveHoveredPiece: Piece | null =
            hoveredPieces.find((piece: Piece) => !piece.dead) || null;

        const selectedPiece: Piece | null = board.selected;

        if (board.state === BoardState.MovePieces) {
            if (selectedPiece) {
                if (currentAliveHoveredPiece) {
                    if (selectedPiece.canMountPiece(currentAliveHoveredPiece)) {
                        return ActionType.Mount;
                    }
                    if (
                        selectedPiece.canAttackPiece(currentAliveHoveredPiece)
                    ) {
                        return ActionType.Attack;
                    }
                    if (
                        selectedPiece.canRangedAttackPiece(
                            currentAliveHoveredPiece
                        )
                    ) {
                        return ActionType.RangedAttack;
                    }
                    if (selectedPiece === currentAliveHoveredPiece) {
                        return ActionType.Move;
                    } else {
                        return ActionType.Invalid;
                    }
                } else {
                    if (
                        !selectedPiece.moved &&
                        selectedPiece.inMovementRange(board.cursor.position)
                    ) {
                        return ActionType.Move;
                    }
                    return ActionType.Invalid;
                }
            } else {
                if (currentAliveHoveredPiece) {
                    if (currentAliveHoveredPiece.owner !== board.currentPlayer) {
                        return ActionType.Info;
                    }
                    else {
                        if (currentAliveHoveredPiece.canSelect) {
                            return ActionType.Select;
                        } else {
                            return ActionType.Invalid;
                        }
                    }
                }
                return ActionType.Idle;
            }
        }

        return ActionType.Idle;
    }

    async processAction(
        board: Board,
        actionType: ActionType,
        input: InputType
    ): Promise<ActionType> {
        if (board.state === BoardState.Idle) {
            return ActionType.None;
        }

        const hoveredPieces: Piece[] = board.getPiecesAtPosition(
            board.cursor.position
        );

        if (input === InputType.Click) {
            return await this.processClick(board, actionType, hoveredPieces);
        }

        if (input === InputType.Cancel) {
            return await this.processCancel(board, actionType, hoveredPieces);
        }

        return ActionType.Idle;
    }

    private dispatchEvent(type: EventType, data: any) {
        window.dispatchEvent(
            new CustomEvent(type, {
                detail: data,
            })
        );
    }

    private async processClick(
        board: Board,
        actionType: ActionType,
        hoveredPieces: Piece[]
    ): Promise<ActionType> {
        if (actionType === ActionType.Info) {
            if (hoveredPieces.length > 0) {
                this.dispatchEvent(EventType.PieceInfo, hoveredPieces[0]);
                return ActionType.Info;
            }
        }
        if (actionType === ActionType.Select) {
            if (hoveredPieces.length > 0) {
                this.dispatchEvent(EventType.PieceInfo, hoveredPieces[0]);
                if (hoveredPieces[0].canSelect) {
                    board.selectPiece(hoveredPieces[0].id);
                    return ActionType.Select;
                } else {
                    return ActionType.Invalid;
                }
            }
        }
        const selectedPiece: Piece | null = board.selected;
        if (!selectedPiece) {
            return ActionType.None;
        }

        if (actionType === ActionType.Move) {
            if (
                !selectedPiece.moved &&
                selectedPiece.inMovementRange(board.cursor.position)
            ) {
                await board.movePiece(selectedPiece.id, board.cursor.position);
                this.dispatchEvent(EventType.PieceInfo, null);
                return ActionType.Move;
            } else {
                return ActionType.Invalid;
            }
        }
        if (actionType === ActionType.Attack) {
            if (
                selectedPiece.canAttackPiece(hoveredPieces[0])
            ) {
                await board.attackPiece(selectedPiece.id, hoveredPieces[0].id);
                return ActionType.Attack;
            } else {
                return ActionType.Invalid;
            }
        }
        if (actionType === ActionType.RangedAttack) {
            if (
                selectedPiece.canRangedAttackPiece(hoveredPieces[0])
            ) {
                await board.rangedAttackPiece(
                    selectedPiece.id,
                    hoveredPieces[0].id
                );
                return ActionType.RangedAttack;
            } else {
                return ActionType.Invalid;
            }
        }
        return ActionType.None;
    }

    private async processCancel(
        board: Board,
        _actionType: ActionType,
        _hoveredPieces: Piece[]
    ): Promise<ActionType> {
        const selectedPiece: Piece | null = board.selected;

        if (!selectedPiece) {
            return ActionType.None;
        }

        if (selectedPiece.moved) {
            if (selectedPiece.canAttack) {
                selectedPiece.attacked = true;
            } else if (selectedPiece.canRangedAttack) {
                selectedPiece.rangedAttacked = true;
            }
            if (!selectedPiece.canSelect) {
                selectedPiece.turnOver = true;
                board.deselectPiece();
            }
        } else {
            board.deselectPiece();
        }

        return ActionType.None;
    }
}
