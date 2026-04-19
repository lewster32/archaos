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
