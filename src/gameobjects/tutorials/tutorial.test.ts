import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    Tutorial,
    TutorialStep,
    TutorialData,
    TutorialMessageEvent,
} from "./tutorial";
import type { Board } from "../board";
import { BoardEvent } from "../enums/boardevent";
import { EventType } from "../enums/eventtype";
import { Logger, _resetLoggerForTesting } from "../services/logger";
import { Events } from "phaser";

// ─── Concrete test implementations ─────────────────────────────────────────

/**
 * A minimal concrete TutorialStep that returns a configurable result from
 * checkCondition.
 */
class TestStep extends TutorialStep {
    conditionMet = false;

    checkCondition(
        _board: Board,
        _event?: BoardEvent,
        ..._args: any[]
    ): boolean {
        return this.conditionMet;
    }
}

/**
 * A concrete Tutorial subclass for testing the abstract base class.
 */
class TestTutorial extends Tutorial {
    started = false;
    ended = false;

    protected onStart(_board: Board): void {
        this.started = true;
    }

    protected onEnd(): void {
        this.ended = true;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockBoard(): Board {
    return {
        boardEvents: new Events.EventEmitter(),
        endGame: vi.fn(),
    } as unknown as Board;
}

let mockBoard: Board = createMockBoard();

function makeConfig(
    steps: TutorialStep[],
    overrides: Partial<TutorialData> = {},
): TutorialData {
    return {
        id: "test-tutorial",
        name: "Test Tutorial",
        description: "A test tutorial",
        intro: "<p>Welcome</p>",
        outro: "<p>Well done</p>",
        board: { width: 5, height: 5 },
        players: [],
        steps,
        phase: "casting",
        ...overrides,
    } as TutorialData;
}

/**
 * Auto-resolve any TutorialMessage events so async methods don't hang.
 * Returns a spy that captures emitted events for assertions.
 */
function autoResolveTutorialMessages() {
    const spy = vi.fn((event: TutorialMessageEvent) => {
        event.resolve();
    });
    Logger.getEventEmitter().on(EventType.TutorialMessage, spy);
    return spy;
}

type MessageSpy = ReturnType<typeof autoResolveTutorialMessages>;

function findMessage(spy: MessageSpy, type: string) {
    return spy.mock.calls.find((args) => args[0].type === type);
}

function filterMessages(spy: MessageSpy, type: string) {
    return spy.mock.calls.filter((args) => args[0].type === type);
}

// ─── TutorialStep ───────────────────────────────────────────────────────────

describe("TutorialStep", () => {
    describe("hint", () => {
        it("returns the hint text when provided", () => {
            const step = new TestStep("Click the spellbook");
            expect(step.hint).toBe("Click the spellbook");
        });

        it("returns an empty string when no hint is provided", () => {
            const step = new TestStep();
            expect(step.hint).toBe("");
        });

        it("returns an empty string when hint is explicitly undefined", () => {
            const step = new TestStep(undefined);
            expect(step.hint).toBe("");
        });
    });

    describe("checkCondition", () => {
        it("returns false when condition is not met", () => {
            const step = new TestStep("hint");
            step.conditionMet = false;
            expect(step.checkCondition(mockBoard)).toBe(false);
        });

        it("returns true when condition is met", () => {
            const step = new TestStep("hint");
            step.conditionMet = true;
            expect(step.checkCondition(mockBoard)).toBe(true);
        });
    });

    describe("lifecycle hooks", () => {
        it("does not have onEnter by default", () => {
            const step = new TestStep();
            expect(step.onEnter).toBeUndefined();
        });

        it("does not have onComplete by default", () => {
            const step = new TestStep();
            expect(step.onComplete).toBeUndefined();
        });

        it("calls onEnter when defined", () => {
            const step = new TestStep();
            step.onEnter = vi.fn();
            step.onEnter(mockBoard);
            expect(step.onEnter).toHaveBeenCalledWith(mockBoard);
        });

        it("calls onComplete when defined", () => {
            const step = new TestStep();
            step.onComplete = vi.fn();
            step.onComplete(mockBoard);
            expect(step.onComplete).toHaveBeenCalledWith(mockBoard);
        });
    });
});

// ─── Tutorial constructor ───────────────────────────────────────────────────

describe("Tutorial", () => {
    beforeEach(() => {
        mockBoard = createMockBoard();
    });

    afterEach(() => {
        _resetLoggerForTesting();
    });

    describe("constructor", () => {
        it("throws when config is null", () => {
            expect(() => new TestTutorial(null as any)).toThrow(
                "Tutorial config must include at least one step.",
            );
        });

        it("throws when config has no steps property", () => {
            const config = {
                id: "t",
                name: "T",
                description: "",
                intro: "",
                outro: "",
                board: { width: 5, height: 5 },
                players: [],
            } as any;
            expect(() => new TestTutorial(config)).toThrow(
                "Tutorial config must include at least one step.",
            );
        });

        it("throws when steps array is empty", () => {
            expect(() => new TestTutorial(makeConfig([]))).toThrow(
                "Tutorial config must include at least one step.",
            );
        });

        it("creates a tutorial with valid config", () => {
            const step = new TestStep("hint");
            const tutorial = new TestTutorial(makeConfig([step]));
            expect(tutorial).toBeInstanceOf(Tutorial);
        });
    });

    // ─── Config getters ─────────────────────────────────────────────────

    describe("config getters", () => {
        let tutorial: TestTutorial;
        let step: TestStep;

        beforeEach(() => {
            step = new TestStep("hint");
            tutorial = new TestTutorial(
                makeConfig([step], {
                    id: "basics",
                    name: "The Basics",
                    description: "Learn the basics",
                    intro: "<p>Welcome to Archaos</p>",
                    outro: "<p>Tutorial complete</p>",
                    order: 1,
                    nextTutorialId: "combat",
                    disableIllusions: true,
                }),
            );
        });

        it("returns the config object", () => {
            expect(tutorial.config.id).toBe("basics");
        });

        it("returns the name", () => {
            expect(tutorial.name).toBe("The Basics");
        });

        it("returns the description", () => {
            expect(tutorial.description).toBe("Learn the basics");
        });

        it("returns the intro", () => {
            expect(tutorial.intro).toBe("<p>Welcome to Archaos</p>");
        });

        it("returns the outro", () => {
            expect(tutorial.outro).toBe("<p>Tutorial complete</p>");
        });

        it("exposes optional config fields via config getter", () => {
            expect(tutorial.config.order).toBe(1);
            expect(tutorial.config.nextTutorialId).toBe("combat");
            expect(tutorial.config.disableIllusions).toBe(true);
        });
    });

    // ─── Steps and step index ───────────────────────────────────────────

    describe("steps", () => {
        it("returns steps as a readonly array", () => {
            const step1 = new TestStep("first");
            const step2 = new TestStep("second");
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            expect(tutorial.steps).toHaveLength(2);
            expect(tutorial.steps[0]).toBe(step1);
            expect(tutorial.steps[1]).toBe(step2);
        });

        it("does not share the same array reference as the config", () => {
            const steps = [new TestStep()];
            const config = makeConfig(steps);
            const tutorial = new TestTutorial(config);
            expect(tutorial.steps).not.toBe(config.steps);
        });

        it("starts at step index 0", () => {
            const tutorial = new TestTutorial(makeConfig([new TestStep()]));
            expect(tutorial.currentStepIndex).toBe(0);
        });

        it("currentStep returns the first step initially", () => {
            const step = new TestStep("first");
            const tutorial = new TestTutorial(makeConfig([step]));
            expect(tutorial.currentStep).toBe(step);
        });
    });

    // ─── isComplete ─────────────────────────────────────────────────────

    describe("isComplete", () => {
        it("is false when the tutorial has not started advancing", async () => {
            autoResolveTutorialMessages();
            const tutorial = new TestTutorial(
                makeConfig([new TestStep(), new TestStep()]),
            );
            await tutorial.start(mockBoard);
            expect(tutorial.isComplete).toBe(false);
        });

        it("is true after advancing past the last step", async () => {
            autoResolveTutorialMessages();
            const step = new TestStep();
            step.conditionMet = true;
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);
            await tutorial.advance();
            expect(tutorial.isComplete).toBe(true);
        });
    });

    // ─── advance() ──────────────────────────────────────────────────────

    describe("advance", () => {
        beforeEach(() => {
            autoResolveTutorialMessages();
        });

        it("returns false when the board is not set", async () => {
            const step = new TestStep();
            step.conditionMet = true;
            const tutorial = new TestTutorial(makeConfig([step]));
            // Don't call start() — _board remains null
            expect(await tutorial.advance()).toBe(false);
        });

        it("returns false when the current step condition is not met", async () => {
            const step = new TestStep();
            step.conditionMet = false;
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);
            expect(await tutorial.advance()).toBe(false);
            expect(tutorial.currentStepIndex).toBe(0);
        });

        it("returns true and advances when the condition is met", async () => {
            const step1 = new TestStep("first");
            const step2 = new TestStep("second");
            step1.conditionMet = true;
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            expect(await tutorial.advance()).toBe(true);
            expect(tutorial.currentStepIndex).toBe(1);
            expect(tutorial.currentStep).toBe(step2);
        });

        it("returns true and marks tutorial complete on the last step", async () => {
            const step = new TestStep();
            step.conditionMet = true;
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);

            expect(await tutorial.advance()).toBe(true);
            expect(tutorial.isComplete).toBe(true);
            expect(tutorial.currentStep).toBeNull();
        });

        it("returns false when the tutorial is already complete", async () => {
            const step = new TestStep();
            step.conditionMet = true;
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);

            await tutorial.advance(); // complete
            expect(await tutorial.advance()).toBe(false);
        });

        it("advances through multiple steps sequentially", async () => {
            const step1 = new TestStep("first");
            const step2 = new TestStep("second");
            const step3 = new TestStep("third");
            step1.conditionMet = true;
            step2.conditionMet = true;
            step3.conditionMet = true;
            const tutorial = new TestTutorial(
                makeConfig([step1, step2, step3]),
            );
            await tutorial.start(mockBoard);

            expect(await tutorial.advance()).toBe(true);
            expect(tutorial.currentStepIndex).toBe(1);

            expect(await tutorial.advance()).toBe(true);
            expect(tutorial.currentStepIndex).toBe(2);

            expect(await tutorial.advance()).toBe(true);
            expect(tutorial.isComplete).toBe(true);
        });

        it("only advances one step per call even if multiple are ready", async () => {
            const step1 = new TestStep();
            const step2 = new TestStep();
            step1.conditionMet = true;
            step2.conditionMet = true;
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            await tutorial.advance();
            expect(tutorial.currentStepIndex).toBe(1);
            expect(tutorial.isComplete).toBe(false);
        });
    });

    // ─── Lifecycle hooks ────────────────────────────────────────────────

    describe("lifecycle hooks", () => {
        beforeEach(() => {
            autoResolveTutorialMessages();
        });

        it("calls onComplete on the outgoing step when advancing", async () => {
            const step1 = new TestStep();
            step1.conditionMet = true;
            step1.onComplete = vi.fn();
            const step2 = new TestStep();
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            await tutorial.advance();

            expect(step1.onComplete).toHaveBeenCalledWith(mockBoard);
            expect(step1.onComplete).toHaveBeenCalledTimes(1);
        });

        it("calls onEnter on the incoming step when advancing", async () => {
            const step1 = new TestStep();
            step1.conditionMet = true;
            const step2 = new TestStep();
            step2.onEnter = vi.fn();
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            await tutorial.advance();

            expect(step2.onEnter).toHaveBeenCalledWith(mockBoard);
            expect(step2.onEnter).toHaveBeenCalledTimes(1);
        });

        it("calls onComplete before onEnter", async () => {
            const callOrder: string[] = [];
            const step1 = new TestStep();
            step1.conditionMet = true;
            step1.onComplete = vi.fn(() => callOrder.push("complete"));
            const step2 = new TestStep();
            step2.onEnter = vi.fn(() => callOrder.push("enter"));
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            await tutorial.advance();

            expect(callOrder).toEqual(["complete", "enter"]);
        });

        it("does not call onEnter when advancing completes the tutorial", async () => {
            const step = new TestStep();
            step.conditionMet = true;
            step.onComplete = vi.fn();
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);

            await tutorial.advance();

            expect(step.onComplete).toHaveBeenCalledTimes(1);
            // No next step to call onEnter on — just verify no error
            expect(tutorial.isComplete).toBe(true);
        });

        it("does not call hooks when condition is not met", async () => {
            const step1 = new TestStep();
            step1.conditionMet = false;
            step1.onComplete = vi.fn();
            const step2 = new TestStep();
            step2.onEnter = vi.fn();
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            await tutorial.advance();

            expect(step1.onComplete).not.toHaveBeenCalled();
            expect(step2.onEnter).not.toHaveBeenCalled();
        });

        it("works when steps have no lifecycle hooks defined", async () => {
            const step1 = new TestStep();
            step1.conditionMet = true;
            const step2 = new TestStep();
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            // Should not throw
            await expect(tutorial.advance()).resolves.toBe(true);
            expect(tutorial.currentStepIndex).toBe(1);
        });

        it("calls onEnter for the first step during start", async () => {
            const step = new TestStep();
            step.onEnter = vi.fn();
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);
            expect(step.onEnter).toHaveBeenCalledWith(mockBoard);
        });
    });

    // ─── start() and end() ──────────────────────────────────────────────

    describe("start and end", () => {
        beforeEach(() => {
            autoResolveTutorialMessages();
        });

        it("start sets the board and calls onStart", async () => {
            const tutorial = new TestTutorial(makeConfig([new TestStep()]));
            await tutorial.start(mockBoard);
            expect(tutorial.started).toBe(true);
        });

        it("end calls onEnd", async () => {
            const tutorial = new TestTutorial(makeConfig([new TestStep()]));
            await tutorial.start(mockBoard);
            tutorial.end();
            expect(tutorial.ended).toBe(true);
        });

        it("advance works after start has been called", async () => {
            const step = new TestStep();
            step.conditionMet = true;
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);
            expect(await tutorial.advance()).toBe(true);
        });
    });

    // ─── currentStep after completion ───────────────────────────────────

    describe("currentStep after completion", () => {
        beforeEach(() => {
            autoResolveTutorialMessages();
        });

        it("returns null when the tutorial is complete", async () => {
            const step = new TestStep();
            step.conditionMet = true;
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);
            await tutorial.advance();
            expect(tutorial.currentStep).toBeNull();
        });

        it("returns null for currentStep on a completed multi-step tutorial", async () => {
            const step1 = new TestStep();
            const step2 = new TestStep();
            step1.conditionMet = true;
            step2.conditionMet = true;
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);
            await tutorial.advance();
            await tutorial.advance();
            expect(tutorial.currentStep).toBeNull();
            expect(tutorial.currentStepIndex).toBe(2);
        });
    });

    // ─── Tutorial message events ────────────────────────────────────────

    describe("tutorial message events", () => {
        it("start emits an intro message", async () => {
            const spy = autoResolveTutorialMessages();
            const tutorial = new TestTutorial(
                makeConfig([new TestStep()], { intro: "<p>Hello!</p>" }),
            );
            await tutorial.start(mockBoard);

            const introCall = findMessage(spy, "intro");
            expect(introCall).toBeDefined();
            expect(introCall![0].text).toBe("<p>Hello!</p>");
            expect(introCall![0].title).toBe("Test Tutorial");
        });

        it("start emits a hint message for the first step", async () => {
            const spy = autoResolveTutorialMessages();
            const step = new TestStep("Do this first");
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);

            const hintCall = findMessage(spy, "hint");
            expect(hintCall).toBeDefined();
            expect(hintCall![0].text).toBe("Do this first");
        });

        it("start does not emit a hint when the first step has no hint", async () => {
            const spy = autoResolveTutorialMessages();
            const step = new TestStep(); // no hint
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);

            expect(filterMessages(spy, "hint")).toHaveLength(0);
        });

        it("advance emits a hint for the next step", async () => {
            const spy = autoResolveTutorialMessages();
            const step1 = new TestStep();
            step1.conditionMet = true;
            const step2 = new TestStep("Now do this");
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            spy.mockClear();
            await tutorial.advance();

            const hintCall = findMessage(spy, "hint");
            expect(hintCall).toBeDefined();
            expect(hintCall![0].text).toBe("Now do this");
        });

        it("advance emits an outro when the tutorial completes", async () => {
            const spy = autoResolveTutorialMessages();
            const step = new TestStep();
            step.conditionMet = true;
            const tutorial = new TestTutorial(
                makeConfig([step], { outro: "<p>Finished!</p>" }),
            );
            await tutorial.start(mockBoard);

            spy.mockClear();
            await tutorial.advance();

            const outroCall = findMessage(spy, "outro");
            expect(outroCall).toBeDefined();
            expect(outroCall![0].text).toBe("<p>Finished!</p>");
        });

        it("advance does not emit a hint when the next step has no hint", async () => {
            const spy = autoResolveTutorialMessages();
            const step1 = new TestStep();
            step1.conditionMet = true;
            const step2 = new TestStep(); // no hint
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            spy.mockClear();
            await tutorial.advance();

            expect(filterMessages(spy, "hint")).toHaveLength(0);
        });

        it("showMessage resolves immediately for empty text", async () => {
            const spy = autoResolveTutorialMessages();
            const tutorial = new TestTutorial(
                makeConfig([new TestStep()], { intro: "" }),
            );
            // showIntro with empty text should not emit
            await tutorial.showIntro();
            expect(spy).not.toHaveBeenCalled();
        });

        it("showMessage awaits resolve callback before returning", async () => {
            let savedResolve: (() => void) | null = null;
            Logger.getEventEmitter().on(
                EventType.TutorialMessage,
                (event: TutorialMessageEvent) => {
                    savedResolve = event.resolve;
                },
            );

            const step = new TestStep("hint");
            const tutorial = new TestTutorial(makeConfig([step]));

            let startResolved = false;
            const startPromise = tutorial.start(mockBoard).then(() => {
                startResolved = true;
            });

            // The intro resolve is pending — start should not have resolved
            await Promise.resolve(); // flush microtasks
            expect(startResolved).toBe(false);
            expect(savedResolve).not.toBeNull();

            // Resolve the intro
            savedResolve!();
            // Now the hint message is pending
            await Promise.resolve();
            expect(startResolved).toBe(false);
            expect(savedResolve).not.toBeNull();

            // Resolve the hint
            savedResolve!();
            await startPromise;
            expect(startResolved).toBe(true);
        });
    });

    // ─── Event-driven advancement ────────────────────────────────────────

    describe("event-driven advancement", () => {
        beforeEach(() => {
            autoResolveTutorialMessages();
        });

        it("subscribes to all BoardEvent values on start", async () => {
            const step = new TestStep();
            const tutorial = new TestTutorial(makeConfig([step]));
            const emitter = (mockBoard as any).boardEvents;
            const onSpy = vi.spyOn(emitter, "on");

            await tutorial.start(mockBoard);

            const eventValues = Object.values(BoardEvent);
            expect(onSpy).toHaveBeenCalledTimes(eventValues.length);
            for (const event of eventValues) {
                expect(onSpy).toHaveBeenCalledWith(
                    event,
                    expect.any(Function),
                );
            }
        });

        it("advances when a board event fires and the condition is met", async () => {
            const step1 = new TestStep();
            const step2 = new TestStep();
            const tutorial = new TestTutorial(makeConfig([step1, step2]));
            await tutorial.start(mockBoard);

            step1.conditionMet = true;
            (mockBoard as any).boardEvents.emit(BoardEvent.PhaseChange);
            // advance() is fire-and-forget — flush microtasks
            await Promise.resolve();

            expect(tutorial.currentStepIndex).toBe(1);
        });

        it("does not advance when a board event fires but condition is not met", async () => {
            const step = new TestStep();
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);

            step.conditionMet = false;
            (mockBoard as any).boardEvents.emit(BoardEvent.PieceMoved);
            await Promise.resolve();

            expect(tutorial.currentStepIndex).toBe(0);
        });

        it("responds to any BoardEvent type", async () => {
            const step1 = new TestStep();
            const step2 = new TestStep();
            const step3 = new TestStep();
            const tutorial = new TestTutorial(
                makeConfig([step1, step2, step3]),
            );
            await tutorial.start(mockBoard);

            step1.conditionMet = true;
            (mockBoard as any).boardEvents.emit(BoardEvent.PieceAttacked);
            await Promise.resolve();
            expect(tutorial.currentStepIndex).toBe(1);

            step2.conditionMet = true;
            (mockBoard as any).boardEvents.emit(BoardEvent.SpellCast);
            await Promise.resolve();
            expect(tutorial.currentStepIndex).toBe(2);
        });

        it("unsubscribes from all board events on end", async () => {
            const step = new TestStep();
            const tutorial = new TestTutorial(makeConfig([step]));
            const emitter = (mockBoard as any).boardEvents;
            const offSpy = vi.spyOn(emitter, "off");

            await tutorial.start(mockBoard);
            tutorial.end();

            const eventValues = Object.values(BoardEvent);
            expect(offSpy).toHaveBeenCalledTimes(eventValues.length);
            for (const event of eventValues) {
                expect(offSpy).toHaveBeenCalledWith(
                    event,
                    expect.any(Function),
                );
            }
        });

        it("does not advance after end is called", async () => {
            const step = new TestStep();
            const tutorial = new TestTutorial(makeConfig([step]));
            await tutorial.start(mockBoard);
            tutorial.end();

            step.conditionMet = true;
            (mockBoard as any).boardEvents.emit(BoardEvent.PhaseChange);
            await Promise.resolve();

            expect(tutorial.currentStepIndex).toBe(0);
            expect(tutorial.isComplete).toBe(false);
        });
    });
});
