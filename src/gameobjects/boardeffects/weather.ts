import { SimplePoint } from "@archaos/engine/src/board";
import { Board } from "../board";

import {
    GameObjects,
} from "phaser";

export interface WeatherEffect {
    /**
     * Start the weather effect. This will typically involve adding particles,
     * timers, and other game objects to the board's scene. The effect should
     * be fully visible and active after this method is called.
     */
    start(): void;

    /**
     * Destroy the weather effect. This should clean up any particles, timers,
     * or other game objects that were created by the effect, and restore the
     * board to its normal state. After this method is called, the effect should
     * no longer be visible or active on the board.
     */
    destroy(): void;
}

/**
 * Adds a rain effect to the board. This includes raindrops that fall from the
 * top of the board and splash when they hit the ground, as well as occasional
 * lightning strikes that flash the screen.
 * 
 * @param board The board to apply the rain effect to.
 */
export class RainEffect implements WeatherEffect {
    /**
     * The Phaser scene to which the rain effect's particles and timers will be
     * added.
     */
    private readonly scene: Phaser.Scene;

    /**
     * The width of the board.
     */
    private readonly width: number;

    /**
     * The height of the board.
     */
    private readonly height: number;

    /**
     * A reference to the board that this weather effect is applied to. This is
     * used to access the board's scene for adding particles and timers, and to
     * update the board's background colour during lightning strikes.
     */
    private readonly board: Board;

    /**
     * The Phaser particle emitter that creates the raindrops.
     */
    private emitter?: GameObjects.Particles.ParticleEmitter;

    /**
     * A Phaser timer event that schedules lightning strikes.
     */
    private lightningTimer?: Phaser.Time.TimerEvent;

    /**
     * A flag to indicate whether the weather effect has been destroyed. This is
     * used to prevent any scheduled timers or particle callbacks from running
     * after the effect has been destroyed.
     */
    private _destroyed: boolean = false;

    /**
     * The intensity of the rain effect, ranging from 0.1 (a few drops) to 1
     * (tropical downpour).
     */
    private readonly rainIntensity: number;

    constructor(board: Board) {
        this.board = board;
        this.scene = board.scene;
        this.width = board.width;
        this.height = board.height;
        // Random intensity between 0.1 and 1
        this.rainIntensity = Math.random() * 0.9 + 0.1;
    }

    public start(): void {
        console.debug(`Starting rain with intensity ${this.rainIntensity.toFixed(2)}`);
        const cs = Board.DEFAULT_CELLSIZE;
        const corner = (gx: number, gy: number) => ({
            x: (gx - gy) * cs,
            y: ((gx + gy) * cs) / 2 + cs / 2,
        });

        const lifespan: number = 1000;
        const avgSpeedX: number = (Math.random() * 150 - 75) * this.rainIntensity;
        const avgSpeedY: number = 220;

        this.emitter = this.scene.add.particles(0, 0, "rain", {
            frame: "drop",
            speedX: avgSpeedX,
            speedY: avgSpeedY,
            quantity: 3 * this.rainIntensity,
            frequency: 40 / this.rainIntensity, // More intense rain has more frequent drops
            lifespan,
            alpha: { start: 0, end: .25 },
            scale: 1,
            deathCallback: (particle: any) => {
                const splash = this.scene.add.sprite(
                    particle.x,
                    particle.y,
                    "rain",
                    "splash_1",
                );
                splash.play("rain_splash");
                splash.setAlpha(0.15);
                splash.on(
                    "animationcomplete",
                    () => splash.destroy(),
                );
            },
        });

        // Set an emitter the shape of the board diamond.
        // Phaser.Geom.Polygon lacks getRandomPoint, so we
        // use a custom source. The board is a rhombus, so
        // sampling is exact with two edge vectors.
        const pad: number = 0.2;
        const top: SimplePoint = corner(pad, pad);
        const dRight: SimplePoint = {
            x: corner(this.width - pad, pad).x - top.x,
            y: corner(this.width - pad, pad).y - top.y,
        };
        const dLeft: SimplePoint = {
            x: corner(pad, this.height - pad).x - top.x,
            y: corner(pad, this.height - pad).y - top.y,
        };
        // Offset the spawn zone so particles land on the
        // board: each axis is the average speed × lifespan.
        const spawnOffsetX = -(avgSpeedX * lifespan / 1000);
        const spawnOffsetY = -(avgSpeedY * lifespan / 1000);
        this.emitter.addEmitZone({
            type: "random",
            source: {
                getRandomPoint(point: SimplePoint): SimplePoint {
                    const s = Math.random();
                    const t = Math.random();
                    point.x = top.x + s * dRight.x + t * dLeft.x + spawnOffsetX;
                    point.y = top.y + s * dRight.y + t * dLeft.y + spawnOffsetY;
                    return point;
                },
            },
            quantity: 1,
        });

        // Give a 30% chance of lightning accompanying heavier rain
        if (Math.random() > 0.3 || this.rainIntensity <= 0.5) {
            return;
        }
        console.debug("Starting rain with lightning strikes");

        const FRAME: number = 1000 / 30;
        const scheduleStrike = () => {
            if (this._destroyed) return;
            this.lightningTimer = this.scene.time.delayedCall(
                Phaser.Math.Between(4000, 12000), strike,
            );
        };
        const strike: () => void = () => {
            // Frames is 1,0 repeated 1-3 times
            const FRAMES: number[] = [];
            for (let i = 0; i < Phaser.Math.Between(4, 12); i++) {
                FRAMES.push(i % 2);
            }
            FRAMES.push(0); // End on clear
            FRAMES.forEach((flash, i) => {
                this.scene.time.delayedCall(i * FRAME, () => {
                    if (this._destroyed) return;
                    const intensity: number = Math.random() * 0.5 + 0.5;
                    this.scene.game.canvas.style.filter = flash ? `contrast(${100 - intensity * 100}%) brightness(${intensity * 100}%)` : `none`;
                    if (flash) {
                        globalThis.document.body.style.setProperty("--bg-colour", `rgba(255, 255, 255, ${intensity})`);
                    } else {
                        this.board.updateBackgroundColour();
                    }

                    if (i === FRAMES.length - 1) scheduleStrike();
                });
            });
        };
        scheduleStrike();
    }

    public destroy(): void {
        this._destroyed = true;
        this.emitter?.stop();
        this.lightningTimer?.remove();
        this.scene.game.canvas.style.filter = "none";
        this.board.updateBackgroundColour();
    }
}

export enum WeatherType {
    Rain = "rain",
}