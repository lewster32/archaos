import {
    ActionType,
    BoardState,
    InputType,
    UnitStatus,
} from "@archaos/engine";
import { describe, it, expect, vi } from "vitest";
import { Rules } from "./rules";
import type { Board } from "../board";
import type { Piece } from "../piece";
import { Geom } from "phaser";

function createMockPiece(overrides: Record<string, any> = {}): Piece {
    return {
        id: 1,
        dead: false,
        currentMount: null,
        currentRider: null,
        engulfed: false,
        owner: { id: 1 },
        position: new Geom.Point(0, 0),
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
        cursor: { position: new Geom.Point(4, 0) },
        selected: null,
        currentPlayer: { id: 1 },
        getPiecesAtPosition: vi.fn().mockReturnValue([]),
        movePiece: vi.fn().mockResolvedValue(undefined),
        attackPiece: vi.fn().mockResolvedValue(null),
        rangedAttackPiece: vi.fn().mockResolvedValue(null),
        mountPiece: vi.fn().mockResolvedValue(undefined),
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
                position: new Geom.Point(0, 0),
                canAttackPiece: vi.fn().mockReturnValue(true),
                inAttackRange: vi.fn().mockReturnValue(true),
                hasStatus: vi.fn().mockReturnValue(true),
            });
            const defender = createMockPiece({
                id: 2,
                position: new Geom.Point(4, 0),
                owner: { id: 2 },
            });
            const board = createMockBoard({
                selected: attacker,
                getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
            });

            const result = await rules.processIntent(board);
            expect(result).toBe(ActionType.Attack);
            expect(attacker.inAttackRange).toHaveBeenCalledWith(
                defender.position,
            );
        });
    });

    // ─── processAction (Click → processClick) ────────────────────────────

    describe("processAction (Click)", () => {
        describe("Attack action", () => {
            it("flying unit attacks enemy in movement range", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Geom.Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(true),
                    inAttackRange: vi.fn().mockReturnValue(true),
                    hasStatus: vi
                        .fn()
                        .mockImplementation(
                            (s: UnitStatus) => s === UnitStatus.Flying,
                        ),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Geom.Point(4, 0),
                    owner: { id: 2 },
                    inAttackRange: vi.fn().mockReturnValue(false),
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursor: { position: new Geom.Point(4, 0) },
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(
                    board,
                    ActionType.Attack,
                    InputType.Click,
                );

                expect(result).toBe(ActionType.Attack);
                expect(board.attackPiece).toHaveBeenCalledWith(
                    attacker.id,
                    defender.id,
                );
                // Should NOT have moved first (flying units attack from position)
                expect(board.movePiece).not.toHaveBeenCalled();
            });

            it("flying unit cannot attack enemy outside movement range", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Geom.Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(true),
                    inAttackRange: vi.fn().mockReturnValue(false),
                    hasStatus: vi
                        .fn()
                        .mockImplementation(
                            (s: UnitStatus) => s === UnitStatus.Flying,
                        ),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Geom.Point(10, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursor: { position: new Geom.Point(10, 0) },
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(
                    board,
                    ActionType.Attack,
                    InputType.Click,
                );

                expect(result).toBe(ActionType.Invalid);
                expect(board.attackPiece).not.toHaveBeenCalled();
            });

            it("ground unit walks to attack distant enemy within movement range", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Geom.Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(true),
                    inMovementRange: vi.fn().mockReturnValue(true),
                    hasStatus: vi.fn().mockReturnValue(false),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Geom.Point(3, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursor: { position: new Geom.Point(3, 0) },
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(
                    board,
                    ActionType.Attack,
                    InputType.Click,
                );

                expect(result).toBe(ActionType.Attack);
                expect(board.movePiece).toHaveBeenCalledWith(
                    attacker.id,
                    defender.position,
                );
                expect(board.attackPiece).toHaveBeenCalledWith(
                    attacker.id,
                    defender.id,
                );
            });

            it("adjacent attack succeeds without moving", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Geom.Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(true),
                    inAttackRange: vi.fn().mockReturnValue(true),
                    hasStatus: vi.fn().mockReturnValue(false),
                    inMovementRange: vi.fn().mockReturnValue(true),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Geom.Point(1, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursor: { position: new Geom.Point(1, 0) },
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(
                    board,
                    ActionType.Attack,
                    InputType.Click,
                );

                expect(result).toBe(ActionType.Attack);
                expect(board.movePiece).not.toHaveBeenCalled();
                expect(board.attackPiece).toHaveBeenCalledWith(
                    attacker.id,
                    defender.id,
                );
            });

            it("returns Invalid when canAttackPiece is false", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Geom.Point(0, 0),
                    canAttackPiece: vi.fn().mockReturnValue(false),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Geom.Point(1, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursor: { position: new Geom.Point(1, 0) },
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(
                    board,
                    ActionType.Attack,
                    InputType.Click,
                );

                expect(result).toBe(ActionType.Invalid);
                expect(board.attackPiece).not.toHaveBeenCalled();
            });
        });

        describe("RangedAttack action", () => {
            it("ranged attack succeeds when canRangedAttackPiece is true", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Geom.Point(0, 0),
                    canRangedAttackPiece: vi.fn().mockReturnValue(true),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Geom.Point(3, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursor: { position: new Geom.Point(3, 0) },
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(
                    board,
                    ActionType.RangedAttack,
                    InputType.Click,
                );

                expect(result).toBe(ActionType.RangedAttack);
                expect(board.rangedAttackPiece).toHaveBeenCalledWith(
                    attacker.id,
                    defender.id,
                );
            });

            it("ranged attack returns Invalid when canRangedAttackPiece is false", async () => {
                const attacker = createMockPiece({
                    id: 1,
                    position: new Geom.Point(0, 0),
                    canRangedAttackPiece: vi.fn().mockReturnValue(false),
                });
                const defender = createMockPiece({
                    id: 2,
                    position: new Geom.Point(3, 0),
                    owner: { id: 2 },
                });
                const board = createMockBoard({
                    selected: attacker,
                    cursor: { position: new Geom.Point(3, 0) },
                    getPiecesAtPosition: vi.fn().mockReturnValue([defender]),
                });

                const result = await rules.processAction(
                    board,
                    ActionType.RangedAttack,
                    InputType.Click,
                );

                expect(result).toBe(ActionType.Invalid);
                expect(board.rangedAttackPiece).not.toHaveBeenCalled();
            });
        });
    });
});
