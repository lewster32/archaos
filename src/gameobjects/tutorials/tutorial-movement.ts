import { Board } from "../board";
import { BoardEvent } from "../enums/boardevent";
import { BoardPhase } from "../enums/boardphase";
import { UnitType } from "../enums/unittype";
import "../wizard";
import { Piece } from "../piece";
import { Tutorial, TutorialStep, clickOrTap } from "./tutorial";
import statMove from "../../../assets/images/ui/stat-move.png?url";
import statFly from "../../../assets/images/ui/stat-fly.png?url";
import { EffectType } from "../effectemitter";

class Movement5 extends TutorialStep {
    private snakePiece: Piece | null = null;

    constructor() {
        super(
            `<p>
            The King Cobra is a <em>ground-based</em> piece and can only move to adjacent spaces because its movement
            range is 1.
            <p>
            ${clickOrTap(true)} on it to select it, then select an adjacent space to move it there.`,
            "Move the snake",
            "right",
        );
    }

    onEnter(board: Board): void {
        board
            .addPiece({
                x: 5,
                y: 8,
                owner: board.getPlayer(1)!,
                ...Piece.getPieceProperties("King Cobra"),
                unitType: UnitType.Creature,
            })
            .then((snake) => {
                this.snakePiece = snake;
                board.playEffect(EffectType.SummonPiece, snake.screenPosition);
            });
    }

    onDismissHint(board: Board): void {
        if (this.snakePiece) {
            TutorialStep.pointAtPosition(board, this.snakePiece.screenPosition);
        }
    }

    checkCondition(board: Board, event?: BoardEvent, ...args: any[]): boolean {
        if (
            event === BoardEvent.PieceMoved &&
            args[0].properties.name === "King Cobra"
        ) {
            return true;
        }
        return false;
    }
}

class Movement6 extends TutorialStep {
    private wolfPiece: Piece | null = null;

    constructor() {
        super(
            `<p>
            The Dire Wolf is also a ground-based piece, but it can move much further in a single turn due to its
            <em>movement range</em> stat being 3, instead of 1.
            <p>
            When you select a piece, its stats appear at the bottom of the screen. The first stat icon
            (<img src="${statMove}" style="width:36px;vertical-align:middle" alt="Movement icon"> or
            <img src="${statFly}" style="width:36px;vertical-align:middle" alt="Flying icon">)
            is the movement range.
            <p>
            ${clickOrTap(true)} on the Dire Wolf to select it, then select any space within its movement range (denoted by the
            <em class="c-green">green dots</em>) to move it there.`,
            "Move the wolf",
            "right",
        );
    }

    onEnter(board: Board): void {
        board
            .addPiece({
                x: 5,
                y: 8,
                owner: board.getPlayer(1)!,
                ...Piece.getPieceProperties("Dire Wolf"),
                unitType: UnitType.Creature,
            })
            .then((wolf) => {
                this.wolfPiece = wolf;
                board.playEffect(EffectType.SummonPiece, wolf.screenPosition);
            });
    }

    onDismissHint(board: Board): void {
        if (this.wolfPiece) {
            TutorialStep.pointAtPosition(
                board,
                this.wolfPiece.screenPosition,
                2000,
            );
        }
    }

    checkCondition(board: Board, event?: BoardEvent, ...args: any[]): boolean {
        if (
            event === BoardEvent.PieceMoved &&
            args[0].properties.name === "Dire Wolf"
        ) {
            return true;
        }
        return false;
    }
}

class Movement7 extends TutorialStep {
    private batPiece: Piece | null = null;

    constructor() {
        super(
            `<p>
            The Bat is a <em>flying</em> piece, which means it can immediately move to any position on the board that's
            in range. It will also ignore any obstacles, as it simply flies over them.`,
            "Move the bat",
            "right",
        );
    }

    onEnter(board: Board): void {
        board
            .addPiece({
                x: 5,
                y: 8,
                owner: board.getPlayer(1)!,
                ...Piece.getPieceProperties("Bat"),
                unitType: UnitType.Creature,
            })
            .then((bat) => {
                this.batPiece = bat;
                board.playEffect(EffectType.SummonPiece, bat.screenPosition);
            });
    }

    onDismissHint(board: Board): void {
        if (this.batPiece) {
            TutorialStep.pointAtPosition(
                board,
                this.batPiece.screenPosition,
                2000,
            );
        }
    }

    checkCondition(board: Board, event?: BoardEvent, ...args: any[]): boolean {
        if (
            event === BoardEvent.PieceMoved &&
            args[0].properties.name === "Bat"
        ) {
            return true;
        }
        return false;
    }
}

class Movement10 extends TutorialStep {
    constructor() {
        super(
            `<p>
            Your wizard can also move, and by default they have a movement range of 1.
            <p>
            There are spells later on that can increase your wizard's range and mode of movement, but for now you're
            stuck with ye olde walking. To be fair though, this is better than broken ankles.`,
            "Move your wizard",
            "right",
        );
    }

    onEnter(board: Board): void {
        board.getPlayer(1).castingPiece.properties.movement = 1;
    }

    onDismissHint(board: Board): void {
        TutorialStep.pointAtPosition(
            board,
            board.getPlayer(1)!.castingPiece.screenPosition,
            2000,
        );
    }

    checkCondition(board: Board, event?: BoardEvent): boolean {
        if (
            event === BoardEvent.PhaseChange &&
            board.phase === BoardPhase.Spellbook
        ) {
            return true;
        }
        return false;
    }
}

class Movement20 extends TutorialStep {
    constructor() {
        super(
            `<p>
            Wizards have some other movement options. One of them is the ability to <em class="c-brown">mount</em>
            friendly ridable creatures.
            <p>
            You have a <em>Horse</em> spell in your spellbook. Last we checked, horses are ridable creatures, so cast
            the spell and hop on!`,
            "Summon a steed",
            "right",
        );
    }

    checkCondition(board: Board, event?: BoardEvent): boolean {
        if (
            event === BoardEvent.PhaseChange &&
            board.phase === BoardPhase.Moving
        ) {
            return true;
        }
    }
}

class Movement25 extends TutorialStep {
    // If the player takes too long to mount the horse after it's summoned,
    // we'll start counting down and eventually end the tutorial.
    private runawayHorseCountdown: number = 3;

    constructor() {
        super(
            `<p>
            ${clickOrTap(true)} on your wizard, then select the horse you just cast to mount it.</p>`,
            "Mount your horse",
            "right",
        );
        this.runawayHorseCountdown = 3;
    }

    onDismissHint(board: Board): void {
        const wizard = board.getPlayer(1)?.castingPiece;
        if (wizard) {
            TutorialStep.pointAtPosition(board, wizard.screenPosition, 2000);
        }
    }

    checkCondition(board: Board, event?: BoardEvent, ...args: any[]): boolean {
        if (
            event === BoardEvent.PhaseChange &&
            board.phase === BoardPhase.Moving
        ) {
            this.runawayHorseCountdown--;
            if (this.runawayHorseCountdown <= 0) {
                // The horse gets tired of waiting and gallops away, ending the tutorial
                const horse = board
                    .getPiecesByOwner(board.getPlayer(1)!)
                    .find((p) => p.properties.name === "Horse");
                if (horse) {
                    horse.destroy();
                }
                board.endGame("Your horse ran away. Better luck next time!");
                return false;
            }
        }
        if (
            event === BoardEvent.PieceDied &&
            args[0].properties.name === "Horse"
        ) {
            board.endGame("Your horse was slain. Better luck next time!");
            return false;
        }
        if (
            event === BoardEvent.PieceSelected &&
            args[0].id === board.getPlayer(1)?.castingPiece.id
        ) {
            const horse = board
                .getPiecesByOwner(board.getPlayer(1)!)
                .find((p) => p.properties.name === "Horse");
            // Are we selecting the wizard while the horse is adjacent? If so,
            // point at the horse to hint at mounting it
            if (
                horse &&
                board.getAdjacentPiecesAtPosition(
                    horse.position,
                    (p) => p.id === board.getPlayer(1)?.castingPiece.id,
                ).length > 0
            ) {
                TutorialStep.pointAtPosition(board, horse.screenPosition, 2000);
            }
        }
        if (
            event === BoardEvent.PieceMoved &&
            board
                .getPiecesByOwner(board.getPlayer(1)!)
                .find((p) => p.currentMount !== null)
        ) {
            return true;
        }
        return false;
    }
}

class Movement30 extends TutorialStep {
    constructor() {
        super(
            `<p>
            When mounted, your wizard is not only able to move around the board more easily, but also is protected from
            harm<sup>*</sup>, as your mount must be attacked and defeated before your wizard can be targeted.
            <p>
            Mounting a creature will use up their movement for the turn, so you'll have to wait for the next movement
            phase to be able to ride your horse around. For now, <em>continue moving your other pieces</em>. Maybe try
            to whack the opponent wizard with some of them?
            <p class="text-small">
            <sup>*</sup>Most harm anyway. There're a couple of things that can still get you, but we'll discuss those
            later.`,
            "Perks of cavalry",
            "right",
        );
    }

    onDismissHint(board: Board): void {
        const remainingPiecesToMove = board.pieces.filter(
            (p) =>
                p.owner === board.getPlayer(1) &&
                !p.currentMount &&
                !p.turnOver,
        );
        if (remainingPiecesToMove.length > 0) {
            remainingPiecesToMove.forEach((p) => {
                TutorialStep.pointAtPosition(board, p.screenPosition, 2000);
            });
        }
    }

    checkCondition(board: Board, event?: BoardEvent, ...args: any[]): boolean {
        const horse = board
            .getPiecesByOwner(board.getPlayer(1)!)
            .find((p) => p.properties.name === "Horse");
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
                new Movement25(),
                new Movement30(),
            ],
            intro: `<p>
            In this tutorial you'll learn how to move pieces around the board, and how their movement can differ from
            one another.
            <p>
            Pieces can either move on the <em>ground</em> or through the air by <em>flying</em>, and each piece has a
            movement range stat that determines how far.`,
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
                    pieces: [],
                    wizardProperties: {
                        movement: 0,
                    },
                },
                {
                    id: 2,
                    name: "Enemy",
                    position: { x: 5, y: 0 },
                    spells: [],
                    forceHit: true,
                    computerControlled: true,
                    wizCode: "0400120900",
                    difficulty: 1,
                },
            ],
            phase: "moving",
        });
    }
}
