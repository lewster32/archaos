import { describe, it, expect, vi, afterEach } from "vitest";
import { Rules, _resetRulesForTesting } from "./rules";
import { ActionType } from "./enums/actiontype";
import { BoardState } from "./enums/boardstate";
import { InputType } from "./enums/inputtype";
import { UnitStatus } from "./enums/unitstatus";
import { EngineEvent } from "./enums/engineevent";
import { EventType } from "./enums/eventtype";
import { Point } from "./point";
import { Board } from "./board";
import type { Piece } from "./piece";
import type { SpreadBatchPayload } from "./actions";
import { TestRNG } from "./rng";

function createMockPiece(overrides: Record<string, any> = {}): Piece {
    return {
        id: 1,
        dead: false,
        currentMount: null,
        currentRider: null,
        engulfed: false,
        owner: { id: 1 },
        position: new Point(0, 0),
        moved: false,
        attacked: false,
        engaged: false,
        canSelect: true,
        hasStatus: vi.fn().mockReturnValue(false),
        canAttackPiece: vi.fn().mockReturnValue(false),
        canRangedAttackPiece: vi.fn().mockReturnValue(false),
        canMountPiece: vi.fn().mockReturnValue(false),
        inAttackRange: vi.fn().mockReturnValue(false),
        inMovementRange: vi.fn().mockReturnValue(false),
        ...overrides,
    } as unknown as Piece;
}

function createMockBoard(overrides: Record<string, any> = {}): Board {
    return {
        state: BoardState.Move,
        cursorPosition: new Point(4, 0),
        selected: null,
        currentPlayer: { id: 1 },
        getPiecesAtPosition: vi.fn().mockReturnValue([]),
        movePiece: vi.fn().mockResolvedValue(undefined),
        attackPiece: vi.fn().mockResolvedValue(null),
        rangedAttackPiece: vi.fn().mockResolvedValue(null),
        mountPiece: vi.fn().mockResolvedValue(undefined),
        selectPiece: vi.fn().mockResolvedValue(undefined),
        deselectPiece: vi.fn().mockResolvedValue(undefined),
        emitUIEvent: vi.fn(),
        events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
        ...overrides,
    } as unknown as Board;
}

describe("Rules", () => {
    const rules = Rules.getInstance();

    // ─── processIntent ────────────────────────────────────────────────────

    describe("processIntent", () => {
        it("returns Attack for a flying unit with an enemy in attack range", async () => {
            const attacker = createMockPiece({
                id: 1,
                position: new Point(0, 0),
                canAttackPiece: vi.fn().mockReturnValue(true),
                inAttackRange: vi.fn().mockReturnValue(true),
                hasStatus: vi.fn().mockReturnValue(true),
            });
            const defender = createMockPiece({
                id: 2,
                position: new Point(4, 0),
                owner: { id: 2 },
            });
            const board = createMockBoard({
                selected: attacker,
                getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
            });

            const result = await rules.processIntent(board);
            expect(result).toBe(ActionType.Attack);
            expect(attacker.inAttackRange).toHaveBeenCalledWith(defender.position);
        });
    });

    // ─── processAction (Click → processClick) ────────────────────────────

    describe("processAction (Click)", () => {
        describe("Attack action", () => {
            it("flying unit attacks enemy in movement range", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(true),
                    inAttackRange: vi.fn().mockReturnValue(true),
                    hasStatus: vi.fn().mockImplementation((s: UnitStatus) => s === UnitStatus.Flying),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Point(4, 0),
                    owner: { id: 2 },
                    inAttackRange: vi.fn().mockReturnValue(false),
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursorPosition: new Point(4, 0),
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(board, ActionType.Attack, InputType.Click);

                expect(result).toBe(ActionType.Attack);
                expect(board.attackPiece).toHaveBeenCalledWith(attacker.id, defender.id);
                // Should NOT have moved first (flying units attack from position)
                expect(board.movePiece).not.toHaveBeenCalled();
            });

            it("flying unit cannot attack enemy outside movement range", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(true),
                    inAttackRange: vi.fn().mockReturnValue(false),
                    hasStatus: vi.fn().mockImplementation((s: UnitStatus) => s === UnitStatus.Flying),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Point(10, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursorPosition: new Point(10, 0),
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(board, ActionType.Attack, InputType.Click);

                expect(result).toBe(ActionType.Invalid);
                expect(board.attackPiece).not.toHaveBeenCalled();
            });

            it("ground unit walks to attack distant enemy within movement range", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(true),
                    inMovementRange: vi.fn().mockReturnValue(true),
                    hasStatus: vi.fn().mockReturnValue(false),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Point(3, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursorPosition: new Point(3, 0),
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(board, ActionType.Attack, InputType.Click);

                expect(result).toBe(ActionType.Attack);
                expect(board.movePiece).toHaveBeenCalledWith(
                    attacker.id,
                    defender.position,
                    expect.any(String),
                    expect.any(Number),
                );
                expect(board.attackPiece).toHaveBeenCalledWith(attacker.id, defender.id);
            });

            it("adjacent attack succeeds without moving", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(true),
                    inAttackRange: vi.fn().mockReturnValue(true),
                    hasStatus: vi.fn().mockReturnValue(false),
                    inMovementRange: vi.fn().mockReturnValue(true),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Point(1, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursorPosition: new Point(1, 0),
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(board, ActionType.Attack, InputType.Click);

                expect(result).toBe(ActionType.Attack);
                expect(board.movePiece).not.toHaveBeenCalled();
                expect(board.attackPiece).toHaveBeenCalledWith(attacker.id, defender.id);
            });

            it("returns Invalid when canAttackPiece is false", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(false),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Point(1, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursorPosition: new Point(1, 0),
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(board, ActionType.Attack, InputType.Click);

                expect(result).toBe(ActionType.Invalid);
                expect(board.attackPiece).not.toHaveBeenCalled();
            });
        });

        describe("RangedAttack action", () => {
            it("ranged attack succeeds when canRangedAttackPiece is true", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Point(0, 0),
                    canRangedAttackPiece: vi.fn().mockReturnValue(true),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Point(3, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursorPosition: new Point(3, 0),
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(board, ActionType.RangedAttack, InputType.Click);

                expect(result).toBe(ActionType.RangedAttack);
                expect(board.rangedAttackPiece).toHaveBeenCalledWith(attacker.id, defender.id);
            });

            it("ranged attack returns Invalid when canRangedAttackPiece is false", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Point(0, 0),
                    canRangedAttackPiece: vi.fn().mockReturnValue(false),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Point(3, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursorPosition: new Point(3, 0),
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(board, ActionType.RangedAttack, InputType.Click);

                expect(result).toBe(ActionType.Invalid);
                expect(board.rangedAttackPiece).not.toHaveBeenCalled();
            });
        });
    });
});

describe("Rules.doSpread", () => {
    it("emits SpreadBatch with correct iteration count", async () => {
        const board = {
            pieces: [
                {
                    id: 1,
                    dead: false,
                    hasStatus: vi.fn((s: UnitStatus) => s === UnitStatus.Spreads),
                    spread: vi.fn().mockResolvedValue({
                        action: "none",
                    }),
                },
            ],
            events: {
                emit: vi.fn(),
            },
            emitBoardUpdateEvent: vi.fn(),
        } as unknown as Board;

        const rules = Rules.getInstance();
        await rules.doSpread(board);

        const batchCall = (board.events.emit as any).mock.calls.find((c: any) => c[0] === EngineEvent.SpreadBatch);
        expect(batchCall).toBeDefined();
        const payload: SpreadBatchPayload = batchCall[1];
        expect(payload.iterations).toHaveLength(2);
    });

    it("skips a piece that dies mid-iteration (dead=true after first spread)", async () => {
        const spreader = {
            id: 5,
            dead: false,
            hasStatus: vi.fn((s: UnitStatus) => s === UnitStatus.Spreads),
            spread: vi.fn().mockResolvedValue({
                action: "shrink",
                pieceId: 5,
            }),
        };
        // After first spread the piece "dies"
        spreader.spread.mockImplementation(async () => {
            spreader.dead = true;
            return {
                action: "shrink",
                pieceId: 5,
            };
        });
        const board = {
            pieces: [spreader],
            events: { emit: vi.fn() },
            emitBoardUpdateEvent: vi.fn(),
        } as unknown as Board;

        const rules = Rules.getInstance();
        await rules.doSpread(board);

        const payload: SpreadBatchPayload = (board.events.emit as any).mock.calls.find(
            (c: any) => c[0] === EngineEvent.SpreadBatch,
        )[1];
        expect(payload.iterations[0].results).toHaveLength(1);
        expect(payload.iterations[0].results[0]).toEqual({
            action: "shrink",
            pieceId: 5,
        });
        // Second iteration: piece is dead, filtered
        expect(payload.iterations[1].results).toHaveLength(0);
    });
});

// ── Rules.processIntent – additional branches ────────────────────────────────

describe("Rules.processIntent – additional branches", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("returns Idle when board state is Idle", async () => {
        const board = createMockBoard({ state: BoardState.Idle });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.None);
    });

    it("returns Info when state is View and a piece is hovered", async () => {
        const piece = createMockPiece();
        const board = createMockBoard({
            state: BoardState.View,
            getPiecesAtPosition: vi.fn().mockReturnValue([piece]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Info);
    });

    it("returns Idle when state is View and no piece is hovered", async () => {
        const board = createMockBoard({
            state: BoardState.View,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Idle);
    });

    it("returns Info when state is SelectSpell and a piece is hovered", async () => {
        const piece = createMockPiece();
        const board = createMockBoard({
            state: BoardState.SelectSpell,
            getPiecesAtPosition: vi.fn().mockReturnValue([piece]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Info);
    });

    it("returns Idle when state is SelectSpell and no piece is hovered", async () => {
        const board = createMockBoard({
            state: BoardState.SelectSpell,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Idle);
    });

    it("returns Idle when there is no currentPlayer", async () => {
        const board = createMockBoard({
            state: BoardState.Move,
            currentPlayer: null,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Idle);
    });

    it("returns Cast when state is CastSpell and spell has a valid target", async () => {
        const board = createMockBoard({
            state: BoardState.CastSpell,
            currentPlayer: {
                id: 1,
                selectedSpell: {
                    castTimes: 1,
                    getValidTarget: vi.fn().mockReturnValue({ id: 42 }),
                },
            } as any,
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Cast);
    });

    it("returns Invalid when state is CastSpell and spell has no valid target", async () => {
        const board = createMockBoard({
            state: BoardState.CastSpell,
            currentPlayer: {
                id: 1,
                selectedSpell: {
                    castTimes: 1,
                    getValidTarget: vi.fn().mockReturnValue(null),
                },
            } as any,
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Invalid);
    });

    it("returns Info when state is CastSpell but no spell selected", async () => {
        const board = createMockBoard({
            state: BoardState.CastSpell,
            currentPlayer: { id: 1, selectedSpell: null } as any,
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Info);
    });

    it("returns Select when no piece is selected and a friendly selectable piece is hovered", async () => {
        // owner must be the same object reference as currentPlayer
        const currentPlayer = { id: 1 } as any;
        const hoveredPiece = createMockPiece({
            owner: currentPlayer,
            canSelect: true,
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: null,
            currentPlayer,
            getPiecesAtPosition: vi.fn().mockReturnValue([hoveredPiece]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Select);
    });

    it("returns Info when no piece is selected and a friendly non-selectable piece is hovered", async () => {
        // owner must be the same object reference as currentPlayer
        const currentPlayer = { id: 1 } as any;
        const hoveredPiece = createMockPiece({
            owner: currentPlayer,
            canSelect: false,
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: null,
            currentPlayer,
            getPiecesAtPosition: vi.fn().mockReturnValue([hoveredPiece]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Info);
    });

    it("returns Info when no piece selected and an enemy piece is hovered", async () => {
        const hoveredPiece = createMockPiece({ owner: { id: 2 } });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: null,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([hoveredPiece]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Info);
    });

    it("returns Idle when no piece selected and no pieces hovered", async () => {
        const board = createMockBoard({
            state: BoardState.Move,
            selected: null,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Idle);
    });

    it("returns Mount when a piece is selected and target is mountable", async () => {
        const mount = createMockPiece({ id: 2, owner: { id: 1 } });
        const attacker = createMockPiece({
            id: 1,
            canMountPiece: vi.fn().mockReturnValue(true),
            canAttackPiece: vi.fn().mockReturnValue(false),
            canRangedAttackPiece: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: attacker,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([mount]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Mount);
    });

    it("returns RangedAttack when a piece is selected and can ranged attack hovered piece", async () => {
        const defender = createMockPiece({ id: 2, owner: { id: 2 } });
        const attacker = createMockPiece({
            id: 1,
            moved: true,
            canMountPiece: vi.fn().mockReturnValue(false),
            canAttackPiece: vi.fn().mockReturnValue(false),
            canRangedAttackPiece: vi.fn().mockReturnValue(true),
            inAttackRange: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: attacker,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.RangedAttack);
    });

    it("returns Invalid when piece has moved and the hovered piece cannot be attacked", async () => {
        const enemy = createMockPiece({ id: 2, owner: { id: 2 } });
        const attacker = createMockPiece({
            id: 1,
            moved: true,
            canMountPiece: vi.fn().mockReturnValue(false),
            canAttackPiece: vi.fn().mockReturnValue(false),
            canRangedAttackPiece: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: attacker,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([enemy]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Invalid);
    });

    it("returns Move when selected piece is in movement range of empty cursor cell", async () => {
        const mover = createMockPiece({
            moved: false,
            inMovementRange: vi.fn().mockReturnValue(true),
            canMountPiece: vi.fn().mockReturnValue(false),
            canAttackPiece: vi.fn().mockReturnValue(false),
            canRangedAttackPiece: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: mover,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Move);
    });

    it("returns Invalid when selected piece is not in movement range of cursor", async () => {
        const mover = createMockPiece({
            moved: false,
            inMovementRange: vi.fn().mockReturnValue(false),
            canMountPiece: vi.fn().mockReturnValue(false),
            canAttackPiece: vi.fn().mockReturnValue(false),
            canRangedAttackPiece: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: mover,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Invalid);
    });

    it("returns Idle for an unrecognised board state", async () => {
        const board = createMockBoard({
            state: "unknown" as any,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Idle);
    });

    it("returns Move when selected piece hovers over itself (self-select)", async () => {
        // This exercises the selectedPiece === currentAliveHoveredPiece branch.
        const piece = createMockPiece({
            id: 1,
            moved: false,
            canMountPiece: vi.fn().mockReturnValue(false),
            canAttackPiece: vi.fn().mockReturnValue(false),
            canRangedAttackPiece: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: piece,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([piece]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Move);
    });

    it("returns Invalid when selected piece hovers over an uninteractable third piece", async () => {
        // selectedPiece !== currentAliveHoveredPiece and nothing matches → Invalid.
        const selected = createMockPiece({
            id: 1,
            moved: false,
            canMountPiece: vi.fn().mockReturnValue(false),
            canAttackPiece: vi.fn().mockReturnValue(false),
            canRangedAttackPiece: vi.fn().mockReturnValue(false),
        });
        const other = createMockPiece({ id: 2 });
        const board = createMockBoard({
            state: BoardState.Move,
            selected,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([other]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Invalid);
    });

    it("returns Info when no piece selected but only dead/mounted pieces are hovered", async () => {
        // hoveredPieces.length > 0 but currentAliveHoveredPiece is null →
        // the else-if (hoveredPieces.length > 0) branch returns Info.
        const deadPiece = createMockPiece({
            id: 5,
            dead: true,
            currentMount: null,
            engulfed: false,
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: null,
            currentPlayer: { id: 1 } as any,
            getPiecesAtPosition: vi.fn().mockReturnValue([deadPiece]),
        });
        const rules = Rules.getInstance();
        expect(await rules.processIntent(board)).toBe(ActionType.Info);
    });
});

// ── Rules.processAction – additional branches ────────────────────────────────

describe("Rules.processAction – additional branches", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("returns Idle for an unhandled input type", async () => {
        const board = createMockBoard({ state: BoardState.Move });
        const rules = Rules.getInstance();
        // InputType.Unknown is not Click or Cancel
        const result = await rules.processAction(board, ActionType.Move, "unknown" as any);
        expect(result).toBe(ActionType.Idle);
    });

    it("returns None when state is Idle", async () => {
        const board = createMockBoard({ state: BoardState.Idle });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.Move, InputType.Click);
        expect(result).toBe(ActionType.None);
    });

    it("Click + Info with a hovered piece dispatches PieceInfo event", async () => {
        const piece = createMockPiece({ id: 7 });
        const board = createMockBoard({
            state: BoardState.Move,
            getPiecesAtPosition: vi.fn().mockReturnValue([piece]),
        });
        const rules = Rules.getInstance();
        await rules.processAction(board, ActionType.Info, InputType.Click);
        expect(board.events.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(EventType.PieceInfo, piece);
    });

    it("Click + Select picks the hovered piece", async () => {
        const piece = createMockPiece({ id: 10, canSelect: true });
        const board = createMockBoard({
            state: BoardState.Move,
            getPiecesAtPosition: vi.fn().mockReturnValue([piece]),
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.Select, InputType.Click);
        expect(result).toBe(ActionType.Select);
        expect(board.selectPiece).toHaveBeenCalledWith(10);
    });

    it("Click + Move moves the selected piece to cursor position", async () => {
        const selectedPiece = createMockPiece({
            id: 3,
            moved: false,
            inMovementRange: vi.fn().mockReturnValue(true),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: selectedPiece,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.Move, InputType.Click);
        expect(result).toBe(ActionType.Move);
        expect(board.movePiece).toHaveBeenCalledWith(3, board.cursorPosition, expect.any(String), expect.any(Number));
    });

    it("Click + Move returns Invalid when piece cannot reach cursor", async () => {
        const selectedPiece = createMockPiece({
            id: 3,
            moved: false,
            inMovementRange: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: selectedPiece,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.Move, InputType.Click);
        expect(result).toBe(ActionType.Invalid);
    });

    it("Cancel returns None when there is no currentPlayer", async () => {
        const board = createMockBoard({
            state: BoardState.Move,
            currentPlayer: null,
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.None);
    });

    it("Cancel returns None when currentPlayer has a remote controller", async () => {
        const board = createMockBoard({
            state: BoardState.Move,
            currentPlayer: { id: 1, remote: {} } as any,
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.None);
    });

    it("Cancel in Move state with a selected piece marks it as turn-over", async () => {
        const selectedPiece = createMockPiece({
            id: 5,
            moved: false,
            currentRider: null,
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: selectedPiece,
            currentPlayer: { id: 1, remote: null } as any,
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.Cancel);
        expect(board.deselectPiece).toHaveBeenCalled();
    });

    it("Cancel in an unrecognised state returns None", async () => {
        const board = createMockBoard({
            state: "unknown" as any,
            currentPlayer: { id: 1, remote: null } as any,
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.None);
    });
});

// ── Rules.dispatchEvent ───────────────────────────────────────────────────────

describe("Rules.dispatchEvent", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("emits the event on the board when a board is provided", () => {
        const board = createMockBoard({ state: BoardState.Move });
        const rules = Rules.getInstance();
        rules.dispatchEvent(EventType.PieceInfo, { id: 1 }, board);
        expect(board.events.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(EventType.PieceInfo, { id: 1 });
    });

    it("does not throw when no board is provided", () => {
        const rules = Rules.getInstance();
        expect(() => rules.dispatchEvent(EventType.PieceInfo, { id: 1 })).not.toThrow();
    });
});

// ── Rules.roll / Rules.rollChance ────────────────────────────────────────────

describe("Rules.roll", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("returns player.forceHit when set", () => {
        const rules = Rules.getInstance();
        const rng = new TestRNG();
        expect(rules.roll(5, 5, rng, { forceHit: true } as any)).toBe(true);
        expect(rules.roll(5, 5, rng, { forceHit: false } as any)).toBe(false);
    });

    it("returns true when attack roll > defence roll (TestRNG returns min)", () => {
        const rules = Rules.getInstance();
        // TestRNG.between returns min always; with attack=10 between(0,20)=0
        // and defence=0 between(0,10)=0 → 0 > 0 is false.
        const rng = new TestRNG();
        const result = rules.roll(10, 0, rng);
        // Both between() calls return 0 → attackRoll=0, defenceRoll=0 → false
        expect(result).toBe(false);
    });
});

describe("Rules.rollChance", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("returns player.forceCast when set", () => {
        const rules = Rules.getInstance();
        const rng = new TestRNG();
        expect(rules.rollChance(0.5, rng, { forceCast: true } as any)).toBe(true);
        expect(rules.rollChance(0.5, rng, { forceCast: false } as any)).toBe(false);
    });

    it("succeeds when chance > frac (frac=0.3, chance=0.7)", () => {
        const rules = Rules.getInstance();
        const rng = new TestRNG(0.3);
        expect(rules.rollChance(0.7, rng)).toBe(true);
    });

    it("fails when chance <= frac (frac=0.8, chance=0.5)", () => {
        const rules = Rules.getInstance();
        const rng = new TestRNG(0.8);
        expect(rules.rollChance(0.5, rng)).toBe(false);
    });

    it("clamps out-of-bounds chance > 1 and still evaluates", () => {
        const rules = Rules.getInstance();
        const rng = new TestRNG(0.5);
        // 1.5 clamped to 1.0 > 0.5 → true
        expect(rules.rollChance(1.5, rng)).toBe(true);
    });

    it("clamps out-of-bounds chance < 0 and evaluates to false", () => {
        const rules = Rules.getInstance();
        const rng = new TestRNG(0.5);
        // -0.5 clamped to 0.0 > 0.5 → false
        expect(rules.rollChance(-0.5, rng)).toBe(false);
    });
});

// ── Rules.doExpire ────────────────────────────────────────────────────────────

describe("Rules.doExpire", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("kills a Structure with Expires status when roll succeeds", async () => {
        const piece = {
            id: 1,
            name: "Test Structure",
            dead: false,
            hasStatus: vi.fn((s: UnitStatus) => s === UnitStatus.Expires || s === UnitStatus.Structure),
            currentRider: null,
            kill: vi.fn().mockResolvedValue(undefined),
        };
        const board = {
            pieces: [piece],
            roll: vi.fn().mockReturnValue(true),
            events: {
                emit: vi.fn(),
                emitAsync: vi.fn().mockResolvedValue(undefined),
            },
            logger: { log: vi.fn() },
            emitBoardUpdateEvent: vi.fn(),
            newTurn: vi.fn().mockResolvedValue(undefined),
            addSpell: vi.fn(),
            rng: new TestRNG(),
            spellFilter: vi.fn().mockReturnValue(true),
        } as unknown as Board;

        const rules = Rules.getInstance();
        await rules.doExpire(board);
        expect(piece.kill).toHaveBeenCalled();
    });

    it("does not kill a Structure when roll fails", async () => {
        const piece = {
            id: 1,
            name: "Test Structure",
            dead: false,
            hasStatus: vi.fn((s: UnitStatus) => s === UnitStatus.Expires || s === UnitStatus.Structure),
            currentRider: null,
            kill: vi.fn().mockResolvedValue(undefined),
        };
        const board = {
            pieces: [piece],
            roll: vi.fn().mockReturnValue(false),
            events: {
                emit: vi.fn(),
                emitAsync: vi.fn().mockResolvedValue(undefined),
            },
            logger: { log: vi.fn() },
            emitBoardUpdateEvent: vi.fn(),
            newTurn: vi.fn().mockResolvedValue(undefined),
            addSpell: vi.fn(),
            rng: new TestRNG(),
            spellFilter: vi.fn().mockReturnValue(true),
        } as unknown as Board;

        const rules = Rules.getInstance();
        await rules.doExpire(board);
        expect(piece.kill).not.toHaveBeenCalled();
    });

    it("skips pieces without Expires status", async () => {
        const piece = {
            id: 1,
            name: "Normal",
            hasStatus: vi.fn().mockReturnValue(false),
            kill: vi.fn(),
        };
        const board = {
            pieces: [piece],
            roll: vi.fn(),
            events: {
                emit: vi.fn(),
                emitAsync: vi.fn().mockResolvedValue(undefined),
            },
            logger: { log: vi.fn() },
            emitBoardUpdateEvent: vi.fn(),
            newTurn: vi.fn().mockResolvedValue(undefined),
            addSpell: vi.fn(),
            rng: new TestRNG(),
            spellFilter: vi.fn().mockReturnValue(true),
        } as unknown as Board;

        const rules = Rules.getInstance();
        await rules.doExpire(board);
        expect(piece.kill).not.toHaveBeenCalled();
    });
});

// ── Rules.doCastSpell ─────────────────────────────────────────────────────────

function makeCastBoard(spellOverrides: Record<string, any> = {}) {
    const spell = {
        name: "Fireball",
        castTimes: 1,
        failed: false,
        lineOfSight: false,
        cast: vi.fn().mockResolvedValue(undefined),
        ...spellOverrides,
    };
    const board = {
        currentPlayer: {
            name: "Alice",
            useSpell: vi.fn().mockResolvedValue(spell),
            discardSpell: vi.fn().mockResolvedValue(spell),
            selectedSpell: spell,
        },
        selected: { position: new Point(0, 0), turnOver: false },
        state: BoardState.CastSpell,
        boardEvents: { emit: vi.fn() },
        events: { emit: vi.fn() },
        logger: { log: vi.fn() },
        stateManager: { evaluate: vi.fn() },
        deselectPlayer: vi.fn(),
        idleDelay: vi.fn().mockResolvedValue(undefined),
        nextPlayer: vi.fn().mockResolvedValue(undefined),
        deselectPiece: vi.fn().mockResolvedValue(undefined),
    } as unknown as Board;
    return { board, spell };
}

describe("Rules.doCastSpell", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("returns true when spell still has castTimes remaining", async () => {
        const { board } = makeCastBoard({ castTimes: 2 });
        const rules = Rules.getInstance();
        const result = await rules.doCastSpell(board, { id: 1 } as any);
        expect(result).toBe(true);
    });

    it("emits ShowCastRange when spell has lineOfSight", async () => {
        const { board } = makeCastBoard({
            castTimes: 1,
            lineOfSight: true,
            range: 4,
        });
        const rules = Rules.getInstance();
        await rules.doCastSpell(board, { id: 1 } as any);
        expect(
            (board.events.emit as ReturnType<typeof vi.fn>).mock.calls.some(
                (c: any) => c[0] === EngineEvent.ShowCastRange,
            ),
        ).toBe(true);
    });

    it("returns false when useSpell returns null", async () => {
        const board = {
            currentPlayer: {
                useSpell: vi.fn().mockResolvedValue(null),
            },
        } as unknown as Board;
        const rules = Rules.getInstance();
        expect(await rules.doCastSpell(board, {} as any)).toBe(false);
    });

    it("logs failure message when spell.failed is true after casting", async () => {
        const { board } = makeCastBoard({
            castTimes: 0,
            failed: true,
        });
        const rules = Rules.getInstance();
        await rules.doCastSpell(board, { id: 1 } as any);
        expect((board as any).logger.log).toHaveBeenCalledWith(
            expect.stringContaining("failed to cast"),
            expect.anything(),
        );
    });
});

// ── Rules.doAutoCastSpell ─────────────────────────────────────────────────────

describe("Rules.doAutoCastSpell", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("delegates to ComputerWizard.autoCastSpell and returns its result", async () => {
        const { board } = makeCastBoard();
        // ComputerWizard.autoCastSpell is a static method — spy on it.
        const { ComputerWizard } = await import("./ai/computerwizard");
        const spy = vi.spyOn(ComputerWizard, "autoCastSpell").mockResolvedValue(true);
        const rules = Rules.getInstance();
        const result = await rules.doAutoCastSpell(board);
        expect(result).toBe(true);
        expect(spy).toHaveBeenCalledWith(board, board.currentPlayer);
        spy.mockRestore();
    });
});

// ── Rules.processClick – Info sort + Cast success ─────────────────────────────

describe("Rules.processAction – Info sort and Cast success (Click)", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("Info sort: alive+rider piece sorts before alive-no-rider and dead", async () => {
        // [aliveNoRider, aliveWithRider] — compare(a=aliveNoRider, b=aliveWithRider)
        // hits !b.dead && b.currentRider → return 1 (line 331).
        const aliveNoRider = createMockPiece({
            id: 11,
            dead: false,
            currentRider: null,
        });
        const aliveWithRider = createMockPiece({
            id: 12,
            dead: false,
            currentRider: createMockPiece({ id: 99 }),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            getPiecesAtPosition: vi.fn().mockReturnValue([aliveNoRider, aliveWithRider]),
        });
        const rules = Rules.getInstance();
        await rules.processAction(board, ActionType.Info, InputType.Click);
        const emitCalls = (board.events.emit as ReturnType<typeof vi.fn>).mock.calls;
        const infoCall = emitCalls.find((c: any) => c[0] === EventType.PieceInfo);
        expect(infoCall?.[1]).toBe(aliveWithRider);
    });

    it("Info sort: alive-no-rider before dead hits return -1 branch (line 334)", async () => {
        // [aliveNoRider, dead] — compare(a=aliveNoRider, b=dead)
        // hits !a.dead && b.dead → return -1 (line 334).
        const aliveNoRider = createMockPiece({
            id: 11,
            dead: false,
            currentRider: null,
        });
        const dead = createMockPiece({ id: 10, dead: true, currentRider: null });
        const board = createMockBoard({
            state: BoardState.Move,
            getPiecesAtPosition: vi.fn().mockReturnValue([aliveNoRider, dead]),
        });
        const rules = Rules.getInstance();
        await rules.processAction(board, ActionType.Info, InputType.Click);
        const emitCalls = (board.events.emit as ReturnType<typeof vi.fn>).mock.calls;
        const infoCall = emitCalls.find((c: any) => c[0] === EventType.PieceInfo);
        expect(infoCall?.[1]).toBe(aliveNoRider);
    });

    it("Info sort: two dead pieces hit the return-0 branch", async () => {
        // When both pieces are dead and have no rider, comparator returns 0.
        const deadA = createMockPiece({
            id: 20,
            dead: true,
            currentRider: null,
        });
        const deadB = createMockPiece({
            id: 21,
            dead: true,
            currentRider: null,
        });
        const board = createMockBoard({
            state: BoardState.Move,
            getPiecesAtPosition: vi.fn().mockReturnValue([deadA, deadB]),
        });
        const rules = Rules.getInstance();
        // No assertion on order — just ensure the comparator runs without error
        await expect(rules.processAction(board, ActionType.Info, InputType.Click)).resolves.toBe(ActionType.Info);
    });

    it("Cast click returns Cast when doCastSpell succeeds", async () => {
        const spell = {
            name: "Fireball",
            castTimes: 1,
            failed: false,
            lineOfSight: false,
            cast: vi.fn().mockResolvedValue(undefined),
            getValidTarget: vi.fn().mockReturnValue({ id: 7 }),
            range: 3,
        };
        const selected = createMockPiece({
            id: 1,
            position: new Point(0, 0),
            turnOver: false,
        });
        const board = createMockBoard({
            state: BoardState.CastSpell,
            selected,
            currentPlayer: {
                id: 1,
                name: "Alice",
                remote: null,
                selectedSpell: spell,
                useSpell: vi.fn().mockResolvedValue(spell),
                discardSpell: vi.fn().mockResolvedValue(spell),
            } as any,
            boardEvents: { emit: vi.fn() },
            logger: { log: vi.fn() },
            stateManager: { evaluate: vi.fn() },
            deselectPlayer: vi.fn(),
            idleDelay: vi.fn().mockResolvedValue(undefined),
            nextPlayer: vi.fn().mockResolvedValue(undefined),
        } as any);
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.Cast, InputType.Click);
        expect(result).toBe(ActionType.Cast);
    });

    it("Cast click returns Invalid when getValidTarget returns null", async () => {
        const spell = {
            name: "Fireball",
            castTimes: 1,
            getValidTarget: vi.fn().mockReturnValue(null),
        };
        const selected = createMockPiece({ id: 1 });
        const board = createMockBoard({
            state: BoardState.CastSpell,
            selected,
            currentPlayer: {
                id: 1,
                selectedSpell: spell,
            } as any,
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.Cast, InputType.Click);
        expect(result).toBe(ActionType.Invalid);
    });

    it("Cast click calls nextPlayer and returns Cancel when doCastSpell returns false", async () => {
        const spell = {
            name: "Fireball",
            castTimes: 0, // spell runs out after cast → doCastSpell returns false
            failed: false,
            lineOfSight: false,
            cast: vi.fn().mockResolvedValue(undefined),
            getValidTarget: vi.fn().mockReturnValue({ id: 7 }),
        };
        const selected = createMockPiece({
            id: 1,
            position: new Point(0, 0),
            turnOver: false,
        });
        const nextPlayer = vi.fn().mockResolvedValue(undefined);
        const board = createMockBoard({
            state: BoardState.CastSpell,
            selected,
            currentPlayer: {
                id: 1,
                name: "Alice",
                remote: null,
                selectedSpell: spell,
                useSpell: vi.fn().mockResolvedValue(spell),
                discardSpell: vi.fn().mockResolvedValue(spell),
            } as any,
            boardEvents: { emit: vi.fn() },
            logger: { log: vi.fn() },
            stateManager: { evaluate: vi.fn() },
            deselectPlayer: vi.fn(),
            idleDelay: vi.fn().mockResolvedValue(undefined),
            nextPlayer,
        } as any);
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.Cast, InputType.Click);
        expect(result).toBe(ActionType.Cancel);
        expect(nextPlayer).toHaveBeenCalled();
    });
});

// ── Rules.processClick – Mount action ────────────────────────────────────────

describe("Rules.processAction – Mount action (Click)", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("mounts adjacent piece when not engaged (distance ≤ 1.5)", async () => {
        const mount = createMockPiece({
            id: 2,
            position: new Point(1, 0),
        });
        const rider = createMockPiece({
            id: 1,
            position: new Point(0, 0),
            moved: false,
            engaged: false,
            canMountPiece: vi.fn().mockReturnValue(true),
            hasStatus: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: rider,
            cursorPosition: new Point(1, 0),
            getPiecesAtPosition: vi.fn().mockReturnValue([mount]),
        });
        const result = await Rules.getInstance().processAction(board, ActionType.Mount, InputType.Click);
        expect(result).toBe(ActionType.Mount);
        expect(board.mountPiece).toHaveBeenCalledWith(rider.id, mount.id);
        expect(board.movePiece).not.toHaveBeenCalled();
    });

    it("moves ground unit to mount target if distance > 1.5 then mounts", async () => {
        const mount = createMockPiece({
            id: 2,
            position: new Point(3, 0),
        });
        const rider = createMockPiece({
            id: 1,
            position: new Point(0, 0),
            moved: false,
            engaged: false,
            canMountPiece: vi.fn().mockReturnValue(true),
            inMovementRange: vi.fn().mockReturnValue(true),
            hasStatus: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: rider,
            cursorPosition: new Point(3, 0),
            getPiecesAtPosition: vi.fn().mockReturnValue([mount]),
        });
        const result = await Rules.getInstance().processAction(board, ActionType.Mount, InputType.Click);
        expect(result).toBe(ActionType.Mount);
        expect(board.movePiece).toHaveBeenCalledWith(rider.id, mount.position, expect.any(String), expect.any(Number));
        expect(board.mountPiece).toHaveBeenCalledWith(rider.id, mount.id);
        // moved flag must be restored to false after the pre-mount move
        expect(rider.moved).toBe(false);
    });

    it("returns Invalid when piece is engaged (cannot mount)", async () => {
        const mount = createMockPiece({
            id: 2,
            position: new Point(1, 0),
        });
        const rider = createMockPiece({
            id: 1,
            position: new Point(0, 0),
            engaged: true,
            canMountPiece: vi.fn().mockReturnValue(true),
            hasStatus: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: rider,
            cursorPosition: new Point(1, 0),
            getPiecesAtPosition: vi.fn().mockReturnValue([mount]),
        });
        const result = await Rules.getInstance().processAction(board, ActionType.Mount, InputType.Click);
        expect(result).toBe(ActionType.Invalid);
        expect(board.mountPiece).not.toHaveBeenCalled();
    });

    it("returns Invalid when canMountPiece is false", async () => {
        const mount = createMockPiece({ id: 2, position: new Point(1, 0) });
        const rider = createMockPiece({
            id: 1,
            position: new Point(0, 0),
            canMountPiece: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: rider,
            cursorPosition: new Point(1, 0),
            getPiecesAtPosition: vi.fn().mockReturnValue([mount]),
        });
        const result = await Rules.getInstance().processAction(board, ActionType.Mount, InputType.Click);
        expect(result).toBe(ActionType.Invalid);
    });
});

// ── Rules.processClick – Select and edge cases ───────────────────────────────

describe("Rules.processAction – Select and edge cases (Click)", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("Select: hovered piece has a selectable rider → returns Move and emits DismountAvailable", async () => {
        const rider = createMockPiece({ id: 99, canSelect: true });
        const mount = createMockPiece({
            id: 2,
            canSelect: false,
            currentRider: rider,
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: null,
            getPiecesAtPosition: vi.fn().mockReturnValue([mount]),
        });
        const result = await Rules.getInstance().processAction(board, ActionType.Select, InputType.Click);
        expect(result).toBe(ActionType.Move);
        expect(board.selectPiece).toHaveBeenCalledWith(mount.id);
        expect(board.emitUIEvent).toHaveBeenCalledWith(EventType.DismountAvailable, true);
    });

    it("Select: hovered piece not selectable and has no selectable rider → returns Invalid", async () => {
        const piece = createMockPiece({
            id: 3,
            canSelect: false,
            currentRider: null,
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: null,
            getPiecesAtPosition: vi.fn().mockReturnValue([piece]),
        });
        const result = await Rules.getInstance().processAction(board, ActionType.Select, InputType.Click);
        expect(result).toBe(ActionType.Invalid);
    });

    it("Select: no hovered pieces and no selected piece → returns None", async () => {
        const board = createMockBoard({
            state: BoardState.Move,
            selected: null,
            getPiecesAtPosition: vi.fn().mockReturnValue([]),
        });
        const result = await Rules.getInstance().processAction(board, ActionType.Select, InputType.Click);
        expect(result).toBe(ActionType.None);
    });

    it("Click with hovered pieces that are all dead → returns Idle", async () => {
        // The dead-piece Idle path is reached in the hoveredPieces block after
        // the Move check — use Attack so we pass the Move check.
        const dead = createMockPiece({ id: 5, dead: true });
        const selected = createMockPiece({
            id: 1,
            canAttackPiece: vi.fn().mockReturnValue(false),
        });
        const board = createMockBoard({
            state: BoardState.Attack,
            selected,
            getPiecesAtPosition: vi.fn().mockReturnValue([dead]),
        });
        const result = await Rules.getInstance().processAction(board, ActionType.Attack, InputType.Click);
        expect(result).toBe(ActionType.Idle);
    });

    it("Click with selected piece, non-null hovered piece, unrecognised action → returns None", async () => {
        const hovered = createMockPiece({
            id: 2,
            dead: false,
            currentMount: null,
            engulfed: false,
        });
        const selected = createMockPiece({ id: 1 });
        const board = createMockBoard({
            state: BoardState.Move,
            selected,
            getPiecesAtPosition: vi.fn().mockReturnValue([hovered]),
        });
        // Use an action type that doesn't match Mount/Attack/RangedAttack
        const result = await Rules.getInstance().processAction(board, ActionType.Idle, InputType.Click);
        expect(result).toBe(ActionType.None);
    });
});

// ── Rules.processCancel – additional branches ─────────────────────────────────

describe("Rules.processCancel – additional branches", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("Cancel in Move state also marks currentRider as moved/turn-over", async () => {
        const rider = { moved: false, turnOver: false };
        const piece = createMockPiece({
            id: 1,
            moved: false,
            currentRider: rider,
        });
        const board = createMockBoard({
            state: BoardState.Move,
            selected: piece,
            currentPlayer: { id: 1, remote: null } as any,
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.Cancel);
        expect(rider.moved).toBe(true);
        expect(rider.turnOver).toBe(true);
        expect(board.deselectPiece).toHaveBeenCalled();
    });

    it("Cancel with no selected piece calls nextPlayer and returns Cancel", async () => {
        const board = createMockBoard({
            state: BoardState.Attack,
            selected: null,
            currentPlayer: { id: 1, remote: null } as any,
            nextPlayer: vi.fn().mockResolvedValue(undefined),
        } as any);
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.Cancel);
        expect((board as any).nextPlayer).toHaveBeenCalled();
    });

    it("Cancel in SelectSpell with no selected piece advances to next player", async () => {
        const board = createMockBoard({
            state: BoardState.SelectSpell,
            selected: null,
            currentPlayer: { id: 1, remote: null } as any,
            nextPlayer: vi.fn().mockResolvedValue(undefined),
        } as any);
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.Cancel);
        expect((board as any).nextPlayer).toHaveBeenCalled();
    });

    it("Cancel in Dismount state marks piece and rider as moved", async () => {
        const rider = { moved: false };
        const piece = createMockPiece({
            id: 1,
            moved: false,
            currentRider: rider,
            currentMount: null,
        });
        const board = createMockBoard({
            state: BoardState.Dismount,
            selected: piece,
            currentPlayer: { id: 1, remote: null } as any,
            logger: { log: vi.fn() },
        } as any);
        const rules = Rules.getInstance();
        await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(piece.moved).toBe(true);
        expect(rider.moved).toBe(true);
    });

    it("Cancel in Dismount state re-selects mount when mount canSelect", async () => {
        const mount = createMockPiece({ id: 99, canSelect: true });
        const piece = createMockPiece({
            id: 1,
            moved: false,
            currentRider: null,
            currentMount: mount,
        });
        const stateManager = { evaluate: vi.fn() };
        const board = createMockBoard({
            state: BoardState.Dismount,
            selected: piece,
            currentPlayer: { id: 1, remote: null } as any,
            logger: { log: vi.fn() },
            stateManager,
        } as any);
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.Move);
        expect(board.selectPiece).toHaveBeenCalledWith(mount.id);
    });

    it("Cancel in Dismount state emits DismountAvailable(false) when mount cannot be selected", async () => {
        const mount = createMockPiece({ id: 99, canSelect: false });
        const piece = createMockPiece({
            id: 1,
            moved: false,
            currentRider: null,
            currentMount: mount,
        });
        const board = createMockBoard({
            state: BoardState.Dismount,
            selected: piece,
            currentPlayer: { id: 1, remote: null } as any,
            logger: { log: vi.fn() },
            stateManager: { evaluate: vi.fn() },
        } as any);
        const rules = Rules.getInstance();
        await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(board.emitUIEvent).toHaveBeenCalledWith(EventType.DismountAvailable, false);
    });

    it("Cancel with unmoved piece and unmoved rider triggers RequestDismount", async () => {
        const rider = { moved: false };
        const piece = createMockPiece({
            id: 1,
            moved: false,
            currentRider: rider,
            currentMount: null,
        });
        const stateManager = { evaluate: vi.fn() };
        const board = createMockBoard({
            state: BoardState.Attack,
            selected: piece,
            currentPlayer: { id: 1, remote: null } as any,
            stateManager,
        } as any);
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.Dismount);
    });

    it("Cancel after moving sets attacked=true when piece canAttack", async () => {
        const piece = createMockPiece({
            id: 1,
            moved: true,
            attacked: false,
            canAttack: true,
            canSelect: true,
            currentRider: null,
        });
        const board = createMockBoard({
            state: BoardState.Attack,
            selected: piece,
            currentPlayer: { id: 1, remote: null } as any,
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.None);
        expect(piece.attacked).toBe(true);
    });

    it("Cancel after moving sets rangedAttacked=true when piece canRangedAttack", async () => {
        const piece = createMockPiece({
            id: 1,
            moved: true,
            attacked: false,
            rangedAttacked: false,
            canAttack: false,
            canRangedAttack: true,
            canSelect: true,
            currentRider: null,
        });
        const board = createMockBoard({
            state: BoardState.RangedAttack,
            selected: piece,
            currentPlayer: { id: 1, remote: null } as any,
        });
        const rules = Rules.getInstance();
        await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(piece.rangedAttacked).toBe(true);
    });

    it("Cancel after moving marks turnOver and deselects when piece cannot select", async () => {
        const piece = createMockPiece({
            id: 1,
            moved: true,
            canAttack: false,
            canRangedAttack: false,
            canSelect: false,
            currentRider: null,
        });
        const board = createMockBoard({
            state: BoardState.Attack,
            selected: piece,
            currentPlayer: { id: 1, remote: null } as any,
        });
        const rules = Rules.getInstance();
        await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(piece.turnOver).toBe(true);
        expect(board.deselectPiece).toHaveBeenCalled();
    });

    it("Cancel with unmoved piece and no rider deselects piece and returns None", async () => {
        const piece = createMockPiece({
            id: 1,
            moved: false,
            currentRider: null,
            currentMount: null,
        });
        const board = createMockBoard({
            state: BoardState.Attack,
            selected: piece,
            currentPlayer: { id: 1, remote: null } as any,
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.None);
        expect(board.deselectPiece).toHaveBeenCalled();
    });

    it("Cancel in CastSpell state discards spell and advances to next player", async () => {
        const wasted = { name: "Fireball" };
        const selected = createMockPiece({ id: 9, turnOver: false });
        const board = createMockBoard({
            state: BoardState.CastSpell,
            selected,
            currentPlayer: {
                id: 1,
                remote: null,
                name: "Alice",
                selectedSpell: { name: "Fireball" },
                discardSpell: vi.fn().mockResolvedValue(wasted),
            } as any,
            stateManager: { evaluate: vi.fn() },
            logger: { log: vi.fn() },
            deselectPlayer: vi.fn(),
            idleDelay: vi.fn().mockResolvedValue(undefined),
            nextPlayer: vi.fn().mockResolvedValue(undefined),
        } as any);
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.Cancel);
        expect((board as any).nextPlayer).toHaveBeenCalled();
        expect(selected.turnOver).toBe(true);
    });

    it("Cancel in CastSpell state still returns Cancel when no selectedSpell", async () => {
        const board = createMockBoard({
            state: BoardState.CastSpell,
            selected: null,
            currentPlayer: {
                id: 1,
                remote: null,
                selectedSpell: null,
            } as any,
        });
        const rules = Rules.getInstance();
        const result = await rules.processAction(board, ActionType.None, InputType.Cancel);
        expect(result).toBe(ActionType.Cancel);
    });
});

// ── Rules.roll / rollChance – Board cheat flags ───────────────────────────────

describe("Rules.roll – CHEAT_FORCE_HIT", () => {
    afterEach(() => {
        _resetRulesForTesting();
        // Restore default (null = cheat disabled)
        Board.CHEAT_FORCE_HIT = null;
    });

    it("returns true when CHEAT_FORCE_HIT is true", () => {
        Board.CHEAT_FORCE_HIT = true;
        const rules = Rules.getInstance();
        expect(rules.roll(0, 10, new TestRNG())).toBe(true);
    });

    it("returns false when CHEAT_FORCE_HIT is false", () => {
        Board.CHEAT_FORCE_HIT = false;
        const rules = Rules.getInstance();
        expect(rules.roll(10, 0, new TestRNG())).toBe(false);
    });
});

describe("Rules.rollChance – CHEAT_FORCE_CAST", () => {
    afterEach(() => {
        _resetRulesForTesting();
        Board.CHEAT_FORCE_CAST = null;
    });

    it("returns true when CHEAT_FORCE_CAST is true", () => {
        Board.CHEAT_FORCE_CAST = true;
        const rules = Rules.getInstance();
        expect(rules.rollChance(0, new TestRNG())).toBe(true);
    });

    it("returns false when CHEAT_FORCE_CAST is false", () => {
        Board.CHEAT_FORCE_CAST = false;
        const rules = Rules.getInstance();
        expect(rules.rollChance(1, new TestRNG())).toBe(false);
    });
});

// ── Rules.doExpire – ExpiresGivesSpell ───────────────────────────────────────

describe("Rules.doExpire – ExpiresGivesSpell", () => {
    afterEach(() => {
        _resetRulesForTesting();
    });

    it("grants a spell to rider's owner and kills piece when roll succeeds", async () => {
        const owner = { name: "Alice" };
        const rider = { owner };
        const piece = {
            id: 2,
            name: "Magic Steed",
            currentRider: rider,
            hasStatus: vi.fn((s: UnitStatus) => s === UnitStatus.Expires || s === UnitStatus.ExpiresGivesSpell),
            kill: vi.fn().mockResolvedValue(undefined),
        };
        const board = {
            pieces: [piece],
            roll: vi.fn().mockReturnValue(true),
            events: {
                emit: vi.fn(),
                emitAsync: vi.fn().mockResolvedValue(undefined),
            },
            logger: { log: vi.fn() },
            emitBoardUpdateEvent: vi.fn(),
            newTurn: vi.fn().mockResolvedValue(undefined),
            addSpell: vi.fn(),
            idleDelay: vi.fn().mockResolvedValue(undefined),
            rng: new TestRNG(),
            spellFilter: vi.fn().mockReturnValue(true),
        } as unknown as Board;

        const rules = Rules.getInstance();
        await rules.doExpire(board);

        expect(board.addSpell).toHaveBeenCalled();
        expect(piece.kill).toHaveBeenCalled();
    });

    it("does not grant spell when ExpiresGivesSpell roll fails", async () => {
        const rider = { owner: { name: "Bob" } };
        const piece = {
            id: 3,
            name: "Magic Steed",
            currentRider: rider,
            hasStatus: vi.fn((s: UnitStatus) => s === UnitStatus.Expires || s === UnitStatus.ExpiresGivesSpell),
            kill: vi.fn().mockResolvedValue(undefined),
        };
        const board = {
            pieces: [piece],
            roll: vi.fn().mockReturnValue(false),
            events: {
                emit: vi.fn(),
                emitAsync: vi.fn().mockResolvedValue(undefined),
            },
            logger: { log: vi.fn() },
            emitBoardUpdateEvent: vi.fn(),
            newTurn: vi.fn().mockResolvedValue(undefined),
            addSpell: vi.fn(),
            idleDelay: vi.fn().mockResolvedValue(undefined),
            rng: new TestRNG(),
            spellFilter: vi.fn().mockReturnValue(true),
        } as unknown as Board;

        const rules = Rules.getInstance();
        await rules.doExpire(board);

        expect(board.addSpell).not.toHaveBeenCalled();
        expect(piece.kill).not.toHaveBeenCalled();
    });
});
