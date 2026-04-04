import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Logger, _resetLoggerForTesting } from "./logger";
import { Colour } from "./enums/colour";

describe("Logger", () => {
    let emitSpy: ReturnType<typeof vi.spyOn>;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        _resetLoggerForTesting();
        emitSpy = vi.spyOn(Logger.getEventEmitter(), "emit");
        consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        emitSpy.mockRestore();
        consoleSpy.mockRestore();
    });

    describe("getInstance", () => {
        it("creates and returns a Logger instance on the first call", () => {
            const logger = Logger.getInstance();
            expect(logger).toBeInstanceOf(Logger);
        });

        it("returns the same instance on subsequent calls", () => {
            const a = Logger.getInstance();
            const b = Logger.getInstance();
            expect(a).toBe(b);
        });
    });

    describe("log", () => {
        let logger: Logger;

        beforeEach(() => {
            logger = Logger.getInstance();
        });

        it('emits a "log" event on the event emitter', () => {
            logger.log("hello");
            expect(emitSpy).toHaveBeenCalledWith("log", expect.any(Object));
        });

        it("includes the message in the emitted payload", () => {
            logger.log("test message");
            expect(emitSpy).toHaveBeenCalledWith(
                "log",
                expect.objectContaining({
                    message: "test message",
                }),
            );
        });

        it("starts id at 1 on the first log call", () => {
            logger.log("first");
            const payload = emitSpy.mock.calls[0][1] as Record<string, unknown>;
            expect(payload.id).toBe(1);
        });

        it("increments the id with each successive log call", () => {
            logger.log("first");
            logger.log("second");
            const id1 = (emitSpy.mock.calls[0][1] as Record<string, unknown>)
                .id;
            const id2 = (emitSpy.mock.calls[1][1] as Record<string, unknown>)
                .id;
            expect(id2).toBe((id1 as number) + 1);
        });

        it("includes a Date timestamp in the emitted payload", () => {
            logger.log("msg");
            const payload = emitSpy.mock.calls[0][1] as Record<string, unknown>;
            expect(payload.timestamp).toBeInstanceOf(Date);
        });

        it("includes colour in the emitted payload when provided", () => {
            logger.log("msg", Colour.Red);
            expect(emitSpy).toHaveBeenCalledWith(
                "log",
                expect.objectContaining({
                    colour: Colour.Red,
                }),
            );
        });

        it("emits with colour undefined when not provided", () => {
            logger.log("msg");
            const payload = emitSpy.mock.calls[0][1] as Record<string, unknown>;
            expect(payload.colour).toBeUndefined();
        });

        it("calls console.log with the message", () => {
            logger.log("hello world");
            expect(consoleSpy).toHaveBeenCalledWith("hello world");
        });
    });
});
