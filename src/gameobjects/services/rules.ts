import { Board } from "../board";
import { ActionType } from "../enums/actiontype";
import { BoardState } from "../enums/boardstate";
import { Colour } from "../enums/colour";
import { EventType } from "../enums/eventtype";
import { InputType } from "../enums/inputtype";
import { SpellType } from "../enums/spelltype";
import { Piece } from "../piece";
import { Spell } from "../spell";

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
            hoveredPieces.find(
                (piece: Piece) => !piece.dead && !piece.currentMount
            ) || null;

        const selectedPiece: Piece | null = board.selected;

        if (board.state === BoardState.CastSpell && board.selected) {
            const selectedSpell: Spell | null =
                board.currentPlayer?.selectedSpell;

            if (selectedSpell && selectedSpell.castTimes > 0) {
                if (
                    selectedSpell.inCastingRange(
                        board.selected.position,
                        board.cursor.position
                    ) &&
                    selectedSpell.canCastAtPosition(board.cursor.position)
                ) {
                    if (
                        selectedSpell.type === SpellType.Summon &&
                        !currentAliveHoveredPiece
                    ) {
                        return ActionType.Cast;
                    }
                    else if (selectedSpell.type === SpellType.Attack && currentAliveHoveredPiece) {
                        return ActionType.Cast;
                    }
                }
                return ActionType.Invalid;
            }
            return ActionType.Idle;
        }
        if (
            board.state === BoardState.Move ||
            board.state === BoardState.Dismount
        ) {
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
                    if (selectedPiece.moved) {
                        return ActionType.Invalid;
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
                    if (
                        currentAliveHoveredPiece.owner !== board.currentPlayer
                    ) {
                        return ActionType.Info;
                    } else {
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
        if (actionType === ActionType.Cast) {
            if (
                board.currentPlayer &&
                board.selected &&
                board.currentPlayer.selectedSpell
            ) {
                const casted: Spell | null =
                    await board.currentPlayer.useSpell();
                if (casted) {
                    board.state = BoardState.Idle;
                    board.logger.log(`${board.currentPlayer.name} casts '${casted.name}'`);
                    await casted.cast(
                        board.currentPlayer,
                        board.selected,
                        board.cursor.position,
                        hoveredPieces
                    );
                    board.state = BoardState.CastSpell;
                    if (casted?.castTimes <= 0) {
                        await board.currentPlayer.discardSpell();
                        if (casted.failed) {
                            board.logger.log(`Spell failed`, Colour.Magenta);
                        }
                        board.selected.turnOver = true;
                        board.deselectPlayer();
                        return ActionType.None;
                    }
                    else {
                        board.logger.log(`${board.currentPlayer.name} casts '${casted.name}' (${casted.castTimes} more available)`);
                    }
                    return ActionType.Cast;
                }
            }
            return ActionType.None;
        }
        if (actionType === ActionType.Select) {
            if (hoveredPieces.length > 0) {
                const currentAliveHoveredPiece: Piece | null =
                    hoveredPieces.find(
                        (piece: Piece) => !piece.dead && !piece.currentMount
                    ) || null;

                if (
                    currentAliveHoveredPiece &&
                    currentAliveHoveredPiece.currentRider &&
                    currentAliveHoveredPiece.currentRider.canSelect
                ) {
                    this.dispatchEvent(
                        EventType.PieceInfo,
                        currentAliveHoveredPiece.currentRider
                    );
                    await board.selectPiece(currentAliveHoveredPiece.currentRider.id);
                    board.state = BoardState.Dismount;
                    return ActionType.Dismount;
                } else if (
                    currentAliveHoveredPiece &&
                    currentAliveHoveredPiece.canSelect
                ) {
                    this.dispatchEvent(
                        EventType.PieceInfo,
                        currentAliveHoveredPiece
                    );
                    await board.selectPiece(currentAliveHoveredPiece.id);
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
        if (hoveredPieces.length > 0) {
            const currentAliveHoveredPiece: Piece | null =
                hoveredPieces.find(
                    (piece: Piece) => !piece.dead && !piece.currentMount
                ) || null;

            if (!currentAliveHoveredPiece) {
                return ActionType.Idle;
            }

            if (actionType === ActionType.Mount) {
                if (selectedPiece.canMountPiece(currentAliveHoveredPiece)) {
                    board.mountPiece(
                        selectedPiece.id,
                        currentAliveHoveredPiece.id
                    );
                    return ActionType.Mount;
                } else {
                    return ActionType.Invalid;
                }
            }
            if (actionType === ActionType.Attack) {
                if (selectedPiece.canAttackPiece(currentAliveHoveredPiece)) {
                    await board.attackPiece(
                        selectedPiece.id,
                        currentAliveHoveredPiece.id
                    );
                    return ActionType.Attack;
                } else {
                    return ActionType.Invalid;
                }
            }
            if (actionType === ActionType.RangedAttack) {
                if (
                    selectedPiece.canRangedAttackPiece(currentAliveHoveredPiece)
                ) {
                    await board.rangedAttackPiece(
                        selectedPiece.id,
                        currentAliveHoveredPiece.id
                    );
                    return ActionType.RangedAttack;
                } else {
                    return ActionType.Invalid;
                }
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

        if (board.state === BoardState.CastSpell) {
            if (board.currentPlayer && board.currentPlayer.selectedSpell) {
                const wasted: Spell | null =
                    await board.currentPlayer.discardSpell();
                if (wasted) {
                    board.logger.log(`Discarded ${board.currentPlayer.name}'s spell '${wasted.name}'`);
                }
                if (board.selected) {
                    board.selected.turnOver = true;
                }
                board.deselectPlayer();
            }
            return ActionType.None;
        }

        if (!selectedPiece) {
            board.nextPlayer();
            return ActionType.None;
        }

        if (board.state === BoardState.Dismount) {
            if (selectedPiece) {
                selectedPiece.moved = true;
            }
            if (selectedPiece.currentRider) {
                selectedPiece.currentRider.moved = true;
            }
            if (
                selectedPiece.currentMount &&
                selectedPiece.currentMount.canSelect
            ) {
                await board.selectPiece(selectedPiece.currentMount.id);
                return ActionType.Move;
            }
        }

        if (
            !selectedPiece.moved &&
            selectedPiece.currentRider &&
            !selectedPiece.currentRider.moved
        ) {
            board.state = BoardState.Dismount;
            return ActionType.Dismount;
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
