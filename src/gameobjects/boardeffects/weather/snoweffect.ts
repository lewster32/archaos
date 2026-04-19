import type { SimplePoint } from "@archaos/engine";
import { Board } from "../../board";

import { GameObjects } from "phaser";

import type { WeatherEffect } from "./weathereffect";

/**
 * Adds a snow effect to the board. Snowflakes drift slowly downwards in a
 * wavy, wind-blown pattern and fade out near the end of their lifespan.
 *
 * Configurable keys (any unknown / mistyped value is ignored with a warning):
 *
 * - `intensity` (number, 0.1–1, clamped) — defaults to a random value in
 *   that range. Higher intensity means more flakes and stronger wind drift.
 */
export class SnowEffect implements WeatherEffect {
    /**
     * Lifetime fraction (0..1) at which a snowflake reaches full alpha.
     * Each flake fades linearly from alpha 0 at spawn to alpha 1 at this
     * point.
     */
    public static readonly SNOW_FADE_IN: number = 0.9;

    /**
     * Lifetime fraction (0..1) at which a snowflake starts fading back
     * out. From this point until end-of-life, alpha ramps linearly from
     * `SNOW_MAX_ALPHA` back to 0.
     */
    public static readonly SNOW_FADE_OUT: number = 0.95;

    /**
     * Peak alpha (0..1) reached during the hold phase between
     * `SNOW_FADE_IN` and `SNOW_FADE_OUT`. Lower values produce more
     * subtle snowfall.
     */
    public static readonly SNOW_MAX_ALPHA: number = 0.4;

    /**
     * The Phaser scene to which the snow effect's particles are added.
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
     * The Phaser particle emitter that creates the snowflakes.
     */
    private emitter?: GameObjects.Particles.ParticleEmitter;

    /**
     * The intensity of the snow effect, ranging from 0.1 (a few flakes) to
     * 1 (heavy snowfall).
     */
    private readonly intensity: number;

    constructor(board: Board, rawOptions: Record<string, unknown> = {}) {
        this.scene = board.scene;
        this.width = board.width;
        this.height = board.height;
        this.intensity = SnowEffect.parseSnowIntensity(rawOptions.intensity);
    }

    /**
     * Validate and clamp a raw `intensity` value, falling back to a random
     * intensity if the value is missing or invalid.
     */
    private static parseSnowIntensity(raw: unknown): number {
        if (typeof raw === "number" && Number.isFinite(raw)) {
            return Math.min(1, Math.max(0.1, raw));
        }
        if (raw !== undefined) {
            console.warn(`SnowEffect: ignoring invalid intensity ${JSON.stringify(raw)}`);
        }
        return Math.random() * 0.9 + 0.1;
    }

    public start(): void {
        console.debug(`Starting snow with intensity ${this.intensity.toFixed(2)}`);
        const cs = Board.DEFAULT_CELLSIZE;
        const corner = (gx: number, gy: number) => ({
            x: (gx - gy) * cs,
            y: ((gx + gy) * cs) / 2 + cs / 2,
        });

        const lifespan: number = 4000;
        const fallSpeed: number = 50;
        // Wind drift, signed, scaled by intensity. Like rain's avgSpeedX.
        const windDrift: number = (Math.random() * 30 - 15) * this.intensity;
        // Position-space wave amplitude in pixels, scaled by intensity.
        const waveAmplitude: number = 15 * this.intensity;
        // Number of full sine waves over a particle's lifetime.
        const waveCycles: number = 2;
        const lifespanSeconds: number = lifespan / 1000;

        this.emitter = this.scene.add.particles(0, 0, "rain", {
            frame: "drop",
            speedY: fallSpeed,
            quantity: 10 * this.intensity,
            frequency: 80 / this.intensity,
            lifespan,
            scale: 0.66,
        });

        // Drive the X position directly so the wave is purely positional
        // (zero net drift) and the only horizontal travel is `windDrift`.
        // Using `accelerationX` instead would double-integrate to an extra
        // phase-dependent linear drift per particle, breaking the
        // spawn-offset guarantee that keeps flakes inside the diamond.
        //
        // We don't touch `x.onEmit` — that would clobber the emit zone's
        // spawn position. Instead, we lazy-capture each particle's spawn
        // x on its first update tick, after the emit zone has placed it.
        const xOp = this.emitter.ops.x;
        xOp.emitOnly = false;
        xOp.onUpdate = (particle: any, _key: string, t: number) => {
            if (particle.__spawnX === undefined) {
                particle.__spawnX = particle.x;
                particle.__wavePhase = Math.random() * Math.PI * 2;
            }
            const elapsedSeconds = t * lifespanSeconds;
            const wave = Math.sin(particle.__wavePhase + t * Math.PI * 2 * waveCycles) * waveAmplitude;
            return particle.__spawnX + windDrift * elapsedSeconds + wave;
        };

        // Fade in until SNOW_FADE_IN, hold at SNOW_MAX_ALPHA, then fade
        // out from SNOW_FADE_OUT through end-of-life.
        const fadeIn = SnowEffect.SNOW_FADE_IN;
        const fadeOut = SnowEffect.SNOW_FADE_OUT;
        const maxAlpha = SnowEffect.SNOW_MAX_ALPHA;
        const alphaOp = this.emitter.ops.alpha;
        alphaOp.emitOnly = false;
        alphaOp.onEmit = () => 0;
        alphaOp.onUpdate = (_particle: any, _key: string, t: number) => {
            if (t < fadeIn) return (t / fadeIn) * maxAlpha;
            if (t > fadeOut) return ((1 - t) / (1 - fadeOut)) * maxAlpha;
            return maxAlpha;
        };

        // Spawn zone: same diamond as rain, with the spawn point offset so
        // particles land on the board. Wave oscillation averages to zero,
        // so we only need to compensate for the wind drift.
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
        const spawnOffsetX = -((windDrift * lifespan) / 1000);
        const spawnOffsetY = -((fallSpeed * lifespan) / 1000);
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
    }

    public destroy(): void {
        this.emitter?.stop();
    }
}
