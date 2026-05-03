import { describe, it, expect, vi } from "vitest";
import { Board } from "../board";
import type { BoardDeps } from "../board";
import { ExpectedCommand } from "./expectedcommand";
import { SpellbookBarrier } from "./spellbookbarrier";
import { GameSetupPlayerType } from "../interfaces/ui";
import type { Spell } from "../spells/spell";
import type { Player } from "../player";
import type { CommandMessage, PickSpellCommand } from "../protocol/commands";
import { Logger } from "../logger";
import { TestRNG } from "../rng";
import { Rules } from "../rules";
import { roundTrip } from "../protocol/wiresafety.testhelpers";
import { UnitType } from "../enums/unittype";
import type { PieceConfig } from "../configs/piececonfig";
import { MovingReady, SkipSpellbook, StartGame } from "../phasemachine";

function makeRules(): Rules {
    return {
        doSpread: vi.fn().mockResolvedValue(undefined),
        doExpire: vi.fn().mockResolvedValue(undefined),
        doAutoCastSpell: vi.fn().mockResolvedValue(false),
        doCastSpell: vi.fn().mockResolvedValue(false),
    } as unknown as Rules;
}

function makeBoard(overrides: Partial<BoardDeps> = {}): Board {
    return new Board(1, 13, 13, false, undefined, {
        rng: new TestRNG(),
        logger: { log: vi.fn() } as unknown as Logger,
        rules: makeRules(),
        ...overrides,
    });
}

function makeMockSpell(overrides: Record<string, any> = {}): Spell {
    return {
        id: 99,
        range: -1,
        lineOfSight: false,
        castTimes: 1,
        persist: false,
        properties: { autoPlace: false },
        resetCastTimes: () => {},
        ...overrides,
    } as unknown as Spell;
}

function addLocalPlayer(board: Board, name: string): Player {
    return board.addPlayer({ name, type: GameSetupPlayerType.Local });
}

function openSerialSlotFor(board: Board, playerId: number): void {
    (board as any)._expectedCommand = new ExpectedCommand(playerId, ["pick-spell", "end-spell-pick"]);
}

function openCastSlotFor(board: Board, playerId: number): void {
    (board as any)._expectedCommand = new ExpectedCommand(playerId, ["cast-spell", "cancel-cast"]);
    (board as any)._currentCastingPlayerId = playerId;
}

const noopSetTimeout = (_cb: () => void, _ms: number): unknown => Symbol("noop");
const noopClearTimeout = (_: unknown): void => {};

function openBarrierFor(board: Board, playerIds: number[]): SpellbookBarrier {
    const barrier = new SpellbookBarrier(playerIds, 5000, noopSetTimeout, noopClearTimeout);
    (board as any)._spellbookBarrier = barrier;
    return barrier;
}

function makeTestBoard(): Board {
    const board = makeBoard();
    addLocalPlayer(board, "P1");
    return board;
}

/**
 * Build a board where player `playerId` holds a single-cast spell whose
 * `getValidTarget` always returns null (i.e. the spell rejects every
 * target). Used to drive the cast handler's invalid-target path
 * irrespective of board geometry.
 */
function makeTestBoardWithRangedSpell(playerId: number, range: number): Board {
    const board = makeTestBoard();
    const player = board.getPlayer(playerId);
    const spell = makeMockSpell({
        id: 100,
        range,
        castTimes: 1,
        totalCastTimes: 1,
        failed: false,
        getValidTarget: vi.fn().mockReturnValue(null),
        cast: vi.fn().mockResolvedValue(true),
    });
    (player as any)._spells.set(spell.id, spell);
    (player as any)._selectedSpell = spell;
    (player as any)._castingPiece = { id: 50, position: { x: 5, y: 5 } };
    return board;
}

/**
 * Build a board where player `playerId` holds a single-cast summon-style
 * spell whose `getValidTarget` accepts the target unmodified and whose
 * `cast` resolves true. Used to drive the cast handler's happy-path
 * outcome buffering.
 */
function makeTestBoardWithSummonSpell(playerId: number): Board {
    const board = makeTestBoard();
    const player = board.getPlayer(playerId);
    const spell = makeMockSpell({
        id: 100,
        range: 1.5,
        castTimes: 1,
        totalCastTimes: 1,
        failed: false,
        getValidTarget: vi.fn().mockImplementation((target) => target),
        cast: vi.fn().mockResolvedValue(true),
    });
    (player as any)._spells.set(spell.id, spell);
    (player as any)._selectedSpell = spell;
    (player as any)._castingPiece = { id: 50, position: { x: 4, y: 5 } };
    return board;
}

/**
 * Build a board where player `playerId` holds a multi-cast spell with
 * the given remaining cast count. The mock `cast` decrements
 * `castTimes` on each invocation so the handler observes a falling
 * counter across iterations, matching real Spell.cast semantics.
 */
function makeTestBoardWithMultiCastSpell(playerId: number, castTimes: number): Board {
    const board = makeTestBoard();
    const player = board.getPlayer(playerId);
    const spell = makeMockSpell({
        id: 100,
        range: 1.5,
        castTimes,
        totalCastTimes: castTimes,
        failed: false,
        persist: false,
        getValidTarget: vi.fn().mockImplementation((target) => target),
    });
    (spell as any).cast = vi.fn().mockImplementation(async () => {
        (spell as any).castTimes -= 1;
        return true;
    });
    (player as any)._spells.set(spell.id, spell);
    (player as any)._selectedSpell = spell;
    (player as any)._castingPiece = { id: 50, position: { x: 4, y: 5 } };
    return board;
}

const pick = (commandId: string, spellId = 1): PickSpellCommand => ({
    type: "command",
    commandId,
    token: "",
    kind: "pick-spell",
    spellId,
});

describe("Board.handleCommand: dispatcher + dedup", () => {
    it("silently ignores a duplicate commandId", async () => {
        const board = makeBoard();
        const cmd = roundTrip(pick("dup-1"));

        await board.handleCommand(1, cmd);
        const rejectionsAfterFirst = board._rejectedCommandsForTests.length;
        await board.handleCommand(1, cmd);

        // Second invocation must NOT produce another rejection.
        expect(board._rejectedCommandsForTests.length).toBe(rejectionsAfterFirst);
    });

    it("rejects unknown command kinds with wrong-phase", async () => {
        const board = makeBoard();
        const bogus = roundTrip({
            type: "command",
            commandId: "bogus-1",
            token: "",
            kind: "no-such-kind",
        }) as unknown as CommandMessage;

        await board.handleCommand(1, bogus);
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "bogus-1",
            reason: "wrong-phase",
        });
    });

    it("routes pick-spell to the pick-spell handler (which currently rejects)", async () => {
        const board = makeBoard();
        const cmd = roundTrip(pick("p-1"));

        await board.handleCommand(1, cmd);
        // Stub handler currently emits wrong-phase since no slot is open.
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "p-1",
            reason: "wrong-phase",
        });
    });

    it("dispatches end-spell-pick, cast-spell, cancel-cast through the right routes (stub-rejection)", async () => {
        const board = makeBoard();
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "e-1",
                token: "",
                kind: "end-spell-pick",
            }),
        );
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c-1",
                token: "",
                kind: "cast-spell",
                target: { self: true },
            }),
        );
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "x-1",
                token: "",
                kind: "cancel-cast",
            }),
        );

        const reasons = board._rejectedCommandsForTests.map((r) => r.commandId);
        expect(reasons).toContain("e-1");
        expect(reasons).toContain("c-1");
        expect(reasons).toContain("x-1");
        expect(board._rejectedCommandsForTests.every((r) => r.reason === "wrong-phase")).toBe(true);
    });

    it("processed commandIds set is per-game (does not bleed across boards)", async () => {
        const a = makeBoard();
        const b = makeBoard();
        const cmd = roundTrip(pick("shared-id"));

        await a.handleCommand(1, cmd);
        await b.handleCommand(1, cmd);

        // Both boards must have processed the command (no silent skip).
        expect(a._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "shared-id",
            reason: "wrong-phase",
        });
        expect(b._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "shared-id",
            reason: "wrong-phase",
        });
    });
});

describe("pick-spell handler", () => {
    it("rejects with wrong-phase when no spellbook slot/barrier is open", async () => {
        const board = makeBoard();
        addLocalPlayer(board, "P1");
        await board.handleCommand(1, roundTrip(pick("c1", 99)));
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "c1",
            reason: "wrong-phase",
        });
    });

    it("rejects with not-your-turn in serial mode for the wrong player", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        p1.addSpell(makeMockSpell({ id: 10 }));
        p2.addSpell(makeMockSpell({ id: 20 }));
        openSerialSlotFor(board, p1.id);

        await board.handleCommand(p2.id, roundTrip(pick("c2", 20)));
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: p2.id,
            commandId: "c2",
            reason: "not-your-turn",
        });
    });

    it("rejects with spell-pick-already-ended when the player has already submitted to the barrier", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        p1.addSpell(makeMockSpell({ id: 10 }));
        p2.addSpell(makeMockSpell({ id: 20 }));
        openBarrierFor(board, [p1.id, p2.id]);

        await board.handleCommand(p1.id, roundTrip(pick("c1", 10)));
        await board.handleCommand(p1.id, roundTrip(pick("c2", 10)));

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: p1.id,
            commandId: "c2",
            reason: "spell-pick-already-ended",
        });
    });

    it("rejects with spell-not-in-book when spellId is not in the player's spellbook", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        p1.addSpell(makeMockSpell({ id: 10 }));
        openBarrierFor(board, [p1.id]);

        await board.handleCommand(p1.id, roundTrip(pick("c1", 999_999)));
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: p1.id,
            commandId: "c1",
            reason: "spell-not-in-book",
        });
    });

    it("on success records the player's pick in authoritative state", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        const spell10 = makeMockSpell({ id: 10 });
        p1.addSpell(spell10);
        p2.addSpell(makeMockSpell({ id: 20 }));
        openBarrierFor(board, [p1.id, p2.id]);

        await board.handleCommand(p1.id, roundTrip(pick("c1", 10)));

        expect(p1.selectedSpell?.id).toBe(10);
    });

    it("on success closes the slot/barrier participation for that player", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        p1.addSpell(makeMockSpell({ id: 10 }));
        p2.addSpell(makeMockSpell({ id: 20 }));
        const barrier = openBarrierFor(board, [p1.id, p2.id]);

        await board.handleCommand(p1.id, roundTrip(pick("c1", 10)));
        expect(barrier.canAccept(p1.id)).toBe(false);
        expect(barrier.canAccept(p2.id)).toBe(true);
    });
});

describe("end-spell-pick handler", () => {
    it("succeeds and discards any previously selected spell", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        p1.addSpell(makeMockSpell({ id: 10 }));
        p2.addSpell(makeMockSpell({ id: 20 }));
        openBarrierFor(board, [p1.id, p2.id]);

        await board.handleCommand(
            p1.id,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "end-spell-pick",
            }),
        );

        expect(p1.selectedSpell).toBeNull();
    });

    it("rejects with wrong-phase when no slot/barrier is open", async () => {
        const board = makeBoard();
        addLocalPlayer(board, "P1");
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "end-spell-pick",
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "c1",
            reason: "wrong-phase",
        });
    });

    it("rejects with not-your-turn in serial mode for the wrong player", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        addLocalPlayer(board, "P2");
        openSerialSlotFor(board, p1.id);

        await board.handleCommand(
            2,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "end-spell-pick",
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 2,
            commandId: "c1",
            reason: "not-your-turn",
        });
    });
});

describe("cast-spell handler", () => {
    it("rejects with wrong-phase when no casting slot is open", async () => {
        const board = makeTestBoard();
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cast-spell",
                target: { self: true },
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({ playerId: 1, commandId: "c1", reason: "wrong-phase" });
    });

    it("rejects with not-your-turn when the slot is for another player", async () => {
        const board = makeTestBoard();
        addLocalPlayer(board, "P2");
        openCastSlotFor(board, 1);

        await board.handleCommand(
            2,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cast-spell",
                target: { self: true },
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 2,
            commandId: "c1",
            reason: "not-your-turn",
        });
    });

    it("rejects with wrong-phase when player has no selected spell", async () => {
        const board = makeTestBoard();
        openCastSlotFor(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cast-spell",
                target: { self: true },
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({ playerId: 1, commandId: "c1", reason: "wrong-phase" });
    });

    it("rejects with invalid-target when target is out of range", async () => {
        const board = makeTestBoardWithRangedSpell(1, 3);
        openCastSlotFor(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cast-spell",
                target: { point: { x: 99, y: 99 } },
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "c1",
            reason: "invalid-target",
        });
    });

    it("happy path: emits spell-revealed + spell-cast-attempted via cast pipeline", async () => {
        const board = makeTestBoardWithSummonSpell(1);
        openCastSlotFor(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cast-spell",
                target: { point: { x: 5, y: 5 } },
            }),
        );

        expect(board._castOutcomesForTests).toEqual(
            expect.arrayContaining([
                { kind: "spell-revealed", playerId: 1 },
                { kind: "spell-cast-attempted", playerId: 1, target: { point: { x: 5, y: 5 } } },
            ]),
        );
    });
});

describe("cast-spell multi-cast", () => {
    it("submits the slot after each cast and decrements castsLeft", async () => {
        const board = makeTestBoardWithMultiCastSpell(1, 3);
        openCastSlotFor(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cast-spell",
                target: { point: { x: 5, y: 5 } },
            }),
        );

        // The handler always submits — the casting phase loop is what
        // re-opens a fresh slot for the next cast and re-emits
        // phase-changed so the AI dispatches again. Leaving the slot
        // open here would starve the loop of its trigger and hang
        // multi-cast forever.
        expect((board as any)._expectedCommand?.isOpen).toBe(false);
        const succeeded = board._castOutcomesForTests.find((o: any) => o.kind === "spell-cast-succeeded") as
            | { castsLeft?: number }
            | undefined;
        expect(succeeded?.castsLeft).toBe(2);
    });

    it("closes the slot on the final cast", async () => {
        const board = makeTestBoardWithMultiCastSpell(1, 1);
        openCastSlotFor(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cast-spell",
                target: { point: { x: 5, y: 5 } },
            }),
        );

        expect((board as any)._expectedCommand?.isOpen).toBe(false);
    });
});

describe("cancel-cast handler", () => {
    it("emits spell-cast-cancelled + spell-removed-from-book and closes the slot", async () => {
        const board = makeTestBoardWithMultiCastSpell(1, 3);
        openCastSlotFor(board, 1);
        const player = board.getPlayer(1);
        const spellId = player.selectedSpell.id;

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cancel-cast",
            }),
        );

        expect(board._castOutcomesForTests).toEqual(
            expect.arrayContaining([
                { kind: "spell-cast-cancelled", playerId: 1, spellId },
                { kind: "spell-removed-from-book", playerId: 1, spellId },
            ]),
        );
        expect((board as any)._expectedCommand?.isOpen).toBe(false);
        expect(player.selectedSpell).toBeNull();
        expect(player.spells.find((s) => s.id === spellId)).toBeUndefined();
    });

    it("rejects with not-your-turn for a different player", async () => {
        const board = makeTestBoardWithMultiCastSpell(1, 3);
        addLocalPlayer(board, "P2");
        openCastSlotFor(board, 1);

        await board.handleCommand(
            2,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cancel-cast",
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 2,
            commandId: "c1",
            reason: "not-your-turn",
        });
    });
});

describe("movement-phase handler stubs (rejection only)", () => {
    const cases: Array<{ kind: string; cmd: () => CommandMessage }> = [
        {
            kind: "move-piece",
            cmd: () => ({
                type: "command",
                commandId: "m1",
                token: "",
                kind: "move-piece",
                pieceId: 1,
                to: { x: 0, y: 0 },
                path: [],
            }),
        },
        {
            kind: "attack-piece",
            cmd: () => ({
                type: "command",
                commandId: "a1",
                token: "",
                kind: "attack-piece",
                attackerId: 1,
                targetId: 2,
                path: [],
            }),
        },
        {
            kind: "ranged-attack-piece",
            cmd: () => ({
                type: "command",
                commandId: "r1",
                token: "",
                kind: "ranged-attack-piece",
                attackerId: 1,
                targetId: 2,
            }),
        },
        {
            kind: "mount-piece",
            cmd: () => ({
                type: "command",
                commandId: "mt1",
                token: "",
                kind: "mount-piece",
                wizardId: 1,
                mountId: 2,
                path: [],
            }),
        },
        {
            kind: "dismount-piece",
            cmd: () => ({
                type: "command",
                commandId: "dm1",
                token: "",
                kind: "dismount-piece",
                wizardId: 1,
                to: { x: 0, y: 0 },
            }),
        },
    ];

    for (const { kind, cmd } of cases) {
        it(`routes ${kind} to its stub which rejects with wrong-phase`, async () => {
            const board = makeTestBoard();
            await board.handleCommand(1, roundTrip(cmd()));
            const reject = board._rejectedCommandsForTests.find((r) => r.reason === "wrong-phase");
            expect(reject).toBeTruthy();
        });
    }
});

const MOVEMENT_SLOT_KINDS = [
    "select-piece",
    "move-piece",
    "attack-piece",
    "ranged-attack-piece",
    "mount-piece",
    "dismount-piece",
    "cancel-piece-action",
    "end-piece-turn",
    "end-movement-phase",
] as const;

/**
 * Drive the FSM into the moving state and open a movement-phase slot
 * for the given player. Tests use this to exercise the movement-phase
 * handlers without running the full phase loop.
 */
function setupMovementSlot(board: Board, playerId: number): ExpectedCommand {
    const pm = board.stateManager;
    if (pm.isActive(pm.states.idle)) {
        pm.evaluate(new StartGame());
    }
    if (pm.isActive(pm.states.spellbook)) {
        pm.evaluate(new SkipSpellbook());
        pm.evaluate(new MovingReady());
    }
    const slot = new ExpectedCommand(playerId, [...MOVEMENT_SLOT_KINDS]);
    (board as any)._expectedCommand = slot;
    return slot;
}

/**
 * Create a piece owned by `player` with the given stats. Stats default
 * to a generic 3/3/3 unit; callers override to test edge cases (zero
 * combat, zero manoeuvrability, etc.).
 */
async function addPieceFor(
    board: Board,
    player: Player,
    overrides: Partial<{
        x: number;
        y: number;
        combat: number;
        defence: number;
        manoeuvrability: number;
        movement: number;
    }> = {},
): Promise<any> {
    return board.addPiece({
        type: UnitType.Creature,
        x: overrides.x ?? 5,
        y: overrides.y ?? 5,
        properties: {
            id: "test",
            name: "Test",
            movement: overrides.movement ?? 3,
            combat: overrides.combat ?? 3,
            rangedCombat: 0,
            range: 0,
            defence: overrides.defence ?? 3,
            manoeuvrability: overrides.manoeuvrability ?? 3,
            magicResistance: 0,
            attackType: "hit",
            rangedType: "shot",
            status: [],
        },
        owner: player as any,
    } as PieceConfig);
}

describe("select-piece handler", () => {
    it("rejects with wrong-phase when no movement slot is open", async () => {
        const board = makeTestBoard();
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "s1",
                token: "",
                kind: "select-piece",
                pieceId: 99,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({ playerId: 1, commandId: "s1", reason: "wrong-phase" });
    });

    it("rejects with not-your-turn when slot is for a different player", async () => {
        const board = makeTestBoard();
        const p2 = addLocalPlayer(board, "P2");
        const piece = await addPieceFor(board, p2);
        setupMovementSlot(board, 1);

        await board.handleCommand(
            p2.id,
            roundTrip({
                type: "command",
                commandId: "s1",
                token: "",
                kind: "select-piece",
                pieceId: piece.id,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: p2.id,
            commandId: "s1",
            reason: "not-your-turn",
        });
    });

    it("rejects with invalid-target when piece does not exist", async () => {
        const board = makeTestBoard();
        setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "s1",
                token: "",
                kind: "select-piece",
                pieceId: 9999,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "s1",
            reason: "invalid-target",
        });
    });

    it("rejects with invalid-target when piece is not owned by player", async () => {
        const board = makeTestBoard();
        const p2 = addLocalPlayer(board, "P2");
        const piece = await addPieceFor(board, p2);
        setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "s1",
                token: "",
                kind: "select-piece",
                pieceId: piece.id,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "s1",
            reason: "invalid-target",
        });
    });

    it("rejects with invalid-target when piece is dead", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1);
        (piece as any)._dead = true;
        setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "s1",
                token: "",
                kind: "select-piece",
                pieceId: piece.id,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "s1",
            reason: "invalid-target",
        });
    });

    it("rejects with invalid-target when piece cannot be selected (turnOver)", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1);
        piece.turnOver = true;
        setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "s1",
                token: "",
                kind: "select-piece",
                pieceId: piece.id,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "s1",
            reason: "invalid-target",
        });
    });

    it("on accept sets board.selected to the piece", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1);
        setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "s1",
                token: "",
                kind: "select-piece",
                pieceId: piece.id,
            }),
        );

        expect(board.selected).toBe(piece);
        expect(board._rejectedCommandsForTests).toEqual([]);
    });

    it("does not submit the slot on accept", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1);
        const slot = setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "s1",
                token: "",
                kind: "select-piece",
                pieceId: piece.id,
            }),
        );

        expect(slot.isOpen).toBe(true);
    });

    it("emits paired engaged: true outcomes when adjacent enemy can engage and roll succeeds", async () => {
        const rng = new TestRNG();
        const board = makeBoard({ rng });
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        const friendly = await addPieceFor(board, p1, { x: 5, y: 5 });
        const enemy = await addPieceFor(board, p2, {
            x: 6,
            y: 5,
            combat: 5,
            manoeuvrability: 5,
        });
        // Force the engagement roll to always succeed.
        (board as any).roll = vi.fn().mockReturnValue(true);
        await board.startGame();
        setupMovementSlot(board, p1.id);

        await board.handleCommand(
            p1.id,
            roundTrip({
                type: "command",
                commandId: "s1",
                token: "",
                kind: "select-piece",
                pieceId: friendly.id,
            }),
        );

        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const flagOutcomes = (lastEvent?.outcomes ?? []).filter(
            (o: any) => o.kind === "piece-turn-flag-changed",
        ) as Array<{ pieceId: number; flags: { engaged?: boolean } }>;
        const friendlyOutcome = flagOutcomes.find((o) => o.pieceId === friendly.id);
        const enemyOutcome = flagOutcomes.find((o) => o.pieceId === enemy.id);
        expect(friendlyOutcome?.flags.engaged).toBe(true);
        expect(enemyOutcome?.flags.engaged).toBe(true);
    });
});

describe("end-piece-turn handler", () => {
    it("rejects with wrong-phase when no movement slot is open", async () => {
        const board = makeTestBoard();
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "e1",
                token: "",
                kind: "end-piece-turn",
                pieceId: 1,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({ playerId: 1, commandId: "e1", reason: "wrong-phase" });
    });

    it("rejects with not-your-turn when slot is for a different player", async () => {
        const board = makeTestBoard();
        const p2 = addLocalPlayer(board, "P2");
        setupMovementSlot(board, 1);

        await board.handleCommand(
            p2.id,
            roundTrip({
                type: "command",
                commandId: "e1",
                token: "",
                kind: "end-piece-turn",
                pieceId: 1,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: p2.id,
            commandId: "e1",
            reason: "not-your-turn",
        });
    });

    it("rejects with not-your-turn when no piece is currently selected", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1);
        setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "e1",
                token: "",
                kind: "end-piece-turn",
                pieceId: piece.id,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "e1",
            reason: "not-your-turn",
        });
    });

    it("rejects with not-your-turn when pieceId differs from the selected piece", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const a = await addPieceFor(board, p1, { x: 5, y: 5 });
        const b = await addPieceFor(board, p1, { x: 6, y: 5 });
        (board as any)._selected = a;
        setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "e1",
                token: "",
                kind: "end-piece-turn",
                pieceId: b.id,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "e1",
            reason: "not-your-turn",
        });
    });

    it("on accept sets turnOver, clears selection, and submits slot", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1);
        (board as any)._selected = piece;
        const slot = setupMovementSlot(board, 1);

        await board.startGame();
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "e1",
                token: "",
                kind: "end-piece-turn",
                pieceId: piece.id,
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        expect(piece.turnOver).toBe(true);
        expect(board.selected).toBeNull();
        expect(slot.isOpen).toBe(false);
    });
});

describe("end-movement-phase handler", () => {
    it("rejects with wrong-phase when no movement slot is open", async () => {
        const board = makeTestBoard();
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "m1",
                token: "",
                kind: "end-movement-phase",
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({ playerId: 1, commandId: "m1", reason: "wrong-phase" });
    });

    it("rejects with not-your-turn when slot is for a different player", async () => {
        const board = makeTestBoard();
        const p2 = addLocalPlayer(board, "P2");
        setupMovementSlot(board, 1);

        await board.handleCommand(
            p2.id,
            roundTrip({
                type: "command",
                commandId: "m1",
                token: "",
                kind: "end-movement-phase",
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: p2.id,
            commandId: "m1",
            reason: "not-your-turn",
        });
    });

    it("on accept sets _movementPhaseEnded, clears selection, and submits slot", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1);
        (board as any)._selected = piece;
        const slot = setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "m1",
                token: "",
                kind: "end-movement-phase",
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        expect((board as any)._movementPhaseEnded).toBe(true);
        expect(board.selected).toBeNull();
        expect(slot.isOpen).toBe(false);
    });
});

describe("cancel-piece-action handler", () => {
    it("rejects with wrong-phase when no movement slot is open", async () => {
        const board = makeTestBoard();
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cancel-piece-action",
                pieceId: 1,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({ playerId: 1, commandId: "c1", reason: "wrong-phase" });
    });

    it("rejects with not-your-turn when no piece is selected", async () => {
        const board = makeTestBoard();
        setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cancel-piece-action",
                pieceId: 1,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "c1",
            reason: "not-your-turn",
        });
    });

    it("rejects with not-your-turn when pieceId differs from the selected piece", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const a = await addPieceFor(board, p1, { x: 5, y: 5 });
        const b = await addPieceFor(board, p1, { x: 6, y: 5 });
        (board as any)._selected = a;
        setupMovementSlot(board, 1);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cancel-piece-action",
                pieceId: b.id,
            }),
        );
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "c1",
            reason: "not-your-turn",
        });
    });

    it("on accept (piece not yet moved) emits piece-action-cancelled with action=select", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1);
        (board as any)._selected = piece;
        const slot = setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cancel-piece-action",
                pieceId: piece.id,
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        expect(lastEvent?.outcomes).toContainEqual({
            kind: "piece-action-cancelled",
            pieceId: piece.id,
            action: "select",
        });
        expect(board.selected).toBeNull();
        // Cancel does not submit the slot — player can re-select.
        expect(slot.isOpen).toBe(true);
    });

    it("on accept (piece has moved) emits action=move and ends the piece's turn", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1);
        piece.moved = true;
        (board as any)._selected = piece;
        const slot = setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "c1",
                token: "",
                kind: "cancel-piece-action",
                pieceId: piece.id,
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        expect(lastEvent?.outcomes).toContainEqual({
            kind: "piece-action-cancelled",
            pieceId: piece.id,
            action: "move",
        });
        expect(piece.turnOver).toBe(true);
        expect(board.selected).toBeNull();
        // Cancel does not submit the slot.
        expect(slot.isOpen).toBe(true);
    });
});
