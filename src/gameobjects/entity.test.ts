import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Entity } from './entity';
import { Board } from './board';
import { Geom } from 'phaser';

describe('Entity', () => {
    let mockBoard: Board;

    beforeEach(() => {
        mockBoard = vi.mocked({} as Board);
    });

    it('should create an entity with valid parameters', () => {
        const entity = new Entity(mockBoard, 1, 10, 20);
        expect(entity.id).toBe(1);
        expect(entity.board).toBe(mockBoard);
        expect(entity.position.x).toBe(10);
        expect(entity.position.y).toBe(20);
    });

    it('should inherit from Model and validate ID', () => {
        expect(() => new Entity(mockBoard, -1, 0, 0)).toThrow(RangeError);
    });

    it('should throw error if board is null', () => {
        expect(() => new Entity(null as any, 1, 0, 0)).toThrow("Board cannot be null or undefined.");
    });

    it('should throw error if coordinates are not integers', () => {
        expect(() => new Entity(mockBoard, 1, 10.5, 20)).toThrow("Coordinates must be integers.");
        expect(() => new Entity(mockBoard, 1, 10, 20.5)).toThrow("Coordinates must be integers.");
    });

    it('should create entity at origin (0, 0)', () => {
        const entity = new Entity(mockBoard, 5, 0, 0);
        expect(entity.position.x).toBe(0);
        expect(entity.position.y).toBe(0);
    });

    it('should update position using setter', () => {
        const entity = new Entity(mockBoard, 2, 5, 5);
        const newPosition = new Geom.Point(15, 25);
        entity.position = newPosition;
        expect(entity.position.x).toBe(15);
        expect(entity.position.y).toBe(25);
    });

    it('should throw error when setting position to non-integer coordinates', () => {
        const entity = new Entity(mockBoard, 2, 5, 5);
        expect(() => {
            entity.position = new Geom.Point(15.5, 25);
        }).toThrow("Coordinates must be integers.");
        expect(() => {
            entity.position = new Geom.Point(15, 25.5);
        }).toThrow("Coordinates must be integers.");
    });

    it('should maintain reference to the same board', () => {
        const entity = new Entity(mockBoard, 3, 10, 10);
        expect(entity.board).toBe(mockBoard);
    });

    it('should throw when trying to change the board reference', () => {
        const entity = new Entity(mockBoard, 3, 10, 10);
        expect(() => {
            (entity as any).board = {} as Board;
        }).toThrow();
    });

    it('should handle large coordinate values', () => {
        const entity = new Entity(mockBoard, 4, 9999, 9999);
        expect(entity.position.x).toBe(9999);
        expect(entity.position.y).toBe(9999);
    });

    it('should handle negative coordinate values', () => {
        const entity = new Entity(mockBoard, 6, -50, -100);
        expect(entity.position.x).toBe(-50);
        expect(entity.position.y).toBe(-100);
    });
});