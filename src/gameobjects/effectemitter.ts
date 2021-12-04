import { Board } from "./board";
import { Piece } from "./piece";

export class EffectEmitter extends Phaser.GameObjects.Particles
    .ParticleEmitter {
    private _anim: Phaser.Animations.Animation;
    private _startPosition: Phaser.Math.Vector2 | Phaser.Geom.Point;
    private _endPosition: Phaser.Math.Vector2 | Phaser.Geom.Point;
    private _target: Piece | null;
    private _type: EffectType;

    get anim() {
        return this._anim;
    }
    constructor(
        manager: Phaser.GameObjects.Particles.ParticleEmitterManager,
        type: EffectType,
        startPosition: Phaser.Math.Vector2 | Phaser.Geom.Point,
        endPosition: Phaser.Math.Vector2 | Phaser.Geom.Point | null,
        target: Piece | null,
        resolve: Function
    ) {
        super(
            manager,
            EffectEmitter.getConfig(type, startPosition, endPosition, target)
        );
        this._type = type;
        this._anim = this.getAnim();

        this._startPosition = startPosition;
        this._endPosition = endPosition;
        this._target = target;
        this.playEffect(resolve);
    }

    private static getConfig(
        type: EffectType,
        startPosition: Phaser.Math.Vector2 | Phaser.Geom.Point,
        endPosition?: Phaser.Math.Vector2 | Phaser.Geom.Point,
        target?: Piece
    ): any {
        let path: Phaser.Curves.Path;
        let circleSize: number = 10;
        switch (type) {
            case EffectType.WizardCasting:
                path = new Phaser.Curves.Path(
                    startPosition.x + circleSize,
                    startPosition.y
                ).circleTo(circleSize);
                return {
                    x: { min: -5, max: 5 },
                    y: { min: -5, max: 5 },
                    frame: "sparkle1",
                    gravityY: 60,
                    speedX: { min: -20, max: 20 },
                    lifespan: 500,
                    tint: [0xff00ff, 0x5500ff, 0x9900ff, 0xff44ff],
                    blendMode: Phaser.BlendModes.ADD,
                    emitZone: { type: "edge", source: path, quantity: 30 },
                    particleClass: EffectParticle,
                };
            case EffectType.WizardCastFail:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y - 8, max: startPosition.y + 8 },
                    frame: "sparkle1",
                    speedX: { min: -20, max: 20 },
                    speedY: { min: -10, max: -50 },
                    lifespan: 300,
                    tint: [0x7744ff, 0x333388, 0x6666cc],
                    blendMode: Phaser.BlendModes.ADD,
                    alpha: { start: 1, end: 0 },
                    particleClass: EffectParticle,
                };
            case EffectType.WizardCastBeam:
                path = new Phaser.Curves.Path(
                    startPosition.x,
                    startPosition.y
                ).lineTo(endPosition.x, endPosition.y);
                return {
                    x: { min: -2, max: 2 },
                    y: { min: -2, max: 2 },
                    frame: "sparkle1",
                    gravityY: 60,
                    speedX: { min: -10, max: 10 },
                    lifespan: 400,
                    scale: { start: 1, end: 0 },
                    tint: [0xff00ff, 0x5500ff, 0x9900ff, 0xff44ff],
                    blendMode: Phaser.BlendModes.ADD,
                    emitZone: { type: "edge", source: path, quantity: 40 },
                    particleClass: EffectParticle,
                };
            case EffectType.DragonFireBeam:
                path = new Phaser.Curves.Path(
                    startPosition.x,
                    startPosition.y
                ).lineTo(endPosition.x, endPosition.y);
                return {
                    x: { min: -2, max: 2 },
                    y: { min: -5, max: 2 },
                    frame: "dragonfire1",
                    gravityY: -60,
                    speedX: { min: -10, max: 10 },
                    scale: { start: 0.5, end: 1 },
                    lifespan: 400,
                    blendMode: Phaser.BlendModes.ADD,
                    tint: [0xffffff, 0xff00ff, 0xff0088],
                    emitZone: { type: "edge", source: path, quantity: 20 },
                    particleClass: EffectParticle,
                };
            case EffectType.DragonFireHit:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y - 8, max: startPosition.y + 8 },
                    frame: "dragonfire1",
                    speedX: { min: -20, max: 20 },
                    speedY: { min: -10, max: -50 },
                    gravityY: -60,
                    lifespan: 300,
                    tint: [0xffffff, 0xff00ff, 0xff0088],
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
            case EffectType.MagicBoltBeam:
                path = new Phaser.Curves.Path(
                    startPosition.x,
                    startPosition.y
                ).lineTo(endPosition.x, endPosition.y);
                return {
                    x: { min: -2, max: 2 },
                    y: { min: -5, max: 2 },
                    frame: "magicbolt1",
                    quantity: 2,
                    speedX: { min: -10, max: 10 },
                    scale: { start: 1, end: 0 },
                    lifespan: 100,
                    tint: [0xffffff, 0x9955ff],
                    emitZone: { type: "edge", source: path, quantity: 120 },
                    particleClass: EffectParticle,
                };
            case EffectType.MagicBoltHit:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y - 8, max: startPosition.y + 8 },
                    frame: "magicbolt1",
                    speedX: { min: -80, max: 80 },
                    speedY: { min: -10, max: -150 },
                    scale: { start: 1, end: 0 },
                    gravityY: 160,
                    lifespan: 500,
                    tint: [0xffffff, 0x9955ff],
                    particleClass: EffectParticle,
                };
            case EffectType.LightningBeam:
                path = new Phaser.Curves.Path(
                    startPosition.x,
                    startPosition.y
                ).lineTo(endPosition.x, endPosition.y);
                return {
                    x: { min: -5, max: 5 },
                    y: { min: -5, max: 5 },
                    angle: { min: 0, max: 180 },
                    scale: { min: 0.1, max: 1, start: 1, end: 0 },
                    quantity: 4,
                    frame: "lightning1",
                    speedY: { min: -50, max: 50 },
                    speedX: { min: -50, max: 50 },
                    lifespan: 300,
                    tint: [0x0000ff, 0x00ffff, 0x66ffff, 0xffffff],
                    blendMode: Phaser.BlendModes.ADD,
                    emitZone: { type: "edge", source: path, quantity: 40 },
                    particleClass: EffectParticle,
                };
            case EffectType.LightningHit:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y - 8, max: startPosition.y + 8 },
                    frame: "lightning1",
                    angle: { min: 0, max: 180 },
                    speedX: { min: -120, max: 120 },
                    speedY: { min: -50, max: 50 },
                    scale: { start: 1, end: 0 },
                    lifespan: 400,
                    tint: [0x0000ff, 0x00ffff, 0x66ffff, 0xffffff],
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
            case EffectType.ArrowBeam:
                path = new Phaser.Curves.Path(
                    startPosition.x,
                    startPosition.y
                ).lineTo(endPosition.x, endPosition.y);
                return {
                    frame: "sparkle1",
                    quantity: 5,
                    lifespan: 50,
                    blendMode: Phaser.BlendModes.ADD,
                    emitZone: { type: "edge", source: path, quantity: 80 },
                };
            case EffectType.ArrowHit:
                return {
                    frame: "sparkle2",
                    frequency: 20,
                    x: { min: startPosition.x - 2, max: startPosition.x + 2 },
                    y: { min: startPosition.y - 2, max: startPosition.y + 2 },
                    speedX: { min: -80, max: 80 },
                    speedY: { min: -180, max: -80 },
                    gravityY: 1000,
                    lifespan: 250,
                    blendMode: Phaser.BlendModes.ADD,
                    scale: { start: 1.5, end: 0 },
                };
            case EffectType.AttackHit:
                return {
                    frame: "sparkle2",
                    frequency: 15,
                    x: { min: startPosition.x - 2, max: startPosition.x + 2 },
                    y: { min: startPosition.y - 2, max: startPosition.y + 8 },
                    speedX: { min: -120, max: 120 },
                    speedY: { min: -80, max: -180 },
                    gravityY: 500,
                    lifespan: 250,
                    blendMode: Phaser.BlendModes.ADD,
                    scale: { start: 2, end: 0 },
                };
            case EffectType.SummonPiece:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y, max: startPosition.y + 8 },
                    frame: "sparkle1",
                    quantity: 2,
                    speedX: { min: -10, max: 10 },
                    speedY: { min: -10, max: -100 },
                    lifespan: 400,
                    tint: [0xff00ff, 0x5500ff, 0x9900ff, 0xff44ff],
                    scale: { start: 1, end: 0 },
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
            case EffectType.DisbelieveBeam:
                path = new Phaser.Curves.Path(
                    startPosition.x,
                    startPosition.y
                ).lineTo(endPosition.x, endPosition.y);
                return {
                    x: { min: -4, max: 4 },
                    y: { min: -4, max: 4 },
                    frame: "sparkle1",
                    gravityY: 60,
                    quantity: 2,
                    speedX: { min: -10, max: 10 },
                    lifespan: 400,
                    scale: { start: 2, end: 0.5 },
                    blendMode: Phaser.BlendModes.ADD,
                    emitZone: { type: "edge", source: path, quantity: 20 },
                    particleClass: EffectParticle,
                };
            case EffectType.DisbelieveHit:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y - 8, max: startPosition.y + 8 },
                    frame: "sparkle1",
                    quantity: 2,
                    speedX: { min: -80, max: 80 },
                    speedY: { min: -10, max: -150 },
                    scale: { start: 2, end: 0 },
                    gravityY: 260,
                    lifespan: 500,
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
            case EffectType.DarkPowerHit:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y - 8, max: startPosition.y + 8 },
                    frame: "sparkle1",
                    quantity: 2,
                    speedX: { min: -80, max: 80 },
                    speedY: { min: -10, max: -80 },
                    scale: { start: 2, end: 0 },
                    tint: [0xff0000, 0x0000ff, 0xff00ff],
                    gravityY: 160,
                    lifespan: 500,
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
            case EffectType.JusticeHit:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y - 8, max: startPosition.y + 8 },
                    frame: "sparkle1",
                    quantity: 2,
                    speedX: { min: -80, max: 80 },
                    speedY: { min: -10, max: -80 },
                    scale: { start: 2, end: 0 },
                    tint: [0x0000ff, 0x00ffff, 0x0077ff],
                    gravityY: 160,
                    lifespan: 500,
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
            case EffectType.WizardDefeated:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y - 8, max: startPosition.y + 8 },
                    frame: "magicbolt1",
                    quantity: 2,
                    speed: { min: 10, max: 180 },
                    angle: { start: 0, end: 360, steps: 8 },
                    scale: { start: 3, end: 0 },
                    tint: [0x0000ff, 0xff0000, 0xff00ff, 0x00ff00, 0x00ffff, 0xffff00, 0xffffff],
                    lifespan: 400,
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
            case EffectType.RaiseDeadBeam:
                path = new Phaser.Curves.Path(
                    startPosition.x,
                    startPosition.y
                ).lineTo(endPosition.x, endPosition.y);
                return {
                    x: { min: -4, max: 4 },
                    y: { min: -4, max: 4 },
                    frame: "magicbolt1",
                    gravityY: -100,
                    quantity: 4,
                    speedX: { min: -20, max: 20 },
                    lifespan: 400,
                    scale: { start: 0, end: 1 },
                    tint: [0x66ffff, 0x6666ff],
                    blendMode: Phaser.BlendModes.ADD,
                    emitZone: { type: "edge", source: path, quantity: 40 },
                    particleClass: EffectParticle,
                };
            case EffectType.RaiseDeadHit:
                return {
                    frame: "magicbolt1",
                    quantity: 1,
                    x: { min: startPosition.x - 2, max: startPosition.x + 2 },
                    y: { min: startPosition.y - 2, max: startPosition.y + 7 },
                    speed: { min: 10, max: 50 },
                    scale: { start: 0, end: 2 },
                    tint: [0x66ffff, 0x6666ff],
                    gravityY: -560,
                    lifespan: 200,
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
            case EffectType.SubversionBeam:
                path = new Phaser.Curves.Path(
                    startPosition.x,
                    startPosition.y
                ).lineTo(endPosition.x, endPosition.y);
                return {
                    x: { min: -2, max: 2 },
                    y: { min: -2, max: 2 },
                    frame: "sparkle1",
                    gravityY: 50,
                    quantity: 2,
                    speedX: { min: -20, max: 20 },
                    lifespan: 600,
                    scale: { start: 2, end: 0 },
                    tint: [0xff00ff, 0x00ffff],
                    blendMode: Phaser.BlendModes.ADD,
                    emitZone: { type: "edge", source: path, quantity: 90 },
                    particleClass: EffectParticle,
                };
            case EffectType.SubversionHit:
                return {
                    frame: "sparkle1",
                    quantity: 1,
                    x: { min: startPosition.x - 2, max: startPosition.x + 2 },
                    y: { min: startPosition.y - 2, max: startPosition.y + 7 },
                    speed: { min: 10, max: 50 },
                    scale: { start: 4, end: 0 },
                    tint: [0xff00ff, 0x00ffff],
                    gravityY: -100,
                    lifespan: 400,
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
            case EffectType.GiveSpell:
                return {
                    x: { min: startPosition.x - 7, max: startPosition.x + 7 },
                    y: { min: startPosition.y - 8, max: startPosition.y + 8 },
                    frame: "sparkle1",
                    quantity: 1,
                    speedX: { min: -80, max: 80 },
                    speedY: { min: -10, max: -150 },
                    scale: { start: 1.5, end: .5 },
                    gravityY: 260,
                    lifespan: 250,
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                    tint: [0x0000ff, 0xff0000, 0xff00ff, 0x00ff00, 0x00ffff, 0xffff00, 0xffffff]
                };
        }
    }

    private getAnim(): Phaser.Animations.Animation {
        switch (this._type) {
            case EffectType.DragonFireBeam:
            case EffectType.DragonFireHit:
                return this.manager.scene.anims.get("dragonfire");
            case EffectType.MagicBoltBeam:
            case EffectType.MagicBoltHit:
            case EffectType.WizardDefeated:
            case EffectType.RaiseDeadBeam:
            case EffectType.RaiseDeadHit:
                return this.manager.scene.anims.get("magicbolt");
            case EffectType.LightningBeam:
            case EffectType.LightningHit:
                return this.manager.scene.anims.get("lightning");
            default:
                return this.manager.scene.anims.get("sparkle");
        }
    }

    private async playTargetEffect(duration: number = 300): Promise<void> {
        const target = this._target;
        if (!target) {
            return;
        }
        switch (this._type) {
            case EffectType.ArrowHit:
            case EffectType.AttackHit:
                this.manager.scene.tweens.addCounter({
                    from: 0,
                    to: 4,
                    duration: duration,
                    onUpdate: (tween) => {
                        if (Math.round(tween.getValue()) % 2 === 0) {
                            target.sprite.setTintFill(0xffffff);
                        } else {
                            target.sprite.setTint(target.defaultTint)
                        }
                    },
                    onComplete: () => {
                        target.sprite.setTint(target.defaultTint)
                    },
                });
                break;
            case EffectType.LightningHit:
                this.manager.scene.tweens.addCounter({
                    from: 0,
                    to: 5,
                    duration: duration,
                    onUpdate: (tween) => {
                        if (Math.round(tween.getValue()) % 2 === 0) {
                            target.sprite.setTintFill(0xffffff);
                        } else {
                            target.sprite.setTintFill(0x0000ff);
                        }
                    },
                    onComplete: () => {
                        target.sprite.setTint(target.defaultTint)
                    },
                });
                break;
            case EffectType.DragonFireHit:
                this.manager.scene.tweens.addCounter({
                    from: 0,
                    to: 10,
                    duration: duration,
                    onUpdate: (tween) => {
                        target.sprite.setTintFill(
                            [0xff0000, 0xff7700, 0x000000][
                                Math.floor(tween.getValue()) % 3
                            ]
                        );
                    },
                    onComplete: () => {
                        target.sprite.setTint(target.defaultTint)
                    },
                });
                break;
            case EffectType.DarkPowerHit:
                this.manager.scene.tweens.addCounter({
                    from: 0,
                    to: 10,
                    duration: duration,
                    onUpdate: (tween) => {
                        target.sprite.setTintFill(
                            [0xff0000, 0x0000ff, 0xff00ff][
                                Math.floor(tween.getValue()) % 3
                            ]
                        );
                    },
                    onComplete: () => {
                        target.sprite.setTint(target.defaultTint)
                    },
                });
                break;
            case EffectType.JusticeHit:
                this.manager.scene.tweens.addCounter({
                    from: 0,
                    to: 10,
                    duration: duration,
                    onUpdate: (tween) => {
                        target.sprite.setTintFill(
                            [0x0000ff, 0x00ffff, 0x0077ff][
                                Math.floor(tween.getValue()) % 3
                            ]
                        );
                    },
                    onComplete: () => {
                        target.sprite.setTint(target.defaultTint)
                    },
                });
                break;
            case EffectType.DisbelieveHit:
                this.manager.scene.tweens.addCounter({
                    from: 0,
                    to: 255,
                    duration: duration / 2,
                    onUpdate: (tween) => {
                        const value: number = Math.floor(tween.getValue());

                        target.sprite.setTintFill(
                            Phaser.Display.Color.GetColor(value, value, value)
                        );
                    },
                });
                this.manager.scene.tweens.add({
                    targets: [target.sprite, target.shadow],
                    duration: duration,
                    delay: duration / 2,
                    alpha: { from: 1, to: 0 },
                });
                break;
            case EffectType.WizardDefeated:
                this.manager.scene.tweens.addCounter({
                    from: 0,
                    to: 64,
                    duration: duration,
                    onUpdate: (tween) => {
                        const value: number = Math.floor(tween.getValue()) % 5;

                        if (value === 0) {
                            target.sprite.setTintFill(
                                Phaser.Math.RND.pick([0x0000ff, 0xff0000, 0xff00ff, 0x00ff00, 0x00ffff, 0xffff00, 0xffffff])
                            );
                        }
                    },
                });
                this.manager.scene.tweens.add({
                    targets: [target.sprite, target.shadow],
                    duration: duration / 2,
                    delay: duration / 2,
                    alpha: { from: 1, to: 0 },
                });
                break;
        }
    }

    private playEffect(resolve: Function) {
        let duration: number = 400;
        switch (this._type) {
            case EffectType.JusticeHit:
            case EffectType.DarkPowerHit:
                duration = 2000;
                break;
            case EffectType.WizardDefeated:
            case EffectType.RaiseDeadHit:
            case EffectType.SubversionHit:
            case EffectType.GiveSpell:
            case EffectType.DragonFireHit:
                duration = 1000;
                break;
            case EffectType.MagicBoltBeam:
            case EffectType.SubversionBeam:
            case EffectType.DisbelieveHit:
            case EffectType.WizardCastFail:
                duration = 500;
                break;
            case EffectType.WizardCastBeam:
            case EffectType.DisbelieveBeam:
            case EffectType.RaiseDeadBeam:
                duration = 300;
                break;
            case EffectType.LightningHit:
            case EffectType.MagicBoltHit:
            case EffectType.SummonPiece:
            case EffectType.WizardCasting:
            case EffectType.AttackHit:
                duration = 250;
                break;
            case EffectType.LightningBeam:
            case EffectType.ArrowBeam:
            case EffectType.ArrowHit:
                duration = 150;
                break;
        }

        switch (this._type) {
            case EffectType.MagicBoltHit:
            case EffectType.ArrowHit:
                this.manager.scene.cameras.main.shake(150, 0.005, true);
                break;
            case EffectType.LightningHit:
                this.manager.scene.cameras.main.shake(300, 0.0125, true);
                break;
        }

        if (this._target) {
            this.playTargetEffect(duration);
        }

        this.manager.scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: duration,
            onComplete: () => {
                this.stop();
                resolve();
                setTimeout(() => {
                    this.manager.removeEmitter(this);
                }, duration * 2);
            },
        });
    }
}

class EffectParticle extends Phaser.GameObjects.Particles.Particle {
    private _frameTime: number;
    private _frameIndex: number;

    private _anim: Phaser.Animations.Animation;

    constructor(emitter: EffectEmitter) {
        super(emitter);
        this._anim = emitter.anim;
        this._frameTime = 0;
        this._frameIndex = Phaser.Math.RND.integerInRange(
            0,
            this._anim.frames.length - 1
        );
    }

    update(delta: number, step: number, processors: any): boolean {
        const result: boolean = super.update(delta, step, processors);

        this._frameTime += delta;
        if (this._frameTime >= this._anim.msPerFrame) {
            this._frameIndex++;

            if (this._frameIndex > this._anim.frames.length - 1) {
                this._frameIndex = 0;
            }

            this.frame = this._anim.frames[this._frameIndex].frame;

            this._frameTime -= this._anim.msPerFrame;
        }

        return result;
    }
}

export enum EffectType {
    WizardCasting,
    WizardCastFail,
    WizardCastBeam,
    WizardDefeated,
    ArrowBeam,
    ArrowHit,
    DragonFireBeam,
    DragonFireHit,
    MagicBoltBeam,
    MagicBoltHit,
    LightningBeam,
    LightningHit,
    SummonPiece,
    DisbelieveBeam,
    DisbelieveHit,
    DarkPowerHit,
    JusticeHit,
    RaiseDeadBeam,
    RaiseDeadHit,
    SubversionBeam,
    SubversionHit,
    GiveSpell,
    AttackHit
}
