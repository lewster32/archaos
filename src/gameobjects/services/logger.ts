import type { Colour } from "../enums/colour";

import { Events } from "phaser";

// Store the emitter on globalThis so it survives HMR module replacement.
// Vue components that subscribed to it will continue to receive events.
const EMITTER_KEY = "__archaos_logger_emitter__";
const _emitter: Events.EventEmitter =
    (globalThis as Record<string, unknown>)[EMITTER_KEY] as Events.EventEmitter
    ?? (() => {
        const e = new Events.EventEmitter();
        (globalThis as Record<string, unknown>)[EMITTER_KEY] = e;
        return e;
    })();

/**
 * Singleton Logger service to log messages throughout the game.
 */
let _instance: Logger | undefined;

export class Logger {
    private _currentLogId: number = 0;

    protected constructor() {}

    public static getInstance(): Logger {
        if (!_instance) {
            _instance = new Logger();
        }
        return _instance;
    }

    /**
     * Returns the stable EventEmitter used for log events.
     * Vue components should subscribe to this rather than game.events.
     */
    public static getEventEmitter(): Events.EventEmitter {
        return _emitter;
    }

    public log(message: string, colour?: Colour): void {
        _emitter.emit("log", {
            message,
            id: ++this._currentLogId,
            timestamp: new Date(),
            colour
        });
        console.log(`${message}`);
    }
}

/** @internal – only for use in unit tests */
export function _resetLoggerForTesting(): void {
    _instance = undefined;
    _emitter.removeAllListeners();
}

/* v8 ignore next 5 */
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        _instance = undefined;
    });
}

/**
 * A log entry. 'Nuff said.
 */
export interface Log {
    message: string;
    timestamp: Date;
    id: number;
    colour?: Colour | string;
}
