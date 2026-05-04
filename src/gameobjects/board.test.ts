import { describe, it, expect, vi, afterEach } from "vitest";
import { Board as EngineBoard, BoardState, weightedRandomPick, TestRNG, EngineEvent, EventEmitter, UnitStatus, UnitRangedProjectileType } from "@archaos/engine";
import type { BroadcastEventMessage, MovePieceBatchPayload, AttackPieceBatchPayload, RangedAttackPieceBatchPayload, MountPieceBatchPayload } from "@archaos/engine";
import { Board } from "./board";
import { AnimationQueue } from "./animationqueue";

/**
 * A TestRNG variant that delegates frac() to Math.random() for statistical
 * tests, and pick() to a uniform random selection.
 */
class StatisticalRNG extends TestRNG {
    frac(): number {
        return Math.random();
    }
    pick<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)];
    }
}

describe("weightedRandomPick", () => {
    const rng = new StatisticalRNG();

    it("throws on an empty array", () => {
        expect(() => weightedRandomPick(rng, [], 1)).toThrow("Cannot pick from an empty array");
    });

    it("always returns the only element for a single-element array", () => {
        expect(weightedRandomPick(rng, ["only"], 2)).toBe("only");
        expect(weightedRandomPick(rng, ["only"], -2)).toBe("only");
    });

    it("returns a value from the array", () => {
        const array = ["a", "b", "c", "d"];
        for (let i = 0; i < 100; i++) {
            expect(array).toContain(weightedRandomPick(rng, array, 1));
            expect(array).toContain(weightedRandomPick(rng, array, -1));
            expect(array).toContain(weightedRandomPick(rng, array, 0));
        }
    });

    /**
     * Statistical helper: run N trials and return the frequency of each index.
     * Also returns the mean index selected across all trials.
     */
    function sample(
        array: number[],
        weight: number,
        N: number,
        exponential = false,
    ): { counts: number[]; mean: number } {
        const counts = Array.from({ length: array.length }, () => 0);
        let total = 0;
        for (let i = 0; i < N; i++) {
            const result = weightedRandomPick(rng, array, weight, exponential);
            counts[result]++;
            total += result;
        }
        return { counts, mean: total / N };
    }

    // We use a 4-element array [0,1,2,3] so the result is its own index.
    // With weight=0 the mean should be ~1.5 (uniform).
    // With positive weight the mean should be significantly above 1.5.
    // With negative weight the mean should be significantly below 1.5.
    //
    // Theoretical probabilities with the corrected formula (n*(2+|w|)/2 total weight):
    //   array [0,1,2,3], weight=2:
    //     w_i = 1 + i*2/3 → [1, 5/3, 7/3, 3], total = 8
    //     P = [1/8, 5/24, 7/24, 3/8] ≈ [0.125, 0.208, 0.292, 0.375]
    //     mean = 0*0.125 + 1*(5/24) + 2*(7/24) + 3*0.375 ≈ 1.917
    //   For weight=-2 the probabilities are reversed, mean ≈ 1.083

    const N = 20_000;
    const indices = [0, 1, 2, 3];
    const TOLERANCE = 0.05; // ±5% of N

    it("with weight=0, picks uniformly (mean ≈ 1.5)", () => {
        const { mean } = sample(indices, 0, N);
        expect(mean).toBeGreaterThan(1.2);
        expect(mean).toBeLessThan(1.8);
    });

    it("with positive weight, biases towards later elements (mean > 1.5)", () => {
        const { mean } = sample(indices, 2, N);
        expect(mean).toBeGreaterThan(1.7); // theoretical ≈ 1.917
    });

    it("with negative weight, biases towards earlier elements (mean < 1.5)", () => {
        const { mean } = sample(indices, -2, N);
        expect(mean).toBeLessThan(1.3); // theoretical ≈ 1.083
    });

    it("positive and negative weights of the same magnitude produce mirrored means", () => {
        const pos = sample(indices, 2, N);
        const neg = sample(indices, -2, N);
        // The two means should sum to ~3 (the max index), symmetric around 1.5.
        expect(Math.abs(pos.mean + neg.mean - 3)).toBeLessThan(0.3);
    });

    it("higher weight magnitude produces a more extreme mean", () => {
        const low = sample(indices, 1, N);
        const high = sample(indices, 3, N);
        expect(high.mean).toBeGreaterThan(low.mean);
    });

    it("matches expected probabilities for weight=2 within tolerance", () => {
        // P(0)=0.125, P(1)≈0.208, P(2)≈0.292, P(3)=0.375
        const expected = [0.125, 5 / 24, 7 / 24, 0.375];
        const { counts } = sample(indices, 2, N);
        for (let i = 0; i < indices.length; i++) {
            const observed = counts[i] / N;
            expect(Math.abs(observed - expected[i])).toBeLessThan(TOLERANCE);
        }
    });

    it("matches expected probabilities for weight=-2 within tolerance (mirrored)", () => {
        // Negative weight reverses direction: P(3)=0.125, P(0)=0.375
        const expected = [0.375, 7 / 24, 5 / 24, 0.125];
        const { counts } = sample(indices, -2, N);
        for (let i = 0; i < indices.length; i++) {
            const observed = counts[i] / N;
            expect(Math.abs(observed - expected[i])).toBeLessThan(TOLERANCE);
        }
    });

    it("all elements are reachable with positive weight", () => {
        const { counts } = sample(indices, 3, N);
        for (const count of counts) {
            expect(count).toBeGreaterThan(0);
        }
    });

    it("all elements are reachable with negative weight", () => {
        const { counts } = sample(indices, -3, N);
        for (const count of counts) {
            expect(count).toBeGreaterThan(0);
        }
    });

    describe("exponential mode", () => {
        // Theoretical probabilities for n=4, weight=+2, exponential=true:
        //   slot weights: exp(0), exp(2/3), exp(4/3), exp(2) ≈ [1, 1.948, 3.794, 7.389]
        //   total ≈ 14.131
        //   P ≈ [0.0708, 0.1378, 0.2685, 0.5230]
        //   mean ≈ 2.244  (vs linear mean ≈ 1.917 for the same weight)

        it("exponential=false matches the default behaviour", () => {
            const lin = sample(indices, 2, N, false);
            const def = sample(indices, 2, N);
            // Both should produce a similar mean — within noise of each other
            expect(Math.abs(lin.mean - def.mean)).toBeLessThan(0.15);
        });

        it("exponential mode biases more strongly than linear for positive weight", () => {
            const lin = sample(indices, 2, N, false);
            const log = sample(indices, 2, N, true);
            // Log mean ≈ 2.24, linear mean ≈ 1.92 — log should be clearly higher
            expect(log.mean).toBeGreaterThan(lin.mean + 0.1);
        });

        it("exponential mode biases more strongly than linear for negative weight", () => {
            const lin = sample(indices, -2, N, false);
            const log = sample(indices, -2, N, true);
            // Log mean ≈ 0.76, linear mean ≈ 1.08 — log should be clearly lower
            expect(log.mean).toBeLessThan(lin.mean - 0.1);
        });

        it("exponential positive and negative weights are mirrored", () => {
            const pos = sample(indices, 2, N, true);
            const neg = sample(indices, -2, N, true);
            expect(Math.abs(pos.mean + neg.mean - 3)).toBeLessThan(0.3);
        });

        it("matches expected probabilities for exponential weight=+2", () => {
            const total = Math.exp(0) + Math.exp(2 / 3) + Math.exp(4 / 3) + Math.exp(2);
            const expected = [
                Math.exp(0) / total,
                Math.exp(2 / 3) / total,
                Math.exp(4 / 3) / total,
                Math.exp(2) / total,
            ];
            const { counts } = sample(indices, 2, N, true);
            for (let i = 0; i < indices.length; i++) {
                expect(Math.abs(counts[i] / N - expected[i])).toBeLessThan(TOLERANCE);
            }
        });

        it("all elements are reachable in exponential mode", () => {
            const { counts } = sample(indices, 3, N, true);
            for (const count of counts) {
                expect(count).toBeGreaterThan(0);
            }
        });

        it("single-element array returns the only element in exponential mode", () => {
            expect(weightedRandomPick(rng, ["only"], 2, true)).toBe("only");
            expect(weightedRandomPick(rng, ["only"], -2, true)).toBe("only");
        });
    });
});

// ────────────────────────────────────────────────────────────────────────────
// Dual-driver race regression test
// ────────────────────────────────────────────────────────────────────────────
//
// When `autoRunPhaseLoop` is true, the engine's `_runGameFlow` drives the
// FSM and per-player slot loops; the client subclass must NOT also reset the
// FSM and run the legacy `nextPlayer()` flow concurrently. Both writers
// would race for `_currentPlayer`, causing `Rules.processIntent` to return
// `ActionType.Info` instead of `Select` when the human clicked their wizard
// during what they perceived as their own turn.

describe("client Board.startGame override", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Build a minimal `Board` instance via `Object.create` to bypass the
     * heavy Phaser-bound constructor. Only the fields touched by
     * `Board.startGame()` need to be populated; the engine super
     * `startGame()` is stubbed via the prototype so the broadcast event
     * log machinery is not exercised. Per-instance setters override the
     * prototype's `currentPlayer`/`state` setters (which would otherwise
     * touch Phaser-bound state like `cursor.enabled`).
     */
    function makeFakeBoard(autoRunPhaseLoop: boolean): {
        board: Board;
        currentPlayerSetSpy: ReturnType<typeof vi.fn>;
        stateSetSpy: ReturnType<typeof vi.fn>;
        stateManagerReset: ReturnType<typeof vi.fn>;
    } {
        const fake = Object.create(Board.prototype) as Board;
        // Fields read by Board.startGame override.
        (fake as any)._autoRunPhaseLoop = autoRunPhaseLoop;
        (fake as any)._currentPlayerIndex = 0;
        (fake as any)._currentPlayer = null;
        (fake as any)._state = BoardState.Idle;

        const stateManagerReset = vi.fn();
        (fake as any)._stateManager = { reset: stateManagerReset };

        // Replace the prototype's currentPlayer setter for this instance
        // with a no-op spy so we don't touch cursor/UI state.
        const currentPlayerSetSpy = vi.fn();
        Object.defineProperty(fake, "currentPlayer", {
            configurable: true,
            get: () => (fake as any)._currentPlayer,
            set: (v) => {
                (fake as any)._currentPlayer = v;
                currentPlayerSetSpy(v);
            },
        });

        // Same for the state setter — the client override emits UI events
        // and reads disabled-flags that the fake doesn't carry.
        const stateSetSpy = vi.fn();
        Object.defineProperty(fake, "state", {
            configurable: true,
            get: () => (fake as any)._state,
            set: (v) => {
                (fake as any)._state = v;
                stateSetSpy(v);
            },
        });

        return { board: fake, currentPlayerSetSpy, stateSetSpy, stateManagerReset };
    }

    it("does NOT call legacy nextPlayer() or reset the FSM when autoRunPhaseLoop is true", async () => {
        const { board, stateManagerReset } = makeFakeBoard(true);

        const fakeEvent = {
            type: "event",
            sequence: 1,
            elapsedMs: 0,
            outcomes: [],
        } as BroadcastEventMessage;

        const superStartGameSpy = vi.spyOn(EngineBoard.prototype, "startGame").mockResolvedValue(fakeEvent);
        const nextPlayerSpy = vi.spyOn(Board.prototype, "nextPlayer").mockResolvedValue(undefined);

        const event = await Board.prototype.startGame.call(board);

        expect(superStartGameSpy).toHaveBeenCalledTimes(1);
        expect(event).toBe(fakeEvent);
        // The legacy driver must not run when the engine is auto-driving.
        expect(nextPlayerSpy).not.toHaveBeenCalled();
        // The FSM reset is part of the legacy driver and would yank the
        // FSM out from under `_runGameFlow` mid-flight.
        expect(stateManagerReset).not.toHaveBeenCalled();
    });

    it("calls legacy nextPlayer() and resets the FSM when autoRunPhaseLoop is false (legacy mode)", async () => {
        const { board, stateManagerReset } = makeFakeBoard(false);

        const fakeEvent = {
            type: "event",
            sequence: 1,
            elapsedMs: 0,
            outcomes: [],
        } as BroadcastEventMessage;

        vi.spyOn(EngineBoard.prototype, "startGame").mockResolvedValue(fakeEvent);
        const nextPlayerSpy = vi.spyOn(Board.prototype, "nextPlayer").mockResolvedValue(undefined);

        await Board.prototype.startGame.call(board);

        expect(nextPlayerSpy).toHaveBeenCalledTimes(1);
        expect(stateManagerReset).toHaveBeenCalledTimes(1);
        // Legacy reset must blank the current-player tracking too.
        expect((board as any)._currentPlayerIndex).toBe(-1);
        expect((board as any)._currentPlayer).toBeNull();
    });
});

// ────────────────────────────────────────────────────────────────────────────
// Visual reaction - MovePieceBatch
// ────────────────────────────────────────────────────────────────────────────

describe("Visual reaction - MovePieceBatch", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Build a minimal fake client Board that has enough state to exercise
     * the MovePieceBatch subscriber and _animateMovePieceBatch handler
     * without instantiating Phaser. Only the fields touched by the handler
     * are populated.
     */
    function makeFakeMovingBoard(isFlying: boolean = false): {
        board: Board;
        piece: { id: number; hasStatus: ReturnType<typeof vi.fn>; moveTo: ReturnType<typeof vi.fn> };
    } {
        const fake = Object.create(Board.prototype) as Board;

        const animationQueue = new AnimationQueue();
        (fake as any)._animationQueue = animationQueue;

        // Real EventEmitter so the subscription and emit round-trip works.
        const emitter = new EventEmitter();
        (fake as any)._boardEvents = emitter;

        const piece = {
            id: 42,
            hasStatus: vi.fn((_status: UnitStatus) => isFlying),
            moveTo: vi.fn((_pt: { x: number; y: number }) => Promise.resolve()),
        };

        (fake as any).getPiece = vi.fn((_id: number) => piece);
        // sound and rangeGizmo are getter-only; set the backing fields instead.
        (fake as any)._sound = { play: vi.fn(), playAsync: vi.fn(() => Promise.resolve()) };
        (fake as any)._rangeGizmo = { reset: vi.fn(() => Promise.resolve()) };
        (fake as any).emitBoardUpdateEvent = vi.fn();

        // Wire the subscriber the same way the constructor does.
        emitter.on(EngineEvent.MovePieceBatch, (payload: MovePieceBatchPayload) => {
            animationQueue.enqueue(async () => {
                await (fake as any)._animateMovePieceBatch(payload);
            });
        });

        return { board: fake, piece };
    }

    it("animates each step via piece.moveTo for a ground unit", async () => {
        const { board, piece } = makeFakeMovingBoard(false);
        const moveToSpy = vi.spyOn(piece, "moveTo");

        (board as any).events.emit(EngineEvent.MovePieceBatch, {
            pieceId: piece.id,
            path: [{ x: 0, y: 1 }, { x: 0, y: 2 }],
            riderSync: false,
        } as MovePieceBatchPayload);

        await board.animationQueue.idle();

        expect(moveToSpy).toHaveBeenCalledTimes(2);
        expect(moveToSpy.mock.calls[0][0]).toEqual({ x: 0, y: 1 });
        expect(moveToSpy.mock.calls[1][0]).toEqual({ x: 0, y: 2 });
    });

    it("plays the step sound at the first step for a ground unit", async () => {
        const { board } = makeFakeMovingBoard(false);
        const soundPlay = (board as any)._sound.play as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.MovePieceBatch, {
            pieceId: 42,
            path: [{ x: 1, y: 0 }],
            riderSync: false,
        } as MovePieceBatchPayload);

        await board.animationQueue.idle();

        expect(soundPlay).toHaveBeenCalledWith("step");
    });

    it("plays the fly sound at the first step for a flying unit", async () => {
        const { board } = makeFakeMovingBoard(true);
        const soundPlay = (board as any)._sound.play as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.MovePieceBatch, {
            pieceId: 42,
            path: [{ x: 1, y: 0 }],
            riderSync: false,
        } as MovePieceBatchPayload);

        await board.animationQueue.idle();

        expect(soundPlay).toHaveBeenCalledWith("fly");
    });

    it("resets the rangeGizmo after animation", async () => {
        const { board } = makeFakeMovingBoard(false);
        const resetSpy = (board as any)._rangeGizmo.reset as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.MovePieceBatch, {
            pieceId: 42,
            path: [{ x: 1, y: 0 }],
            riderSync: false,
        } as MovePieceBatchPayload);

        await board.animationQueue.idle();

        expect(resetSpy).toHaveBeenCalledTimes(1);
    });

    it("does nothing when piece is not found", async () => {
        const { board } = makeFakeMovingBoard(false);
        (board as any).getPiece = vi.fn(() => null);
        const rangeReset = (board as any)._rangeGizmo.reset as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.MovePieceBatch, {
            pieceId: 99,
            path: [{ x: 1, y: 0 }],
            riderSync: false,
        } as MovePieceBatchPayload);

        await board.animationQueue.idle();

        expect(rangeReset).not.toHaveBeenCalled();
    });

    it("plays the engaged sound when engagedBy is set on the payload", async () => {
        const { board, piece } = makeFakeMovingBoard(false);
        const playAsync = (board as any)._sound.playAsync as ReturnType<typeof vi.fn>;

        const enemy = { id: 7 };
        // Override getPiece so the moving piece resolves normally but
        // the enemy lookup also resolves.
        (board as any).getPiece = vi.fn((id: number) =>
            id === piece.id ? piece : id === enemy.id ? enemy : null
        );

        (board as any).events.emit(EngineEvent.MovePieceBatch, {
            pieceId: piece.id,
            path: [{ x: 1, y: 0 }],
            riderSync: false,
            engagedBy: { pieceId: enemy.id },
        } as MovePieceBatchPayload);

        await board.animationQueue.idle();

        expect(playAsync).toHaveBeenCalledWith(
            "engaged",
            expect.objectContaining({ delay: expect.any(Number) })
        );
    });
});

// ────────────────────────────────────────────────────────────────────────────
// Visual reaction - AttackPieceBatch
// ────────────────────────────────────────────────────────────────────────────

describe("Visual reaction - AttackPieceBatch", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Build a minimal fake client Board that has enough state to exercise
     * the AttackPieceBatch subscriber and _animateAttackPieceBatch handler
     * without instantiating Phaser. Only the fields touched by the handler
     * are populated.
     */
    function makeFakeAttackBoard(): {
        board: Board;
        attacker: {
            id: number;
            position: { x: number; y: number };
            updateDirection: ReturnType<typeof vi.fn>;
            moveTo: ReturnType<typeof vi.fn>;
            sprite: { getCenter: () => { x: number; y: number } };
        };
        target: {
            id: number;
            position: { x: number; y: number };
            dead: boolean;
            kill: ReturnType<typeof vi.fn>;
            sprite: { getCenter: () => { x: number; y: number } };
        };
    } {
        const fake = Object.create(Board.prototype) as Board;

        const animationQueue = new AnimationQueue();
        (fake as any)._animationQueue = animationQueue;

        // Real EventEmitter so the subscription and emit round-trip works.
        const emitter = new EventEmitter();
        (fake as any)._boardEvents = emitter;

        const attacker = {
            id: 10,
            position: { x: 0, y: 0 },
            updateDirection: vi.fn(),
            moveTo: vi.fn((_pt: { x: number; y: number }) => Promise.resolve()),
            sprite: { getCenter: () => ({ x: 50, y: 50 }) },
        };

        const target = {
            id: 20,
            position: { x: 1, y: 0 },
            dead: false,
            kill: vi.fn(() => Promise.resolve()),
            sprite: { getCenter: () => ({ x: 100, y: 50 }) },
        };

        (fake as any).getPiece = vi.fn((id: number) => {
            if (id === attacker.id) return attacker;
            if (id === target.id) return target;
            return null;
        });

        (fake as any)._sound = {
            play: vi.fn(),
            playAsync: vi.fn(() => Promise.resolve()),
        };
        (fake as any)._rangeGizmo = { reset: vi.fn(() => Promise.resolve()) };
        (fake as any).emitBoardUpdateEvent = vi.fn();
        (fake as any).playEffect = vi.fn(() => Promise.resolve());
        (fake as any).delay = vi.fn(() => Promise.resolve());

        // Wire the subscriber the same way the constructor does.
        emitter.on(EngineEvent.AttackPieceBatch, (payload: AttackPieceBatchPayload) => {
            animationQueue.enqueue(async () => {
                await (fake as any)._animateAttackPieceBatch(payload);
            });
        });

        return { board: fake, attacker, target };
    }

    it("walks the approach path via attacker.moveTo before attacking", async () => {
        const { board, attacker, target } = makeFakeAttackBoard();
        const moveToSpy = vi.spyOn(attacker, "moveTo");

        (board as any).events.emit(EngineEvent.AttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            path: [{ x: 1, y: 0 }],
            hit: true,
            targetKilled: true,
            cascadeKilledIds: [],
        } as AttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(moveToSpy).toHaveBeenCalledTimes(1);
        expect(moveToSpy.mock.calls[0][0]).toEqual({ x: 1, y: 0 });
    });

    it("plays the step sound at the first approach step", async () => {
        const { board, attacker, target } = makeFakeAttackBoard();
        const soundPlay = (board as any)._sound.play as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.AttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            path: [{ x: 1, y: 0 }],
            hit: false,
            targetKilled: false,
            cascadeKilledIds: [],
        } as AttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(soundPlay).toHaveBeenCalledWith("step");
    });

    it("plays the attack sound and effect regardless of hit", async () => {
        const { board, attacker, target } = makeFakeAttackBoard();
        const soundPlay = (board as any)._sound.play as ReturnType<typeof vi.fn>;
        const playEffect = (board as any).playEffect as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.AttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            path: [],
            hit: false,
            targetKilled: false,
            cascadeKilledIds: [],
        } as AttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(soundPlay).toHaveBeenCalledWith("attack");
        expect(playEffect).toHaveBeenCalled();
    });

    it("calls target.kill when targetKilled is true", async () => {
        const { board, attacker, target } = makeFakeAttackBoard();
        const killSpy = vi.spyOn(target, "kill");

        (board as any).events.emit(EngineEvent.AttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            path: [],
            hit: true,
            targetKilled: true,
            cascadeKilledIds: [],
        } as AttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(killSpy).toHaveBeenCalledTimes(1);
    });

    it("does not call target.kill when targetKilled is false", async () => {
        const { board, attacker, target } = makeFakeAttackBoard();
        const killSpy = vi.spyOn(target, "kill");

        (board as any).events.emit(EngineEvent.AttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            path: [],
            hit: false,
            targetKilled: false,
            cascadeKilledIds: [],
        } as AttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(killSpy).not.toHaveBeenCalled();
    });

    it("calls kill on each cascade-killed piece", async () => {
        const { board, attacker, target } = makeFakeAttackBoard();

        const cascadePiece = {
            id: 99,
            kill: vi.fn(() => Promise.resolve()),
        };
        const originalGetPiece = (board as any).getPiece as ReturnType<typeof vi.fn>;
        (board as any).getPiece = vi.fn((id: number) => {
            if (id === 99) return cascadePiece;
            return originalGetPiece(id);
        });

        (board as any).events.emit(EngineEvent.AttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            path: [],
            hit: true,
            targetKilled: true,
            cascadeKilledIds: [99],
        } as AttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(cascadePiece.kill).toHaveBeenCalledTimes(1);
    });

    it("plays the engaged sound when engagedBy is set", async () => {
        const { board, attacker, target } = makeFakeAttackBoard();
        const playAsync = (board as any)._sound.playAsync as ReturnType<typeof vi.fn>;

        const enemy = { id: 7 };
        const originalGetPiece = (board as any).getPiece as ReturnType<typeof vi.fn>;
        (board as any).getPiece = vi.fn((id: number) => {
            if (id === enemy.id) return enemy;
            return originalGetPiece(id);
        });

        (board as any).events.emit(EngineEvent.AttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            path: [{ x: 1, y: 0 }],
            hit: false,
            targetKilled: false,
            cascadeKilledIds: [],
            engagedBy: { pieceId: enemy.id },
        } as AttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(playAsync).toHaveBeenCalledWith(
            "engaged",
            expect.objectContaining({ delay: expect.any(Number) })
        );
    });

    it("resets the rangeGizmo and emits board update after animation", async () => {
        const { board, attacker, target } = makeFakeAttackBoard();
        const resetSpy = (board as any)._rangeGizmo.reset as ReturnType<typeof vi.fn>;
        const updateSpy = (board as any).emitBoardUpdateEvent as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.AttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            path: [],
            hit: false,
            targetKilled: false,
            cascadeKilledIds: [],
        } as AttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(resetSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it("does nothing when attacker is not found", async () => {
        const { board, target } = makeFakeAttackBoard();
        (board as any).getPiece = vi.fn((id: number) =>
            id === target.id ? target : null
        );
        const resetSpy = (board as any)._rangeGizmo.reset as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.AttackPieceBatch, {
            attackerId: 999,
            targetId: target.id,
            path: [],
            hit: false,
            targetKilled: false,
            cascadeKilledIds: [],
        } as AttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(resetSpy).not.toHaveBeenCalled();
    });
});

// ────────────────────────────────────────────────────────────────────────────
// Visual reaction - RangedAttackPieceBatch
// ────────────────────────────────────────────────────────────────────────────

describe("Visual reaction - RangedAttackPieceBatch", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Build a minimal fake client Board that has enough state to exercise
     * the RangedAttackPieceBatch subscriber and
     * _animateRangedAttackPieceBatch handler without instantiating Phaser.
     * Only the fields touched by the handler are populated.
     */
    function makeFakeRangedBoard(): {
        board: Board;
        attacker: {
            id: number;
            position: { x: number; y: number };
            properties: { projectileType: UnitRangedProjectileType };
            updateDirection: ReturnType<typeof vi.fn>;
            sprite: { getCenter: () => { x: number; y: number } };
        };
        target: {
            id: number;
            position: { x: number; y: number };
            dead: boolean;
            kill: ReturnType<typeof vi.fn>;
            sprite: { getCenter: () => { x: number; y: number } };
        };
    } {
        const fake = Object.create(Board.prototype) as Board;

        const animationQueue = new AnimationQueue();
        (fake as any)._animationQueue = animationQueue;

        // Real EventEmitter so the subscription and emit round-trip works.
        const emitter = new EventEmitter();
        (fake as any)._boardEvents = emitter;

        const attacker = {
            id: 10,
            position: { x: 0, y: 0 },
            properties: { projectileType: UnitRangedProjectileType.Arrow },
            updateDirection: vi.fn(),
            sprite: { getCenter: () => ({ x: 50, y: 50 }) },
        };

        const target = {
            id: 20,
            position: { x: 3, y: 0 },
            dead: false,
            kill: vi.fn(() => Promise.resolve()),
            sprite: { getCenter: () => ({ x: 150, y: 50 }) },
        };

        (fake as any).getPiece = vi.fn((id: number) => {
            if (id === attacker.id) return attacker;
            if (id === target.id) return target;
            return null;
        });

        (fake as any)._sound = {
            play: vi.fn(),
            playAsync: vi.fn(() => Promise.resolve()),
        };
        (fake as any)._rangeGizmo = { reset: vi.fn(() => Promise.resolve()) };
        (fake as any).emitBoardUpdateEvent = vi.fn();
        (fake as any).playEffect = vi.fn(() => Promise.resolve());
        (fake as any).delay = vi.fn(() => Promise.resolve());

        // Wire the subscriber the same way the constructor does.
        emitter.on(
            EngineEvent.RangedAttackPieceBatch,
            (payload: RangedAttackPieceBatchPayload) => {
                animationQueue.enqueue(async () => {
                    await (fake as any)._animateRangedAttackPieceBatch(payload);
                });
            },
        );

        return { board: fake, attacker, target };
    }

    it("plays the beam and hit sounds and effects", async () => {
        const { board, attacker, target } = makeFakeRangedBoard();
        const soundPlay = (board as any)._sound.play as ReturnType<typeof vi.fn>;
        const playEffect = (board as any).playEffect as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.RangedAttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            hit: true,
            targetKilled: false,
            cascadeKilledIds: [],
        } as RangedAttackPieceBatchPayload);

        await board.animationQueue.idle();

        // Beam sound then hit sound, each followed by a playEffect call.
        expect(soundPlay).toHaveBeenCalledWith("arrow-fly");
        expect(soundPlay).toHaveBeenCalledWith("arrow-hit");
        expect(playEffect).toHaveBeenCalledTimes(2);
    });

    it("calls target.kill when targetKilled is true", async () => {
        const { board, attacker, target } = makeFakeRangedBoard();
        const killSpy = vi.spyOn(target, "kill");

        (board as any).events.emit(EngineEvent.RangedAttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            hit: true,
            targetKilled: true,
            cascadeKilledIds: [],
        } as RangedAttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(killSpy).toHaveBeenCalledTimes(1);
    });

    it("does not call target.kill when targetKilled is false", async () => {
        const { board, attacker, target } = makeFakeRangedBoard();
        const killSpy = vi.spyOn(target, "kill");

        (board as any).events.emit(EngineEvent.RangedAttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            hit: false,
            targetKilled: false,
            cascadeKilledIds: [],
        } as RangedAttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(killSpy).not.toHaveBeenCalled();
    });

    it("calls kill on each cascade-killed piece", async () => {
        const { board, attacker, target } = makeFakeRangedBoard();

        const cascadePiece = {
            id: 99,
            kill: vi.fn(() => Promise.resolve()),
        };
        const originalGetPiece = (board as any).getPiece as ReturnType<typeof vi.fn>;
        (board as any).getPiece = vi.fn((id: number) => {
            if (id === 99) return cascadePiece;
            return originalGetPiece(id);
        });

        (board as any).events.emit(EngineEvent.RangedAttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            hit: true,
            targetKilled: true,
            cascadeKilledIds: [99],
        } as RangedAttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(cascadePiece.kill).toHaveBeenCalledTimes(1);
    });

    it("resets the rangeGizmo and emits board update after animation", async () => {
        const { board, attacker, target } = makeFakeRangedBoard();
        const resetSpy = (board as any)._rangeGizmo.reset as ReturnType<typeof vi.fn>;
        const updateSpy = (board as any).emitBoardUpdateEvent as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.RangedAttackPieceBatch, {
            attackerId: attacker.id,
            targetId: target.id,
            hit: false,
            targetKilled: false,
            cascadeKilledIds: [],
        } as RangedAttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(resetSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it("does nothing when attacker is not found", async () => {
        const { board, target } = makeFakeRangedBoard();
        (board as any).getPiece = vi.fn((id: number) =>
            id === target.id ? target : null
        );
        const resetSpy = (board as any)._rangeGizmo.reset as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.RangedAttackPieceBatch, {
            attackerId: 999,
            targetId: target.id,
            hit: false,
            targetKilled: false,
            cascadeKilledIds: [],
        } as RangedAttackPieceBatchPayload);

        await board.animationQueue.idle();

        expect(resetSpy).not.toHaveBeenCalled();
    });
});

// Visual reaction - MountPieceBatch
// ────────────────────────────────────────────────────────────────────────────

describe("Visual reaction - MountPieceBatch", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Build a minimal fake client Board that has enough state to exercise
     * the MountPieceBatch subscriber and _animateMountPieceBatch handler
     * without instantiating Phaser. Only the fields touched by the handler
     * are populated.
     */
    function makeFakeMountBoard(): {
        board: Board;
        wizard: {
            id: number;
            position: { x: number; y: number };
            moveTo: ReturnType<typeof vi.fn>;
        };
        mount: {
            id: number;
            position: { x: number; y: number };
        };
    } {
        const fake = Object.create(Board.prototype) as Board;

        const animationQueue = new AnimationQueue();
        (fake as any)._animationQueue = animationQueue;

        // Real EventEmitter so the subscription and emit round-trip works.
        const emitter = new EventEmitter();
        (fake as any)._boardEvents = emitter;

        const wizard = {
            id: 10,
            position: { x: 0, y: 0 },
            moveTo: vi.fn((_pt: { x: number; y: number }) => Promise.resolve()),
        };

        const mount = {
            id: 20,
            position: { x: 1, y: 0 },
        };

        (fake as any).getPiece = vi.fn((id: number) => {
            if (id === wizard.id) return wizard;
            if (id === mount.id) return mount;
            return null;
        });

        (fake as any)._sound = {
            play: vi.fn(),
            playAsync: vi.fn(() => Promise.resolve()),
        };
        (fake as any)._rangeGizmo = { reset: vi.fn(() => Promise.resolve()) };
        (fake as any).emitBoardUpdateEvent = vi.fn();

        // Wire the subscriber the same way the constructor does.
        emitter.on(EngineEvent.MountPieceBatch, (payload: MountPieceBatchPayload) => {
            animationQueue.enqueue(async () => {
                await (fake as any)._animateMountPieceBatch(payload);
            });
        });

        return { board: fake, wizard, mount };
    }

    it("walks the approach path via wizard.moveTo", async () => {
        const { board, wizard, mount } = makeFakeMountBoard();
        const moveToSpy = vi.spyOn(wizard, "moveTo");

        (board as any).events.emit(EngineEvent.MountPieceBatch, {
            wizardId: wizard.id,
            mountId: mount.id,
            path: [{ x: 1, y: 0 }],
        } as MountPieceBatchPayload);

        await board.animationQueue.idle();

        expect(moveToSpy).toHaveBeenCalledTimes(1);
        expect(moveToSpy.mock.calls[0][0]).toEqual({ x: 1, y: 0 });
    });

    it("plays the step sound at the first approach step", async () => {
        const { board, wizard, mount } = makeFakeMountBoard();
        const soundPlay = (board as any)._sound.play as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.MountPieceBatch, {
            wizardId: wizard.id,
            mountId: mount.id,
            path: [{ x: 1, y: 0 }],
        } as MountPieceBatchPayload);

        await board.animationQueue.idle();

        expect(soundPlay).toHaveBeenCalledWith("step");
    });

    it("does not call moveTo when path is empty", async () => {
        const { board, wizard, mount } = makeFakeMountBoard();

        // Put the wizard already on the mount's tile.
        wizard.position = { x: 1, y: 0 };
        const moveToSpy = vi.spyOn(wizard, "moveTo");

        (board as any).events.emit(EngineEvent.MountPieceBatch, {
            wizardId: wizard.id,
            mountId: mount.id,
            path: [],
        } as MountPieceBatchPayload);

        await board.animationQueue.idle();

        expect(moveToSpy).not.toHaveBeenCalled();
    });

    it("resets the rangeGizmo and emits board update after animation", async () => {
        const { board, wizard, mount } = makeFakeMountBoard();
        const resetSpy = (board as any)._rangeGizmo.reset as ReturnType<typeof vi.fn>;
        const updateSpy = (board as any).emitBoardUpdateEvent as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.MountPieceBatch, {
            wizardId: wizard.id,
            mountId: mount.id,
            path: [],
        } as MountPieceBatchPayload);

        await board.animationQueue.idle();

        expect(resetSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it("does nothing when wizard is not found", async () => {
        const { board, mount } = makeFakeMountBoard();
        (board as any).getPiece = vi.fn((id: number) =>
            id === mount.id ? mount : null
        );
        const resetSpy = (board as any)._rangeGizmo.reset as ReturnType<typeof vi.fn>;

        (board as any).events.emit(EngineEvent.MountPieceBatch, {
            wizardId: 999,
            mountId: mount.id,
            path: [],
        } as MountPieceBatchPayload);

        await board.animationQueue.idle();

        expect(resetSpy).not.toHaveBeenCalled();
    });
});
