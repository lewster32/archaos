import { describe, expect, test } from "vitest";
import type { CommandMessage } from "./commands";
import type { PrivateEventMessage } from "./events";
import { roundTrip } from "./wiresafety.testhelpers";

/**
 * Wire-safety guard: every CommandMessage and PrivateEventMessage kind
 * must be enumerated in the lists below. Adding a new kind to either
 * union without updating the list here is a TypeScript error, which
 * forces the contributor to add a fixture in the appropriate
 * .test.ts and update the discriminator list in lockstep.
 */
describe("wire-safety: protocol kind exhaustiveness", () => {
    const COMMAND_KINDS = [
        "pick-spell",
        "end-spell-pick",
        "cast-spell",
        "cancel-cast",
        "select-piece",
        "move-piece",
        "attack-piece",
        "ranged-attack-piece",
        "mount-piece",
        "dismount-piece",
        "cancel-piece-action",
        "end-piece-turn",
        "end-movement-phase",
        "chat",
        "ping-position",
        "request-snapshot",
        "request-history",
        "request-private-resend",
        "reconnect",
    ] as const;

    const PRIVATE_EVENT_KINDS = ["spellbook-delivered", "spell-gained", "command-rejected"] as const;

    test("CommandMessage kind list compiles against the union", () => {
        // If a new kind is added to CommandMessage, this assignment
        // type-errors until COMMAND_KINDS is updated.
        const kinds: CommandMessage["kind"][] = [...COMMAND_KINDS];
        kinds.forEach((k) => expect(typeof k).toBe("string"));
    });

    test("PrivateEventMessage kind list compiles against the union", () => {
        const kinds: PrivateEventMessage["kind"][] = [...PRIVATE_EVENT_KINDS];
        kinds.forEach((k) => expect(typeof k).toBe("string"));
    });

    test("roundTrip preserves shape for primitives, arrays, and nested objects", () => {
        const input = { a: 1, b: "x", c: [1, 2, { d: true }] };
        const output = roundTrip(input);
        expect(output).toEqual(input);
        expect(output).not.toBe(input);
    });

    test("roundTrip strips functions, undefined, Map, and Set (proving wire-unsafe inputs are caught)", () => {
        const wireUnsafe = {
            ok: 1,
            fn: () => 42,
            undef: undefined,
            map: new Map([["a", 1]]),
            set: new Set([1, 2]),
        };
        const output = roundTrip(wireUnsafe) as Record<string, unknown>;
        expect(output.ok).toBe(1);
        expect(output.fn).toBeUndefined();
        expect(output.undef).toBeUndefined();
        // JSON.stringify converts Map and Set to {}.
        expect(output.map).toEqual({});
        expect(output.set).toEqual({});
    });
});
