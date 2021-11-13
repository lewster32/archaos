export class Logger {
    private _eventEmitter: Phaser.Events.EventEmitter;
    private _currentLogId: number = 0;
    private static instance: Logger;

    constructor(eventEmitter: Phaser.Events.EventEmitter) {
        this._eventEmitter = eventEmitter;
    }

    public static getInstance(eventEmitter: Phaser.Events.EventEmitter): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger(eventEmitter);
        }
        return Logger.instance;
    }

    public log(message: string): void {
        this._eventEmitter.emit("log", {
            message: message,
            id: ++this._currentLogId,
            timestamp: new Date()
        });
    }
}

export interface Log {
    message: string;
    timestamp: Date;
    id: number;
}