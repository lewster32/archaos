import { Sound, Scene } from "phaser"

/**
 * Class to manage sound effects in the game. Mostly just a wrapper around
 * Phaser's sound system, but some effects need a bit more logic.
 */
let _instance: SoundEffects | undefined;

export class SoundEffects {
    private readonly _sound: Sound.BaseSound;

    protected constructor(scene: Scene) {
        this._sound = scene.sound.addAudioSprite("classicsounds")
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
     * @param effectName the marker name of the effect to play from the audio sprite
     * @param options options for playing the sound effect
     */
    public async playAsync(effectName: string, options?: SoundEffectOptions): Promise<void> {
        try {
            if (options) {
                const repeat: number = options.repeat ?? 1;
                const delay: number = options.delay ?? 0;
                
                for (let i = 0; i < repeat; i++) {
                    this._sound.play(effectName);
                    if (i < repeat) {
                        await new Promise((resolve) => setTimeout(resolve, delay));
                    }
                }
            }
            else {
                this._sound.play(effectName);
            }
        } catch (e) {
            console.error(`Error playing sound effect '${effectName}':`, e);
        }
    }

    /**
     * Play a sound effect.
     * 
     * @param effectName the marker name of the effect to play from the audio sprite
     */
    public play(effectName: string): void {
        try {
            this._sound.play(effectName);
        } catch (e) {
            console.error(`Error playing sound effect '${effectName}':`, e);
        }
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
