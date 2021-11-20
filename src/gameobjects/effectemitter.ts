export class EffectEmitter extends Phaser.GameObjects.Particles
    .ParticleEmitter {
    private _anim: Phaser.Animations.Animation;
    private _startPosition: Phaser.Math.Vector2 | Phaser.Geom.Point;
    private _endPosition: Phaser.Math.Vector2 | Phaser.Geom.Point;
    private _type: EffectType;

    get anim() {
        return this._anim;
    }
    constructor(
        manager: Phaser.GameObjects.Particles.ParticleEmitterManager,
        type: EffectType,
        startPosition: Phaser.Math.Vector2 | Phaser.Geom.Point,
        endPosition: Phaser.Math.Vector2 | Phaser.Geom.Point | null,
        resolve: Function
    ) {
        super(manager, EffectEmitter.getConfig(type, startPosition, endPosition));
        this._type = type;
        this._anim = this.getAnim();

        this._startPosition = startPosition;
        this._endPosition = endPosition;
        this.playEffect(resolve);
    }

    private static getConfig(
        type: EffectType,
        startPosition: Phaser.Math.Vector2 | Phaser.Geom.Point,
        endPosition?: Phaser.Math.Vector2 | Phaser.Geom.Point
    ): any {
        let path: Phaser.Curves.Path;
        switch (type) {
            case EffectType.WizardCasting:
                const circleSize: number = 10;
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
                    alpha: { start: 1, end: 0 },
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
                    emitZone: { type: "edge", source: path, quantity: 120 },
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
                    alpha: { start: 1, end: 0 },
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
                    alpha: { start: 1, end: 0 },
                    blendMode: Phaser.BlendModes.ADD,
                    particleClass: EffectParticle,
                };
        }
    }

    private getAnim(): Phaser.Animations.Animation {
        switch (this._type) {
            case EffectType.DragonFireBeam:
            case EffectType.DragonFireHit:
                return this.manager.scene.anims.get("dragonfire");
            default:
                return this.manager.scene.anims.get("sparkle");
        }
    }

    private playEffect(resolve: Function) {
        let duration: number = 500;
        switch (this._type) {
            case EffectType.WizardCasting:
            case EffectType.WizardCastFail:
                duration = 500;
                break;
            case EffectType.WizardCastBeam:
                duration = 300;
                break;
            case EffectType.SummonPiece:
                duration = 250;
                break;
            case EffectType.ArrowBeam:
            case EffectType.ArrowHit:
                duration = 150;
                break;

        }
        this.manager.scene.tweens.addCounter({
            from: 0,
            to: 1,
            duration: duration,
            onUpdate: (tween) => {},
            onComplete: () => {
                this.stop();
                resolve();
                setTimeout(() => {
                    this.manager.removeEmitter(this);
                }, duration);
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
    SummonPiece
}
