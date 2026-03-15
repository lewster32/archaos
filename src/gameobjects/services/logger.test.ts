import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from './logger';
import { Colour } from '../enums/colour';

describe('Logger', () => {
    let emitter: { emit: ReturnType<typeof vi.fn> };
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Reset the singleton so each test starts fresh
        (Logger as any).instance = undefined;
        emitter = { emit: vi.fn() };
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    // ─── getInstance ─────────────────────────────────────────────────────────

    describe('getInstance', () => {
        it('creates and returns a Logger instance on the first call', () => {
            const logger = Logger.getInstance(emitter as any);
            expect(logger).toBeInstanceOf(Logger);
        });

        it('returns the same instance on subsequent calls', () => {
            const a = Logger.getInstance(emitter as any);
            const b = Logger.getInstance(emitter as any);
            expect(a).toBe(b);
        });

        it('ignores the emitter argument when an instance already exists', () => {
            const first = Logger.getInstance(emitter as any);
            const other = { emit: vi.fn() };
            const second = Logger.getInstance(other as any);
            expect(second).toBe(first);
        });
    });

    // ─── log ─────────────────────────────────────────────────────────────────

    describe('log', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = Logger.getInstance(emitter as any);
        });

        it('emits a "log" event on the event emitter', () => {
            logger.log('hello');
            expect(emitter.emit).toHaveBeenCalledWith('log', expect.any(Object));
        });

        it('includes the message in the emitted payload', () => {
            logger.log('test message');
            expect(emitter.emit).toHaveBeenCalledWith('log',
                expect.objectContaining({ message: 'test message' })
            );
        });

        it('starts id at 1 on the first log call', () => {
            logger.log('first');
            const payload = emitter.emit.mock.calls[0][1];
            expect(payload.id).toBe(1);
        });

        it('increments the id with each successive log call', () => {
            logger.log('first');
            logger.log('second');
            const id1 = emitter.emit.mock.calls[0][1].id;
            const id2 = emitter.emit.mock.calls[1][1].id;
            expect(id2).toBe(id1 + 1);
        });

        it('includes a Date timestamp in the emitted payload', () => {
            logger.log('msg');
            const payload = emitter.emit.mock.calls[0][1];
            expect(payload.timestamp).toBeInstanceOf(Date);
        });

        it('includes colour in the emitted payload when provided', () => {
            logger.log('msg', Colour.Red);
            expect(emitter.emit).toHaveBeenCalledWith('log',
                expect.objectContaining({ colour: Colour.Red })
            );
        });

        it('emits with colour undefined when not provided', () => {
            logger.log('msg');
            const payload = emitter.emit.mock.calls[0][1];
            expect(payload.colour).toBeUndefined();
        });

        it('calls console.log with the message', () => {
            logger.log('hello world');
            expect(consoleSpy).toHaveBeenCalledWith('hello world');
        });
    });
});
