import type { Board } from "../board";
import { BoardEvent } from "../enums/boardevent";
import { BoardState } from "../enums/boardstate";
import { Piece } from "../piece";
import { Tutorial, TutorialStep } from "./tutorial";

const RANDOM_PLAYER_SPELL: string = [
    "King Cobra",
    "Faun",
    "Gorilla",
    "Crocodile",
][Math.floor(Math.random() * 4)];
const RANDOM_OPPONENT_SPELL: string = ["Orc", "Goblin", "Ogre"][
    Math.floor(Math.random() * 3)
];
class GettingStarted5 extends TutorialStep {
    constructor() {
        super(
            `<p>
            Every round starts with all wizards selecting a spell to cast. Spells are assigned randomly at the start,
            and can summon powerful creatures, directly attack enemies, enhance your wizard and much more.
            <p>
            For now, you have one spell: <em>${RANDOM_PLAYER_SPELL}</em>. Select it from your spellbook by pressing the <span
            class="button button--green button--important button--small">Select</span> button next to the spell.
            <p>
            There are some other buttons, icons and numbers on here, but we'll cover those later. For now, you should
            just select your spell, as that enemy wizard looks a bit sketchy...`,
            "Select a spell",
            "left",
        );
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
        super(
            `<p>
            You're ready to cast your <em>${RANDOM_PLAYER_SPELL}</em> spell. This spell is a <em>summon</em> spell, which
            means it will bring forth a friendly creature or object onto the board.
            <p>
            If you look on the board next to your wizard<sup>*</sup>, you should see a <span class="c-magenta">magenta dot</span>.
            This shows valid positions for your spell to be cast. Click or tap this position to cast the spell.
            <p class="text-small"><sup>*</sup>The blue one on the left with the fetching hat, not the one on the right in a red t-shirt and jeans,
            who clearly didn't pay attention to the dress-code.`,
            "Cast your spell",
            "left",
        );
    }

    public checkCondition(
        board: Board,
        event?: BoardEvent,
        ...args: any[]
    ): boolean {
        return (
            event === BoardEvent.StateChange &&
            args[0] == BoardState.Move &&
            board.getPlayer(1)?.spells.length === 0
        );
    }
}

class GettingStarted15 extends TutorialStep {
    constructor() {
        super(
            `<p>
            Behold, your majestic <em>${RANDOM_PLAYER_SPELL}</em>! But alas, your opponent has summoned a fearsome
            <em class="c-cyan">${RANDOM_OPPONENT_SPELL}</em> to the board.
            <p>
            It's time to move your piece. These two creatures can only move one space per turn, and need to be next to
            an enemy to attack them.
            <p>
            Normally the wizards can also move around the board, but in this tutorial, we have (magically) broken their
            ankles.
            <p>
            Click or tap your <em>${RANDOM_PLAYER_SPELL}</em> on the board, then select a position to move to. You don't
            really have much of a choice but to advance towards the <em class="c-cyan">${RANDOM_OPPONENT_SPELL}</em>...`,
            "Move your piece",
            "left",
        );
    }

    onEnter(board: Board): void {
        // Nerf the King Cobra's mnv so it stays engaged with the Orc once near
        const cobra: Piece | null =
            board.pieces?.find((p) => p.name === RANDOM_PLAYER_SPELL) ?? null;
        if (cobra) {
            cobra.properties.maneuverability = -1;
        } else {
            console.warn(
                `Couldn't find ${RANDOM_PLAYER_SPELL} piece to nerf maneuverability. This may cause the tutorial to not work as intended.`,
                board,
            );
        }
        // Buff the Orc's mnv to Infinity so it also stays engaged with the King Cobra
        const orc: Piece | null =
            board.pieces?.find((p) => p.name === RANDOM_OPPONENT_SPELL) ?? null;
        if (orc) {
            orc.properties.maneuverability = Infinity;
        } else {
            console.warn(
                `Couldn't find ${RANDOM_OPPONENT_SPELL} piece to buff maneuverability. This may cause the tutorial to not work as intended.`,
                board,
            );
        }
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
        super(
            `<p>
            The <em class="c-cyan">${RANDOM_OPPONENT_SPELL}</em> strikes, but is no match for your
            <em class="c-yellow">${RANDOM_PLAYER_SPELL}</em>'s impenetrable plot armour! Seize the opportunity and
            strike back!
            <p>
            Click or tap your <em class="c-yellow">${RANDOM_PLAYER_SPELL}</em> again, then select the adjacent
            <em class="c-cyan">${RANDOM_OPPONENT_SPELL}</em> to attack it.`,
            "Win your first battle",
            "left",
        );
    }

    public checkCondition(_board: Board, event?: BoardEvent): boolean {
        // Any death counts as a win, as the player always hits, and the
        // opponent always misses.
        return event === BoardEvent.PieceDied;
    }

}

class GettingStarted30 extends TutorialStep {
    /**
     * Keep track of the rounds for this step, so we can prevent the player from
     * stalling indefinitely on this step by just not attacking the opponent and
     * waiting for them to die of old age or something. If the player reaches
     * the round limit, just let them win regardless of the state of the board.
     */
    private roundCount: number = 0;

    /**
     * The round limit for this step.
     */
    private readonly roundLimit: number = 7;

    public getOutro(): string {
        console.log(`${this.roundCount} rounds of ${this.roundLimit} limit reached.`);
        // Pacifist ending
        if (this.roundCount > this.roundLimit) {
            return `<p>
            <span class="text-rainbow">Congratulations...?</span> Your opponent died of boredom before you could finish
            them off, but hey, a win's a win.
            <p>
            Pacifism probably won't get you very far in Archaos, and you'll face opponents yet whose feet aren't
            irreparably shattered, so try to be a bit more... proactive.
            <p>
            There's a lot more to learn young sorcerer, so check out the other tutorials when you're ready for more!`;
        }
        // Murdered opponent ending
        return `<p>
            <span class="text-rainbow">Congratulations!</span> You murked that wizard like the utter arcane gangster you
            sometimes tell your uninterested friends you are.
            <p>
            There's a lot more to learn though young sorcerer, so check out the other tutorials when you're ready for
            more!`;
    };

    constructor() {
        super(
            `<p>
            The <em class="c-cyan">${RANDOM_OPPONENT_SPELL}</em> is dead. Notice that your
            <em class="c-yellow">${RANDOM_PLAYER_SPELL}</em> has moved over the top of the fallen enemy. No, it's not an
            opportunity to teabag, it's just how the game works.
            <p>
            Now, finish off that opponent wizard to win this game. Move your
            <em class="c-yellow">${RANDOM_PLAYER_SPELL}</em> next to the enemy wizard; your piece will become
            <span class="c-yellow">engaged</span> - this means the piece is locked in combat for this turn, and must
            either attack or cancel. And since you can't cancel in this tutorial, there's only one thing left to do...
            <p>
            Do it.
            `,
            "Finish the opponent",
            "left",
        );
    }

    public checkCondition(_board: Board, event?: BoardEvent): boolean {
        if (event === BoardEvent.NewTurn) {
            this.roundCount++;
        }
        if (this.roundCount > this.roundLimit) {
            return true;
        }

        return event === BoardEvent.PlayerDefeated || event === BoardEvent.GameOver;
    }

    onEnter(_: Board): void {
        this.roundCount = 0;
    }

    /**
     * If the player reaches the round limit, just end the game regardless of the state
     * of the board, to prevent stalling.
     * 
     * @param board The current state of the board.
     */
    onComplete(board: Board): void {
        if (this.roundCount > this.roundLimit && board.state !== BoardState.GameOver) {
            board.endGame();
        }
    }
}

const lastStep: GettingStarted30 = new GettingStarted30();

export class GettingStartedTutorial extends Tutorial {
    constructor() {
        super({
            id: "getting-started",
            name: "Getting Started",
            description:
                "Learn the basics of Archaos with this introductory tutorial.",
            intro: `<p class="text-large text-center text-shadow c-green">
            Welcome to <span class="text-rainbow">Archaos</span>!
            <p class="text-center">
            In this tutorial, you'll <em>cast your first spell</em>, learn to <em>move your pieces</em> around the
            board, and engage in epic <em>combat</em> the likes of which the plane of limbo has never seen before.
            Forth, brave warlock!`,
            steps: [
                new GettingStarted5(),
                new GettingStarted10(),
                new GettingStarted15(),
                new GettingStarted20(),
                lastStep,
            ],
            outro: lastStep.getOutro.bind(lastStep),
            board: {
                width: 6,
                height: 1,
            },
            disableIllusions: true,
            disableCancelSpell: true,
            disableCancelAction: true,
            disableEndTurn: true,
            order: 0,
            players: [
                {
                    id: 1,
                    name: "Player",
                    position: { x: 0, y: 0 },
                    spells: [RANDOM_PLAYER_SPELL],
                    forceCast: true,
                    forceHit: true,
                    wizCode: "000312032a",
                    wizardProperties: {
                        movement: 0,
                    },
                },
                {
                    id: 2,
                    name: "Opponent",
                    position: { x: 5, y: 0 },
                    spells: [RANDOM_OPPONENT_SPELL],
                    forceCast: true,
                    forceHit: false,
                    computerControlled: true,
                    wizCode: "0400120900",
                    difficulty: 1,
                    wizardProperties: {
                        movement: 0,
                    },
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
