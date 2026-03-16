import { Board } from "../board";
import { ComputerWizard } from "../computerwizard";
import { ActionType } from "../enums/actiontype";
import { BoardState } from "../enums/boardstate";
import { Colour } from "../enums/colour";
import { CursorType } from "../enums/cursortype";
import { EventType } from "../enums/eventtype";
import { InputType } from "../enums/inputtype";
import { UnitStatus } from "../enums/unitstatus";
import type { Piece } from "../piece";
import type { Spell } from "../spells/spell";

import { Geom } from "phaser";

/**
 * A target for a cast spell can be either a board position or a piece, or null
 */
export type SpellCastTarget = Geom.Point | Piece | null;

/**
 * The 'brains' of the game live here. This is the beating heart of the game
 * logic. We handle two main types of processing:
 * 
 * 1. Intent: Given the current board state, what action is the player
 *    intending to do?
 * 2. Action: Given the current board state and the intended action,
 *    perform that action.
 * 
 * This separation allows the UI to provide context-sensitive feedback to the
 * player about what they can do at any given time, and then to execute
 * those actions in a consistent manner.
 */
let _instance: Rules | undefined;

export class Rules {
    protected constructor() {
        // Singleton
    }

    public static getInstance(): Rules {
        if (!_instance) {
            _instance = new Rules();
        }
        return _instance;
    }

    /**
     * Given the current board state, what action is the player intending to do?
     * From this we can decide what they're allowed to do.
     * 
     * @param board The game board
     * @returns The allowed action type
     */
    async processIntent(board: Board): Promise<ActionType> {
        if (board.state === BoardState.Idle) {
            return ActionType.None;
        }

        const hoveredPieces: Piece[] = board.getPiecesAtPosition(
            board.cursor.position
        );

        if (board.state === BoardState.View || board.state === BoardState.SelectSpell) {
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
                (piece: Piece) =>
                    !piece.dead && !piece.currentMount && !piece.engulfed
            ) || null;

        const selectedPiece: Piece | null = board.selected;

        if (board.state === BoardState.CastSpell) {
            const selectedSpell: Spell | null =
                board.currentPlayer?.selectedSpell;

            if (selectedSpell && selectedSpell.castTimes > 0) {
                const spellTarget: SpellCastTarget =
                    selectedSpell.getValidTarget(board.cursor.position);

                return spellTarget ? ActionType.Cast : ActionType.Invalid;
            }
            return ActionType.Info;
        }
        if (
            board.state === BoardState.Move ||
            board.state === BoardState.Dismount
        ) {
            if (selectedPiece) {
                if (currentAliveHoveredPiece) {
                    if (
                        selectedPiece.canMountPiece(currentAliveHoveredPiece)
                    ) {
                        return ActionType.Mount;
                    }
                    if (
                        selectedPiece.canAttackPiece(currentAliveHoveredPiece) &&
                        selectedPiece.inAttackRange(currentAliveHoveredPiece.position)
                    ) {
                        return ActionType.Attack;
                    }
                    if (
                        selectedPiece.canRangedAttackPiece(currentAliveHoveredPiece)
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
                        currentAliveHoveredPiece.owner === board.currentPlayer
                    ) {
                        if (currentAliveHoveredPiece.canSelect) {
                            return ActionType.Select;
                        } else {
                            return ActionType.Info;
                        }
                    } else {
                        return ActionType.Info;
                    }
                }
                else if (hoveredPieces.length > 0) {
                    return ActionType.Info;
                }
                return ActionType.Idle;
            }
        }

        return ActionType.Idle;
    }

    /**
     * Given the current board state, what action is the player about to
     * perform?
     * 
     * @param board The game board
     * @param actionType The action type the player is about to perform
     * @param input The input type (click, cancel, etc)
     * @returns The resulting action type
     */
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

    /**
     * Dispatch a global event to notify other parts of the system.
     * 
     * @param type The event type
     * @param data The event data
     */
    public dispatchEvent(type: EventType, data: any) {
        globalThis.dispatchEvent(
            new CustomEvent(type, {
                detail: data,
            })
        );
    }

    /**
     * Automatically cast a spell for the current player.
     * 
     * @param board The game board
     * @param spell The spell to be cast
     */
    public async doAutoCastSpell(
        board: Board
    ): Promise<boolean> {
        return await ComputerWizard.autoCastSpell(board, board.currentPlayer);
    }

    /**
     * Handle the casting of a spell.
     * 
     * @param board The game board
     * @param spell The spell being cast
     * @param currentTarget The target of the spell (a piece or a board position)
     * @returns Whether the spell was successfully cast
     */
    public async doCastSpell(
        board: Board,
        currentTarget: SpellCastTarget
    ): Promise<boolean> {
        const casted: Spell | null = await board.currentPlayer.useSpell();
        if (!casted) {
            return false;
        }
        board.state = BoardState.Idle;
        board.logger.log(
            `${board.currentPlayer.name} casts '${casted.name}'`
        );
        await casted.cast(
            board.currentPlayer,
            board.selected,
            currentTarget
        );
        board.state = BoardState.CastSpell;
        if (casted.castTimes <= 0) {
            await board.currentPlayer.discardSpell();
            if (casted.failed) {
                board.logger.log(`${board.currentPlayer.name} failed to cast ${casted.name}`, Colour.Magenta);
            }
            if (board.selected) {
                board.selected.turnOver = true;
            }
            board.deselectPlayer();
            await board.idleDelay(Board.DEFAULT_DELAY);
            return false;
        } else {
            board.logger.log(
                `${board.currentPlayer.name} casts '${casted.name}' (${casted.castTimes} more available)`
            );
            if (casted.lineOfSight) {
                await board.rangeGizmo.showSimpleRange(
                    board.selected.position,
                    board.currentPlayer?.selectedSpell.range,
                    CursorType.RangeCast,
                    true
                );
            }
        }
        return true;
    }

    /**
     * Handle a click action.
     * 
     * @param board The game board
     * @param actionType The action type the player is about to perform 
     * @param hoveredPieces The pieces currently being hovered over (plural as several pieces can occupy the same tile, e.g. mounted or engulfed pieces)
     * @returns The resulting action type
     */
    private async processClick(
        board: Board,
        actionType: ActionType,
        hoveredPieces: Piece[]
    ): Promise<ActionType> {
        if (actionType === ActionType.Info) {
            if (hoveredPieces.length > 0) {
                // The piece of interest is the best match (in order of priority):
                // 1. Alive piece that has a current rider
                // 2. Alive piece
                // 3. Any remaining piece
                const pieceOfInterest: Piece = hoveredPieces
                    .toSorted((a: Piece, b: Piece) => {
                        if (!a.dead && a.currentRider) {
                            return -1;
                        }
                        if (!b.dead && b.currentRider) {
                            return 1;
                        }
                        if (!a.dead && b.dead) {
                            return -1;
                        }
                        if (a.dead && !b.dead) {
                            return 1;
                        }
                        return 0;
                    }).at(0);
                this.dispatchEvent(EventType.PieceInfo, pieceOfInterest);
                return ActionType.Info;
            }
        }
        if (
            actionType === ActionType.Cast ||
            actionType === ActionType.Invalid
        ) {
            if (
                board.currentPlayer &&
                board.selected &&
                board.currentPlayer.selectedSpell
            ) {
                const currentTarget: SpellCastTarget =
                    board.currentPlayer.selectedSpell.getValidTarget(
                        board.cursor.position,
                        true
                    );
                if (currentTarget == null) {
                    return ActionType.Invalid;
                }
                if (
                    await this.doCastSpell(
                        board,
                        currentTarget
                    )
                ) {
                    return ActionType.Cast;
                } else {
                    await board.nextPlayer();
                }
            }
            return ActionType.Cancel;
        }
        if (actionType === ActionType.Select) {
            if (hoveredPieces.length > 0) {
                const currentAliveHoveredPiece: Piece | null =
                    hoveredPieces.find(
                        (piece: Piece) =>
                            !piece.dead &&
                            !piece.currentMount &&
                            !piece.engulfed
                    ) || null;

                if (currentAliveHoveredPiece?.currentRider?.canSelect) {
                    this.dispatchEvent(
                        EventType.PieceInfo,
                        currentAliveHoveredPiece.currentRider
                    );
                    await board.selectPiece(
                        currentAliveHoveredPiece.id
                    );
                    board.emitUIEvent(EventType.DismountAvailable, true);
                    return ActionType.Move;
                } else if (
                    currentAliveHoveredPiece?.canSelect
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
                    (piece: Piece) =>
                        !piece.dead && !piece.currentMount && !piece.engulfed
                ) || null;

            if (!currentAliveHoveredPiece) {
                return ActionType.Idle;
            }

            if (actionType === ActionType.Mount) {
                if (selectedPiece.canMountPiece(currentAliveHoveredPiece)) {
                    // If we're not flying and we're more than 1 tile away, we
                    // need to move first
                    if (
                        !selectedPiece.hasStatus(UnitStatus.Flying) &&
                        selectedPiece.inMovementRange(
                            currentAliveHoveredPiece.position
                        ) &&
                        Board.distance(selectedPiece.position, currentAliveHoveredPiece.position) > 1.5
                    ) {
                        await board.movePiece(
                            selectedPiece.id,
                            currentAliveHoveredPiece.position
                        );
                        selectedPiece.moved = false;
                    }
                    if (selectedPiece.engaged) {
                        return ActionType.Invalid;
                    }
                    else {
                        await board.mountPiece(
                            selectedPiece.id,
                            currentAliveHoveredPiece.id
                        );
                        return ActionType.Mount;
                    }
                } else {
                    return ActionType.Invalid;
                }
            }
            if (actionType === ActionType.Attack) {
                if (selectedPiece.canAttackPiece(currentAliveHoveredPiece)) {
                    // If we're not flying and we're more than 1.5 tiles away,
                    // we need to move first
                    if (
                        !selectedPiece.hasStatus(UnitStatus.Flying) &&
                        selectedPiece.inMovementRange(
                            currentAliveHoveredPiece.position
                        ) &&
                        Board.distance(selectedPiece.position, currentAliveHoveredPiece.position) > 1.5
                    ) {
                        await board.movePiece(
                            selectedPiece.id,
                            currentAliveHoveredPiece.position
                        );
                        selectedPiece.moved = false;
                    }
                    else if (
                        !currentAliveHoveredPiece.inAttackRange(selectedPiece.position)
                    ) {
                        return ActionType.Invalid;
                    }
                    selectedPiece.attacked = false;
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

    /**
     * Handle a cancel action.
     * 
     * @param board The game board
     * @param _actionType The action type the player is about to perform
     * @param _hoveredPieces The pieces currently being hovered over (plural as several pieces can occupy the same tile, e.g. mounted or engulfed pieces)
     * @returns The resulting action type
     */
    private async processCancel(
        board: Board,
        _actionType: ActionType,
        _hoveredPieces: Piece[]
    ): Promise<ActionType> {
        const selectedPiece: Piece | null = board.selected;

        if (board.state === BoardState.Idle) {
            return ActionType.None;
        }

        board.sound.play("cancel");

        if (board.state === BoardState.CastSpell) {
            if (board.currentPlayer?.selectedSpell) {
                const wasted: Spell | null =
                    await board.currentPlayer.discardSpell();
                if (wasted) {
                    board.logger.log(
                        `Discarded ${board.currentPlayer.name}'s spell '${wasted.name}'`
                    );
                }
                if (board.selected) {
                    board.selected.turnOver = true;
                }
                board.deselectPlayer();
                await board.idleDelay(Board.DEFAULT_DELAY);
                await board.nextPlayer();
            }
            return ActionType.Cancel;
        }

        if (board.state === BoardState.Move) {
            if (selectedPiece) {
                selectedPiece.moved = true;
                selectedPiece.turnOver = true;
                if (selectedPiece.currentRider) {
                    selectedPiece.currentRider.moved = true;
                    selectedPiece.currentRider.turnOver = true;
                }
            }
            board.emitUIEvent(EventType.DismountAvailable, false);
            await board.deselectPiece();
            return ActionType.Cancel;
        }

        if (!selectedPiece) {
            await board.nextPlayer();
            return ActionType.Cancel;
        }

        if (board.state === BoardState.Dismount) {
            if (selectedPiece.currentRider) {
                selectedPiece.moved = true;
                selectedPiece.currentRider.moved = true;
            } 
            board.logger.log(`Dismount cancelled`, Colour.Magenta);
            if (
                selectedPiece.currentMount?.canSelect
            ) {
                await board.selectPiece(selectedPiece.currentMount.id);
                board.state = BoardState.Move;
                return ActionType.Move;
            }
            else {
                board.emitUIEvent(EventType.DismountAvailable, false);
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
                await board.deselectPiece();
            }
        } else {
            await board.deselectPiece();
        }

        return ActionType.None;
    }
}

/* v8 ignore next 5 */
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        _instance = undefined;
    });
}
