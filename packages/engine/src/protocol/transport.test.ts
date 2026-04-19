import { describe, expect, test } from "vitest";
import type { BoardTransport, RemotePlayerTransport } from "./transport";

describe("BoardTransport", () => {
    test("has sendTo, broadcast, onCommand methods", () => {
        const log: string[] = [];
        const impl: BoardTransport = {
            sendTo: (playerId, json) => {
                log.push(`to ${playerId}: ${json}`);
            },
            broadcast: (json) => {
                log.push(`broadcast: ${json}`);
            },
            onCommand: (_listener) => {
                log.push("subscribed");
            },
        };
        impl.sendTo(3, '{"a":1}');
        impl.broadcast('{"b":2}');
        impl.onCommand(() => undefined);
        expect(log).toEqual(['to 3: {"a":1}', 'broadcast: {"b":2}', "subscribed"]);
    });

    test("onCommand listener receives (playerId, json)", () => {
        let seenPlayer: number | null = null;
        let seenJson: string | null = null;
        const impl: BoardTransport = {
            sendTo: () => undefined,
            broadcast: () => undefined,
            onCommand: (listener) => {
                listener(5, '{"kind":"cancel-cast"}');
            },
        };
        impl.onCommand((playerId, json) => {
            seenPlayer = playerId;
            seenJson = json;
        });
        expect(seenPlayer).toBe(5);
        expect(seenJson).toBe('{"kind":"cancel-cast"}');
    });
});

describe("RemotePlayerTransport", () => {
    test("has onMessage and send methods", () => {
        const log: string[] = [];
        const impl: RemotePlayerTransport = {
            onMessage: (_listener) => {
                log.push("subscribed");
            },
            send: (json) => {
                log.push(`sent: ${json}`);
            },
        };
        impl.onMessage(() => undefined);
        impl.send('{"kind":"pick-spell"}');
        expect(log).toEqual(["subscribed", 'sent: {"kind":"pick-spell"}']);
    });

    test("onMessage listener receives a string payload", () => {
        let seen: string | null = null;
        const impl: RemotePlayerTransport = {
            onMessage: (listener) => {
                listener('{"type":"event"}');
            },
            send: () => undefined,
        };
        impl.onMessage((json) => {
            seen = json;
        });
        expect(seen).toBe('{"type":"event"}');
    });
});
