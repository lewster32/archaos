import {
    CursorType,
    ActionType,
    BoardState,
    InputType,
    Colour,
} from "@archaos/engine";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Cursor } from "./cursor";
import { Math as PMath } from "phaser";
import type { Board } from "./board";

// ─── Pointer/tile coordinate helpers ─────────────────────────────────────────
//
// Board.DEFAULT_CELLSIZE = 14 (see board.ts).  The Cursor.translateCursorPosition
// formula maps a screen-space pointer to an integer board tile.  Use these
// pre-computed values so tests that exercise in-bounds code paths are not
// blocked by the bounds guard.
//
//   pointerForTile(tx, ty) gives the pointer coordinates that translate exactly
//   to board tile (tx, ty) when cameras.main.scrollX=-400 and scrollY=-42.
//
// Key values (verified by running the formula in isolation):
//   tile (5,5)  →  pointer (400, 126)
//   tile (5,6)  →  pointer (386, 133)   dy=+1 dx=0  (from 5,5 → DownLeft)
//   tile (6,5)  →  pointer (414, 133)   dy=0  dx=+1 (from 5,5 → DownRight)
//   tile (6,6)  →  pointer (400, 140)   dy=+1 dx=+1 (from 5,5 → Down)
//   tile (4,4)  →  pointer (400, 112)   dy=-1 dx=-1 (from 5,5 → Up)

/** Pointer position that maps to board tile (5,5). Safe in-bounds default. */
const IN_BOUNDS_POINTER = { x: 400, y: 126 };

/** Pointer position that maps to tile (0,0) — i.e. out-of-bounds negative */
// With scrollX=-400, scrollY=-42: pointer (0,0) → tile far negative
const OUT_OF_BOUNDS_POINTER = { x: 0, y: 0 };

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Minimal stub for the Phaser Image object that Cursor stores as `_image`.
 * All methods called by Cursor must be present.
 */
function makeMockImage() {
    return {
        setOrigin: vi.fn().mockReturnThis(),
        setFrame: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setVisible: vi.fn().mockReturnThis(),
        setFlipX: vi.fn().mockReturnThis(),
        x: 0,
        y: 0,
    };
}

/**
 * Build a fully-stubbed Board that satisfies every call made by the Cursor
 * constructor, `update()`, and `action()`.
 *
 * Individual tests can override any top-level property via `overrides`.
 */
function makeMockBoard(overrides: Record<string, unknown> = {}): Board {
    const image = makeMockImage();
    const layer = { add: vi.fn() };

    const board = {
        // --- Phaser scene stub ---
        scene: {
            add: {
                image: vi.fn().mockReturnValue(image),
            },
            input: {
                on: vi.fn(),
                activePointer: {
                    position: { ...IN_BOUNDS_POINTER },
                },
                keyboard: {
                    on: vi.fn(),
                },
            },
            cameras: {
                main: { x: 0, scrollX: -400, scrollY: -42 },
            },
            game: {
                events: { on: vi.fn() },
                scale: { width: 800 },
            },
        },
        // --- Board API ---
        needsPanning: false,
        getLayer: vi.fn().mockReturnValue(layer),
        state: BoardState.Idle,
        busy: false,
        stateManager: { evaluate: vi.fn() },
        width: 16,
        height: 16,
        selected: null,
        rules: {
            processIntent: vi.fn().mockResolvedValue(ActionType.None),
            processAction: vi.fn().mockResolvedValue(ActionType.None),
        },
        getIsoPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
        getAdjacentPiecesAtPosition: vi.fn().mockReturnValue([]),
        rangeGizmo: {
            showPath: vi.fn(),
            showSimpleRange: vi.fn().mockResolvedValue(undefined),
        },
        highlightOwnedUnitsForPlayerIndex: vi.fn(),
        sound: { play: vi.fn() },
        logger: { log: vi.fn() },
        deselectPiece: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    } as unknown as Board;

    return board;
}

/**
 * Convenience factory: creates a Cursor backed by a fresh mock board with
 * the pointer already at `IN_BOUNDS_POINTER`.
 */
function makeCursor(boardOverrides: Record<string, unknown> = {}) {
    const board = makeMockBoard(boardOverrides);
    const cursor = new Cursor(board);
    return { cursor, board };
}

/** Helper to get the image stub that the cursor holds internally. */
function getImage(board: Board) {
    return (board.scene.add.image as ReturnType<typeof vi.fn>).mock.results[0]
        .value;
}

/**
 * Build a minimal selected-piece stub with all properties accessed by the
 * Move branch of `update()` — needed whenever `processIntent` is mocked to
 * return `ActionType.Move` (which `action()` triggers internally via its own
 * `update(true)` call).
 *
 * Override individual fields by spreading after the call:
 *   `{ ...makeMovePiece(), moved: true, canAttack: true }`
 */
function makeMovePiece(extra: Record<string, unknown> = {}) {
    return {
        position: new PMath.Vector2(5, 5),
        hasStatus: vi.fn().mockReturnValue(false),
        currentMount: null,
        canEngagePiece: vi.fn().mockReturnValue(false),
        // Post-move state used by action()
        moved: false,
        canAttack: false,
        canRangedAttack: false,
        turnOver: false,
        currentRider: null,
        ...extra,
    };
}

// ─── Timer control ────────────────────────────────────────────────────────────
//
// The Cursor constructor fires `setTimeout(async () => update(true), 0)` to
// prime the cursor after the first render tick.  In unit tests this deferred
// call leaks across test boundaries and can crash when a piece stub from a
// different test is still held in the closure (e.g. missing `hasStatus`).
//
// Using fake timers suppresses all real setTimeout calls.  Each test that
// wants to exercise the deferred update can opt-in by calling
// `vi.runAllTimers()` or `vi.advanceTimersByTime(0)` explicitly.
beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

// ─── Static API ───────────────────────────────────────────────────────────────

describe("Cursor static constants", () => {
    it('CANCEL_KEY is "Escape"', () => {
        expect(Cursor.CANCEL_KEY).toBe("Escape");
    });

    it("OFFSET is at (0, 0)", () => {
        expect(Cursor.OFFSET.x).toBe(0);
        expect(Cursor.OFFSET.y).toBe(0);
    });

    it("DIRECTION_MAP has exactly 8 entries", () => {
        expect(Object.keys(Cursor.DIRECTION_MAP)).toHaveLength(8);
    });

    it('DIRECTION_MAP maps "0,1" to CursorType.DownLeft', () => {
        expect(Cursor.DIRECTION_MAP["0,1"]).toBe(CursorType.DownLeft);
    });

    it('DIRECTION_MAP maps "1,1" to CursorType.Down', () => {
        expect(Cursor.DIRECTION_MAP["1,1"]).toBe(CursorType.Down);
    });

    it('DIRECTION_MAP maps "1,0" to CursorType.DownRight', () => {
        expect(Cursor.DIRECTION_MAP["1,0"]).toBe(CursorType.DownRight);
    });

    it('DIRECTION_MAP maps "1,-1" to CursorType.Right', () => {
        expect(Cursor.DIRECTION_MAP["1,-1"]).toBe(CursorType.Right);
    });

    it('DIRECTION_MAP maps "0,-1" to CursorType.UpRight', () => {
        expect(Cursor.DIRECTION_MAP["0,-1"]).toBe(CursorType.UpRight);
    });

    it('DIRECTION_MAP maps "-1,-1" to CursorType.Up', () => {
        expect(Cursor.DIRECTION_MAP["-1,-1"]).toBe(CursorType.Up);
    });

    it('DIRECTION_MAP maps "-1,0" to CursorType.UpLeft', () => {
        expect(Cursor.DIRECTION_MAP["-1,0"]).toBe(CursorType.UpLeft);
    });

    it('DIRECTION_MAP maps "-1,1" to CursorType.Left', () => {
        expect(Cursor.DIRECTION_MAP["-1,1"]).toBe(CursorType.Left);
    });
});

// ─── getCursorAngle ───────────────────────────────────────────────────────────

describe("Cursor.getCursorAngle", () => {
    it("returns CursorType.DownRight for angle 0 (start direction)", () => {
        expect(Cursor.getCursorAngle(0)).toBe(CursorType.DownRight);
    });

    it("returns CursorType.DownRight for angle 8 (wraps back to start)", () => {
        expect(Cursor.getCursorAngle(8)).toBe(CursorType.DownRight);
    });

    it("returns CursorType.Down for angle 1", () => {
        expect(Cursor.getCursorAngle(1)).toBe(CursorType.Down);
    });

    it("returns CursorType.DownLeft for angle 2", () => {
        expect(Cursor.getCursorAngle(2)).toBe(CursorType.DownLeft);
    });

    it("returns CursorType.Left for angle 3", () => {
        expect(Cursor.getCursorAngle(3)).toBe(CursorType.Left);
    });

    it("returns CursorType.UpLeft for angle 4", () => {
        expect(Cursor.getCursorAngle(4)).toBe(CursorType.UpLeft);
    });

    it("returns CursorType.Up for angle 5", () => {
        expect(Cursor.getCursorAngle(5)).toBe(CursorType.Up);
    });

    it("returns CursorType.UpRight for angle 6", () => {
        expect(Cursor.getCursorAngle(6)).toBe(CursorType.UpRight);
    });

    it("returns CursorType.Right for angle 7", () => {
        expect(Cursor.getCursorAngle(7)).toBe(CursorType.Right);
    });

    it("returns CursorType.Idle for an out-of-range positive angle", () => {
        expect(Cursor.getCursorAngle(9)).toBe(CursorType.Idle);
        expect(Cursor.getCursorAngle(100)).toBe(CursorType.Idle);
    });

    it("returns CursorType.Idle for a negative angle", () => {
        expect(Cursor.getCursorAngle(-1)).toBe(CursorType.Idle);
    });

    it("returns CursorType.DownRight when no argument is supplied (default = 0)", () => {
        expect(Cursor.getCursorAngle()).toBe(CursorType.DownRight);
    });
});

// ─── getMovementDirectionType ─────────────────────────────────────────────────

describe("Cursor.getMovementDirectionType", () => {
    it("returns DownLeft for dy=+1, dx=0", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(5, 5),
                new PMath.Vector2(5, 6),
            ),
        ).toBe(CursorType.DownLeft);
    });

    it("returns Down for dy=+1, dx=+1", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(5, 5),
                new PMath.Vector2(6, 6),
            ),
        ).toBe(CursorType.Down);
    });

    it("returns DownRight for dy=0, dx=+1", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(5, 5),
                new PMath.Vector2(6, 5),
            ),
        ).toBe(CursorType.DownRight);
    });

    it("returns Right for dy=-1, dx=+1", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(5, 5),
                new PMath.Vector2(6, 4),
            ),
        ).toBe(CursorType.Right);
    });

    it("returns UpRight for dy=-1, dx=0", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(5, 5),
                new PMath.Vector2(5, 4),
            ),
        ).toBe(CursorType.UpRight);
    });

    it("returns Up for dy=-1, dx=-1", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(5, 5),
                new PMath.Vector2(4, 4),
            ),
        ).toBe(CursorType.Up);
    });

    it("returns UpLeft for dy=0, dx=-1", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(5, 5),
                new PMath.Vector2(4, 5),
            ),
        ).toBe(CursorType.UpLeft);
    });

    it("returns Left for dy=+1, dx=-1", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(5, 5),
                new PMath.Vector2(4, 6),
            ),
        ).toBe(CursorType.Left);
    });

    it("clamps large positive deltas to unit steps — (0,0) to (10,10) → Down", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(0, 0),
                new PMath.Vector2(10, 10),
            ),
        ).toBe(CursorType.Down);
    });

    it("clamps large negative deltas — (10,10) to (0,0) → Up", () => {
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(10, 10),
                new PMath.Vector2(0, 0),
            ),
        ).toBe(CursorType.Up);
    });

    it("returns CursorType.Invalid when from and to are the same tile (0,0 delta)", () => {
        // "0,0" is not a key in DIRECTION_MAP so the nullish fallback gives Invalid
        expect(
            Cursor.getMovementDirectionType(
                new PMath.Vector2(5, 5),
                new PMath.Vector2(5, 5),
            ),
        ).toBe(CursorType.Invalid);
    });
});

// ─── Constructor & basic accessors ───────────────────────────────────────────

describe("Cursor constructor", () => {
    it("creates an instance without throwing", () => {
        expect(() => makeCursor()).not.toThrow();
    });

    it('requests an image from scene.add.image with the "cursors" texture', () => {
        const { board } = makeCursor();
        expect(board.scene.add.image).toHaveBeenCalledWith(
            0,
            0,
            "cursors",
            "idle",
        );
    });

    it("adds the cursor image to the layer returned by getLayer", () => {
        const { board } = makeCursor();
        const layer = (board.getLayer as ReturnType<typeof vi.fn>).mock
            .results[0].value;
        expect(layer.add).toHaveBeenCalled();
    });

    it('registers a "pointerdown" listener on scene.input', () => {
        const { board } = makeCursor();
        const calls = (board.scene.input.on as ReturnType<typeof vi.fn>).mock
            .calls;
        expect(calls.some((c: unknown[]) => c[0] === "pointerdown")).toBe(true);
    });

    it('registers a "pointermove" listener on scene.input', () => {
        const { board } = makeCursor();
        const calls = (board.scene.input.on as ReturnType<typeof vi.fn>).mock
            .calls;
        expect(calls.some((c: unknown[]) => c[0] === "pointermove")).toBe(true);
    });

    it('registers a "pointerup" listener on scene.input', () => {
        const { board } = makeCursor();
        const calls = (board.scene.input.on as ReturnType<typeof vi.fn>).mock
            .calls;
        expect(calls.some((c: unknown[]) => c[0] === "pointerup")).toBe(true);
    });

    it('registers a "keyup" listener on scene.input.keyboard', () => {
        const { board } = makeCursor();
        const calls = (
            board.scene.input.keyboard.on as ReturnType<typeof vi.fn>
        ).mock.calls;
        expect(calls.some((c: unknown[]) => c[0] === "keyup")).toBe(true);
    });

    it("registers a listener on scene.game.events for the cancel event", () => {
        const { board } = makeCursor();
        expect(board.scene.game.events.on).toHaveBeenCalled();
    });

    it("starts enabled by default", () => {
        const { cursor } = makeCursor();
        expect(cursor.enabled).toBe(true);
    });

    it("initial cursor type is Idle", () => {
        const { cursor } = makeCursor();
        expect(cursor.type).toBe(CursorType.Idle);
    });

    it("initial position is (0, 0)", () => {
        const { cursor } = makeCursor();
        expect(cursor.position.x).toBe(0);
        expect(cursor.position.y).toBe(0);
    });
});

// ─── enabled getter / setter ──────────────────────────────────────────────────

describe("Cursor.enabled", () => {
    it("can be set to false", () => {
        const { cursor } = makeCursor();
        cursor.enabled = false;
        expect(cursor.enabled).toBe(false);
    });

    it("can be toggled back to true after being disabled", () => {
        const { cursor } = makeCursor();
        cursor.enabled = false;
        cursor.enabled = true;
        expect(cursor.enabled).toBe(true);
    });
});

// ─── type getter / setter ─────────────────────────────────────────────────────

describe("Cursor.type setter/getter", () => {
    it("returns the type that was set", () => {
        const { cursor } = makeCursor();
        cursor.type = CursorType.Attack;
        expect(cursor.type).toBe(CursorType.Attack);
    });

    it("calls setFrame with the cursor type string", () => {
        const { cursor, board } = makeCursor();
        const image = getImage(board);
        cursor.type = CursorType.Cast;
        expect(image.setFrame).toHaveBeenCalledWith(CursorType.Cast);
    });

    it("sets depth to (y - 8) when type is Idle", () => {
        const { cursor, board } = makeCursor();
        const image = getImage(board);
        image.y = 100;
        cursor.type = CursorType.Idle;
        expect(image.setDepth).toHaveBeenCalledWith(92); // 100 - 8
    });

    it("sets depth to (y + 8) when type is Attack (non-Idle)", () => {
        const { cursor, board } = makeCursor();
        const image = getImage(board);
        image.y = 100;
        cursor.type = CursorType.Attack;
        expect(image.setDepth).toHaveBeenCalledWith(108); // 100 + 8
    });

    it("setting each defined CursorType does not throw", () => {
        const { cursor } = makeCursor();
        for (const t of Object.values(CursorType)) {
            expect(() => {
                cursor.type = t;
            }).not.toThrow();
        }
    });
});

// ─── position getter ──────────────────────────────────────────────────────────

describe("Cursor.position", () => {
    it("returns a PMath.Vector2 instance", () => {
        const { cursor } = makeCursor();
        expect(cursor.position).toBeInstanceOf(PMath.Vector2);
    });

    it("returns the same object reference on successive calls (no copy)", () => {
        const { cursor } = makeCursor();
        expect(cursor.position).toBe(cursor.position);
    });
});

// ─── update() — guard clauses ─────────────────────────────────────────────────

describe("Cursor.update()", () => {
    it("returns ActionType.None immediately when cursor is disabled", async () => {
        const { cursor } = makeCursor();
        cursor.enabled = false;
        expect(await cursor.update()).toBe(ActionType.None);
    });

    it("returns ActionType.None immediately when board is busy", async () => {
        const board = makeMockBoard({ busy: true });
        const cursor = new Cursor(board);
        expect(await cursor.update()).toBe(ActionType.None);
    });

    it("does not call processIntent when cursor is disabled", async () => {
        const { cursor, board } = makeCursor();
        cursor.enabled = false;
        await cursor.update();
        expect(board.rules.processIntent).not.toHaveBeenCalled();
    });

    it("does not call processIntent when board is busy", async () => {
        const board = makeMockBoard({ busy: true });
        const cursor = new Cursor(board);
        await cursor.update();
        expect(board.rules.processIntent).not.toHaveBeenCalled();
    });

    it("returns ActionType.None and hides the image when pointer is out of bounds", async () => {
        // OUT_OF_BOUNDS_POINTER (0,0) translates to a tile with very negative coords
        const board = makeMockBoard();
        (board.scene.input as any).activePointer.position = {
            ...OUT_OF_BOUNDS_POINTER,
        };
        const cursor = new Cursor(board);

        const result = await cursor.update(true);

        expect(result).toBe(ActionType.None);
        expect(getImage(board).setVisible).toHaveBeenCalledWith(false);
    });

    it("does not call processIntent when pointer is out of bounds", async () => {
        const board = makeMockBoard();
        (board.scene.input as any).activePointer.position = {
            ...OUT_OF_BOUNDS_POINTER,
        };
        const cursor = new Cursor(board);
        await cursor.update(true);
        expect(board.rules.processIntent).not.toHaveBeenCalled();
    });

    it("skips the intent check on the second call to the same tile without force", async () => {
        // First call (non-forced) sets position; second call to same tile is a no-op
        const board = makeMockBoard();
        (board.scene.input as any).activePointer.position = {
            ...IN_BOUNDS_POINTER,
        };
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Idle);
        const cursor = new Cursor(board);

        await cursor.update(); // sets position to (5,5); calls processIntent
        const callsAfterFirst = (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mock.calls.length;

        await cursor.update(); // same pointer → same tile → no-op
        expect(
            (board.rules.processIntent as ReturnType<typeof vi.fn>).mock.calls
                .length,
        ).toBe(callsAfterFirst);
    });

    it("calls processIntent again when force=true even if position has not changed", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Idle);
        const cursor = new Cursor(board);

        await cursor.update(true);
        await cursor.update(true);

        expect(
            (board.rules.processIntent as ReturnType<typeof vi.fn>).mock.calls
                .length,
        ).toBe(2);
    });

    // ─── switch branches when processIntent returns a non-None action ─────────

    it("hides the image and returns ActionType.None when processIntent returns ActionType.None", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.None);

        const cursor = new Cursor(board);
        const result = await cursor.update(true);

        expect(result).toBe(ActionType.None);
        expect(getImage(board).setVisible).toHaveBeenCalledWith(false);
    });

    it("sets cursor type to Idle when processIntent returns ActionType.Idle", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Idle);

        const cursor = new Cursor(board);
        await cursor.update(true);

        expect(cursor.type).toBe(CursorType.Idle);
    });

    it("returns ActionType.Idle when processIntent returns ActionType.Idle", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Idle);

        const cursor = new Cursor(board);
        const result = await cursor.update(true);

        expect(result).toBe(ActionType.Idle);
    });

    it("sets cursor type to Info when processIntent returns ActionType.Info", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Info);

        const cursor = new Cursor(board);
        await cursor.update(true);

        expect(cursor.type).toBe(CursorType.Info);
    });

    it("sets cursor type to Invalid when processIntent returns ActionType.Invalid", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Invalid);

        const cursor = new Cursor(board);
        await cursor.update(true);

        expect(cursor.type).toBe(CursorType.Invalid);
    });

    it("sets cursor type to Select when processIntent returns ActionType.Select", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Select);

        const cursor = new Cursor(board);
        await cursor.update(true);

        expect(cursor.type).toBe(CursorType.Select);
    });

    it("sets cursor type to Cast when processIntent returns ActionType.Cast", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Cast);

        const cursor = new Cursor(board);
        await cursor.update(true);

        expect(cursor.type).toBe(CursorType.Cast);
    });

    it("sets cursor type to RangedAttack when processIntent returns ActionType.RangedAttack", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.RangedAttack);

        const cursor = new Cursor(board);
        await cursor.update(true);

        expect(cursor.type).toBe(CursorType.RangedAttack);
    });

    it("sets cursor type to Dismount when processIntent returns ActionType.Dismount", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Dismount);

        const cursor = new Cursor(board);
        await cursor.update(true);

        expect(cursor.type).toBe(CursorType.Dismount);
    });

    // ─── Image position is updated after processing ───────────────────────────

    it("assigns isoPosition coordinates to the image after a successful update", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Idle);
        (board.getIsoPosition as ReturnType<typeof vi.fn>).mockReturnValue({
            x: 42,
            y: 84,
        });

        const cursor = new Cursor(board);
        await cursor.update(true);

        const image = getImage(board);
        expect(image.x).toBe(42 + Cursor.OFFSET.x);
        expect(image.y).toBe(84 + Cursor.OFFSET.y);
    });

    // ─── ActionType.Move branch ───────────────────────────────────────────────

    describe("ActionType.Move branch", () => {
        it("does not throw when processIntent returns Move but board.selected is null", async () => {
            const board = makeMockBoard({ selected: null });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Move);

            const cursor = new Cursor(board);
            await expect(cursor.update(true)).resolves.toBe(ActionType.Move);
        });

        it("shows Warning cursor when an adjacent piece can be engaged", async () => {
            const neighbour = { canEngagePiece: vi.fn().mockReturnValue(true) };
            const selectedPiece = {
                position: new PMath.Vector2(5, 5),
                hasStatus: vi.fn().mockReturnValue(false),
                currentMount: null,
                canEngagePiece: vi.fn().mockReturnValue(true),
            };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Move);
            (
                board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>
            ).mockReturnValue([neighbour]);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(cursor.type).toBe(CursorType.Warning);
        });

        it("calls rangeGizmo.showPath when the Move action is processed", async () => {
            const neighbour = {
                canEngagePiece: vi.fn().mockReturnValue(false),
            };
            const selectedPiece = {
                position: new PMath.Vector2(5, 5),
                hasStatus: vi.fn().mockReturnValue(false),
                currentMount: null,
                canEngagePiece: vi.fn().mockReturnValue(false),
            };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Move);
            (
                board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>
            ).mockReturnValue([neighbour]);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(board.rangeGizmo.showPath).toHaveBeenCalled();
        });

        it("shows Fly cursor when selected piece has Flying status and no engageable neighbours", async () => {
            const selectedPiece = {
                position: new PMath.Vector2(5, 5),
                hasStatus: vi.fn().mockReturnValue(true), // Flying is true
                currentMount: null,
                canEngagePiece: vi.fn().mockReturnValue(false),
            };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Move);
            (
                board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>
            ).mockReturnValue([]);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(cursor.type).toBe(CursorType.Fly);
        });

        it("shows Dismount cursor when selected piece has a currentMount but no Flying status", async () => {
            const selectedPiece = {
                position: new PMath.Vector2(5, 5),
                hasStatus: vi.fn().mockReturnValue(false), // no Flying
                currentMount: { id: 99 }, // has a mount
                canEngagePiece: vi.fn().mockReturnValue(false),
            };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Move);
            (
                board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>
            ).mockReturnValue([]);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(cursor.type).toBe(CursorType.Dismount);
        });

        it("shows a directional cursor when selected piece has no special conditions", async () => {
            // Piece is at tile (4,4); cursor lands at (5,5) → dx=+1, dy=+1 → Down
            const selectedPiece = {
                position: new PMath.Vector2(4, 4),
                hasStatus: vi.fn().mockReturnValue(false),
                currentMount: null,
                canEngagePiece: vi.fn().mockReturnValue(false),
            };
            const board = makeMockBoard({ selected: selectedPiece });
            // Pointer (400, 126) translates to tile (5,5)
            (board.scene.input as any).activePointer.position = {
                x: 400,
                y: 126,
            };
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Move);
            (
                board.getAdjacentPiecesAtPosition as ReturnType<typeof vi.fn>
            ).mockReturnValue([]);

            const cursor = new Cursor(board);
            await cursor.update(true);

            // dx = clamp(5-4, -1,1) = 1, dy = clamp(5-4, -1,1) = 1 → "1,1" → Down
            expect(cursor.type).toBe(CursorType.Down);
        });
    });

    // ─── ActionType.Mount branch ──────────────────────────────────────────────

    describe("ActionType.Mount branch", () => {
        it("calls rangeGizmo.showPath when selected piece movement > 1", async () => {
            const selectedPiece = {
                position: new PMath.Vector2(5, 5),
                stats: { movement: 2 },
            };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Mount);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(board.rangeGizmo.showPath).toHaveBeenCalled();
        });

        it("does not call rangeGizmo.showPath when selected piece movement is 1", async () => {
            const selectedPiece = {
                position: new PMath.Vector2(5, 5),
                stats: { movement: 1 },
            };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Mount);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(board.rangeGizmo.showPath).not.toHaveBeenCalled();
        });

        it("sets cursor type to Mount", async () => {
            const selectedPiece = {
                position: new PMath.Vector2(5, 5),
                stats: { movement: 1 },
            };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Mount);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(cursor.type).toBe(CursorType.Mount);
        });

        it("calls image.setFlipX based on relative isometric positions", async () => {
            const selectedPiece = {
                position: new PMath.Vector2(5, 5),
                stats: { movement: 1 },
            };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Mount);

            const cursor = new Cursor(board);
            await cursor.update(true);

            // setFlipX is called (regardless of the value) for the Mount action
            expect(getImage(board).setFlipX).toHaveBeenCalled();
        });
    });

    // ─── ActionType.Attack branch ─────────────────────────────────────────────

    describe("ActionType.Attack branch", () => {
        it("calls rangeGizmo.showPath when selected piece movement > 1", async () => {
            const selectedPiece = { stats: { movement: 3 } };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Attack);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(board.rangeGizmo.showPath).toHaveBeenCalled();
        });

        it("does not call rangeGizmo.showPath when selected piece movement is 1", async () => {
            const selectedPiece = { stats: { movement: 1 } };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Attack);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(board.rangeGizmo.showPath).not.toHaveBeenCalled();
        });

        it("sets cursor type to Attack", async () => {
            const selectedPiece = { stats: { movement: 1 } };
            const board = makeMockBoard({ selected: selectedPiece });
            (
                board.rules.processIntent as ReturnType<typeof vi.fn>
            ).mockResolvedValue(ActionType.Attack);

            const cursor = new Cursor(board);
            await cursor.update(true);

            expect(cursor.type).toBe(CursorType.Attack);
        });
    });
});

// ─── action() — guard clauses and dispatch ────────────────────────────────────

describe("Cursor.action()", () => {
    it("returns without calling processAction when cursor is disabled", async () => {
        const { cursor, board } = makeCursor();
        cursor.enabled = false;
        await cursor.action(InputType.Click);
        expect(board.rules.processAction).not.toHaveBeenCalled();
    });

    it("returns without calling processAction when board is busy", async () => {
        const board = makeMockBoard({ busy: true });
        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);
        expect(board.rules.processAction).not.toHaveBeenCalled();
    });

    it("calls processAction with the board, the intended action, and the input type", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Select);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.None);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        expect(board.rules.processAction).toHaveBeenCalledWith(
            board,
            ActionType.Select,
            InputType.Click,
        );
    });

    it("returns early after processAction returns ActionType.None — deselectPiece is not called", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Select);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.None);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        expect(board.deselectPiece).not.toHaveBeenCalled();
    });

    it("does not call sound.play when no piece is selected after processAction", async () => {
        const board = makeMockBoard({ selected: null });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Select);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Select);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        expect(board.sound.play).not.toHaveBeenCalled();
    });

    it("does not call deselectPiece when selected piece has not moved", async () => {
        const selectedPiece = makeMovePiece({ moved: false });
        const board = makeMockBoard({ selected: selectedPiece });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        expect(board.deselectPiece).not.toHaveBeenCalled();
    });

    it("sets turnOver and calls deselectPiece when piece has moved, no rider, and cannot attack", async () => {
        const selectedPiece = makeMovePiece({ moved: true });
        const board = makeMockBoard({ selected: selectedPiece });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        expect(selectedPiece.turnOver).toBe(true);
        expect(board.deselectPiece).toHaveBeenCalled();
    });

    it("returns early without deselectPiece when piece has moved and canAttack is true", async () => {
        const selectedPiece = makeMovePiece({ moved: true, canAttack: true });
        const board = makeMockBoard({ selected: selectedPiece });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        expect(board.deselectPiece).not.toHaveBeenCalled();
        expect(selectedPiece.turnOver).toBe(false);
    });

    it("plays ranged-select sound and calls showSimpleRange when piece has moved and canRangedAttack", async () => {
        const selectedPiece = makeMovePiece({
            moved: true,
            canRangedAttack: true,
            name: "Archer",
            position: new PMath.Vector2(3, 3),
            stats: { range: 4 },
        });
        const board = makeMockBoard({ selected: selectedPiece });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        expect(board.sound.play).toHaveBeenCalledWith("ranged-select");
        expect(board.rangeGizmo.showSimpleRange).toHaveBeenCalledWith(
            selectedPiece.position,
            4,
            CursorType.RangeRangedAttack,
            true,
        );
    });

    it("logs the ranged-attack message with Yellow colour when canRangedAttack", async () => {
        const selectedPiece = makeMovePiece({
            moved: true,
            canRangedAttack: true,
            name: "Legolas",
            position: new PMath.Vector2(3, 3),
            stats: { range: 4 },
        });
        const board = makeMockBoard({ selected: selectedPiece });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        expect(board.logger.log).toHaveBeenCalledWith(
            "Legolas's turn to ranged attack",
            Colour.Yellow,
        );
    });

    it("does not deselect when piece has moved but its rider has not yet moved", async () => {
        const rider = { moved: false };
        const selectedPiece = makeMovePiece({
            moved: true,
            currentRider: rider,
        });
        const board = makeMockBoard({ selected: selectedPiece });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        // rider has not moved, so the inner guard "!selected.currentRider || selected.currentRider.moved" is false
        expect(board.deselectPiece).not.toHaveBeenCalled();
    });

    it("sets turnOver and deselectPiece when piece has moved and its rider has also moved", async () => {
        const rider = { moved: true };
        const selectedPiece = makeMovePiece({
            moved: true,
            currentRider: rider,
        });
        const board = makeMockBoard({ selected: selectedPiece });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Move);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Click);

        expect(selectedPiece.turnOver).toBe(true);
        expect(board.deselectPiece).toHaveBeenCalled();
    });

    it("passes InputType.Cancel through to processAction when action is called with Cancel", async () => {
        const board = makeMockBoard();
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.None);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.None);

        const cursor = new Cursor(board);
        await cursor.action(InputType.Cancel);

        expect(board.rules.processAction).toHaveBeenCalledWith(
            board,
            ActionType.None,
            InputType.Cancel,
        );
    });
});

// ─── Drag-to-pan ─────────────────────────────────────────────────────────────

describe("Cursor drag-to-pan", () => {
    /**
     * Helper to extract a registered scene.input.on handler by event name.
     */
    function getInputHandler(
        board: Board,
        eventName: string,
    ): (...args: unknown[]) => void {
        const calls = (board.scene.input.on as ReturnType<typeof vi.fn>).mock
            .calls;
        const match = calls.find((c: unknown[]) => c[0] === eventName);
        return match?.[1] as (...args: unknown[]) => void;
    }

    it("does not enter drag mode when panning is disabled", () => {
        const { board } = makeCursor({ needsPanning: false });

        const pointerdown = getInputHandler(board, "pointerdown");
        pointerdown({ position: { x: 100, y: 100 } });

        const pointermove = getInputHandler(board, "pointermove");
        pointermove({ position: { x: 200, y: 100 }, isDown: true });

        // scrollX should not have changed
        expect(board.scene.cameras.main.scrollX).toBe(-400);
    });

    it("enters drag mode when panning is enabled and delta exceeds threshold", () => {
        const { board } = makeCursor({ needsPanning: true });

        const pointerdown = getInputHandler(board, "pointerdown");
        pointerdown({ position: { x: 100, y: 100 } });

        const pointermove = getInputHandler(board, "pointermove");
        // Drag 50px to the left (delta exceeds DRAG_THRESHOLD of 5)
        pointermove({ position: { x: 50, y: 100 }, isDown: true });

        // scrollX should have shifted: startScrollX - dx = -400 - (50-100) = -400 + 50 = -350
        expect(board.scene.cameras.main.scrollX).toBe(-350);
    });

    it("does not call processIntent during a drag", () => {
        const { board } = makeCursor({ needsPanning: true });

        const pointerdown = getInputHandler(board, "pointerdown");
        pointerdown({ position: { x: 100, y: 100 } });

        const pointermove = getInputHandler(board, "pointermove");
        pointermove({ position: { x: 50, y: 100 }, isDown: true });

        // processIntent should not have been called by the drag pointermove
        expect(board.rules.processIntent).not.toHaveBeenCalled();
    });

    it("suppresses click action on pointerup after a drag", () => {
        const { board } = makeCursor({ needsPanning: true });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.Idle);

        const pointerdown = getInputHandler(board, "pointerdown");
        pointerdown({ position: { x: 100, y: 100 } });

        const pointermove = getInputHandler(board, "pointermove");
        pointermove({ position: { x: 50, y: 100 }, isDown: true });

        const pointerup = getInputHandler(board, "pointerup");
        pointerup();

        // processAction should NOT have been called — the drag swallowed the click
        expect(board.rules.processAction).not.toHaveBeenCalled();
    });

    it("fires normal click when pointer moves less than the drag threshold", async () => {
        const { board } = makeCursor({ needsPanning: true });
        (
            board.rules.processIntent as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.None);
        (
            board.rules.processAction as ReturnType<typeof vi.fn>
        ).mockResolvedValue(ActionType.None);

        const pointerdown = getInputHandler(board, "pointerdown");
        pointerdown({ position: { x: 100, y: 100 } });

        const pointermove = getInputHandler(board, "pointermove");
        // Move only 2px — below the 5px threshold
        pointermove({ position: { x: 102, y: 100 }, isDown: true });

        const pointerup = getInputHandler(board, "pointerup");
        await pointerup();

        // processAction SHOULD have been called — it was a tap, not a drag
        expect(board.rules.processAction).toHaveBeenCalled();
    });

    it("panningEnabled setter enables drag after construction", () => {
        const { cursor, board } = makeCursor({ needsPanning: false });

        // Initially panning is disabled — drag should not work
        const pointerdown = getInputHandler(board, "pointerdown");
        pointerdown({ position: { x: 100, y: 100 } });
        const pointermove = getInputHandler(board, "pointermove");
        pointermove({ position: { x: 50, y: 100 }, isDown: true });
        expect(board.scene.cameras.main.scrollX).toBe(-400);

        // Enable panning via setter (simulates viewport narrowing)
        cursor.panningEnabled = true;

        // Reset scrollX for clarity
        board.scene.cameras.main.scrollX = -400;
        pointerdown({ position: { x: 100, y: 100 } });
        pointermove({ position: { x: 50, y: 100 }, isDown: true });
        expect(board.scene.cameras.main.scrollX).toBe(-350);
    });

    it("panningEnabled setter disables drag after construction", () => {
        const { cursor, board } = makeCursor({ needsPanning: true });

        // Initially panning is enabled
        const pointerdown = getInputHandler(board, "pointerdown");
        pointerdown({ position: { x: 100, y: 100 } });
        const pointermove = getInputHandler(board, "pointermove");
        pointermove({ position: { x: 50, y: 100 }, isDown: true });
        expect(board.scene.cameras.main.scrollX).toBe(-350);

        // Disable panning via setter (simulates viewport widening)
        cursor.panningEnabled = false;

        board.scene.cameras.main.scrollX = -400;
        pointerdown({ position: { x: 100, y: 100 } });
        pointermove({ position: { x: 50, y: 100 }, isDown: true });
        expect(board.scene.cameras.main.scrollX).toBe(-400);
    });

    it("enters drag mode with vertical delta and updates scrollY", () => {
        const { board } = makeCursor({ needsPanning: true });

        const pointerdown = getInputHandler(board, "pointerdown");
        pointerdown({ position: { x: 100, y: 100 } });

        const pointermove = getInputHandler(board, "pointermove");
        // Drag 30px upward (negative dy, exceeds threshold)
        pointermove({ position: { x: 100, y: 70 }, isDown: true });

        // scrollY should shift: startScrollY - dy = -42 - (70-100) = -42 + 30 = -12
        expect(board.scene.cameras.main.scrollY).toBe(-12);
        // scrollX should be unchanged (no horizontal movement)
        expect(board.scene.cameras.main.scrollX).toBe(-400);
    });

    it("updates both scrollX and scrollY when dragging diagonally", () => {
        const { board } = makeCursor({ needsPanning: true });

        const pointerdown = getInputHandler(board, "pointerdown");
        pointerdown({ position: { x: 100, y: 100 } });

        const pointermove = getInputHandler(board, "pointermove");
        // Drag diagonally: 50px left, 30px up
        pointermove({ position: { x: 50, y: 70 }, isDown: true });

        // scrollX: -400 - (50-100) = -350
        expect(board.scene.cameras.main.scrollX).toBe(-350);
        // scrollY: -42 - (70-100) = -12
        expect(board.scene.cameras.main.scrollY).toBe(-12);
    });

    it("DRAG_THRESHOLD static constant is 5", () => {
        expect(Cursor.DRAG_THRESHOLD).toBe(5);
    });
});
