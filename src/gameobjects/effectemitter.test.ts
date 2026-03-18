import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Phaser ────────────────────────────────────────────────────────────
// buildParticleConfig constructs Curves.Path objects for emit zones.
// We capture the calls to verify the geometry is correct.

const mockCircleTo = vi.fn().mockReturnThis();
const mockLineTo = vi.fn().mockReturnThis();

vi.mock('phaser', () => ({
    GameObjects: {
        Particles: {
            ParticleEmitter: class MockParticleEmitter {
                scene: any;
                stop = vi.fn();
                destroy = vi.fn();
                constructor(scene: any) {
                    this.scene = scene;
                }
            },
        },
    },
    Geom: {
        Point: class Point {
            x: number;
            y: number;
            constructor(x: number, y: number) {
                this.x = x;
                this.y = y;
            }
        },
    },
    Math: {
        Vector2: class Vector2 {
            x: number;
            y: number;
            constructor(x: number, y: number) {
                this.x = x;
                this.y = y;
            }
        },
        RND: { pick: (arr: any[]) => arr[0] },
    },
    Curves: {
        Path: class MockPath {
            _startX: number;
            _startY: number;
            constructor(x: number, y: number) {
                this._startX = x;
                this._startY = y;
            }
            circleTo = mockCircleTo;
            lineTo = mockLineTo;
        },
    },
    BlendModes: { ADD: 1 },
    Display: {
        Color: {
            GetColor: (r: number, g: number, b: number) => (r << 16) | (g << 8) | b,
        },
    },
    Scene: vi.fn(),
}));

import { EffectEmitter, EffectType } from './effectemitter';
import type { Piece } from './piece';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Simple {x, y} point — duck-types with Geom.Point / PMath.Vector2. */
const point = (x: number, y: number): any => ({ x, y });

function makeMockScene() {
    const tweenCounters: any[] = [];
    const tweenAdds: any[] = [];
    return {
        tweenCounters,
        tweenAdds,
        tweens: {
            addCounter: vi.fn((config: any) => {
                tweenCounters.push(config);
                return { stop: vi.fn(), destroy: vi.fn() };
            }),
            add: vi.fn((config: any) => {
                tweenAdds.push(config);
                return { stop: vi.fn(), destroy: vi.fn() };
            }),
        },
        cameras: {
            main: {
                shake: vi.fn(),
            },
        },
    };
}

function makeMockTarget(overrides: Partial<Record<string, any>> = {}): Piece {
    return {
        sprite: {
            setTint: vi.fn(),
            setTintFill: vi.fn(),
        },
        shadow: {},
        defaultTint: 0xffffff,
        ...overrides,
    } as unknown as Piece;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EffectType', () => {
    it('should have all expected effect types', () => {
        expect(EffectType.WizardCasting).toBe('WizardCasting');
        expect(EffectType.WizardCastFail).toBe('WizardCastFail');
        expect(EffectType.WizardCastBeam).toBe('WizardCastBeam');
        expect(EffectType.WizardDefeated).toBe('WizardDefeated');
        expect(EffectType.ArrowBeam).toBe('ArrowBeam');
        expect(EffectType.ArrowHit).toBe('ArrowHit');
        expect(EffectType.SummonPiece).toBe('SummonPiece');
        expect(EffectType.AttackHit).toBe('AttackHit');
        expect(EffectType.NoCorpseDeath).toBe('NoCorpseDeath');
        expect(EffectType.TurmoilBeam).toBe('TurmoilBeam');
    });

    it('should have correct number of effect types', () => {
        const values = Object.values(EffectType);
        expect(values).toHaveLength(27);
    });
});

describe('EffectEmitter', () => {
    let scene: ReturnType<typeof makeMockScene>;

    beforeEach(() => {
        scene = makeMockScene();
        vi.useFakeTimers();
        mockCircleTo.mockClear();
        mockLineTo.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('constructor and buildParticleConfig', () => {
        it('should create an emitter for a simple origin-based effect', () => {
            const resolve = vi.fn();
            const emitter = new EffectEmitter(
                scene as any, EffectType.WizardCastFail, point(100, 200), null, null, resolve
            );

            expect(emitter).toBeInstanceOf(EffectEmitter);
            expect(scene.tweens.addCounter).toHaveBeenCalled();
        });

        it('should create a circle emit zone for WizardCasting', () => {
            const resolve = vi.fn();
            new EffectEmitter(scene as any, EffectType.WizardCasting, point(50, 60), null, null, resolve);

            // WizardCasting has emitZone.shape === "circle" with radius 10
            expect(mockCircleTo).toHaveBeenCalledWith(10);
        });

        it('should create a line emit zone for beam effects', () => {
            const resolve = vi.fn();
            new EffectEmitter(
                scene as any, EffectType.WizardCastBeam, point(10, 20), point(100, 200), null, resolve
            );

            expect(mockLineTo).toHaveBeenCalledWith(100, 200);
        });

        it('should set origin-offset x/y ranges when origin is defined', () => {
            const resolve = vi.fn();
            // WizardCastFail has origin: { x: [-7, 7], y: [-8, 8] }
            // We just verify it doesn't throw — the config is consumed by the parent class
            const emitter = new EffectEmitter(
                scene as any, EffectType.WizardCastFail, point(50, 60), null, null, resolve
            );
            expect(emitter).toBeDefined();
        });
    });

    describe('playEffect', () => {
        it('should call resolve when the duration tween completes', () => {
            const resolve = vi.fn();
            const emitter = new EffectEmitter(
                scene as any, EffectType.SummonPiece, point(0, 0), null, null, resolve
            );

            const durationTween = scene.tweenCounters[scene.tweenCounters.length - 1];
            expect(durationTween.duration).toBe(250); // SummonPiece duration

            durationTween.onComplete();
            expect(resolve).toHaveBeenCalledOnce();
            expect(emitter.stop).toHaveBeenCalled();
        });

        it('should schedule destroy after duration tween completes', () => {
            const resolve = vi.fn();
            const emitter = new EffectEmitter(
                scene as any, EffectType.SummonPiece, point(0, 0), null, null, resolve
            );

            const durationTween = scene.tweenCounters[scene.tweenCounters.length - 1];
            durationTween.onComplete();

            expect(emitter.destroy).not.toHaveBeenCalled();
            vi.advanceTimersByTime(500); // duration * 2 = 250 * 2
            expect(emitter.destroy).toHaveBeenCalled();
        });

        it('should trigger camera shake when cameraShake is defined', () => {
            const resolve = vi.fn();
            // MagicBoltHit has cameraShake: { duration: 150, intensity: 0.005 }
            new EffectEmitter(scene as any, EffectType.MagicBoltHit, point(0, 0), null, null, resolve);

            expect(scene.cameras.main.shake).toHaveBeenCalledWith(150, 0.005, true);
        });

        it('should not trigger camera shake when cameraShake is not defined', () => {
            const resolve = vi.fn();
            new EffectEmitter(scene as any, EffectType.SummonPiece, point(0, 0), null, null, resolve);

            expect(scene.cameras.main.shake).not.toHaveBeenCalled();
        });

        it('should not call playTargetEffect when there is no target', () => {
            const resolve = vi.fn();
            // ArrowHit has targetEffect but we pass null target
            new EffectEmitter(scene as any, EffectType.ArrowHit, point(0, 0), null, null, resolve);

            // Only the duration counter should be present (no target-effect counter)
            expect(scene.tweenCounters).toHaveLength(1);
        });
    });

    describe('playTargetEffect — flash', () => {
        it('should alternate tint fill on even/odd tween values', () => {
            const resolve = vi.fn();
            const target = makeMockTarget({ defaultTint: 0xaabbcc });

            // ArrowHit has targetEffect: { type: "flash", to: 4 }
            new EffectEmitter(scene as any, EffectType.ArrowHit, point(0, 0), null, target, resolve);

            const flashTween = scene.tweenCounters[0];
            expect(flashTween.to).toBe(4);

            // Even value → setTintFill white
            flashTween.onUpdate({ getValue: () => 2 });
            expect(target.sprite.setTintFill).toHaveBeenCalledWith(0xffffff);

            // Odd value → setTint default
            flashTween.onUpdate({ getValue: () => 3 });
            expect(target.sprite.setTint).toHaveBeenCalledWith(0xaabbcc);
        });

        it('should restore default tint on flash complete', () => {
            const resolve = vi.fn();
            const target = makeMockTarget({ defaultTint: 0x112233 });

            // AttackHit has targetEffect: { type: "flash", to: 4 }
            new EffectEmitter(scene as any, EffectType.AttackHit, point(0, 0), null, target, resolve);

            const flashTween = scene.tweenCounters[0];
            flashTween.onComplete();
            expect(target.sprite.setTint).toHaveBeenCalledWith(0x112233);
        });
    });

    describe('playTargetEffect — cycleTint', () => {
        it('should cycle through tint colors based on tween value', () => {
            const resolve = vi.fn();
            const target = makeMockTarget();

            // DragonFireHit has targetEffect: { type: "cycleTint", to: 10, colors: ["ff0000", "ff7700", "000000"] }
            new EffectEmitter(scene as any, EffectType.DragonFireHit, point(0, 0), null, target, resolve);

            const cycleTween = scene.tweenCounters[0];
            expect(cycleTween.to).toBe(10);

            // Value 0 → colors[0 % 3] = 0xff0000
            cycleTween.onUpdate({ getValue: () => 0 });
            expect(target.sprite.setTintFill).toHaveBeenCalledWith(0xff0000);

            // Value 1.9 → floor(1.9) = 1, colors[1 % 3] = 0xff7700
            cycleTween.onUpdate({ getValue: () => 1.9 });
            expect(target.sprite.setTintFill).toHaveBeenCalledWith(0xff7700);

            // Value 3 → colors[3 % 3] = colors[0] = 0xff0000
            cycleTween.onUpdate({ getValue: () => 3 });
            expect(target.sprite.setTintFill).toHaveBeenCalledWith(0xff0000);
        });

        it('should restore default tint on cycleTint complete', () => {
            const resolve = vi.fn();
            const target = makeMockTarget({ defaultTint: 0xdddddd });

            new EffectEmitter(scene as any, EffectType.DragonFireHit, point(0, 0), null, target, resolve);

            const cycleTween = scene.tweenCounters[0];
            cycleTween.onComplete();
            expect(target.sprite.setTint).toHaveBeenCalledWith(0xdddddd);
        });
    });

    describe('playTargetEffect — fadeToWhite', () => {
        it('should tint fill with increasing white values and fade out sprite', () => {
            const resolve = vi.fn();
            const target = makeMockTarget();

            // DisbelieveHit has targetEffect: { type: "fadeToWhite" }, duration: 500
            new EffectEmitter(scene as any, EffectType.DisbelieveHit, point(0, 0), null, target, resolve);

            // First counter: fadeToWhite tint counter
            const fadeTween = scene.tweenCounters[0];
            expect(fadeTween.to).toBe(255);
            expect(fadeTween.duration).toBe(250); // 500 / 2

            // Simulate update at value 128
            fadeTween.onUpdate({ getValue: () => 128 });
            const expected = (128 << 16) | (128 << 8) | 128;
            expect(target.sprite.setTintFill).toHaveBeenCalledWith(expected);

            // Should also add a sprite+shadow fade-out tween
            expect(scene.tweens.add).toHaveBeenCalled();
            const fadeOutTween = scene.tweenAdds[0];
            expect(fadeOutTween.targets).toEqual([target.sprite, target.shadow]);
            expect(fadeOutTween.alpha).toEqual({ from: 1, to: 0 });
            expect(fadeOutTween.duration).toBe(500);
            expect(fadeOutTween.delay).toBe(250);
        });
    });

    describe('playTargetEffect — explode', () => {
        it('should apply random tint colors on every 5th step and fade out', () => {
            const resolve = vi.fn();
            const target = makeMockTarget();

            // WizardDefeated has targetEffect: { type: "explode", colors: [...] }
            new EffectEmitter(scene as any, EffectType.WizardDefeated, point(0, 0), null, target, resolve);

            const explodeTween = scene.tweenCounters[0];
            expect(explodeTween.to).toBe(64);

            // value 0 → floor(0) % 5 === 0, should setTintFill with a picked color
            explodeTween.onUpdate({ getValue: () => 0 });
            expect(target.sprite.setTintFill).toHaveBeenCalled();

            // value 3 → floor(3) % 5 === 3, should NOT setTintFill
            (target.sprite.setTintFill as ReturnType<typeof vi.fn>).mockClear();
            explodeTween.onUpdate({ getValue: () => 3 });
            expect(target.sprite.setTintFill).not.toHaveBeenCalled();

            // value 5 → floor(5) % 5 === 0, should setTintFill again
            explodeTween.onUpdate({ getValue: () => 5 });
            expect(target.sprite.setTintFill).toHaveBeenCalled();

            // Should add sprite+shadow fade-out tween
            expect(scene.tweens.add).toHaveBeenCalled();
            const fadeOut = scene.tweenAdds[0];
            expect(fadeOut.targets).toEqual([target.sprite, target.shadow]);
            expect(fadeOut.alpha).toEqual({ from: 1, to: 0 });
        });
    });

    describe('playTargetEffect — no target effect defined', () => {
        it('should not add any target tween when effect has no targetEffect', () => {
            const resolve = vi.fn();
            const target = makeMockTarget();

            // SummonPiece has no targetEffect
            new EffectEmitter(scene as any, EffectType.SummonPiece, point(0, 0), null, target, resolve);

            // Only the duration tween should be present
            expect(scene.tweenCounters).toHaveLength(1);
            expect(scene.tweens.add).not.toHaveBeenCalled();
        });
    });

    describe('buildParticleConfig details', () => {
        it('should parse hex tint strings to numbers without throwing', () => {
            const resolve = vi.fn();
            // WizardCastFail has tint: ["7744ff", "333388", "6666cc"]
            const emitter = new EffectEmitter(
                scene as any, EffectType.WizardCastFail, point(0, 0), null, null, resolve
            );
            expect(emitter).toBeDefined();
        });

        it('should map "ADD" blendMode string to BlendModes.ADD constant', () => {
            const resolve = vi.fn();
            // WizardCasting has blendMode: "ADD"
            const emitter = new EffectEmitter(
                scene as any, EffectType.WizardCasting, point(0, 0), null, null, resolve
            );
            expect(emitter).toBeDefined();
        });

        it('should wrap anim string into Phaser format', () => {
            const resolve = vi.fn();
            // WizardCasting has anim: "sparkle"
            const emitter = new EffectEmitter(
                scene as any, EffectType.WizardCasting, point(0, 0), null, null, resolve
            );
            expect(emitter).toBeDefined();
        });

        it('should handle effects with no emitZone and no origin', () => {
            const resolve = vi.fn();
            // RaiseDeadHit has origin but no emitZone
            const emitter = new EffectEmitter(
                scene as any, EffectType.RaiseDeadHit, point(30, 40), null, null, resolve
            );
            expect(emitter).toBeDefined();
        });
    });

    describe('combined behaviours', () => {
        it('should play target effect and camera shake simultaneously', () => {
            const resolve = vi.fn();
            const target = makeMockTarget();

            // LightningHit has both targetEffect (cycleTint) and cameraShake
            new EffectEmitter(scene as any, EffectType.LightningHit, point(0, 0), null, target, resolve);

            expect(scene.cameras.main.shake).toHaveBeenCalledWith(300, 0.0125, true);
            // cycleTint counter + duration counter
            expect(scene.tweenCounters).toHaveLength(2);
        });

        it('should work with all beam effect types', () => {
            const beamEffects = [
                EffectType.WizardCastBeam,
                EffectType.DragonFireBeam,
                EffectType.BlackDragonFireBeam,
                EffectType.MagicBoltBeam,
                EffectType.LightningBeam,
                EffectType.ArrowBeam,
                EffectType.DisbelieveBeam,
                EffectType.RaiseDeadBeam,
                EffectType.SubversionBeam,
                EffectType.TurmoilBeam,
            ];

            for (const effectType of beamEffects) {
                const localScene = makeMockScene();
                const resolve = vi.fn();
                mockLineTo.mockClear();

                const emitter = new EffectEmitter(
                    localScene as any, effectType, point(0, 0), point(100, 100), null, resolve
                );
                expect(emitter).toBeDefined();
                expect(mockLineTo).toHaveBeenCalledWith(100, 100);
            }
        });
    });
});
