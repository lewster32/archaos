import { describe, expect, test } from "vitest";
import type {
    AlignmentState,
    PhaseKind,
    PhaseState,
    PickedSpellState,
    PlayerPublicState,
    ScenarioState,
    SelfState,
    SnapshotBoardState,
    SnapshotMessage,
    SnapshotState,
    SpellbookEntry,
} from "./snapshot";

describe("snapshot", () => {
    test("PhaseKind enumerates the four phases", () => {
        const kinds: PhaseKind[] = ["spellbook", "casting", "spreading", "movement"];
        expect(kinds).toHaveLength(4);
    });

    test("PhaseState currentPlayerId is PlayerId or null", () => {
        const withPlayer: PhaseState = {
            kind: "casting",
            currentPlayerId: 3,
            turnNumber: 7,
        };
        const spellbook: PhaseState = {
            kind: "spellbook",
            currentPlayerId: null,
            turnNumber: 7,
        };
        expect(withPlayer.currentPlayerId).toBe(3);
        expect(spellbook.currentPlayerId).toBeNull();
    });

    test("AlignmentState has value and accumulatedValue", () => {
        const a: AlignmentState = { value: 4, accumulatedValue: 2 };
        expect(a.value).toBe(4);
        expect(a.accumulatedValue).toBe(2);
    });

    test("PlayerPublicState includes tri-state pickedSpell", () => {
        const undecided: PlayerPublicState = {
            id: 1,
            name: "Merlin",
            colour: "ff0000",
            castingPieceId: 101,
            defeated: false,
            pickedSpell: null,
        };
        const picked: PlayerPublicState = {
            ...undecided,
            pickedSpell: true,
        };
        const ended: PlayerPublicState = {
            ...undecided,
            pickedSpell: false,
        };
        expect(undecided.pickedSpell).toBeNull();
        expect(picked.pickedSpell).toBe(true);
        expect(ended.pickedSpell).toBe(false);
    });

    test("castingPieceId is PieceId or null", () => {
        const alive: PlayerPublicState = {
            id: 1,
            name: "A",
            colour: "ff0000",
            castingPieceId: 101,
            defeated: false,
            pickedSpell: null,
        };
        const defeated: PlayerPublicState = {
            id: 2,
            name: "B",
            colour: "00ff00",
            castingPieceId: null,
            defeated: true,
            pickedSpell: null,
        };
        expect(alive.castingPieceId).toBe(101);
        expect(defeated.castingPieceId).toBeNull();
    });

    test("SpellbookEntry round-trips", () => {
        const e: SpellbookEntry = { spellTypeId: "magic-fire", id: 10 };
        expect(JSON.parse(JSON.stringify(e))).toEqual(e);
    });

    test("PickedSpellState carries id and castsLeft", () => {
        const p: PickedSpellState = { id: 10, castsLeft: 1 };
        expect(p.castsLeft).toBe(1);
    });

    test("SelfState.pickedSpell may be null", () => {
        const self: SelfState = {
            spells: [{ spellTypeId: "magic-fire", id: 10 }],
            pickedSpell: null,
        };
        expect(self.pickedSpell).toBeNull();
    });

    test("SnapshotBoardState contains alignment", () => {
        const board: SnapshotBoardState = {
            alignment: { value: 0, accumulatedValue: 0 },
        };
        expect(board.alignment.value).toBe(0);
    });

    test("ScenarioState exposes boardWidth, boardHeight, weather", () => {
        const s: ScenarioState = {
            boardWidth: 13,
            boardHeight: 13,
            weather: {},
        };
        expect(s.boardWidth).toBe(13);
    });

    test("SnapshotMessage round-trips cleanly", () => {
        const msg: SnapshotMessage = {
            type: "snapshot",
            sequence: 42,
            recipient: 3,
            state: {
                scenario: { boardWidth: 13, boardHeight: 13, weather: {} },
                phase: {
                    kind: "movement",
                    currentPlayerId: 1,
                    turnNumber: 1,
                },
                board: { alignment: { value: 0, accumulatedValue: 0 } },
                players: [],
                pieces: [],
                self: { spells: [], pickedSpell: null },
            },
        };
        expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
    });

    test("SnapshotState requires every top-level section", () => {
        const state: SnapshotState = {
            scenario: { boardWidth: 1, boardHeight: 1, weather: {} },
            phase: { kind: "spellbook", currentPlayerId: null, turnNumber: 0 },
            board: { alignment: { value: 0, accumulatedValue: 0 } },
            players: [],
            pieces: [],
            self: { spells: [], pickedSpell: null },
        };
        expect(Object.keys(state).sort()).toEqual(["board", "phase", "pieces", "players", "scenario", "self"]);
    });
});
