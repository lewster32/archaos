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
                detail: data
            }) 
        );
    }

    private async processClick(board: Board, actionType: ActionType, hoveredPieces: Piece[]): Promise<ActionType> {
        if (actionType === ActionType.Info) {
            if (hoveredPieces.length > 0) {
                this.dispatchEvent(EventType.PieceInfo, hoveredPieces[0]);
                return ActionType.Info;
            }
        }
        return ActionType.None;
    }

    private async processCancel(board: Board, actionType: ActionType, hoveredPieces: Piece[]): Promise<ActionType> {
        if (actionType === ActionType.Info) {

        }
        return ActionType.None;
    }
}
