import { EffectType } from "@archaos/engine";
import { Piece } from "./piece";

import Phaser from "phaser";
import {
    Scene,
    GameObjects,
    Math as PMath,
    Curves,
    BlendModes,
    Display,
} from "phaser";

import effectsData from "@assets/data/effects.json";

/**
 * Factory function for effects defined in code rather than via effects.json.
 * Must call `resolve` when the effect is complete so callers can await it.
 */
export type CustomEffectFactory = (
    scene: Scene,
    startPosition: PMath.Vector2,
    endPosition: PMath.Vector2 | null,
    target: Piece | null,
    duration: number | null,
    resolve: Function,
) => GameObjects.GameObject;

interface EffectDefinition {
    duration: number;
    particle: Record<string, any>;
    emitZone?: { shape: string; radius?: number; quantity: number };
    origin?: { x: number[]; y: number[] };
    targetEffect?: { type: string; to?: number; colors?: string[] };
    cameraShake?: { duration: number; intensity: number };
}

const BLEND_MODES: Record<string, number> = {
    ADD: BlendModes.ADD,
};

const parseHexColor = (hex: string): number => {
    return Number.parseInt(hex, 16);
};

const buildParticleConfig = (
    def: EffectDefinition,
    startPosition: PMath.Vector2,
    endPosition?: PMath.Vector2,
): any => {
    const config: any = { ...def.particle };

    if (config.anim) {
        config.anim = { anims: config.anim, startFrame: true };
    }

    if (config.tint) {
        config.tint = config.tint.map(parseHexColor);
    }

    if (config.blendMode) {
        config.blendMode = BLEND_MODES[config.blendMode] ?? config.blendMode;
    }

    if (def.origin) {
        config.x = {
            min: startPosition.x + def.origin.x[0],
            max: startPosition.x + def.origin.x[1],
        };
        config.y = {
            min: startPosition.y + def.origin.y[0],
            max: startPosition.y + def.origin.y[1],
        };
    }

    if (def.emitZone) {
        let path: Curves.Path;
        if (def.emitZone.shape === "circle") {
            const radius = def.emitZone.radius!;
            path = new Curves.Path(
                startPosition.x + radius,
                startPosition.y,
            ).circleTo(radius);
        } else {
            path = new Curves.Path(startPosition.x, startPosition.y).lineTo(
                endPosition!.x,
                endPosition!.y,
            );
        }
        config.emitZone = {
            type: "edge",
            source: path,
            quantity: def.emitZone.quantity,
        };
    }

    return config;
};

/**
 * Particle-based visual effects driven by configuration in effects.json.
 * Each effect type defines particle properties, optional emit zones/paths,
 * target sprite animations, and camera shakes.
 */
export class EffectEmitter extends GameObjects.Particles.ParticleEmitter {
    private readonly _target: Piece | null;
    private readonly _def: EffectDefinition;

    constructor(
        scene: Scene,
        type: EffectType,
        startPosition: PMath.Vector2,
        endPosition: PMath.Vector2 | null,
        target: Piece | null,
        duration: number | null,
        resolve: Function,
    ) {
        const def = (effectsData as Record<string, EffectDefinition>)[type];
        super(
            scene,
            0,
            0,
            "effects",
            buildParticleConfig(def, startPosition, endPosition),
        );
        this._def = def;
        this._target = target;
        this.playEffect(resolve, duration ?? def.duration);
    }

    private playTargetEffect(duration: number): void {
        const target = this._target;
        if (!target) return;

        const te = this._def.targetEffect;
        if (!te) return;

        const colors = te.colors?.map(parseHexColor);

        switch (te.type) {
            case "flash":
                this.scene.tweens.addCounter({
                    from: 0,
                    to: te.to!,
                    duration,
                    onUpdate: (tween) => {
                        if (Math.round(tween.getValue()) % 2 === 0) {
                            // @ts-expect-error -- phaser4
                            target.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
                        } else {
                            target.sprite.setTint(target.defaultTint);
                        }
                    },
                    onComplete: () => {
                        target.sprite.setTint(target.defaultTint);
                    },
                });
                break;

            case "cycleTint":
                this.scene.tweens.addCounter({
                    from: 0,
                    to: te.to!,
                    duration,
                    onUpdate: (tween) => {
                        // @ts-expect-error -- phaser4
                        target.sprite.setTint(colors![Math.floor(tween.getValue()) % colors!.length])
                            .setTintMode(Phaser.TintModes.FILL);
                    },
                    onComplete: () => {
                        target.sprite.setTint(target.defaultTint);
                    },
                });
                break;

            case "fadeToWhite":
                this.scene.tweens.addCounter({
                    from: 0,
                    to: 255,
                    duration: duration / 2,
                    onUpdate: (tween) => {
                        const value: number = Math.floor(tween.getValue());
                        // @ts-expect-error -- phaser4
                        target.sprite.setTint(Display.Color.GetColor(value, value, value))
                            .setTintMode(Phaser.TintModes.FILL);
                    },
                });
                this.scene.tweens.add({
                    targets: [target.sprite, target.shadow],
                    duration: duration,
                    delay: duration / 2,
                    alpha: { from: 1, to: 0 },
                });
                break;

            case "explode":
                this.scene.tweens.addCounter({
                    from: 0,
                    to: 64,
                    duration,
                    onUpdate: (tween) => {
                        const value: number = Math.floor(tween.getValue()) % 5;
                        if (value === 0) {
                            // @ts-expect-error -- phaser4
                            target.sprite.setTint(colors![Math.floor(Math.random() * colors!.length)])
                                .setTintMode(Phaser.TintModes.FILL);
                        }
                    },
                });
                this.scene.tweens.add({
                    targets: [target.sprite, target.shadow],
                    duration: duration / 2,
                    delay: duration / 2,
                    alpha: { from: 1, to: 0 },
                });
                break;
        }
    }

    private playEffect(resolve: Function, effectDuration: number | null) {
        const duration = effectDuration ?? this._def.duration;

        if (this._def.cameraShake) {
            this.scene.cameras.main.shake(
                this._def.cameraShake.duration,
                this._def.cameraShake.intensity,
                true,
            );
        }

        if (this._target) {
            this.playTargetEffect(duration);
        }

        this.scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: duration,
            onComplete: () => {
                this.stop();
                resolve();
                setTimeout(() => {
                    this.destroy();
                }, duration * 2);
            },
        });
    }
}

/**
 * A pulsing downward arrow that draws attention to a specific board position.
 * Used by tutorial steps to point the player towards the relevant position.
 */
class PointAtPositionEffect extends GameObjects.Container {
    constructor(
        scene: Scene,
        startPosition: PMath.Vector2,
        duration: number = 3500,
        resolve: Function = () => {},
    ) {
        super(scene, startPosition.x, startPosition.y);

        const arrow: GameObjects.Image = scene.add
            .image(0, -30, "pointer-arrow")
            .setOrigin(0.5, 0)
            .setAlpha(0);
        this.add(arrow);

        scene.tweens.add({
            targets: arrow,
            alpha: 1,
            duration: 300,
            ease: "Sine.easeOut",
        });

        const bobDuration: number = duration; // yoyo * (repeat + 1) = 3500ms
        const fadeOutDuration: number = duration - 500;

        scene.tweens.add({
            targets: arrow,
            y: { from: -30, to: -20 },
            duration: 350,
            yoyo: true,
            repeat: 4,
            ease: "Sine.easeInOut",
        });

        scene.tweens.add({
            targets: arrow,
            alpha: 0,
            duration: fadeOutDuration,
            delay: bobDuration - fadeOutDuration,
            ease: "Sine.easeIn",
            onComplete: () => {
                resolve();
                setTimeout(() => this.destroy(), 50);
            },
        });
    }
}

export { EffectType } from "@archaos/engine";

/**
 * Registry of code-defined effects. Each entry maps an EffectType to a
 * factory that creates the corresponding GameObject. Checked by createEffect
 * before falling back to the data-driven EffectEmitter.
 */
const CUSTOM_EFFECT_REGISTRY = new Map<EffectType, CustomEffectFactory>([
    [
        EffectType.PointAtPosition,
        (scene, startPos, _endPos, _target, duration, resolve) =>
            new PointAtPositionEffect(scene, startPos, duration, resolve),
    ],
]);

/**
 * Registers an additional custom effect factory. Use this to add code-defined
 * effects without modifying this file.
 */
export const registerCustomEffect = (
    type: EffectType,
    factory: CustomEffectFactory,
): void => {
    CUSTOM_EFFECT_REGISTRY.set(type, factory);
};

/**
 * Creates an effect for the given type. Custom effects registered in
 * CUSTOM_EFFECT_REGISTRY take precedence; all other types fall through to the
 * data-driven EffectEmitter (effects.json).
 */
export const createEffect = (
    scene: Scene,
    type: EffectType,
    startPosition: PMath.Vector2,
    endPosition: PMath.Vector2 | null,
    target: Piece | null,
    duration: number | null,
    resolve: Function,
): GameObjects.GameObject => {
    const factory = CUSTOM_EFFECT_REGISTRY.get(type);
    if (factory) {
        return factory(
            scene,
            startPosition,
            endPosition,
            target,
            duration,
            resolve,
        );
    }
    return new EffectEmitter(
        scene,
        type,
        startPosition,
        endPosition,
        target,
        duration,
        resolve,
    );
};
