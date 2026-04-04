import { describe, it, expect, vi } from "vitest";
import { Piece } from "./piece";
import { Board } from "./board";
import { TestRNG } from "./rng";
import { Point } from "./point";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { SpreadAction } from "./enums/spreadaction";
import type { PieceConfig } from "./configs/piececonfig";
import type { UnitConfig } from "./interfaces/ui";

// Seed the static unit data so spread() can look
// up the config for newly created pieces.
Piece.units = {
    gooeyblob: {
        name: "Gooey Blob",
        group: "classicunits",
        shadowScale: 1,
        offY: 0,
        properties: {
            mov: 0,
            com: 0,
            rcm: 0,
            rng: 0,
            def: 1,
            mnv: 0,
            res: 0,
        },
        status: [UnitStatus.Spreads, UnitStatus.Engulfs],
    } as unknown as UnitConfig,
};

/**
 * Build a minimal mock board for Piece tests.
 */
function makeMockBoard(rng = new TestRNG()): Board {
    return {
        rng,
        width: 13,
        height: 13,
        logger: { log: vi.fn() },
        emitBoardUpdateEvent: vi.fn(),
        boardEvents: { emit: vi.fn() },
        events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
        getAdjacentPoints: vi
            .fn()
            .mockReturnValue([new Point(1, 0), new Point(0, 1)]),
        getPiecesAtPosition: vi.fn().mockReturnValue([]),
        removePiece: vi.fn(),
        addPiece: vi.fn().mockImplementation(() => ({
            id: 99,
            hasStatus: vi.fn().mockReturnValue(false),
            currentEngulfed: null,
        })),
    } as unknown as Board;
}

function makeSpreader(board: Board, id = 1, x = 0, y = 0): Piece {
    return new Piece(board, id, {
        type: UnitType.Creature,
        x,
        y,
        properties: {
            id: "gooeyblob",
            name: "Gooey Blob",
            movement: 0,
            combat: 0,
            rangedCombat: 0,
            range: 0,
            defence: 1,
            manoeuvrability: 0,
            magicResistance: 0,
            attackType: "attacked",
            rangedType: "shot",
            status: [UnitStatus.Spreads, UnitStatus.Engulfs],
        },
        owner: { name: "Player 1" } as any,
    } as PieceConfig);
}

describe("Piece.spread", () => {
    it("returns { action: 'none' } when RNG picks None", async () => {
        const rng = new TestRNG();
        rng.weightedRandomPick = () => SpreadAction.None;
        const board = makeMockBoard(rng);
        const piece = makeSpreader(board);
        const result = await piece.spread();
        expect(result).toEqual({ action: "none" });
    });

    it("returns shrink result and destroys the piece", async () => {
        const rng = new TestRNG();
        rng.weightedRandomPick = () => SpreadAction.Shrink;
        const board = makeMockBoard(rng);
        const piece = makeSpreader(board);
        const result = await piece.spread();
        expect(result).toEqual({
            action: "shrink",
            pieceId: piece.id,
        });
        expect(board.removePiece).toHaveBeenCalledWith(piece.id);
    });

    it("returns shrink with releasedPieceId when engulfing", async () => {
        const rng = new TestRNG();
        rng.weightedRandomPick = () => SpreadAction.Shrink;
        const board = makeMockBoard(rng);
        const piece = makeSpreader(board);
        const engulfed = {
            id: 42,
            engulfed: true,
            fullName: "Engulfed Piece",
        } as any;
        piece.currentEngulfed = engulfed;
        const result = await piece.spread();
        expect(result).toEqual({
            action: "shrink",
            pieceId: piece.id,
            releasedPieceId: 42,
        });
        expect(engulfed.engulfed).toBe(false);
    });

    it("returns spread result when spreading to empty square", async () => {
        const rng = new TestRNG();
        rng.weightedRandomPick = () => SpreadAction.Spread;
        rng.pick = (arr: any[]) => arr[0];
        const board = makeMockBoard(rng);
        const piece = makeSpreader(board);
        const result = await piece.spread();
        expect(result).toMatchObject({
            action: "spread",
            pieceId: piece.id,
            targetPoint: { x: 1, y: 0 },
            newPieceId: 99,
            destroyedPieceIds: [],
        });
    });

    it("throws when called on a non-spreading piece", async () => {
        const board = makeMockBoard();
        const piece = new Piece(board, 1, {
            type: UnitType.Creature,
            x: 0,
            y: 0,
            properties: {
                id: "horse",
                name: "Horse",
                movement: 4,
                combat: 1,
                rangedCombat: 0,
                range: 0,
                defence: 1,
                manoeuvrability: 0,
                magicResistance: 0,
                attackType: "attacked",
                rangedType: "shot",
                status: [],
            },
            owner: { name: "P1" } as any,
        } as PieceConfig);
        await expect(piece.spread()).rejects.toThrow(
            "Cannot spread a non-spreading or dead piece",
        );
    });
});
