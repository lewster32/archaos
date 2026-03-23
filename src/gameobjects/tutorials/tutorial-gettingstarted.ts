import type { Board } from "../board";
import { BoardEvent } from "../enums/boardevent";
import { BoardState } from "../enums/boardstate";
import { Tutorial, TutorialStep } from "./tutorial";

class GettingStarted5 extends TutorialStep {
    constructor() {
        super("Select a spell");
    }

    public checkCondition(
        _: Board,
        event?: BoardEvent,
        ...args: any[]
    ): boolean {
        return event === BoardEvent.SpellSelected && args[0].id === 1;
    }
}

class GettingStarted10 extends TutorialStep {
    constructor() {
        super("Cast your first spell");
    }

    public checkCondition(
        board: Board,
        event?: BoardEvent,
        ...args: any[]
    ): boolean {
        return event === BoardEvent.StateChange &&
            args[0] == BoardState.Move &&
            board.currentPlayer?.id == 1 &&
            board.currentPlayer.spells.length === 0;
    }
}

class GettingStarted15 extends TutorialStep {
    constructor() {
        super("Move your pieces");
    }

    public checkCondition(
        board: Board,
        event?: BoardEvent,
        ...args: any[]
    ): boolean {
        return (
            event === BoardEvent.PieceAttacked &&
            args[1].owner === board.getPlayer(1)
        );
    }
}

class GettingStarted20 extends TutorialStep {
    constructor() {
        super("Win your first battle");
    }

    public checkCondition(_board: Board, event?: BoardEvent): boolean {
        // Any death counts as a win, as the player always hits, and the
        // opponent always misses.
        return event === BoardEvent.PieceDied;
    }
}

export class GettingStartedTutorial extends Tutorial {
    constructor() {
        super({
            id: "getting-started",
            name: "Getting Started",
            description:
                "Learn the basics of Archaos with this introductory tutorial.",
            intro: `Welcome to Archaos! In this tutorial, you'll learn the basics of how to play the game. Let's get started!`,
            steps: [
                new GettingStarted5(),
                new GettingStarted10(),
                new GettingStarted15(),
                new GettingStarted20(),
            ],
            outro: `Congratulations! You've completed the Getting Started tutorial. Good luck, and have fun playing!`,
            board: {
                width: 6,
                height: 1,
            },
            disableIllusions: true,
            disableCancelSpell: true,
            disableEndTurn: true,
            order: 0,
            players: [
                {
                    id: 1,
                    name: "Player",
                    position: { x: 0, y: 0 },
                    spells: ["King Cobra"],
                    forceCast: true,
                    forceHit: true,
                },
                {
                    id: 2,
                    name: "Opponent",
                    position: { x: 5, y: 0 },
                    spells: ["Orc"],
                    forceCast: true,
                    forceHit: false,
                    computerControlled: true,
                    difficulty: 1,
                },
            ],
            phase: "casting",
        });
    }

    protected onStart(board: Board): void {
        console.log("Starting Getting Started tutorial...", board);
    }

    protected onEnd(): void {
        console.log("Ending Getting Started tutorial...");
    }
}
