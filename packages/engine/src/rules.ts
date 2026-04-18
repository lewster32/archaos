import { EngineEvent } from "./enums/engineevent";
import { ActionType } from "./enums/actiontype";
import { BoardEvent } from "./enums/boardevent";
import { BoardState } from "./enums/boardstate";
import { Colour } from "./enums/colour";
import { EventType } from "./enums/eventtype";
import { InputType } from "./enums/inputtype";
import { UnitStatus } from "./enums/unitstatus";
import { Spell } from "./spells/spell";
import type { SpellCastTarget } from "./spells/spell";
import {
    CancelDismount,
    RequestDismount,
    SpellCastComplete,
} from "./phasemachine";
import type { IRNG } from "./rng";
import { Board } from "./board";
import { ComputerWizard } from "./ai/computerwizard";
import type { Piece } from "./piece";
import type { Player } from "./player";
import { EffectType } from "./enums/effecttype";
import type {
    SpreadResult,
    SpreadBatchPayload,
    SpreadIterationPayload,
} from "./actions";
export type { SpellCastTarget } from "./spells/spell";

/**
 * The 'brains' of the game live here. This is the
 * beating heart of the game logic. We handle two main
 * types of processing:
 *
 * 1. Intent: Given the current board state, what action
 *    is the player intending to do?
 * 2. Action: Given the current board state and the
 *    intended action, perform that action.
 *
 * This separation allows the UI to provide
 * context-sensitive feedback to the player about what
 * they can do at any given time, and then to execute
 * those actions in a consistent manner.
 */
let _instance: Rules | undefined;

export class Rules {
    /**
     * Guard flag to prevent re-entrant cancel
     * processing (e.g. rapid repeated Escape presses
     * during async operations).
     */
    private _cancelInProgress: boolean = false;

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
     * Given the current board state, what action is the
     * player intending to do? From this we can decide
     * what they're allowed to do.
     *
     * @param board The game board
     * @returns The allowed action type
     */
    async processIntent(board: Board): Promise<ActionType> {
        if (board.state === BoardState.Idle) {
            return ActionType.None;
        }

        const hoveredPieces: Piece[] = board.getPiecesAtPosition(
            board.cursorPosition,
        );

        if (
            board.state === BoardState.View ||
            board.state === BoardState.SelectSpell
        ) {
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
                    !piece.dead && !piece.currentMount && !piece.engulfed,
            ) || null;

        const selectedPiece: Piece | null = board.selected;

        if (board.state === BoardState.CastSpell) {
            const selectedSpell: Spell | null =
                board.currentPlayer?.selectedSpell;

            if (selectedSpell && selectedSpell.castTimes > 0) {
                const spellTarget: SpellCastTarget =
                    selectedSpell.getValidTarget(board.cursorPosition);

                return spellTarget ? ActionType.Cast : ActionType.Invalid;
            }
            return ActionType.Info;
        }
        if (
            board.state === BoardState.Move ||
            board.state === BoardState.Dismount ||
            board.state === BoardState.Attack ||
            board.state === BoardState.RangedAttack
        ) {
            if (selectedPiece) {
                if (currentAliveHoveredPiece) {
                    if (selectedPiece.canMountPiece(currentAliveHoveredPiece)) {
                        return ActionType.Mount;
                    }
                    if (
                        selectedPiece.canAttackPiece(
                            currentAliveHoveredPiece,
                        ) &&
                        selectedPiece.inAttackRange(
                            currentAliveHoveredPiece.position,
                        )
                    ) {
                        return ActionType.Attack;
                    }
                    if (
                        selectedPiece.canRangedAttackPiece(
                            currentAliveHoveredPiece,
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
                        selectedPiece.inMovementRange(board.cursorPosition)
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
                } else if (hoveredPieces.length > 0) {
                    return ActionType.Info;
                }
                return ActionType.Idle;
            }
        }

        return ActionType.Idle;
    }

    /**
     * Given the current board state, what action is
     * the player about to perform?
     *
     * @param board The game board
     * @param actionType The action type the player is
     *     about to perform
     * @param input The input type (click, cancel, etc)
     * @returns The resulting action type
     */
    async processAction(
        board: Board,
        actionType: ActionType,
        input: InputType,
    ): Promise<ActionType> {
        if (board.state === BoardState.Idle) {
            return ActionType.None;
        }

        const hoveredPieces: Piece[] = board.getPiecesAtPosition(
            board.cursorPosition,
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
     * Dispatch a game event to notify other parts of
     * the system.
     *
     * @param type The event type
     * @param data The event data
     * @param board The board whose event emitter to use
     */
    public dispatchEvent(type: EventType, data: any, board?: Board) {
        if (board) {
            board.events.emit(type, data);
        }
    }

    /**
     * Automatically cast a spell for the current
     * player.
     *
     * @param board The game board
     */
    public async doAutoCastSpell(board: Board): Promise<boolean> {
        return await ComputerWizard.autoCastSpell(board, board.currentPlayer);
    }

    /**
     * Handle the casting of a spell.
     *
     * @param board The game board
     * @param currentTarget The target of the spell
     *     (a piece or a board position)
     * @returns Whether the spell was successfully cast
     */
    public async doCastSpell(
        board: Board,
        currentTarget: SpellCastTarget,
    ): Promise<boolean> {
        const casted: Spell | null = await board.currentPlayer.useSpell();
        if (!casted) {
            return false;
        }
        board.state = BoardState.Idle;
        await casted.cast(board.currentPlayer, board.selected, currentTarget);
        board.boardEvents.emit(
            BoardEvent.SpellCast,
            board.currentPlayer,
            casted,
        );
        board.state = BoardState.CastSpell;
        if (casted.castTimes <= 0) {
            board.stateManager.evaluate(new SpellCastComplete());
            await board.currentPlayer.discardSpell();
            if (casted.failed) {
                board.logger.log(
                    `${board.currentPlayer.name}` +
                        ` failed to cast` +
                        ` ${casted.name}`,
                    Colour.Magenta,
                );
            }
            if (board.selected) {
                board.selected.turnOver = true;
            }
            board.deselectPlayer();
            await board.idleDelay();
            return false;
        } else {
            board.logger.log(
                `${board.currentPlayer.name} casts` +
                    ` '${casted.name}'` +
                    ` (${casted.castTimes} more` +
                    ` available)`,
            );
            if (casted.lineOfSight) {
                board.events.emit(EngineEvent.ShowCastRange, {
                    position: board.selected.position,
                    range: board.currentPlayer?.selectedSpell.range,
                    lineOfSight: true,
                });
            }
        }
        return true;
    }

    /**
     * Handle a click action.
     *
     * @param board The game board
     * @param actionType The action type the player is
     *     about to perform
     * @param hoveredPieces The pieces currently being
     *     hovered over (plural as several pieces can
     *     occupy the same tile, e.g. mounted or
     *     engulfed pieces)
     * @returns The resulting action type
     */
    private async processClick(
        board: Board,
        actionType: ActionType,
        hoveredPieces: Piece[],
    ): Promise<ActionType> {
        if (actionType === ActionType.Info) {
            if (hoveredPieces.length > 0) {
                // The piece of interest is the best
                // match (in order of priority):
                // 1. Alive piece with a current rider
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
                    })
                    .at(0);
                this.dispatchEvent(EventType.PieceInfo, pieceOfInterest, board);
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
                        board.cursorPosition,
                        true,
                    );
                if (currentTarget == null) {
                    return ActionType.Invalid;
                }
                if (await this.doCastSpell(board, currentTarget)) {
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
                            !piece.engulfed,
                    ) || null;

                if (currentAliveHoveredPiece?.currentRider?.canSelect) {
                    this.dispatchEvent(
                        EventType.PieceInfo,
                        currentAliveHoveredPiece.currentRider,
                        board,
                    );
                    await board.selectPiece(currentAliveHoveredPiece.id);
                    board.emitUIEvent(EventType.DismountAvailable, true);
                    return ActionType.Move;
                } else if (currentAliveHoveredPiece?.canSelect) {
                    this.dispatchEvent(
                        EventType.PieceInfo,
                        currentAliveHoveredPiece,
                        board,
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
                selectedPiece.inMovementRange(board.cursorPosition)
            ) {
                await board.movePiece(selectedPiece.id, board.cursorPosition);
                this.dispatchEvent(EventType.PieceInfo, null, board);
                return ActionType.Move;
            } else {
                return ActionType.Invalid;
            }
        }
        if (hoveredPieces.length > 0) {
            const currentAliveHoveredPiece: Piece | null =
                hoveredPieces.find(
                    (piece: Piece) =>
                        !piece.dead && !piece.currentMount && !piece.engulfed,
                ) || null;

            if (!currentAliveHoveredPiece) {
                return ActionType.Idle;
            }

            if (actionType === ActionType.Mount) {
                if (selectedPiece.canMountPiece(currentAliveHoveredPiece)) {
                    // If we're not flying and we're
                    // more than 1 tile away, we need
                    // to move first
                    if (
                        !selectedPiece.hasStatus(UnitStatus.Flying) &&
                        selectedPiece.inMovementRange(
                            currentAliveHoveredPiece.position,
                        ) &&
                        Board.distance(
                            selectedPiece.position,
                            currentAliveHoveredPiece.position,
                        ) > 1.5
                    ) {
                        await board.movePiece(
                            selectedPiece.id,
                            currentAliveHoveredPiece.position,
                        );
                        selectedPiece.moved = false;
                    }
                    if (selectedPiece.engaged) {
                        return ActionType.Invalid;
                    } else {
                        await board.mountPiece(
                            selectedPiece.id,
                            currentAliveHoveredPiece.id,
                        );
                        return ActionType.Mount;
                    }
                } else {
                    return ActionType.Invalid;
                }
            }
            if (actionType === ActionType.Attack) {
                if (selectedPiece.canAttackPiece(currentAliveHoveredPiece)) {
                    // If we're not flying and we're
                    // more than 1.5 tiles away, we
                    // need to move first
                    if (
                        !selectedPiece.hasStatus(UnitStatus.Flying) &&
                        selectedPiece.inMovementRange(
                            currentAliveHoveredPiece.position,
                        ) &&
                        Board.distance(
                            selectedPiece.position,
                            currentAliveHoveredPiece.position,
                        ) > 1.5
                    ) {
                        await board.movePiece(
                            selectedPiece.id,
                            currentAliveHoveredPiece.position,
                        );
                        selectedPiece.moved = false;
                    } else if (
                        !selectedPiece.inAttackRange(
                            currentAliveHoveredPiece.position,
                        )
                    ) {
                        return ActionType.Invalid;
                    }
                    selectedPiece.attacked = false;
                    await board.attackPiece(
                        selectedPiece.id,
                        currentAliveHoveredPiece.id,
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
                        currentAliveHoveredPiece.id,
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
     * @param _actionType The action type the player is
     *     about to perform
     * @param _hoveredPieces The pieces currently being
     *     hovered over
     * @returns The resulting action type
     */
    private async processCancel(
        board: Board,
        _actionType: ActionType,
        _hoveredPieces: Piece[],
    ): Promise<ActionType> {
        // Only allow cancel for the current human
        // player
        if (!board.currentPlayer || board.currentPlayer.remote) {
            return ActionType.None;
        }

        // Only allow cancel in states where there is
        // a legitimate action to cancel
        switch (board.state) {
            case BoardState.SelectSpell:
            case BoardState.CastSpell:
            case BoardState.Move:
            case BoardState.Attack:
            case BoardState.RangedAttack:
            case BoardState.Dismount:
                break;
            default:
                return ActionType.None;
        }

        // Prevent re-entrant cancel
        if (this._cancelInProgress) {
            return ActionType.None;
        }
        this._cancelInProgress = true;

        try {
            const selectedPiece: Piece | null = board.selected;

            board.events.emit(EngineEvent.EffectRequested, {
                sound: "cancel",
            });

            if (board.state === BoardState.CastSpell) {
                if (board.currentPlayer?.selectedSpell) {
                    board.stateManager.evaluate(new SpellCastComplete());
                    const wasted: Spell | null =
                        await board.currentPlayer.discardSpell();
                    if (wasted) {
                        board.logger.log(
                            `Discarded` +
                                ` ${board.currentPlayer.name}'s` +
                                ` spell` +
                                ` '${wasted.name}'`,
                        );
                    }
                    if (board.selected) {
                        board.selected.turnOver = true;
                    }
                    board.deselectPlayer();
                    await board.idleDelay();
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
                if (selectedPiece.currentMount?.canSelect) {
                    board.stateManager.evaluate(new CancelDismount());
                    await board.selectPiece(selectedPiece.currentMount.id);
                    return ActionType.Move;
                } else {
                    board.emitUIEvent(EventType.DismountAvailable, false);
                }
            }

            if (
                !selectedPiece.moved &&
                selectedPiece.currentRider &&
                !selectedPiece.currentRider.moved
            ) {
                board.stateManager.evaluate(new RequestDismount());
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
        } finally {
            this._cancelInProgress = false;
        }
    }

    /**
     * Roll an attack vs defence check. Per-player
     * overrides are checked first, then the global
     * cheat flag, then normal dice rolls.
     *
     * @param attack the attack value
     * @param defence the defence value
     * @param rng the PRNG instance to use for the roll
     * @param attackingPlayer optional player whose
     *     units are attacking; used for per-player
     *     forceHit overrides (e.g. in tutorials)
     * @returns true if the attack is greater than the
     *     defence, false otherwise
     */
    roll(
        attack: number,
        defence: number,
        rng: IRNG,
        attackingPlayer?: Player,
    ): boolean {
        if (attackingPlayer?.forceHit != null) {
            return attackingPlayer.forceHit;
        }
        if (Board.CHEAT_FORCE_HIT !== null) {
            return Board.CHEAT_FORCE_HIT;
        }
        const attackRoll: number = rng.between(0, 10 + attack);
        const defenceRoll: number = rng.between(0, 10 + defence);
        console.debug(
            `Rolled ${attackRoll} vs` +
                ` ${defenceRoll}; attack ` +
                `${attackRoll > defenceRoll ? "succeeds" : "fails"}`,
        );
        return attackRoll > defenceRoll;
    }

    /**
     * Roll a chance check for spell casting. Per-player
     * overrides are checked first, then the global
     * cheat flag, then normal chance rolls.
     *
     * @param attack the chance value (0 to 1)
     * @param rng the PRNG instance to use for the roll
     * @param castingPlayer optional player who is
     *     casting; used for per-player forceCast
     *     overrides (e.g. in tutorials)
     * @returns true if the chance check succeeds
     */
    rollChance(attack: number, rng: IRNG, castingPlayer?: Player): boolean {
        if (castingPlayer?.forceCast != null) {
            return castingPlayer.forceCast;
        }
        if (Board.CHEAT_FORCE_CAST !== null) {
            return Board.CHEAT_FORCE_CAST;
        }
        const defenceRoll: number = rng.frac();
        if (attack < 0 || attack > 1) {
            console.warn(
                `Chance value ${attack} is out of bounds, clamping to 0-1`,
            );
            attack = Math.max(0, Math.min(1, attack));
        }
        console.debug(
            `Rolled ${attack} vs` +
                ` ${defenceRoll}; chance ` +
                `${attack > defenceRoll ? "succeeds" : "fails"}`,
        );
        return attack > defenceRoll;
    }

    /**
     * Handle spreading effects on the board. Runs
     * each iteration sequentially, collecting results
     * into a batch payload, then emits a single
     * `SpreadBatch` event for client replay.
     */
    async doSpread(board: Board): Promise<void> {
        const payload: SpreadBatchPayload = {
            iterations: [],
        };
        for (let i: number = 0; i < Board.SPREAD_ITERATIONS; i++) {
            const spreadPieces: Piece[] = board.pieces.filter(
                (piece) => piece.hasStatus(UnitStatus.Spreads) && !piece.dead,
            );
            const iteration: SpreadIterationPayload = {
                focusPieceIds: spreadPieces.map((p) => p.id),
                results: [],
            };
            for (const piece of spreadPieces) {
                if (piece.dead) continue;
                const result: SpreadResult = await piece.spread();
                iteration.results.push(result);
            }
            payload.iterations.push(iteration);
            board.emitBoardUpdateEvent();
        }
        board.events.emit(EngineEvent.SpreadBatch, payload);
    }

    /**
     * Handle expiring effects on the board - called at
     * the end of the turn to expire pieces with the
     * 'expires' status.
     */
    async doExpire(board: Board): Promise<void> {
        const expirePieces: Piece[] = board.pieces.filter((piece: Piece) =>
            piece.hasStatus(UnitStatus.Expires),
        );

        for (const piece of expirePieces) {
            if (piece.hasStatus(UnitStatus.Structure)) {
                if (board.roll(2, 10)) {
                    await board.events.emitAsync(EngineEvent.EffectRequested, {
                        type: EffectType.DisbelieveHit,
                        pieceId: piece.id,
                        sound: "destroy",
                    });
                    await piece.kill();
                    board.logger.log(
                        `${piece.name} has expired`,
                        Colour.Magenta,
                    );
                }
            } else if (
                piece.hasStatus(UnitStatus.ExpiresGivesSpell) &&
                piece.currentRider &&
                board.roll(4, 10)
            ) {
                const owner: Player = piece.currentRider.owner;
                board.logger.log(
                    `${piece.name} has expired and` +
                        ` gifted ${owner.name} a` +
                        ` new spell`,
                    Colour.Cyan,
                );
                await board.events.emitAsync(EngineEvent.EffectRequested, {
                    type: EffectType.GiveSpell,
                    pieceId: piece.id,
                    sound: "new-spell",
                });
                board.addSpell(
                    piece.currentRider.owner,
                    Spell.getRandomSpell(board.rng, true, board.spellFilter),
                );
                await piece.kill();
                await board.idleDelay();
            }
        }
        board.emitBoardUpdateEvent();
        await board.newTurn();
    }
}

export function _resetRulesForTesting(): void {
    _instance = undefined;
}
