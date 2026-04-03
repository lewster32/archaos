import type { Colour } from "./enums/colour";
import { EventEmitter } from "./events";

const EMITTER_KEY = "__archaos_logger_emitter__";
const _emitter: EventEmitter =
    ((globalThis as Record<string, unknown>)[
        EMITTER_KEY
    ] as EventEmitter) ??
    (() => {
        const e = new EventEmitter();
        (globalThis as Record<string, unknown>)[
            EMITTER_KEY
        ] = e;
        return e;
    })();

/**
 * Singleton Logger service to log messages throughout
 * the game.
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
     * Returns the stable EventEmitter used for log
     * events. Vue components should subscribe to this
     * rather than game.events.
     */
    public static getEventEmitter(): EventEmitter {
        return _emitter;
    }

    public log(
        message: string,
        colour?: Colour,
    ): void {
        _emitter.emit("log", {
            message,
            id: ++this._currentLogId,
            timestamp: new Date(),
            colour,
        });
        console.log(`${message}`);
    }
}

/** @internal – only for use in unit tests */
export function _resetLoggerForTesting(): void {
    _instance = undefined;
    _emitter.removeAllListeners();
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
