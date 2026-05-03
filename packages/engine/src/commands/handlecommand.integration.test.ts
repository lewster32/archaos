import { describe, it, expect, vi } from "vitest";
import { Board } from "../board";
import { ComputerWizard } from "../ai/computerwizard";
import { BoardPhase } from "../enums/boardphase";
import { GameSetupPlayerType } from "../interfaces/ui";
import { Logger } from "../logger";
import { TestRNG } from "../rng";
import { Rules } from "../rules";
import { roundTrip } from "../protocol/wiresafety.testhelpers";
import type {
    CancelCastCommand,
    CastSpellCommand,
    PickSpellCommand,
} from "../protocol/commands";
import type { Spell } from "../spells/spell";
import type { Player } from "../player";
import type { Piece } from "../piece";

/**
 * End-to-end integration test for the command intake pipeline.
 * Drives a 2-human + 2-AI game from `startGame` through the casting
 * phase under barrier mode, asserting that human commands and
 * AI-emitted commands flow through the same `handleCommand` surface
 * and that the broadcast event log remains JSON-safe.
 */

interface FakeScheduler {
    handles: Map<number, () => void>;
    setTimeout: (cb: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
}

function fakeScheduler(): FakeScheduler {
    let nextHandle = 1;
    const handles = new Map<number, () => void>();
    return {
        handles,
        setTimeout: (cb) => {
            const handle = nextHandle++;
            handles.set(handle, cb);
            return handle;
        },
        clearTimeout: (handle) => {
            handles.delete(handle as number);
        },
    };
}

function makeRules(): Rules {
    return {
        doSpread: vi.fn().mockResolvedValue(undefined),
        doExpire: vi.fn().mockResolvedValue(undefined),
        doAutoCastSpell: vi.fn().mockResolvedValue(false),
        doCastSpell: vi.fn().mockResolvedValue(false),
    } as unknown as Rules;
}

/**
 * Minimal mock spell sufficient for the cast handler's range +
 * target-resolution checks and for the spellbook phase loop's
 * has-castable-spell check.
 */
function makeMockSpell(overrides: Record<string, any> = {}): Spell {
    const spell: any = {
        id: 99,
        range: 1.5,
        lineOfSight: false,
        castTimes: 1,
        totalCastTimes: 1,
        persist: false,
        failed: false,
        properties: { autoPlace: false, id: "mock-spell" },
        resetCastTimes: () => {},
        getValidTarget: vi.fn().mockImplementation((t: unknown) => t),
        ...overrides,
    };
    spell.cast = overrides.cast ?? vi.fn().mockImplementation(async () => {
        spell.castTimes -= 1;
        return true;
    });
    return spell as Spell;
}

interface IntegrationPlayerOpts {
    id: number;
    isRemote: boolean;
    hasAi: boolean;
}

interface IntegrationBoardOpts {
    players: IntegrationPlayerOpts[];
    phaseTimeoutMs: number;
    setTimeout: (cb: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
}

/**
 * Build a Board configured for end-to-end command-pipeline testing.
 * Local-human players each get a single castable mock spell. AI
 * players are wired with a real `ComputerWizard` whose subscription
 * to `EngineEvent.PhaseChanged` exercises the event-driven AI
 * command-emission path. AIs are given no spells, so their AI emits
 * `end-spell-pick` reflexively when the spellbook phase opens.
 */
function makeBoardForIntegration(opts: IntegrationBoardOpts): Board {
    const board = new Board(1, 13, 13, false, undefined, {
        rng: new TestRNG(),
        logger: { log: vi.fn() } as unknown as Logger,
        rules: makeRules(),
        autoRunPhaseLoop: true,
        phaseTimeoutMs: opts.phaseTimeoutMs,
        setTimeout: opts.setTimeout,
        clearTimeout: opts.clearTimeout,
    });
    for (const p of opts.players) {
        const player = board.addPlayer(
            { name: `P${p.id}`, type: GameSetupPlayerType.Local },
            null,
            p.isRemote,
        );
        if (p.hasAi) {
            // The constructor subscribes the AI to phase-changed; that
            // is the integration surface under test. Held in a marker
            // field so the construction is not a free-standing
            // statement (oxlint no-new).
            (player as any)._aiForTest = new ComputerWizard(
                board,
                player as any,
                0.5,
            );
        } else {
            player.addSpell(makeMockSpell({ id: 1000 + p.id }));
        }
    }
    return board;
}

function pickFor(
    board: Board,
    playerId: number,
    commandId: string,
): PickSpellCommand {
    const player = board.getPlayer(playerId);
    return {
        type: "command",
        commandId,
        token: "",
        kind: "pick-spell",
        spellId: player.spells[0].id,
    };
}

function castFor(
    playerId: number,
    commandId: string,
    point: { x: number; y: number },
): CastSpellCommand {
    return {
        type: "command",
        commandId,
        token: "",
        kind: "cast-spell",
        target: { point },
    };
}

async function flushUntilPhase(board: Board, phase: BoardPhase): Promise<void> {
    for (let i = 0; i < 200; i += 1) {
        if (board.phase === phase) return;
        await Promise.resolve();
    }
}

describe("Command pipeline integration", () => {
    it("runs a 2-human + 2-AI game from startGame through casting", async () => {
        // The AI prints `console.error` when it has no casting piece;
        // expected for this barebones board, so silence it.
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const sched = fakeScheduler();
            const board = makeBoardForIntegration({
                players: [
                    { id: 1, isRemote: false, hasAi: false }, // human
                    { id: 2, isRemote: true, hasAi: true }, // AI
                    { id: 3, isRemote: false, hasAi: false }, // human
                    { id: 4, isRemote: true, hasAi: true }, // AI
                ],
                phaseTimeoutMs: 5000,
                setTimeout: sched.setTimeout,
                clearTimeout: sched.clearTimeout,
            });

            await board.startGame();

            // Barrier mode is active because two players are remote.
            // The AI listeners synchronously dispatched their picks
            // during `_emitPhaseChanged` — the barrier already holds
            // submissions from players 2 and 4. Submit the human picks
            // in any order; barrier closes when all four have arrived.
            await board.handleCommand(1, roundTrip(pickFor(board, 1, "h1")));
            await board.handleCommand(3, roundTrip(pickFor(board, 3, "h3")));

            // Spellbook phase completes; casting phase opens its first
            // slot for player 1 (lowest id with a selected spell).
            await flushUntilPhase(board, BoardPhase.Casting);
            expect((board as any)._currentCastingPlayerId).toBe(1);

            await board.handleCommand(
                1,
                roundTrip(castFor(1, "h1c", { x: 5, y: 5 })),
            );
            // Slot advances past AI #2 (no selected spell) to player 3.
            expect((board as any)._currentCastingPlayerId).toBe(3);

            await board.handleCommand(
                3,
                roundTrip(castFor(3, "h3c", { x: 6, y: 6 })),
            );

            await board.phaseFlow;

            // Casting phase has run to completion.
            expect(board.phase).not.toBe(BoardPhase.Casting);

            // Both casting humans produced a `spell-cast-attempted`
            // outcome on the broadcast event log.
            const events = board.eventLog.range(1);
            const allOutcomes = events.flatMap((e) => e.outcomes);
            const attempts = allOutcomes.filter(
                (o) => o.kind === "spell-cast-attempted",
            );
            expect(
                attempts
                    .map((o) => (o as { playerId: number }).playerId)
                    .toSorted((a, b) => a - b),
            ).toEqual([1, 3]);

            // Both AIs registered an end-spell-pick via the command
            // pipeline (no rejection paths, no manual prodding).
            const ended = board._endedSpellPickOutcomesForTests;
            expect(
                ended.map((e) => e.playerId).toSorted((a, b) => a - b),
            ).toEqual([2, 4]);

            // Every command in this scenario was accepted on the
            // happy path.
            expect(board._rejectedCommandsForTests).toEqual([]);

            // Event log is JSON-safe (round-trip serialisable).
            const json = JSON.stringify(board.eventLog.toJSON());
            expect(() => JSON.parse(json)).not.toThrow();
            expect(JSON.parse(json).events.length).toBeGreaterThanOrEqual(
                events.length,
            );
        } finally {
            errSpy.mockRestore();
        }
    });

    it("smoke-tests reducer-style replay over a representative outcome subset", async () => {
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const sched = fakeScheduler();
            const board = makeBoardForIntegration({
                players: [
                    { id: 1, isRemote: false, hasAi: false },
                    { id: 2, isRemote: true, hasAi: true },
                ],
                phaseTimeoutMs: 5000,
                setTimeout: sched.setTimeout,
                clearTimeout: sched.clearTimeout,
            });

            await board.startGame();
            await board.handleCommand(1, roundTrip(pickFor(board, 1, "h1")));

            await flushUntilPhase(board, BoardPhase.Casting);
            await board.handleCommand(
                1,
                roundTrip(castFor(1, "h1c", { x: 5, y: 5 })),
            );

            await board.phaseFlow;

            // Stub mirror walks the broadcast log applying outcomes for
            // a handful of representative kinds. The full reducer is
            // future work; this asserts the log alone is sufficient to
            // reach the same terminal state for these kinds.
            interface Mirror {
                gameStarted: boolean;
                phasesEntered: string[];
                pickedPlayers: Set<number>;
                endedPlayers: Set<number>;
                castAttemptsByPlayer: Map<number, number>;
            }
            const mirror: Mirror = {
                gameStarted: false,
                phasesEntered: [],
                pickedPlayers: new Set(),
                endedPlayers: new Set(),
                castAttemptsByPlayer: new Map(),
            };

            for (const event of board.eventLog.range(1)) {
                for (const outcome of event.outcomes) {
                    switch (outcome.kind) {
                        case "game-started":
                            mirror.gameStarted = true;
                            break;
                        case "phase-changed":
                            mirror.phasesEntered.push(outcome.phase);
                            break;
                        case "player-picked-spell":
                            mirror.pickedPlayers.add(outcome.playerId);
                            break;
                        case "player-ended-spell-pick":
                            mirror.endedPlayers.add(outcome.playerId);
                            break;
                        case "spell-cast-attempted": {
                            const prev =
                                mirror.castAttemptsByPlayer.get(
                                    outcome.playerId,
                                ) ?? 0;
                            mirror.castAttemptsByPlayer.set(
                                outcome.playerId,
                                prev + 1,
                            );
                            break;
                        }
                    }
                }
            }

            expect(mirror.gameStarted).toBe(true);
            expect(mirror.pickedPlayers.has(1)).toBe(true);
            expect(mirror.endedPlayers.has(2)).toBe(true);
            expect(mirror.castAttemptsByPlayer.get(1)).toBe(1);
            // Spellbook and casting were both entered along the way.
            expect(mirror.phasesEntered).toContain("spellbook");
            expect(mirror.phasesEntered).toContain("casting");
        } finally {
            errSpy.mockRestore();
        }
    });

    it("handler rejects a stray command-kind union member with wrong-phase", async () => {
        // Wire-safety guard: the dispatcher's default arm rejects any
        // CommandMessage whose kind is not yet wired through the
        // pipeline (movement-phase commands, chat, snapshot requests).
        const sched = fakeScheduler();
        const board = makeBoardForIntegration({
            players: [
                { id: 1, isRemote: false, hasAi: false },
                { id: 2, isRemote: true, hasAi: true },
            ],
            phaseTimeoutMs: 5000,
            setTimeout: sched.setTimeout,
            clearTimeout: sched.clearTimeout,
        });

        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            await board.startGame();

            // Submit a command whose `kind` is in the CommandMessage
            // union but not yet implemented. The dispatcher's default
            // arm rejects it.
            const cancelDuringSpellbook: CancelCastCommand = {
                type: "command",
                commandId: "stray-1",
                token: "",
                kind: "cancel-cast",
            };
            await board.handleCommand(1, roundTrip(cancelDuringSpellbook));

            expect(board._rejectedCommandsForTests).toContainEqual({
                playerId: 1,
                commandId: "stray-1",
                reason: "wrong-phase",
            });

            // Game still progresses normally for legitimate picks.
            await board.handleCommand(1, roundTrip(pickFor(board, 1, "h1")));
            await flushUntilPhase(board, BoardPhase.Casting);
            expect(board.phase).toBe(BoardPhase.Casting);
        } finally {
            errSpy.mockRestore();
        }
    });
});

/**
 * Build a minimal wizard piece for `player` at `(x, y)`. The piece has
 * the `Wizard` status, non-zero combat / movement / manoeuvrability so
 * it satisfies `Piece.canSelect`, and is registered as the player's
 * castingPiece via the Wizard constructor side-effect.
 */
async function addWizardFor(
    board: Board,
    player: Player,
    x: number,
    y: number,
): Promise<Piece> {
    return await board.addWizard({
        wizCode: "0000000000",
        x,
        y,
        owner: player,
        properties: { movement: 1, combat: 3, manoeuvrability: 3 },
    });
}

describe("Command pipeline integration: full movement", () => {
    it(
        "runs a 2-human + 2-AI game from startGame through a complete " +
            "movement turn cycle under autoRunPhaseLoop: true",
        async () => {
            // The AI may print `console.error` during enemy threat
            // evaluation if a wizard lookup fails; silence it so the
            // assertion noise stays focused on the protocol-level
            // invariants.
            const errSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});
            try {
                const sched = fakeScheduler();
                const board = makeBoardForIntegration({
                    players: [
                        { id: 1, isRemote: false, hasAi: false }, // human
                        { id: 2, isRemote: true, hasAi: true }, // AI
                        { id: 3, isRemote: false, hasAi: false }, // human
                        { id: 4, isRemote: true, hasAi: true }, // AI
                    ],
                    phaseTimeoutMs: 5000,
                    setTimeout: sched.setTimeout,
                    clearTimeout: sched.clearTimeout,
                });

                // Place wizards on a 13x13 board, well-separated so AIs
                // do not engage on their first turn — the assertion
                // surface is the command pipeline, not combat.
                await addWizardFor(board, board.getPlayer(1)!, 1, 1);
                await addWizardFor(board, board.getPlayer(2)!, 11, 1);
                await addWizardFor(board, board.getPlayer(3)!, 1, 11);
                await addWizardFor(board, board.getPlayer(4)!, 11, 11);

                await board.startGame();

                // Spellbook (barrier mode): humans submit picks; AIs
                // auto-submit `end-spell-pick` via their phase-changed
                // listener (no spells in their book).
                await board.handleCommand(
                    1,
                    roundTrip(pickFor(board, 1, "h1-pick")),
                );
                await board.handleCommand(
                    3,
                    roundTrip(pickFor(board, 3, "h3-pick")),
                );

                await flushUntilPhase(board, BoardPhase.Casting);

                // Casting: humans cancel rather than cast (avoids the
                // mock spell's effects). AIs have no selected spell so
                // they are skipped automatically by the casting phase
                // loop.
                await board.handleCommand(
                    1,
                    roundTrip({
                        type: "command",
                        commandId: "h1-cancel",
                        token: "",
                        kind: "cancel-cast",
                    } as CancelCastCommand),
                );
                await board.handleCommand(
                    3,
                    roundTrip({
                        type: "command",
                        commandId: "h3-cancel",
                        token: "",
                        kind: "cancel-cast",
                    } as CancelCastCommand),
                );

                // Wait for movement phase to open.
                await flushUntilPhase(board, BoardPhase.Moving);

                // Player 1 (human) drives their movement turn manually:
                // select wizard, end piece turn, end movement phase.
                const wiz1 = board.getPlayer(1)!.castingPiece!;
                await board.handleCommand(
                    1,
                    roundTrip({
                        type: "command",
                        commandId: "h1-sel",
                        token: "",
                        kind: "select-piece",
                        pieceId: wiz1.id,
                    }),
                );
                await board.handleCommand(
                    1,
                    roundTrip({
                        type: "command",
                        commandId: "h1-end-piece",
                        token: "",
                        kind: "end-piece-turn",
                        pieceId: wiz1.id,
                    }),
                );
                await board.handleCommand(
                    1,
                    roundTrip({
                        type: "command",
                        commandId: "h1-end-move",
                        token: "",
                        kind: "end-movement-phase",
                    }),
                );

                // AI #2 reacts to its movement-slot phase-changed
                // automatically. Yield to let the AI dispatch its
                // chain of select-piece / move / end-piece-turn /
                // end-movement-phase commands.
                for (let i = 0; i < 50; i += 1) {
                    if (board.phase !== BoardPhase.Moving) break;
                    if ((board as any)._expectedCommand?.expectedPlayerId === 3)
                        break;
                    await Promise.resolve();
                }

                // Player 3 (human) drives their movement turn the same
                // way as player 1.
                const wiz3 = board.getPlayer(3)!.castingPiece!;
                if ((board as any)._expectedCommand?.expectedPlayerId === 3) {
                    await board.handleCommand(
                        3,
                        roundTrip({
                            type: "command",
                            commandId: "h3-sel",
                            token: "",
                            kind: "select-piece",
                            pieceId: wiz3.id,
                        }),
                    );
                    await board.handleCommand(
                        3,
                        roundTrip({
                            type: "command",
                            commandId: "h3-end-piece",
                            token: "",
                            kind: "end-piece-turn",
                            pieceId: wiz3.id,
                        }),
                    );
                    await board.handleCommand(
                        3,
                        roundTrip({
                            type: "command",
                            commandId: "h3-end-move",
                            token: "",
                            kind: "end-movement-phase",
                        }),
                    );
                }

                // Let AI #4 and the remainder of the phase loop finish.
                await board.phaseFlow;

                // ── Assertions ───────────────────────────────────────

                // 1. Full event log is JSON-safe.
                const json = JSON.stringify(board.eventLog.toJSON());
                expect(() => JSON.parse(json)).not.toThrow();

                // 2. Per-piece sequential traversal: within any single
                //    broadcast event, consecutive `piece-moved` outcomes
                //    for the same piece must chain (each move's `from`
                //    equals the previous move's `to`).
                const events = board.eventLog.range(1);
                for (const event of events) {
                    const moves = event.outcomes.filter(
                        (o) => o.kind === "piece-moved",
                    ) as Array<{
                        kind: "piece-moved";
                        pieceId: number;
                        from: { x: number; y: number };
                        to: { x: number; y: number };
                    }>;
                    const byPiece: Record<
                        number,
                        Array<{
                            from: { x: number; y: number };
                            to: { x: number; y: number };
                        }>
                    > = {};
                    for (const m of moves) {
                        const arr = byPiece[m.pieceId] ?? [];
                        arr.push({ from: m.from, to: m.to });
                        byPiece[m.pieceId] = arr;
                    }
                    for (const arr of Object.values(byPiece)) {
                        for (let i = 1; i < arr.length; i += 1) {
                            expect(arr[i].from).toEqual(arr[i - 1].to);
                        }
                    }
                }

                // 3. No AI rejections (invariant 13: client-server path
                //    agreement). The AI players must never have a
                //    command rejected — every command they emit must be
                //    accepted on the happy path.
                const aiRejections = board._rejectedCommandsForTests.filter(
                    (r) => r.playerId === 2 || r.playerId === 4,
                );
                expect(aiRejections).toEqual([]);

                // 4. Game progressed past movement: the phase loop
                //    closed out and the FSM advanced (Spellbook for
                //    next turn, or GameOver if a wizard fell).
                expect([BoardPhase.Spellbook, BoardPhase.GameOver]).toContain(
                    board.phase,
                );

                // 5. The movement phase actually opened at least one
                //    per-player slot (sanity check that the assertions
                //    above are not vacuously true). A `phase-changed`
                //    broadcast with `phase: "movement"` and a non-null
                //    `currentPlayerId` is emitted exactly when the
                //    movement-phase slot loop calls `_emitPhaseChanged`.
                const movingSlotOpens = events
                    .flatMap((e) => e.outcomes)
                    .filter(
                        (o) =>
                            o.kind === "phase-changed" &&
                            o.phase === "movement" &&
                            o.currentPlayerId !== undefined,
                    );
                expect(movingSlotOpens.length).toBeGreaterThan(0);
            } finally {
                errSpy.mockRestore();
            }
        },
    );
});
