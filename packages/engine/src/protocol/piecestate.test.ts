import { describe, expect, test } from "vitest";
import type {
    PartialPersistentFlags,
    PartialStats,
    PartialTurnFlags,
    PersistentFlags,
    PieceFlags,
    PieceState,
    PieceStats,
    TurnFlags,
} from "./piecestate";

describe("piecestate", () => {
    test("PieceStats carries the seven canonical stat fields", () => {
        const stats: PieceStats = {
            mov: 1,
            com: 5,
            rcm: 0,
            rng: 0,
            def: 4,
            mnv: 2,
            res: 6,
        };
        expect(JSON.parse(JSON.stringify(stats))).toEqual(stats);
    });

    test("PartialStats accepts any subset of stats", () => {
        const buffed: PartialStats = { def: 8 };
        expect(buffed.def).toBe(8);
    });

    test("TurnFlags carries five per-turn flags", () => {
        const flags: TurnFlags = {
            moved: false,
            attacked: false,
            rangedAttacked: false,
            engaged: false,
            turnOver: false,
        };
        expect(Object.keys(flags)).toHaveLength(5);
    });

    test("PersistentFlags carries dead and raisedDead", () => {
        const flags: PersistentFlags = { dead: false, raisedDead: false };
        expect(Object.keys(flags)).toEqual(["dead", "raisedDead"]);
    });

    test("PartialTurnFlags and PartialPersistentFlags accept subsets", () => {
        const turn: PartialTurnFlags = { moved: true };
        const persistent: PartialPersistentFlags = { dead: true };
        expect(turn.moved).toBe(true);
        expect(persistent.dead).toBe(true);
    });

    test("PieceState round-trips cleanly through JSON", () => {
        const piece: PieceState = {
            id: 101,
            typeId: "wizard",
            wizCode: "1a2b3c",
            ownerId: 1,
            position: { x: 6, y: 6 },
            stats: { mov: 1, com: 5, rcm: 0, rng: 0, def: 4, mnv: 2, res: 6 },
            statuses: ["wizard"],
            flags: {
                turn: {
                    moved: false,
                    attacked: false,
                    rangedAttacked: false,
                    engaged: false,
                    turnOver: false,
                },
                persistent: { dead: false, raisedDead: false },
            },
            currentMountId: null,
            mountedById: null,
        };
        expect(JSON.parse(JSON.stringify(piece))).toEqual(piece);
    });

    test("PieceFlags groups turn and persistent", () => {
        const flags: PieceFlags = {
            turn: {
                moved: false,
                attacked: false,
                rangedAttacked: false,
                engaged: false,
                turnOver: false,
            },
            persistent: { dead: false, raisedDead: false },
        };
        expect(flags.turn.turnOver).toBe(false);
        expect(flags.persistent.raisedDead).toBe(false);
    });

    test("wizCode is optional on PieceState", () => {
        const piece: PieceState = {
            id: 5,
            typeId: "goblin",
            ownerId: 1,
            position: { x: 0, y: 0 },
            stats: { mov: 1, com: 3, rcm: 0, rng: 0, def: 3, mnv: 3, res: 3 },
            statuses: [],
            flags: {
                turn: {
                    moved: false,
                    attacked: false,
                    rangedAttacked: false,
                    engaged: false,
                    turnOver: false,
                },
                persistent: { dead: false, raisedDead: false },
            },
            currentMountId: null,
            mountedById: null,
        };
        expect(piece.wizCode).toBeUndefined();
    });
});
