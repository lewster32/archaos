import { Piece } from "./piece";

import {
    Scene,
    GameObjects,
    Math as PMath,
    Geom,
    Curves,
    BlendModes,
    Display,
} from "phaser";

import effectsData from "../../assets/data/effects.json";

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
    startPosition: PMath.Vector2 | Geom.Point,
    endPosition?: PMath.Vector2 | Geom.Point,
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
        startPosition: PMath.Vector2 | Geom.Point,
        endPosition: PMath.Vector2 | Geom.Point | null,
        target: Piece | null,
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
        this.playEffect(resolve);
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
                            target.sprite.setTintFill(0xffffff);
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
                        target.sprite.setTintFill(
                            colors![
                                Math.floor(tween.getValue()) % colors!.length
                            ],
                        );
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
                        target.sprite.setTintFill(
                            Display.Color.GetColor(value, value, value),
                        );
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
                            target.sprite.setTintFill(
                                colors![
                                    Math.floor(Math.random() * colors!.length)
                                ],
                            );
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

    private playEffect(resolve: Function) {
        const duration = this._def.duration;

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

export enum EffectType {
    WizardCasting = "WizardCasting",
    WizardCastFail = "WizardCastFail",
    WizardCastBeam = "WizardCastBeam",
    WizardDefeated = "WizardDefeated",
    ArrowBeam = "ArrowBeam",
    ArrowHit = "ArrowHit",
    DragonFireBeam = "DragonFireBeam",
    DragonFireHit = "DragonFireHit",
    BlackDragonFireBeam = "BlackDragonFireBeam",
    BlackDragonFireHit = "BlackDragonFireHit",
    MagicBoltBeam = "MagicBoltBeam",
    MagicBoltHit = "MagicBoltHit",
    LightningBeam = "LightningBeam",
    LightningHit = "LightningHit",
    SummonPiece = "SummonPiece",
    DisbelieveBeam = "DisbelieveBeam",
    DisbelieveHit = "DisbelieveHit",
    DarkPowerHit = "DarkPowerHit",
    JusticeHit = "JusticeHit",
    RaiseDeadBeam = "RaiseDeadBeam",
    RaiseDeadHit = "RaiseDeadHit",
    SubversionBeam = "SubversionBeam",
    SubversionHit = "SubversionHit",
    GiveSpell = "GiveSpell",
    AttackHit = "AttackHit",
    NoCorpseDeath = "NoCorpseDeath",
    TurmoilBeam = "TurmoilBeam",
}
