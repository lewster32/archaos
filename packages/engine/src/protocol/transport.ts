import type { PlayerId } from "./primitives";

/**
 * The authoritative-engine side of the transport boundary. One instance
 * per game session. All messages flow as JSON strings.
 */
export interface BoardTransport {
    /**
     * Send a message to exactly one recipient (snapshot or private
     * event).
     */
    sendTo(playerId: PlayerId, json: string): void;

    /**
     * Send a message to every connected recipient (broadcast events).
     */
    broadcast(json: string): void;

    /**
     * Subscribe to incoming commands. The listener receives the
     * transport-authenticated `playerId` and the raw JSON string payload.
     */
    onCommand(listener: (playerId: PlayerId, json: string) => void): void;
}

/**
 * The RemotePlayer side of the transport boundary — used by both
 * ComputerWizard's in-process instance and future networked clients.
 */
export interface RemotePlayerTransport {
    /**
     * Subscribe to server messages (snapshot, broadcast event, or private
     * event) arriving as JSON strings.
     */
    onMessage(listener: (json: string) => void): void;

    /**
     * Send a command upstream to the server as a JSON string.
     */
    send(json: string): void;
}
