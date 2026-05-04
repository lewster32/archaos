/**
 * Serialises async animation tasks so they play in enqueue order. The
 * client's visual reaction layer enqueues one task per `EngineEvent.*Batch`
 * received from the engine; the engine never waits for a task to complete.
 *
 * While a task is mid-flight the queue is `isProcessing`; the client's
 * Board sets `_busy = true` for as long as the queue reports processing,
 * which suppresses cursor input via the existing `Cursor.update` guard.
 *
 * Tasks that throw are logged and skipped; the queue continues with the
 * next enqueued task. This prevents one bad animation from stalling the
 * entire visual stream.
 */
export class AnimationQueue {
    private _chain: Promise<void> = Promise.resolve();
    private _activeCount: number = 0;

    /**
     * Whether a task is currently running OR there are pending tasks in
     * the chain that have not yet started.
     */
    get isProcessing(): boolean {
        return this._activeCount > 0;
    }

    /**
     * Enqueue an async task. The returned promise resolves when this task
     * (and only this task) completes; use {@link idle} to wait for the
     * entire queue to drain.
     */
    enqueue(task: () => Promise<void>): Promise<void> {
        this._activeCount++;
        const next = this._chain.then(async () => {
            try {
                await task();
            } catch (err) {
                console.error("[AnimationQueue] task threw:", err);
            } finally {
                this._activeCount--;
            }
        });
        this._chain = next;
        return next;
    }

    /**
     * Resolves once the queue has drained - i.e., every currently-enqueued
     * task has completed. Tasks enqueued after `idle()` was called are NOT
     * awaited by the returned promise.
     */
    async idle(): Promise<void> {
        await this._chain;
    }
}
