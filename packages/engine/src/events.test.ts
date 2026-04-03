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
});
