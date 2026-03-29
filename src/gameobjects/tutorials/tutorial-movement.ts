import type { Board } from "../board";
import { BoardEvent } from "../enums/boardevent";
import { BoardPhase } from "../enums/boardphase";
import { UnitType } from "../enums/unittype";
import '../wizard';
import { Piece } from "../piece";
import { Tutorial, TutorialStep } from "./tutorial";

class Movement5 extends TutorialStep {
    constructor() {
        super(
            `<p>
            The King Cobra is a <em>ground-based</em> piece and can only move to adjacent spaces.
            <p>
            Click or tap on it to select it, then select an adjacent space to move it there.`,
            "Move the snake",
            "right"
        );
    }

    onEnter(board: Board): void {
        board.addPiece({
            x: 5,
            y: 8,
            owner: board.getPlayer(1)!,
            ... Piece.getPieceProperties("King Cobra"),
            unitType: UnitType.Creature
        });
    }

    checkCondition(board: Board, event?: BoardEvent, ...args: any[]): boolean {
        if (event === BoardEvent.PieceMoved && args[0].properties.name === "King Cobra") {
            return true;
        }
        return false;
    }
}

class Movement6 extends TutorialStep {
    constructor() {
        super(
            `<p>
            The Dire Wolf is also a ground-based piece, but it can move much further in a single turn due to its
            <em>movement range</em> stat being 3, instead of 1.
            <p>
            When you select a piece, its stats appear at the bottom of the screen. The first stat icon
            (<img src="/assets/images/ui/stat-move.png" style="width:36px;vertical-align:middle" alt="Movement icon"> or
            <img src="/assets/images/ui/stat-fly.png" style="width:36px;vertical-align:middle" alt="Flying icon">)
            is the movement range.
            <p>
            For the Dire Wolf, this means it can move up to 3 spaces in a single turn, but it must move through every
            space individually, so it has to go around obstacles.`,
            "Move the dire wolf",
            "right"
        );
    }

    onEnter(board: Board): void {
        board.addPiece({
            x: 5,
            y: 8,
            owner: board.getPlayer(1)!,
            ... Piece.getPieceProperties("Dire Wolf"),
            unitType: UnitType.Creature
        });
    }

    checkCondition(board: Board, event?: BoardEvent, ...args: any[]): boolean {
        if (event === BoardEvent.PieceMoved && args[0].properties.name === "Dire Wolf") {
            return true;
        }
        return false;
    }
}

class Movement7 extends TutorialStep {
    constructor() {
        super(
            `<p>
            The Bat is a <em>flying</em> piece, which means it can immediately move to any position on the board in
            range.
            <p>
            You can see the movement range of any unit when you select it, denoted by the <em class="c-green">green
            dots</em>.
            <p>
            Move the bat similar to how you moved the King Cobra.`,
            "Move the bat",
            "right"
        );
    }


    onEnter(board: Board): void {
        board.addPiece({
            x: 5,
            y: 8,
            owner: board.getPlayer(1)!,
            ... Piece.getPieceProperties("Bat"),
            unitType: UnitType.Creature
        });
    }

    checkCondition(board: Board, event?: BoardEvent, ...args: any[]): boolean {
        if (event === BoardEvent.PieceMoved && args[0].properties.name === "Bat") {
            return true;
        }
        return false;
    }
}

class Movement10 extends TutorialStep {
    constructor() {
        super(
            `<p>
            Your wizard can also move, and by default they have a movement range of 1, just like the King Cobra.`,
            "Move your wizard",
            "right"
        );
    }

    onEnter(board: Board): void {
        board.getPlayer(1).castingPiece.properties.movement = 1;
    }

    checkCondition(board: Board, event?: BoardEvent): boolean {
        if (event === BoardEvent.PhaseChange && board.phase === BoardPhase.Spellbook) {
            return true;
        }
        return false;
    }
}

class Movement20 extends TutorialStep {
    constructor() {
        super(`<p>
            Wizards have some other movement options. One of them is the ability to <em class="c-brown">mount</em>
            friendly ridable creatures.
            <p>
            You have a <em>Horse</em> spell in your spellbook. Last we checked, horses are ridable creatures, so cast
            the spell and hop on!
            <p>
            Click or tap on your wizard, then select the horse you just cast to mount it.`,
            "Learn to ride",
            "right"
        );
    }

    checkCondition(board: Board, event?: BoardEvent): boolean {
        if (event === BoardEvent.PieceMoved && board.getPiecesByOwner(board.getPlayer(1)!).find(p => p.currentMount !== null)) {
            return true;
        }
        return false;
    }
}

class Movement30 extends TutorialStep {
    constructor() {
        super(`<p>
            When mounted, your wizard is not only able to move around the board more easily, but also is protected from
            harm<sup>*</sup>, as your mount must be attacked and defeated before your wizard can be targeted.
            <p>
            Mounting a creature will use up their movement for the turn, so you'll have to wait for the next movement
            phase to be able to ride your horse around. For now, <em>continue moving your other pieces</em.. Maybe try
            to whack the opponent wizard with some of your pieces?
            <p class="text-small">
            <sup>*</sup>Most harm anyway. There're a couple of things that can still get you, but we'll discuss those
            later.`,
            "Perks of cavalry",
            "right"
        );
    }

    checkCondition(board: Board, event?: BoardEvent, ...args: any[]): boolean {
        const horse = board.getPiecesByOwner(board.getPlayer(1)!).find(p => p.properties.name === "Horse");
        if (event === BoardEvent.PieceMoved && args[0].id === horse?.id) {
            return true;
        }
        return false;
    }
}


export class MovementTutorial extends Tutorial {
    constructor() {
        super({
            id: "movement",
            name: "Movement Fundamentals",
            description: "Learn how to move your pieces around the board.",
            steps: [
                new Movement5(),
                new Movement6(),
                new Movement7(),
                new Movement10(),
                new Movement20(),
                new Movement30()
            ],
            intro: `<p>
            In this tutorial you'll learn how to move pieces around the board, and how their movement can differ from
            one another.`,
            outro: `<p>
            You are truly a <em class="text-rainbow">master jockey</em> as well as an above-average mover of pieces.
            <p>
            Let's end it there before you get too enthusiastic, and 'move' onto the next tutorial.
            <p>
            Or maybe now's a good time to try a proper game? Your choice!`,
            board: {
                width: 11,
                height: 11,
            },
            disableEndTurn: true,
            disableIllusions: true,
            disableCancelSpell: true,
            disableCancelAction: true,
            order: 10,
            players: [
                {
                    id: 1,
                    name: "Player",
                    position: { x: 5, y: 10 },
                    spells: ["Horse"],
                    forceHit: false,
                    forceCast: true,
                    wizCode: "000312032a",
                    pieces: [

                    ],
                    wizardProperties: {
                        movement: 0
                    }
                },
                {
                    id: 2,
                    name: "Enemy",
                    position: { x: 5, y: 0 },
                    spells: [],
                    forceHit: true,
                    computerControlled: true,
                    wizCode: "0400120900",
                    difficulty: 1
                }
            ],
            phase: "moving"
        });
    }
}
