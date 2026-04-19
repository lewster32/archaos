import { describe, expect, test } from "vitest";
import type {
    GameOverOutcome,
    GameStartedOutcome,
    PhaseChangedOutcome,
    PlayerDefeatedOutcome,
    PlayerEndedSpellPickOutcome,
    PlayerPickedSpellOutcome,
    SpellCastAttemptedOutcome,
    SpellCastCancelledOutcome,
    SpellCastFailedOutcome,
    SpellCastSucceededOutcome,
    SpellRemovedFromBookOutcome,
    SpellRevealedOutcome,
    SpellTarget,
} from "./outcomes";

describe("outcomes — game lifecycle", () => {
    test("game-started round-trips", () => {
        const o: GameStartedOutcome = {
            kind: "game-started",
            scenario: { boardWidth: 13, boardHeight: 13, weather: {} },
            players: [],
            initialPieces: [],
        };
        expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    });

    test("phase-changed currentPlayerId is optional", () => {
        const movement: PhaseChangedOutcome = {
            kind: "phase-changed",
            phase: "movement",
            turnNumber: 1,
            currentPlayerId: 1,
        };
        const spellbook: PhaseChangedOutcome = {
            kind: "phase-changed",
            phase: "spellbook",
            turnNumber: 1,
        };
        expect(movement.currentPlayerId).toBe(1);
        expect(spellbook.currentPlayerId).toBeUndefined();
    });

    test("player-defeated carries playerId", () => {
        const o: PlayerDefeatedOutcome = {
            kind: "player-defeated",
            playerId: 3,
        };
        expect(o.playerId).toBe(3);
    });

    test("game-over winnerId can be PlayerId or 'draw'", () => {
        const win: GameOverOutcome = { kind: "game-over", winnerId: 2 };
        const draw: GameOverOutcome = { kind: "game-over", winnerId: "draw" };
        expect(win.winnerId).toBe(2);
        expect(draw.winnerId).toBe("draw");
    });
});

describe("outcomes — spells", () => {
    test("player-picked-spell withholds identity", () => {
        const o: PlayerPickedSpellOutcome = {
            kind: "player-picked-spell",
            playerId: 1,
        };
        expect(Object.keys(o).toSorted()).toEqual(["kind", "playerId"]);
    });

    test("spell-revealed carries spellId and spellTypeId", () => {
        const o: SpellRevealedOutcome = {
            kind: "spell-revealed",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
        };
        expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    });

    test("SpellTarget accepts pieceId, point, or self", () => {
        const piece: SpellTarget = { pieceId: 5 };
        const point: SpellTarget = { point: { x: 3, y: 4 } };
        const self: SpellTarget = { self: true };
        expect(piece).toHaveProperty("pieceId");
        expect(point).toHaveProperty("point");
        expect(self).toHaveProperty("self");
    });

    test("spell-cast-attempted carries a SpellTarget", () => {
        const o: SpellCastAttemptedOutcome = {
            kind: "spell-cast-attempted",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
            target: { pieceId: 5 },
        };
        expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    });

    test("spell-cast-succeeded.castsLeft is optional", () => {
        const single: SpellCastSucceededOutcome = {
            kind: "spell-cast-succeeded",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
        };
        const multi: SpellCastSucceededOutcome = {
            ...single,
            castsLeft: 2,
        };
        expect(single.castsLeft).toBeUndefined();
        expect(multi.castsLeft).toBe(2);
    });

    test("spell-cast-cancelled round-trips", () => {
        const o: SpellCastCancelledOutcome = {
            kind: "spell-cast-cancelled",
            playerId: 1,
            spellId: 10,
            spellTypeId: "shadow-wood",
        };
        expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    });

    test("spell-cast-failed covers fizzle only (no resist reason)", () => {
        const o: SpellCastFailedOutcome = {
            kind: "spell-cast-failed",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
        };
        expect(Object.keys(o).toSorted()).toEqual(["kind", "playerId", "spellId", "spellTypeId"]);
    });

    test("spell-removed-from-book round-trips", () => {
        const o: SpellRemovedFromBookOutcome = {
            kind: "spell-removed-from-book",
            playerId: 1,
            spellId: 10,
            spellTypeId: "magic-fire",
        };
        expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    });

    test("player-ended-spell-pick round-trips", () => {
        const o: PlayerEndedSpellPickOutcome = {
            kind: "player-ended-spell-pick",
            playerId: 3,
        };
        expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    });
});

describe("outcomes — pieces", () => {
    test("piece-spawned carries a full PieceState", () => {
        const o: import("./outcomes").PieceSpawnedOutcome = {
            kind: "piece-spawned",
            piece: {
                id: 101,
                typeId: "goblin",
                ownerId: 1,
                position: { x: 0, y: 0 },
                stats: {
                    mov: 1,
                    com: 3,
                    rcm: 0,
                    rng: 0,
                    def: 3,
                    mnv: 3,
                    res: 3,
                },
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
            },
        };
        expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    });

    test("piece-moved has optional path", () => {
        const withoutPath: import("./outcomes").PieceMovedOutcome = {
            kind: "piece-moved",
            pieceId: 101,
            from: { x: 0, y: 0 },
            to: { x: 1, y: 0 },
        };
        const withPath: import("./outcomes").PieceMovedOutcome = {
            ...withoutPath,
            path: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
            ],
        };
        expect(withoutPath.path).toBeUndefined();
        expect(withPath.path).toHaveLength(2);
    });

    test("piece-attacked carries attacker, target, succeeded", () => {
        const o: import("./outcomes").PieceAttackedOutcome = {
            kind: "piece-attacked",
            attackerId: 101,
            targetId: 102,
            succeeded: true,
        };
        expect(o.succeeded).toBe(true);
    });

    test("piece-ranged-attacked carries attacker, target, succeeded", () => {
        const o: import("./outcomes").PieceRangedAttackedOutcome = {
            kind: "piece-ranged-attacked",
            attackerId: 101,
            targetId: 102,
            succeeded: false,
        };
        expect(o.succeeded).toBe(false);
    });

    test("piece-died cause covers the canonical strings", () => {
        const causes: import("./outcomes").PieceDiedCause[] = [
            "combat",
            "ranged",
            "spell",
            "disbelieve",
            "expired",
            "spread",
            "subverted-away",
        ];
        expect(causes).toHaveLength(7);
        const o: import("./outcomes").PieceDiedOutcome = {
            kind: "piece-died",
            pieceId: 101,
            cause: "combat",
        };
        expect(o.cause).toBe("combat");
    });

    test("piece-mounted and piece-dismounted round-trip", () => {
        const mounted: import("./outcomes").PieceMountedOutcome = {
            kind: "piece-mounted",
            mountId: 50,
            riderId: 1,
        };
        const dismounted: import("./outcomes").PieceDismountedOutcome = {
            kind: "piece-dismounted",
            mountId: 50,
            riderId: 1,
        };
        expect(JSON.parse(JSON.stringify(mounted))).toEqual(mounted);
        expect(JSON.parse(JSON.stringify(dismounted))).toEqual(dismounted);
    });

    test("piece-stats-changed accepts a partial stats diff", () => {
        const o: import("./outcomes").PieceStatsChangedOutcome = {
            kind: "piece-stats-changed",
            pieceId: 1,
            stats: { def: 8 },
        };
        expect(o.stats.def).toBe(8);
    });

    test("piece-statuses-changed has added and removed arrays", () => {
        const o: import("./outcomes").PieceStatusesChangedOutcome = {
            kind: "piece-statuses-changed",
            pieceId: 1,
            added: ["shadow-form"],
            removed: [],
        };
        expect(o.added).toEqual(["shadow-form"]);
        expect(o.removed).toEqual([]);
    });

    test("piece-owner-changed carries newOwnerId", () => {
        const o: import("./outcomes").PieceOwnerChangedOutcome = {
            kind: "piece-owner-changed",
            pieceId: 1,
            newOwnerId: 2,
        };
        expect(o.newOwnerId).toBe(2);
    });

    test("piece-turn-flag-changed accepts partial turn flags", () => {
        const o: import("./outcomes").PieceTurnFlagChangedOutcome = {
            kind: "piece-turn-flag-changed",
            pieceId: 1,
            flags: { turnOver: true },
        };
        expect(o.flags.turnOver).toBe(true);
    });

    test("piece-persistent-flag-changed accepts partial persistent flags", () => {
        const o: import("./outcomes").PiecePersistentFlagChangedOutcome = {
            kind: "piece-persistent-flag-changed",
            pieceId: 1,
            flags: { raisedDead: true },
        };
        expect(o.flags.raisedDead).toBe(true);
    });

    test("piece-action-cancelled action accepts the canonical set", () => {
        const actions: import("./outcomes").PieceActionCancelledAction[] = [
            "select",
            "move",
            "attack",
            "rangedAttack",
            "mount",
            "dismount",
        ];
        expect(actions).toHaveLength(6);
        const o: import("./outcomes").PieceActionCancelledOutcome = {
            kind: "piece-action-cancelled",
            pieceId: 1,
            action: "move",
        };
        expect(o.action).toBe("move");
    });

    test("piece-resisted-spell round-trips", () => {
        const o: import("./outcomes").PieceResistedSpellOutcome = {
            kind: "piece-resisted-spell",
            pieceId: 1,
            spellId: 10,
            spellTypeId: "disbelieve",
        };
        expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    });
});
