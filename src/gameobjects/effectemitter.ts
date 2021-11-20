export class EffectEmitter extends Phaser.GameObjects.Particles.ParticleEmitter {
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
        super(manager, EffectEmitter.getConfig(type, startPosition));
        this._type = type;
        this._anim = this.getAnim();
        this._startPosition = startPosition;
        this._endPosition = endPosition;

        this.playEffect(resolve)
    }

    private static getConfig(type: EffectType, position: Phaser.Math.Vector2 | Phaser.Geom.Point): any {
        switch (type) {
            case EffectType.WizardCasting:
                const circleSize: number = 10;
                const path: Phaser.Curves.Path = new Phaser.Curves.Path(position.x + circleSize, position.y).circleTo(circleSize);
                return {
                    x: {min: -5, max: 5},
                    y: {min: -5, max: 5},
                    gravityY: 60,
                    speedX: {min: -20, max: 20},
                    lifespan: 500,
                    tint: [0xff00ff, 0x5500ff, 0x9900ff, 0xff44ff],
                    blendMode: Phaser.BlendModes.ADD,
                    emitZone: {type: "edge", source: path, quantity: 30},
                    particleClass: EffectParticle,
                }
            break;
        }
    }

    private getAnim(): Phaser.Animations.Animation | null {
        switch (this._type) {
            case EffectType.WizardCasting:
                return this.manager.scene.anims.get("sparkle");
        }
        return null;
    }

    private playEffect(resolve: Function) {
        switch (this._type) {
            case EffectType.WizardCasting:
                this.manager.scene.tweens.addCounter({
                    from: 0,
                    to: 1,
                    duration: 500,
                    onUpdate: (tween) => {
                    },
                    onComplete: () => {
                        this.stop();
                        setTimeout(() => {
                            this.manager.removeEmitter(this);
                            resolve();
                        }, 500);
                    }
                });
        }
    }
}

export class EffectParticle extends Phaser.GameObjects.Particles.Particle {
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
    WizardCasting
}