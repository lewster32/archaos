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
import { UnitStatus } from "../enums/unitstatus";
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
        status: UnitStatus[];
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
            status: overrides.status ?? [],
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

    it("uses manoeuvrability stats for the engagement roll, not combat", async () => {
        const board = makeBoard();
        const p1 = addLocalPlayer(board, "P1");
        const p2 = addLocalPlayer(board, "P2");
        const friendly = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            combat: 1,
            manoeuvrability: 4,
        });
        await addPieceFor(board, p2, {
            x: 6,
            y: 5,
            combat: 9,
            manoeuvrability: 7,
        });
        const rollSpy = vi.spyOn(board, "roll").mockReturnValue(false);
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

        // First positional arg is enemy stat, second is selecting
        // piece's stat. The engagement roll must use manoeuvrability
        // (7 vs 4), not combat (9 vs 1).
        expect(rollSpy).toHaveBeenCalled();
        const firstCallArgs = rollSpy.mock.calls[0];
        expect(firstCallArgs[0]).toBe(7);
        expect(firstCallArgs[1]).toBe(4);
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

describe("_handleMovePiece", () => {
    it("rejects with not-your-turn when cmd.pieceId differs from board.selected", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const a = await addPieceFor(board, p1, { x: 5, y: 5 });
        const b = await addPieceFor(board, p1, { x: 7, y: 7 });
        (board as any)._selected = a;
        setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "m1",
                token: "",
                kind: "move-piece",
                pieceId: b.id,
                to: { x: 7, y: 7 },
                path: [],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "m1",
            reason: "not-your-turn",
        });
    });

    it("rejects with invalid-move when piece.moved is already true", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1, { x: 5, y: 5 });
        piece.moved = true;
        (board as any)._selected = piece;
        setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "m1",
                token: "",
                kind: "move-piece",
                pieceId: piece.id,
                to: { x: 6, y: 5 },
                path: [{ x: 6, y: 5 }],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "m1",
            reason: "invalid-move",
        });
    });

    it("rejects with invalid-move when validatePath returns false (path exceeds budget)", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1, { x: 5, y: 5, movement: 1 });
        (board as any)._selected = piece;
        setupMovementSlot(board, 1);
        await board.startGame();

        // Movement budget is 1 but path traverses 3 tiles.
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "m1",
                token: "",
                kind: "move-piece",
                pieceId: piece.id,
                to: { x: 8, y: 5 },
                path: [
                    { x: 6, y: 5 },
                    { x: 7, y: 5 },
                    { x: 8, y: 5 },
                ],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "m1",
            reason: "invalid-move",
        });
    });

    it("happy path: emits one piece-moved outcome per traversed tile in order", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const piece = await addPieceFor(board, p1, { x: 5, y: 5, movement: 5 });
        (board as any)._selected = piece;
        const slot = setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "m1",
                token: "",
                kind: "move-piece",
                pieceId: piece.id,
                to: { x: 8, y: 5 },
                path: [
                    { x: 6, y: 5 },
                    { x: 7, y: 5 },
                    { x: 8, y: 5 },
                ],
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const moves = (lastEvent?.outcomes ?? []).filter(
            (o: any) => o.kind === "piece-moved" && o.pieceId === piece.id,
        ) as Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
        expect(moves).toHaveLength(3);
        expect(moves[0].from).toEqual({ x: 5, y: 5 });
        expect(moves[0].to).toEqual({ x: 6, y: 5 });
        expect(moves[1].from).toEqual({ x: 6, y: 5 });
        expect(moves[1].to).toEqual({ x: 7, y: 5 });
        expect(moves[2].from).toEqual({ x: 7, y: 5 });
        expect(moves[2].to).toEqual({ x: 8, y: 5 });
        expect(piece.moved).toBe(true);
        expect(slot.isOpen).toBe(false);
    });

    it("engagement-mid-path stops the move and flags both pieces engaged (invariant 14)", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const p2 = addLocalPlayer(board, "P2");
        const piece = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            movement: 5,
            manoeuvrability: 4,
        });
        // Enemy adjacent to the middle step (7,5) but not the first
        // (6,5). (8,6) is at dx=2,dy=1 from (6,5) so out of range,
        // and dx=1,dy=1 from (7,5) so adjacent diagonally.
        const enemy = await addPieceFor(board, p2, {
            x: 8,
            y: 6,
            manoeuvrability: 5,
        });
        (board as any)._selected = piece;
        const slot = setupMovementSlot(board, 1);
        await board.startGame();

        // Force the engagement roll to always succeed.
        vi.spyOn(board, "roll").mockReturnValue(true);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "m1",
                token: "",
                kind: "move-piece",
                pieceId: piece.id,
                to: { x: 8, y: 5 },
                path: [
                    { x: 6, y: 5 },
                    { x: 7, y: 5 },
                    { x: 8, y: 5 },
                ],
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const moves = (lastEvent?.outcomes ?? []).filter(
            (o: any) => o.kind === "piece-moved" && o.pieceId === piece.id,
        ) as Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
        // Should have moved through (6,5) and (7,5) but not (8,5).
        expect(moves).toHaveLength(2);
        expect(moves[0].to).toEqual({ x: 6, y: 5 });
        expect(moves[1].to).toEqual({ x: 7, y: 5 });
        // No move to the truncated tile.
        expect(moves.find((m) => m.to.x === 8 && m.to.y === 5)).toBeUndefined();

        // Both pieces flagged engaged: true.
        const flagOutcomes = (lastEvent?.outcomes ?? []).filter(
            (o: any) => o.kind === "piece-turn-flag-changed",
        ) as Array<{ pieceId: number; flags: { engaged?: boolean; moved?: boolean } }>;
        const friendlyEngaged = flagOutcomes.find(
            (o) => o.pieceId === piece.id && o.flags.engaged === true,
        );
        const enemyEngaged = flagOutcomes.find(
            (o) => o.pieceId === enemy.id && o.flags.engaged === true,
        );
        expect(friendlyEngaged).toBeTruthy();
        expect(enemyEngaged).toBeTruthy();
        expect(slot.isOpen).toBe(false);
    });
});

describe("_handleMountPiece", () => {
    it("rejects with invalid-target when mount does not exist", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const wizard = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            movement: 3,
            status: [UnitStatus.Wizard],
        });
        (board as any)._selected = wizard;
        setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "mt1",
                token: "",
                kind: "mount-piece",
                wizardId: wizard.id,
                mountId: 9999,
                path: [],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "mt1",
            reason: "invalid-target",
        });
    });

    it("rejects with invalid-target when mount belongs to another player (and is not MountAny)", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const p2 = addLocalPlayer(board, "P2");
        const wizard = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            movement: 3,
            status: [UnitStatus.Wizard],
        });
        const enemyMount = await addPieceFor(board, p2, {
            x: 6,
            y: 5,
            status: [UnitStatus.Mount],
        });
        (board as any)._selected = wizard;
        setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "mt1",
                token: "",
                kind: "mount-piece",
                wizardId: wizard.id,
                mountId: enemyMount.id,
                path: [{ x: 6, y: 5 }],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "mt1",
            reason: "invalid-target",
        });
    });

    it("rejects with invalid-move when path's terminal step is not the mount's tile", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const wizard = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            movement: 3,
            status: [UnitStatus.Wizard],
        });
        const mount = await addPieceFor(board, p1, {
            x: 7,
            y: 5,
            status: [UnitStatus.Mount],
        });
        (board as any)._selected = wizard;
        setupMovementSlot(board, 1);
        await board.startGame();

        // Path ends at (6,5) but the mount sits at (7,5).
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "mt1",
                token: "",
                kind: "mount-piece",
                wizardId: wizard.id,
                mountId: mount.id,
                path: [{ x: 6, y: 5 }],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "mt1",
            reason: "invalid-move",
        });
    });

    it("happy path: 2-step path ending at mount.position emits piece-moved x2 and piece-mounted x1", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const wizard = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            movement: 3,
            status: [UnitStatus.Wizard],
        });
        const mount = await addPieceFor(board, p1, {
            x: 7,
            y: 5,
            status: [UnitStatus.Mount],
        });
        (board as any)._selected = wizard;
        const slot = setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "mt1",
                token: "",
                kind: "mount-piece",
                wizardId: wizard.id,
                mountId: mount.id,
                path: [
                    { x: 6, y: 5 },
                    { x: 7, y: 5 },
                ],
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const moves = (lastEvent?.outcomes ?? []).filter(
            (o: any) => o.kind === "piece-moved" && o.pieceId === wizard.id,
        ) as Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
        expect(moves).toHaveLength(2);
        expect(moves[0].to).toEqual({ x: 6, y: 5 });
        expect(moves[1].to).toEqual({ x: 7, y: 5 });
        const mounts = (lastEvent?.outcomes ?? []).filter(
            (o: any) => o.kind === "piece-mounted",
        );
        expect(mounts).toHaveLength(1);
        expect(mounts[0]).toEqual({
            kind: "piece-mounted",
            mountId: mount.id,
            riderId: wizard.id,
        });
        expect(wizard.currentMount).toBe(mount);
        expect(mount.currentRider).toBe(wizard);
        expect(slot.isOpen).toBe(false);
    });
});

describe("_handleDismountPiece", () => {
    it("rejects with invalid-target when wizard is not mounted", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const wizard = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            movement: 3,
            status: [UnitStatus.Wizard],
        });
        (board as any)._selected = wizard;
        setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "dm1",
                token: "",
                kind: "dismount-piece",
                wizardId: wizard.id,
                to: { x: 6, y: 5 },
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "dm1",
            reason: "invalid-target",
        });
    });

    it("rejects with invalid-move when destination is not adjacent to the mount", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const wizard = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            movement: 3,
            status: [UnitStatus.Wizard],
        });
        const horse = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            status: [UnitStatus.Mount],
        });
        (board as any)._selected = wizard;
        setupMovementSlot(board, 1);
        await board.startGame();
        // Wire the wizard onto the mount as part of an event so subsequent
        // dismount happens from a "currently mounted" state.
        await (board as any).recordEvent({}, () => {
            wizard.setMount(horse);
            horse.setRider(wizard);
        });

        // (8,5) is two tiles away from the mount at (5,5).
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "dm1",
                token: "",
                kind: "dismount-piece",
                wizardId: wizard.id,
                to: { x: 8, y: 5 },
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "dm1",
            reason: "invalid-move",
        });
    });

    it("happy path: emits piece-dismounted then piece-moved; wizard.currentMount cleared", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const wizard = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            movement: 3,
            status: [UnitStatus.Wizard],
        });
        const horse = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            status: [UnitStatus.Mount],
        });
        (board as any)._selected = wizard;
        const slot = setupMovementSlot(board, 1);
        await board.startGame();
        await (board as any).recordEvent({}, () => {
            wizard.setMount(horse);
            horse.setRider(wizard);
        });

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "dm1",
                token: "",
                kind: "dismount-piece",
                wizardId: wizard.id,
                to: { x: 6, y: 5 },
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const outcomes = lastEvent?.outcomes ?? [];
        const dismounts = outcomes.filter((o: any) => o.kind === "piece-dismounted");
        const moves = outcomes.filter(
            (o: any) => o.kind === "piece-moved" && o.pieceId === wizard.id,
        ) as Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
        expect(dismounts).toHaveLength(1);
        expect(dismounts[0]).toEqual({
            kind: "piece-dismounted",
            mountId: horse.id,
            riderId: wizard.id,
        });
        expect(moves).toHaveLength(1);
        expect(moves[0].to).toEqual({ x: 6, y: 5 });

        // Canonical order: dismount before move.
        const dismountIdx = outcomes.findIndex((o: any) => o.kind === "piece-dismounted");
        const moveIdx = outcomes.findIndex(
            (o: any) => o.kind === "piece-moved" && o.pieceId === wizard.id,
        );
        expect(dismountIdx).toBeGreaterThanOrEqual(0);
        expect(moveIdx).toBeGreaterThan(dismountIdx);

        expect(wizard.currentMount).toBeNull();
        expect(horse.currentRider).toBeNull();
        expect(slot.isOpen).toBe(false);
    });

    it("chain-mount happy path: dismounting onto another friendly mountable emits dismount, move and a follow-up mount", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const wizard = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            movement: 3,
            status: [UnitStatus.Wizard],
        });
        const horse = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            status: [UnitStatus.Mount],
        });
        const otherMount = await addPieceFor(board, p1, {
            x: 6,
            y: 5,
            status: [UnitStatus.Mount],
        });
        (board as any)._selected = wizard;
        const slot = setupMovementSlot(board, 1);
        await board.startGame();
        await (board as any).recordEvent({}, () => {
            wizard.setMount(horse);
            horse.setRider(wizard);
        });

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "dm1",
                token: "",
                kind: "dismount-piece",
                wizardId: wizard.id,
                to: { x: 6, y: 5 },
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const outcomes = lastEvent?.outcomes ?? [];

        const dismountIdx = outcomes.findIndex(
            (o: any) => o.kind === "piece-dismounted" && o.mountId === horse.id,
        );
        const moveIdx = outcomes.findIndex(
            (o: any) => o.kind === "piece-moved" && o.pieceId === wizard.id,
        );
        const mountIdx = outcomes.findIndex(
            (o: any) => o.kind === "piece-mounted" && o.mountId === otherMount.id,
        );
        expect(dismountIdx).toBeGreaterThanOrEqual(0);
        expect(moveIdx).toBeGreaterThan(dismountIdx);
        expect(mountIdx).toBeGreaterThan(moveIdx);

        expect(wizard.currentMount).toBe(otherMount);
        expect(otherMount.currentRider).toBe(wizard);
        expect(horse.currentRider).toBeNull();
        expect(slot.isOpen).toBe(false);
    });
});

describe("_handleAttackPiece", () => {
    it("rejects with invalid-target when attacker cannot attack the target (ally)", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const attacker = await addPieceFor(board, p1, { x: 5, y: 5, combat: 5 });
        const ally = await addPieceFor(board, p1, { x: 6, y: 5 });
        (board as any)._selected = attacker;
        setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "a1",
                token: "",
                kind: "attack-piece",
                attackerId: attacker.id,
                targetId: ally.id,
                path: [],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "a1",
            reason: "invalid-target",
        });
    });

    it("rejects with invalid-target when target does not exist", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const attacker = await addPieceFor(board, p1, { x: 5, y: 5, combat: 5 });
        (board as any)._selected = attacker;
        setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "a1",
                token: "",
                kind: "attack-piece",
                attackerId: attacker.id,
                targetId: 9999,
                path: [],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "a1",
            reason: "invalid-target",
        });
    });

    it("rejects with invalid-move when path is empty and attacker is not adjacent and not flying", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const p2 = addLocalPlayer(board, "P2");
        const attacker = await addPieceFor(board, p1, { x: 5, y: 5, combat: 5 });
        const target = await addPieceFor(board, p2, { x: 8, y: 5 });
        (board as any)._selected = attacker;
        setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "a1",
                token: "",
                kind: "attack-piece",
                attackerId: attacker.id,
                targetId: target.id,
                path: [],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "a1",
            reason: "invalid-move",
        });
    });

    it("rejects with invalid-move when path's terminal step is not adjacent to the target", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const p2 = addLocalPlayer(board, "P2");
        const attacker = await addPieceFor(board, p1, { x: 5, y: 5, combat: 5, movement: 3 });
        const target = await addPieceFor(board, p2, { x: 8, y: 5 });
        (board as any)._selected = attacker;
        setupMovementSlot(board, 1);
        await board.startGame();

        // Path ends at (6,5), but the target is at (8,5) - not adjacent.
        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "a1",
                token: "",
                kind: "attack-piece",
                attackerId: attacker.id,
                targetId: target.id,
                path: [{ x: 6, y: 5 }],
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "a1",
            reason: "invalid-move",
        });
    });

    it("happy path: forced hit emits piece-attacked, piece-died and replacement piece-moved", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const p2 = addLocalPlayer(board, "P2");
        const attacker = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            combat: 5,
            movement: 3,
        });
        const target = await addPieceFor(board, p2, { x: 7, y: 5 });
        (board as any)._selected = attacker;
        const slot = setupMovementSlot(board, 1);
        await board.startGame();
        // Force every roll to succeed (attack hits).
        vi.spyOn(board, "roll").mockReturnValue(true);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "a1",
                token: "",
                kind: "attack-piece",
                attackerId: attacker.id,
                targetId: target.id,
                path: [{ x: 6, y: 5 }],
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const outcomes = lastEvent?.outcomes ?? [];

        const attacked = outcomes.find((o: any) => o.kind === "piece-attacked");
        expect(attacked).toEqual({
            kind: "piece-attacked",
            attackerId: attacker.id,
            targetId: target.id,
            succeeded: true,
        });
        const died = outcomes.find(
            (o: any) => o.kind === "piece-died" && o.pieceId === target.id,
        );
        expect(died).toEqual({
            kind: "piece-died",
            pieceId: target.id,
            cause: "combat",
        });
        // Replacement-on-kill: attacker steps onto the target's tile.
        const moves = outcomes.filter(
            (o: any) => o.kind === "piece-moved" && o.pieceId === attacker.id,
        ) as Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
        // Expect a move to (6,5) from path-walk and a final replacement move to (7,5).
        const replacement = moves.find((m) => m.to.x === 7 && m.to.y === 5);
        expect(replacement).toBeTruthy();
        expect(slot.isOpen).toBe(false);
    });

    it("does NOT replace attacker on kill when attacker has movement 0 (e.g. Shadow Wood)", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const p2 = addLocalPlayer(board, "P2");
        const attacker = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            combat: 5,
            movement: 0,
        });
        const target = await addPieceFor(board, p2, { x: 6, y: 5 });
        (board as any)._selected = attacker;
        setupMovementSlot(board, 1);
        await board.startGame();
        vi.spyOn(board, "roll").mockReturnValue(true);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "a1",
                token: "",
                kind: "attack-piece",
                attackerId: attacker.id,
                targetId: target.id,
                path: [],
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const outcomes = lastEvent?.outcomes ?? [];
        const moves = outcomes.filter(
            (o: any) => o.kind === "piece-moved" && o.pieceId === attacker.id,
        );
        // mov === 0: no replacement.
        expect(moves).toHaveLength(0);
    });

    it("wizard-kill cascade: forced hit on enemy wizard sweeps the wizard's other living pieces and emits player-defeated", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const p2 = addLocalPlayer(board, "P2");
        // P1 needs a live wizard for game-over to crown P1 the winner.
        await addPieceFor(board, p1, {
            x: 0,
            y: 0,
            status: [UnitStatus.Wizard],
        });
        const attacker = await addPieceFor(board, p1, {
            x: 5,
            y: 5,
            combat: 9,
            movement: 3,
        });
        const enemyWizard = await addPieceFor(board, p2, {
            x: 7,
            y: 5,
            status: [UnitStatus.Wizard],
        });
        const enemyCreature = await addPieceFor(board, p2, {
            x: 1,
            y: 1,
        });
        (board as any)._selected = attacker;
        setupMovementSlot(board, 1);
        await board.startGame();
        vi.spyOn(board, "roll").mockReturnValue(true);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "a1",
                token: "",
                kind: "attack-piece",
                attackerId: attacker.id,
                targetId: enemyWizard.id,
                path: [{ x: 6, y: 5 }],
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const outcomes = lastEvent?.outcomes ?? [];
        // Both pieces died.
        const wizardDied = outcomes.find(
            (o: any) => o.kind === "piece-died" && o.pieceId === enemyWizard.id,
        );
        const creatureDied = outcomes.find(
            (o: any) => o.kind === "piece-died" && o.pieceId === enemyCreature.id,
        );
        expect(wizardDied).toEqual({
            kind: "piece-died",
            pieceId: enemyWizard.id,
            cause: "combat",
        });
        expect(creatureDied).toEqual({
            kind: "piece-died",
            pieceId: enemyCreature.id,
            cause: "spell",
        });
        // player-defeated emitted.
        const defeated = outcomes.find(
            (o: any) => o.kind === "player-defeated" && o.playerId === p2.id,
        );
        expect(defeated).toBeTruthy();
        // game-over emitted (only one survivor: P1).
        const gameOver = outcomes.find((o: any) => o.kind === "game-over");
        expect(gameOver).toEqual({ kind: "game-over", winnerId: p1.id });
    });
});

describe("_handleRangedAttackPiece", () => {
    it("rejects with invalid-target when attacker cannot ranged-attack target", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const p2 = addLocalPlayer(board, "P2");
        // Attacker has zero rangedCombat, so canRangedAttackPiece returns false.
        const attacker = await addPieceFor(board, p1, { x: 5, y: 5 });
        const target = await addPieceFor(board, p2, { x: 9, y: 9 });
        (board as any)._selected = attacker;
        setupMovementSlot(board, 1);
        await board.startGame();

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "r1",
                token: "",
                kind: "ranged-attack-piece",
                attackerId: attacker.id,
                targetId: target.id,
            }),
        );

        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 1,
            commandId: "r1",
            reason: "invalid-target",
        });
    });

    it("happy path: forced hit emits piece-ranged-attacked and piece-died, no piece-moved", async () => {
        const board = makeTestBoard();
        const p1 = board.getPlayer(1);
        const p2 = addLocalPlayer(board, "P2");
        const attacker = await board.addPiece({
            type: UnitType.Creature,
            x: 5,
            y: 5,
            properties: {
                id: "test",
                name: "Test",
                movement: 3,
                combat: 3,
                rangedCombat: 5,
                range: 6,
                defence: 3,
                manoeuvrability: 3,
                magicResistance: 0,
                attackType: "hit",
                rangedType: "shot",
                status: [],
            },
            owner: p1 as any,
        } as PieceConfig);
        const target = await addPieceFor(board, p2, { x: 8, y: 5 });
        // ranged-attack precondition: attacker.moved must be true.
        (attacker as any).moved = true;
        (board as any)._selected = attacker;
        const slot = setupMovementSlot(board, 1);
        await board.startGame();
        vi.spyOn(board, "roll").mockReturnValue(true);

        await board.handleCommand(
            1,
            roundTrip({
                type: "command",
                commandId: "r1",
                token: "",
                kind: "ranged-attack-piece",
                attackerId: attacker.id,
                targetId: target.id,
            }),
        );

        expect(board._rejectedCommandsForTests).toEqual([]);
        const seq = board.eventLog.head();
        const lastEvent = board.eventLog.range(seq, seq)[0];
        const outcomes = lastEvent?.outcomes ?? [];

        const ranged = outcomes.find((o: any) => o.kind === "piece-ranged-attacked");
        expect(ranged).toEqual({
            kind: "piece-ranged-attacked",
            attackerId: attacker.id,
            targetId: target.id,
            succeeded: true,
        });
        const died = outcomes.find(
            (o: any) => o.kind === "piece-died" && o.pieceId === target.id,
        );
        expect(died).toEqual({
            kind: "piece-died",
            pieceId: target.id,
            cause: "ranged",
        });
        // Ranged attacks emit no piece-moved outcomes for the attacker.
        const moves = outcomes.filter(
            (o: any) => o.kind === "piece-moved" && o.pieceId === attacker.id,
        );
        expect(moves).toHaveLength(0);
        expect(slot.isOpen).toBe(false);
    });
});
