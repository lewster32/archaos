import { describe, it, expect, vi } from 'vitest';
import { ComputerWizard } from './computerwizard';
import type { Board } from './board';
import type { Player } from './player';

/** Minimal board mock — only `rollChance` is used by the tested methods */
function makeMockBoard(rollChanceResult: boolean = true) {
    return {
        rollChance: vi.fn().mockReturnValue(rollChanceResult),
    } as unknown as Board;
}

const mockPlayer = { name: 'TestAI' } as unknown as Player;

describe('ComputerWizard', () => {
    describe('difficulty getter', () => {
        it('defaults to 0.5 when no difficulty is provided', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            expect(cw.difficulty).toBe(0.5);
        });

        it('returns 0 for minimum difficulty', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer, 0);
            expect(cw.difficulty).toBe(0);
        });

        it('returns 1 for maximum difficulty', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer, 1);
            expect(cw.difficulty).toBe(1);
        });

        it('returns a custom difficulty value', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer, 0.75);
            expect(cw.difficulty).toBe(0.75);
        });
    });

    describe('knowsPieceIsNonIllusion', () => {
        it('returns false for any piece ID on a fresh instance', () => {
            const cw = new ComputerWizard(makeMockBoard(), mockPlayer);
            expect(cw.knowsPieceIsNonIllusion(42)).toBe(false);
            expect(cw.knowsPieceIsNonIllusion(0)).toBe(false);
            expect(cw.knowsPieceIsNonIllusion(999)).toBe(false);
        });
    });

    describe('rememberNonIllusionPiece', () => {
        it('adds a piece to known non-illusions when rollChance returns true', () => {
            const cw = new ComputerWizard(makeMockBoard(true), mockPlayer);
            cw.rememberNonIllusionPiece(42);
            expect(cw.knowsPieceIsNonIllusion(42)).toBe(true);
        });

        it('does not add a piece when rollChance returns false (failed to notice)', () => {
            const cw = new ComputerWizard(makeMockBoard(false), mockPlayer);
            cw.rememberNonIllusionPiece(42);
            expect(cw.knowsPieceIsNonIllusion(42)).toBe(false);
        });

        it('tracks multiple pieces independently', () => {
            const board = makeMockBoard(true);
            const cw = new ComputerWizard(board, mockPlayer);
            cw.rememberNonIllusionPiece(1);
            cw.rememberNonIllusionPiece(2);
            expect(cw.knowsPieceIsNonIllusion(1)).toBe(true);
            expect(cw.knowsPieceIsNonIllusion(2)).toBe(true);
            expect(cw.knowsPieceIsNonIllusion(3)).toBe(false);
        });

        it('does not affect other piece IDs when one remember fails', () => {
            const board = {
                rollChance: vi.fn()
                    .mockReturnValueOnce(true)  // piece 1: remembered
                    .mockReturnValueOnce(false), // piece 2: forgotten
            } as unknown as Board;
            const cw = new ComputerWizard(board, mockPlayer);
            cw.rememberNonIllusionPiece(1);
            cw.rememberNonIllusionPiece(2);
            expect(cw.knowsPieceIsNonIllusion(1)).toBe(true);
            expect(cw.knowsPieceIsNonIllusion(2)).toBe(false);
        });
    });
});
