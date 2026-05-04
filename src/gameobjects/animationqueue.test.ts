import { describe, it, expect, vi } from "vitest";
import { AnimationQueue } from "./animationqueue";

describe("AnimationQueue", () => {
    it("runs tasks sequentially in enqueue order", async () => {
        const queue = new AnimationQueue();
        const order: number[] = [];
        queue.enqueue(async () => {
            await new Promise((r) => setTimeout(r, 10));
            order.push(1);
        });
        queue.enqueue(async () => {
            order.push(2);
        });
        await queue.idle();
        expect(order).toEqual([1, 2]);
    });

    it("isProcessing is true while a task is mid-flight, false when drained", async () => {
        const queue = new AnimationQueue();
        let inside = false;
        const task = queue.enqueue(async () => {
            inside = true;
            await new Promise((r) => setTimeout(r, 10));
            inside = false;
        });
        // After enqueue, the task may or may not have started yet - but
        // isProcessing should become true at least transiently.
        expect(queue.isProcessing).toBe(true);
        await task;
        await queue.idle();
        expect(queue.isProcessing).toBe(false);
        expect(inside).toBe(false);
    });

    it("idle() resolves immediately when queue is empty", async () => {
        const queue = new AnimationQueue();
        const promise = queue.idle();
        // Should not hang - give the event loop a tick.
        await Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("idle hung")), 50)),
        ]);
    });

    it("a task that throws does not stall subsequent tasks", async () => {
        const queue = new AnimationQueue();
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const order: number[] = [];
        queue.enqueue(async () => {
            order.push(1);
            throw new Error("boom");
        });
        queue.enqueue(async () => {
            order.push(2);
        });
        await queue.idle();
        expect(order).toEqual([1, 2]);
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });
});
