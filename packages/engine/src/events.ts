type Listener = (...args: any[]) => void;

/**
 * Lightweight event emitter for the engine. Replaces
 * Phaser.Events.EventEmitter so engine code has no Phaser
 * dependency. API is a subset of Phaser's emitter.
 */
export class EventEmitter {
    private _listeners = new Map<string, Set<Listener>>();

    on(event: string, fn: Listener): this {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event)!.add(fn);
        return this;
    }

    once(event: string, fn: Listener): this {
        const wrapper: Listener = (...args) => {
            this.off(event, wrapper);
            fn(...args);
        };
        return this.on(event, wrapper);
    }

    off(event: string, fn: Listener): this {
        this._listeners.get(event)?.delete(fn);
        return this;
    }

    emit(event: string, ...args: any[]): this {
        for (const fn of this._listeners.get(event) ?? []) {
            fn(...args);
        }
        return this;
    }

    removeAllListeners(event?: string): this {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
        return this;
    }
}
