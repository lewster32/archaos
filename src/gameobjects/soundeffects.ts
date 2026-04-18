import { Sound, Scene } from "phaser";
import chaosSoundsData from "@assets/data/chaossounds.json";
import { playSound, SoundParams } from "./chaossounds";

/**
 * Class to manage sound effects in the game. Mostly just a wrapper around
 * Phaser's sound system, but some effects need a bit more logic.
 */
let _instance: SoundEffects | undefined;

interface ChaosSoundEntry extends SoundParams {
    id: string;
}

const CHAOS_SOUNDS = chaosSoundsData as unknown as ChaosSoundEntry[];

export class SoundEffects {
    private readonly _sound: Sound.BaseSound;

    protected constructor(scene: Scene) {
        this._sound = scene.sound.addAudioSprite("classicsounds");
    }

    public static getInstance(scene: Scene): SoundEffects {
        if (!_instance) {
            _instance = new SoundEffects(scene);
        }
        return _instance;
    }

    /**
     * Play a sound effect asynchronously.
     *
     * @param effectName the id of a chaossounds.json entry to synthesise via the
     *                   ZX Spectrum beeper emulator, or (when `useGenerator` is
     *                   false) the marker name of the effect in the audio sprite
     * @param options options for playing the sound effect
     * @param useGenerator defaults to true (beeper emulator). Pass false to
     *                     play a marker from the loaded audio sprite instead.
     */
    public async playAsync(
        effectName: string,
        options?: SoundEffectOptions,
        useGenerator: boolean = true,
    ): Promise<void> {
        try {
            const repeat: number = options?.repeat ?? 1;
            const delay: number = options?.delay ?? 0;

            for (let i = 0; i < repeat; i++) {
                if (useGenerator) {
                    await this._playGenerated(effectName);
                } else {
                    this._sound.play(effectName);
                }
                /* v8 ignore next */
                if (i < repeat - 1 && delay > 0) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, delay),
                    );
                }
            }
        } catch (e) {
            console.error(`Error playing sound effect '${effectName}':`, e);
        }
    }

    /**
     * Play a sound effect.
     *
     * @param effectName the id of a chaossounds.json entry to synthesise via the
     *                   ZX Spectrum beeper emulator, or (when `useGenerator` is
     *                   false) the marker name of the effect in the audio sprite
     * @param useGenerator defaults to true (beeper emulator). Pass false to
     *                     play a marker from the loaded audio sprite instead.
     */
    public play(effectName: string, useGenerator: boolean = true): void {
        try {
            if (useGenerator) {
                this._playGenerated(effectName).catch((e) => {
                    console.error(
                        `Error playing sound effect '${effectName}':`,
                        e,
                    );
                });
            } else {
                this._sound.play(effectName);
            }
        } catch (e) {
            console.error(`Error playing sound effect '${effectName}':`, e);
        }
    }

    /**
     * Look up a chaossounds.json entry by id and play it through the beeper
     * emulator. Throws if the id is unknown.
     *
     * The beeper emulator uses its own Web Audio API context, separate from
     * Phaser's sound manager, so we explicitly honour the manager's mute
     * flag here to keep `scene.sound.mute` as the single source of truth.
     */
    private _playGenerated(id: string): Promise<void> {
        if (this._sound.manager.mute) {
            return Promise.resolve();
        }
        const entry = CHAOS_SOUNDS.find((s) => s.id === id);
        if (!entry) {
            throw new Error(`Chaos sound '${id}' not found`);
        }
        return playSound(entry);
    }

    /**
     * Destroy the sound effects manager and free resources.
     */
    public destroy(): void {
        this._sound.destroy();
        _instance = undefined;
    }
}

/* v8 ignore next 5 */
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        _instance?.destroy();
    });
}

/**
 * Options for playing a sound effect. Only used with `playAsync`.
 */
export interface SoundEffectOptions {
    /**
     * Number of times to repeat the sound effect.
     */
    repeat?: number;

    /**
     * Delay between repeats in milliseconds.
     */
    delay?: number;
}
