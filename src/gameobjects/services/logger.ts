import type { Colour } from "../enums/colour";

/**
 * Singleton Logger service to log messages throughout the game.
 */
export class Logger {
    private readonly _eventEmitter: Phaser.Events.EventEmitter;
    private _currentLogId: number = 0;
    private static instance: Logger;

    protected constructor(eventEmitter: Phaser.Events.EventEmitter) {
        this._eventEmitter = eventEmitter;
    }

    public static getInstance(eventEmitter: Phaser.Events.EventEmitter): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger(eventEmitter);
        }
        return Logger.instance;
    }

    public log(message: string, colour?: Colour): void {
        this._eventEmitter.emit("log", {
            message,
            id: ++this._currentLogId,
            timestamp: new Date(),
            colour
        });
        console.log(`${message}`);
    }
}

/**
 * A log entry. 'Nuff said.
 */
export interface Log {
    message: string;
    timestamp: Date;
    id: number;
    colour?: Colour;
}