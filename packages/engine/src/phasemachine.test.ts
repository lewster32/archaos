import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    PhaseMachine,
    StartGame,
    GameEnd,
    SpellbookReady,
    SkipSpellbook,
    SpellsDone,
    NoSpellsCast,
    CastingReady,
    CastingDone,
    SpreadingDone,
    MovingReady,
    MovingDone,
    NextPlayer,
    SelectPiece,
    AdvanceToAttack,
    AdvanceToRangedAttack,
    PieceDeselected,
    RequestDismount,
    CompleteDismount,
    CancelDismount,
    SpellTargeting,
    SpellCastComplete,
} from "./phasemachine";

describe("PhaseMachine", () => {
    let pm: PhaseMachine;

    beforeEach(() => {
        pm = new PhaseMachine();
    });

    describe("initial state", () => {
        it("starts in the idle state", () => {
            expect(pm.activeLeafState).toBe("idle");
        });

        it("idle is active", () => {
            expect(pm.isActive(pm.states.idle)).toBe(true);
        });

        it("playing is not active", () => {
            expect(pm.isActive(pm.states.playing)).toBe(false);
        });

        it("gameOver is not active", () => {
            expect(pm.isActive(pm.states.gameOver)).toBe(false);
        });

        it("root game state is always active", () => {
            expect(pm.isActive(pm.states.game)).toBe(true);
        });
    });

    describe("evaluate", () => {
        it("returns true for a valid transition", () => {
            expect(pm.evaluate(new StartGame())).toBe(true);
        });

        it("returns false for an invalid transition", () => {
            expect(pm.evaluate(new SpellbookReady())).toBe(false);
        });
    });

    describe("game lifecycle", () => {
        it("transitions from idle to playing on StartGame", () => {
            pm.evaluate(new StartGame());
            expect(pm.isActive(pm.states.playing)).toBe(true);
            expect(pm.isActive(pm.states.idle)).toBe(false);
        });

        it("enters spellbookSetup as the initial substate of playing", () => {
            pm.evaluate(new StartGame());
            expect(pm.activeLeafState).toBe("spellbookSetup");
        });

        it("transitions from idle to gameOver on GameEnd", () => {
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
            expect(pm.isActive(pm.states.idle)).toBe(false);
        });

        it("transitions from playing to gameOver on GameEnd", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
            expect(pm.isActive(pm.states.playing)).toBe(false);
        });
    });

    describe("GameEnd from any playing substate", () => {
        it("ends from spellbookSetup", () => {
            pm.evaluate(new StartGame());
            expect(pm.activeLeafState).toBe("spellbookSetup");
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });

        it("ends from spellbookPlayer", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            expect(pm.activeLeafState).toBe("spellbookPlayer");
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });

        it("ends from castingPlayer", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            expect(pm.activeLeafState).toBe("castIdle");
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });

        it("ends from spreading", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
            expect(pm.activeLeafState).toBe("spreading");
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });

        it("ends from movingPlayer", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
            pm.evaluate(new SpreadingDone());
            pm.evaluate(new MovingReady());
            expect(pm.activeLeafState).toBe("pieceIdle");
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });
    });

    describe("spellbook phase", () => {
        beforeEach(() => {
            pm.evaluate(new StartGame());
        });

        it("transitions from spellbookSetup to spellbookPlayer on SpellbookReady", () => {
            pm.evaluate(new SpellbookReady());
            expect(pm.activeLeafState).toBe("spellbookPlayer");
            expect(pm.isActive(pm.states.spellbook)).toBe(true);
        });

        it("skips spellbook and goes to movingSetup on SkipSpellbook", () => {
            pm.evaluate(new SkipSpellbook());
            expect(pm.activeLeafState).toBe("movingSetup");
            expect(pm.isActive(pm.states.moving)).toBe(true);
        });

        it("iterates players with NextPlayer staying in spellbookPlayer", () => {
            pm.evaluate(new SpellbookReady());
            expect(pm.activeLeafState).toBe("spellbookPlayer");

            pm.evaluate(new NextPlayer());
            expect(pm.activeLeafState).toBe("spellbookPlayer");

            pm.evaluate(new NextPlayer());
            expect(pm.activeLeafState).toBe("spellbookPlayer");
        });

        it("transitions to castingSetup on SpellsDone", () => {
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            expect(pm.activeLeafState).toBe("castingSetup");
            expect(pm.isActive(pm.states.casting)).toBe(true);
        });

        it("skips casting and goes to spreading on NoSpellsCast", () => {
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new NoSpellsCast());
            expect(pm.activeLeafState).toBe("spreading");
        });
    });

    describe("casting phase", () => {
        beforeEach(() => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
        });

        it("starts in castingSetup", () => {
            expect(pm.activeLeafState).toBe("castingSetup");
        });

        it("transitions to castingPlayer on CastingReady", () => {
            pm.evaluate(new CastingReady());
            expect(pm.activeLeafState).toBe("castIdle");
        });

        it("iterates players with NextPlayer staying in castingPlayer", () => {
            pm.evaluate(new CastingReady());
            pm.evaluate(new NextPlayer());
            expect(pm.activeLeafState).toBe("castIdle");
        });

        it("transitions to spreading on CastingDone", () => {
            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
            expect(pm.activeLeafState).toBe("spreading");
        });
    });

    describe("spreading phase", () => {
        beforeEach(() => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
        });

        it("is in spreading state", () => {
            expect(pm.activeLeafState).toBe("spreading");
            expect(pm.isActive(pm.states.spreading)).toBe(true);
        });

        it("transitions to movingSetup on SpreadingDone", () => {
            pm.evaluate(new SpreadingDone());
            expect(pm.activeLeafState).toBe("movingSetup");
            expect(pm.isActive(pm.states.moving)).toBe(true);
        });
    });

    describe("moving phase", () => {
        beforeEach(() => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
            pm.evaluate(new SpreadingDone());
        });

        it("starts in movingSetup", () => {
            expect(pm.activeLeafState).toBe("movingSetup");
        });

        it("transitions to movingPlayer on MovingReady", () => {
            pm.evaluate(new MovingReady());
            expect(pm.activeLeafState).toBe("pieceIdle");
        });

        it("iterates players with NextPlayer staying in movingPlayer", () => {
            pm.evaluate(new MovingReady());
            pm.evaluate(new NextPlayer());
            expect(pm.activeLeafState).toBe("pieceIdle");
        });

        it("loops back to spellbookSetup on MovingDone (new turn)", () => {
            pm.evaluate(new MovingReady());
            pm.evaluate(new MovingDone());
            expect(pm.activeLeafState).toBe("spellbookSetup");
            expect(pm.isActive(pm.states.spellbook)).toBe(true);
        });
    });

    describe("full turn cycle", () => {
        it("completes a full turn and returns to spellbookSetup", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new NextPlayer());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            pm.evaluate(new NextPlayer());
            pm.evaluate(new CastingDone());
            pm.evaluate(new SpreadingDone());
            pm.evaluate(new MovingReady());
            pm.evaluate(new NextPlayer());
            pm.evaluate(new MovingDone());

            // Back at the beginning of a new turn
            expect(pm.activeLeafState).toBe("spellbookSetup");
        });

        it("completes two full turns", () => {
            // Turn 1
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
            pm.evaluate(new SpreadingDone());
            pm.evaluate(new MovingReady());
            pm.evaluate(new MovingDone());

            // Turn 2
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
            pm.evaluate(new SpreadingDone());
            pm.evaluate(new MovingReady());
            pm.evaluate(new MovingDone());

            expect(pm.activeLeafState).toBe("spellbookSetup");
        });

        it("handles NoSpellsCast shortcut (skip casting, go to spreading)", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new NoSpellsCast());
            // Should skip casting entirely
            expect(pm.activeLeafState).toBe("spreading");
            expect(pm.isActive(pm.states.casting)).toBe(false);
        });

        it("handles SkipSpellbook shortcut (skip to moving)", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SkipSpellbook());
            expect(pm.activeLeafState).toBe("movingSetup");
            expect(pm.isActive(pm.states.spellbook)).toBe(false);
        });
    });

    describe("compound state queries", () => {
        it("playing is active when in any substate", () => {
            pm.evaluate(new StartGame());

            // In spellbookSetup — playing should be active
            expect(pm.isActive(pm.states.playing)).toBe(true);

            pm.evaluate(new SpellbookReady());
            expect(pm.isActive(pm.states.playing)).toBe(true);

            pm.evaluate(new SpellsDone());
            expect(pm.isActive(pm.states.playing)).toBe(true);

            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
            expect(pm.isActive(pm.states.playing)).toBe(true);

            pm.evaluate(new SpreadingDone());
            expect(pm.isActive(pm.states.playing)).toBe(true);

            pm.evaluate(new MovingReady());
            expect(pm.isActive(pm.states.playing)).toBe(true);
        });

        it("spellbook compound state is active during its substates", () => {
            pm.evaluate(new StartGame());
            expect(pm.isActive(pm.states.spellbook)).toBe(true);

            pm.evaluate(new SpellbookReady());
            expect(pm.isActive(pm.states.spellbook)).toBe(true);
        });

        it("casting compound state is active during its substates", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            expect(pm.isActive(pm.states.casting)).toBe(true);

            pm.evaluate(new CastingReady());
            expect(pm.isActive(pm.states.casting)).toBe(true);
        });

        it("moving compound state is active during its substates", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
            pm.evaluate(new SpreadingDone());
            expect(pm.isActive(pm.states.moving)).toBe(true);

            pm.evaluate(new MovingReady());
            expect(pm.isActive(pm.states.moving)).toBe(true);
        });
    });

    describe("invalid transitions", () => {
        it("ignores events not valid for current state", () => {
            // In idle, SpellbookReady should not cause a transition
            expect(pm.evaluate(new SpellbookReady())).toBe(false);
            expect(pm.activeLeafState).toBe("idle");
        });

        it("ignores CastingDone when in spellbook phase", () => {
            pm.evaluate(new StartGame());
            expect(pm.evaluate(new CastingDone())).toBe(false);
            expect(pm.activeLeafState).toBe("spellbookSetup");
        });

        it("ignores MovingDone when in casting phase", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            expect(pm.evaluate(new MovingDone())).toBe(false);
            expect(pm.activeLeafState).toBe("castIdle");
        });

        it("ignores StartGame when already playing", () => {
            pm.evaluate(new StartGame());
            expect(pm.evaluate(new StartGame())).toBe(false);
            expect(pm.isActive(pm.states.playing)).toBe(true);
        });

        it("ignores all events when in gameOver", () => {
            pm.evaluate(new GameEnd());
            expect(pm.evaluate(new StartGame())).toBe(false);
            expect(pm.evaluate(new SpellbookReady())).toBe(false);
            expect(pm.evaluate(new MovingDone())).toBe(false);
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });
    });

    describe("callback", () => {
        it("invokes the callback on state entry", () => {
            const callback = vi.fn();
            pm = new PhaseMachine(callback);

            // Creating the machine enters idle, so callback is already called
            expect(callback).toHaveBeenCalledWith("idle");
            callback.mockClear();

            pm.evaluate(new StartGame());
            // Should be called for playing, spellbook, spellbookSetup
            expect(callback).toHaveBeenCalledWith("playing");
            expect(callback).toHaveBeenCalledWith("spellbook");
            expect(callback).toHaveBeenCalledWith("spellbookSetup");
        });

        it("invokes the callback for each state entered during transition", () => {
            const calls: string[] = [];
            pm = new PhaseMachine((state) => calls.push(state));
            calls.length = 0; // clear initial entry calls

            pm.evaluate(new StartGame());
            // Should include compound states and leaf state
            expect(calls).toContain("playing");
            expect(calls).toContain("spellbook");
            expect(calls).toContain("spellbookSetup");
        });
    });

    describe("reset", () => {
        it("resets to idle state", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            expect(pm.isActive(pm.states.casting)).toBe(true);

            pm.reset();
            expect(pm.activeLeafState).toBe("idle");
            expect(pm.isActive(pm.states.idle)).toBe(true);
            expect(pm.isActive(pm.states.playing)).toBe(false);
        });

        it("allows starting a new game after reset", () => {
            pm.evaluate(new StartGame());
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);

            pm.reset();
            expect(pm.evaluate(new StartGame())).toBe(true);
            expect(pm.activeLeafState).toBe("spellbookSetup");
        });
    });

    describe("movingPlayer piece states", () => {
        // Helper: advance FSM to movingPlayer (pieceIdle)
        function enterMovingPlayer() {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
            pm.evaluate(new CastingDone());
            pm.evaluate(new SpreadingDone());
            pm.evaluate(new MovingReady());
        }

        it("starts in pieceIdle when entering movingPlayer", () => {
            enterMovingPlayer();
            expect(pm.activeLeafState).toBe("pieceIdle");
            expect(pm.isActive(pm.states.movingPlayer)).toBe(true);
        });

        it("transitions to pieceMoving on SelectPiece", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            expect(pm.activeLeafState).toBe("pieceMoving");
        });

        it("full piece lifecycle: Idle → Moving → Attacking → RangedAttacking → Idle", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            expect(pm.activeLeafState).toBe("pieceMoving");

            pm.evaluate(new AdvanceToAttack());
            expect(pm.activeLeafState).toBe("pieceAttacking");

            pm.evaluate(new AdvanceToRangedAttack());
            expect(pm.activeLeafState).toBe("pieceRangedAttacking");

            pm.evaluate(new PieceDeselected());
            expect(pm.activeLeafState).toBe("pieceIdle");
        });

        it("shortcut: Moving → RangedAttacking (skip melee)", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            pm.evaluate(new AdvanceToRangedAttack());
            expect(pm.activeLeafState).toBe("pieceRangedAttacking");
        });

        it("shortcut: Moving → Idle (no actions available)", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            pm.evaluate(new PieceDeselected());
            expect(pm.activeLeafState).toBe("pieceIdle");
        });

        it("PieceDeselected from pieceAttacking returns to pieceIdle", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            pm.evaluate(new AdvanceToAttack());
            pm.evaluate(new PieceDeselected());
            expect(pm.activeLeafState).toBe("pieceIdle");
        });

        it("self-transition: SelectPiece in pieceMoving (re-select)", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            expect(pm.activeLeafState).toBe("pieceMoving");

            pm.evaluate(new SelectPiece());
            expect(pm.activeLeafState).toBe("pieceMoving");
        });

        describe("dismount flow", () => {
            it("transitions to pieceDismounting on RequestDismount", () => {
                enterMovingPlayer();
                pm.evaluate(new SelectPiece());
                pm.evaluate(new RequestDismount());
                expect(pm.activeLeafState).toBe("pieceDismounting");
            });

            it("returns to pieceMoving on CompleteDismount", () => {
                enterMovingPlayer();
                pm.evaluate(new SelectPiece());
                pm.evaluate(new RequestDismount());
                pm.evaluate(new CompleteDismount());
                expect(pm.activeLeafState).toBe("pieceMoving");
            });

            it("returns to pieceMoving on CancelDismount", () => {
                enterMovingPlayer();
                pm.evaluate(new SelectPiece());
                pm.evaluate(new RequestDismount());
                pm.evaluate(new CancelDismount());
                expect(pm.activeLeafState).toBe("pieceMoving");
            });

            it("returns to pieceIdle on PieceDeselected from dismounting", () => {
                enterMovingPlayer();
                pm.evaluate(new SelectPiece());
                pm.evaluate(new RequestDismount());
                pm.evaluate(new PieceDeselected());
                expect(pm.activeLeafState).toBe("pieceIdle");
            });
        });

        it("NextPlayer resets to pieceIdle", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            pm.evaluate(new AdvanceToAttack());
            expect(pm.activeLeafState).toBe("pieceAttacking");

            pm.evaluate(new NextPlayer());
            expect(pm.activeLeafState).toBe("pieceIdle");
        });

        it("MovingDone exits to spellbookSetup", () => {
            enterMovingPlayer();
            pm.evaluate(new MovingDone());
            expect(pm.activeLeafState).toBe("spellbookSetup");
            expect(pm.isActive(pm.states.movingPlayer)).toBe(false);
        });

        it("GameEnd exits from pieceMoving", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });

        it("GameEnd exits from pieceAttacking", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            pm.evaluate(new AdvanceToAttack());
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });

        it("GameEnd exits from pieceRangedAttacking", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            pm.evaluate(new AdvanceToRangedAttack());
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });

        it("GameEnd exits from pieceDismounting", () => {
            enterMovingPlayer();
            pm.evaluate(new SelectPiece());
            pm.evaluate(new RequestDismount());
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });

        it("ignores SelectPiece from pieceIdle when not in movingPlayer", () => {
            pm.evaluate(new StartGame());
            // In spellbookSetup — SelectPiece should be ignored
            expect(pm.evaluate(new SelectPiece())).toBe(false);
            expect(pm.activeLeafState).toBe("spellbookSetup");
        });

        it("ignores AdvanceToAttack from pieceIdle", () => {
            enterMovingPlayer();
            expect(pm.evaluate(new AdvanceToAttack())).toBe(false);
            expect(pm.activeLeafState).toBe("pieceIdle");
        });

        it("ignores RequestDismount from pieceIdle", () => {
            enterMovingPlayer();
            expect(pm.evaluate(new RequestDismount())).toBe(false);
            expect(pm.activeLeafState).toBe("pieceIdle");
        });

        it("movingPlayer compound state is active during all piece sub-states", () => {
            enterMovingPlayer();
            expect(pm.isActive(pm.states.movingPlayer)).toBe(true);

            pm.evaluate(new SelectPiece());
            expect(pm.isActive(pm.states.movingPlayer)).toBe(true);

            pm.evaluate(new AdvanceToAttack());
            expect(pm.isActive(pm.states.movingPlayer)).toBe(true);

            pm.evaluate(new AdvanceToRangedAttack());
            expect(pm.isActive(pm.states.movingPlayer)).toBe(true);

            pm.evaluate(new PieceDeselected());
            pm.evaluate(new SelectPiece());
            pm.evaluate(new RequestDismount());
            expect(pm.isActive(pm.states.movingPlayer)).toBe(true);
        });
    });

    describe("castingPlayer casting states", () => {
        function enterCastingPlayer() {
            pm.evaluate(new StartGame());
            pm.evaluate(new SpellbookReady());
            pm.evaluate(new SpellsDone());
            pm.evaluate(new CastingReady());
        }

        it("starts in castIdle when entering castingPlayer", () => {
            enterCastingPlayer();
            expect(pm.activeLeafState).toBe("castIdle");
            expect(pm.isActive(pm.states.castingPlayer)).toBe(true);
        });

        it("transitions to castTargeting on SpellTargeting", () => {
            enterCastingPlayer();
            pm.evaluate(new SpellTargeting());
            expect(pm.activeLeafState).toBe("castTargeting");
        });

        it("returns to castIdle on SpellCastComplete", () => {
            enterCastingPlayer();
            pm.evaluate(new SpellTargeting());
            pm.evaluate(new SpellCastComplete());
            expect(pm.activeLeafState).toBe("castIdle");
        });

        it("self-transition: SpellTargeting in castTargeting (re-target after multi-cast)", () => {
            enterCastingPlayer();
            pm.evaluate(new SpellTargeting());
            pm.evaluate(new SpellTargeting());
            expect(pm.activeLeafState).toBe("castTargeting");
        });

        it("NextPlayer resets to castIdle", () => {
            enterCastingPlayer();
            pm.evaluate(new SpellTargeting());
            pm.evaluate(new NextPlayer());
            expect(pm.activeLeafState).toBe("castIdle");
        });

        it("CastingDone exits to spreading", () => {
            enterCastingPlayer();
            pm.evaluate(new SpellTargeting());
            pm.evaluate(new CastingDone());
            expect(pm.activeLeafState).toBe("spreading");
            expect(pm.isActive(pm.states.castingPlayer)).toBe(false);
        });

        it("GameEnd exits from castTargeting", () => {
            enterCastingPlayer();
            pm.evaluate(new SpellTargeting());
            pm.evaluate(new GameEnd());
            expect(pm.isActive(pm.states.gameOver)).toBe(true);
        });

        it("ignores SpellCastComplete from castIdle", () => {
            enterCastingPlayer();
            expect(pm.evaluate(new SpellCastComplete())).toBe(false);
            expect(pm.activeLeafState).toBe("castIdle");
        });

        it("castingPlayer compound state is active during all sub-states", () => {
            enterCastingPlayer();
            expect(pm.isActive(pm.states.castingPlayer)).toBe(true);

            pm.evaluate(new SpellTargeting());
            expect(pm.isActive(pm.states.castingPlayer)).toBe(true);

            pm.evaluate(new SpellCastComplete());
            expect(pm.isActive(pm.states.castingPlayer)).toBe(true);
        });
    });
});
