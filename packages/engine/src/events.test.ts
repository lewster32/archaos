import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "./events";

describe("EventEmitter", () => {
    it("calls listeners on emit", () => {
        const emitter = new EventEmitter();
        const fn = vi.fn();
        emitter.on("test", fn);
        emitter.emit("test", { value: 42 });
        expect(fn).toHaveBeenCalledWith({ value: 42 });
    });

    it("removes a listener with off", () => {
        const emitter = new EventEmitter();
        const fn = vi.fn();
        emitter.on("test", fn);
        emitter.off("test", fn);
        emitter.emit("test");
        expect(fn).not.toHaveBeenCalled();
    });

    it("removeAllListeners clears everything", () => {
        const emitter = new EventEmitter();
        const fn = vi.fn();
        emitter.on("a", fn);
        emitter.on("b", fn);
        emitter.removeAllListeners();
        emitter.emit("a");
        emitter.emit("b");
        expect(fn).not.toHaveBeenCalled();
    });

    it("once fires only once", () => {
        const emitter = new EventEmitter();
        const fn = vi.fn();
        emitter.once("test", fn);
        emitter.emit("test");
        emitter.emit("test");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("emitAsync calls listeners and awaits each one", async () => {
        const emitter = new EventEmitter();
        const order: number[] = [];
        emitter.on("seq", async () => {
            await Promise.resolve();
            order.push(1);
        });
        emitter.on("seq", async () => {
            order.push(2);
        });
        await emitter.emitAsync("seq");
        expect(order).toEqual([1, 2]);
    });

    it("emitAsync on an event with no listeners resolves immediately", async () => {
        const emitter = new EventEmitter();
        await expect(emitter.emitAsync("unknown")).resolves.toBeUndefined();
    });

    it("removeAllListeners with an event name removes only that event", () => {
        const emitter = new EventEmitter();
        const fnA = vi.fn();
        const fnB = vi.fn();
        emitter.on("a", fnA);
        emitter.on("b", fnB);
        emitter.removeAllListeners("a");
        emitter.emit("a");
        emitter.emit("b");
        expect(fnA).not.toHaveBeenCalled();
        expect(fnB).toHaveBeenCalledTimes(1);
    });
});
