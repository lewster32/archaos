import {
    UnitStatus,
    Colour,
    BoardEvent,
    Player as EnginePlayer,
    GameSetupPlayerType,
    ComputerWizard,
} from "@archaos/engine";
import type { PlayerConfig, PlayerAI } from "@archaos/engine";
import { Board } from "./board";
import { EffectType } from "./effectemitter";
import { Wizard } from "./wizard";
import type { Piece } from "./piece";

export class Player extends EnginePlayer<Piece> {
    /**
     * Get the AI controller for this player, if any.
     */
    public override get ai(): PlayerAI | null {
        if (this._remote instanceof ComputerWizard) {
            return this._remote as ComputerWizard;
        }
        return null;
    }

    /**
     * Creates a new Player instance.
     *
     * @param board A reference to the game board.
     * @param id The unique ID for this player.
     * @param config The configuration for this player.
     * @param colour The colour of this player.
     */
    constructor(
        board: Board,
        id: number,
        config: PlayerConfig,
        colour: number,
    ) {
        super(
            board as any,
            id,
            config
                ? {
                      ...config,
                      wizCode: config.wizCode || Wizard.randomWizCode(),
                  }
                : config,
            colour,
            null,
        );

        // If this is a computer player, create the
        // AI controller now that super() is done.
        if (config.type === GameSetupPlayerType.Computer) {
            (this as any)._remote = new ComputerWizard(
                board as any,
                this as any,
                config.difficulty ?? 0.5,
            );
            console.log(
                `${this.name} will be controlled by AI, with difficulty ${this.ai.difficulty}.`,
            );
        }
    }

    /**
     * Marks this player as defeated, plays the
     * defeat sequence, and destroys all of their
     * non-wizard pieces.
     */
    override async defeat(): Promise<void> {
        this._defeated = true;
        (this.board as unknown as Board).logger.log(
            `Game over for ${this.name}`,
            Colour.Red,
        );
        await (this.board as unknown as Board).sound.playAsync("deadwizard2", {
            delay: Board.DEFAULT_DELAY,
        });
        await this.destroyCreations();
        // Let's really dwell on this for a bit
        await (this.board as unknown as Board).idleDelay(Board.END_TURN_DELAY);
        (this.board as unknown as Board).boardEvents.emit(
            BoardEvent.PlayerDefeated,
            this,
        );
    }

    /**
     * Destroys all non-wizard pieces owned by this
     * player, with a short delay and effect for each.
     */
    override async destroyCreations(): Promise<any[]> {
        return Promise.all(
            (this.board as unknown as Board)
                .getPiecesByOwner(this)
                .filter((p) => !p.hasStatus(UnitStatus.Wizard))
                .map((piece: Piece) => {
                    return new Promise((resolve) => {
                        setTimeout(
                            async () => {
                                (this.board as unknown as Board).sound.play(
                                    "destroy", true
                                );
                                await (
                                    this.board as unknown as Board
                                ).playEffect(
                                    EffectType.DisbelieveHit,
                                    (piece as Piece).sprite.getCenter(),
                                    null,
                                    piece,
                                );
                                await (piece as Piece).destroy();
                                resolve(true);
                            },
                            250 + Math.random() * 500,
                        );
                    });
                }),
        );
    }
}
