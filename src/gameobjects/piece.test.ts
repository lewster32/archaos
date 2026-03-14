import { describe, it, expect } from 'vitest';
// Wizard must be imported first to resolve the circular dependency chain:
// Piece → Board → Player → Wizard → (extends Piece). If Piece is imported
// before Wizard, Wizard sees an uninitialised Piece at class-definition time.
import './wizard';
import { Piece } from './piece';
import { Board } from './board';
import { PieceConfig } from './configs/piececonfig';
import { Player } from './player';
import { UnitDirection } from './enums/unitdirection';
import { UnitStatus } from './enums/unitstatus';
import { UnitType } from './enums/unittype';
import { Geom } from 'phaser';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function makeMockSprite() {
    return {
        setOrigin: () => ({}),
        setFrame: () => ({}),
        setDepth: () => ({}),
        setTint: () => ({}),
        setTintFill: () => ({}),
        clearTint: () => ({}),
        setAlpha: () => ({}),
        setVisible: () => ({}),
        setFlipX: () => ({}),
        setBlendMode: () => ({}),
        getData: (_key: string) => null,
        setData: () => ({}),
        destroy: () => ({}),
        getCenter: () => ({ x: 0, y: 0 }),
        x: 0,
        y: 0,
        depth: 0,
        visible: true,
        anims: {
            play: () => ({}),
            stop: () => ({}),
            playAfterDelay: () => ({}),
            setProgress: () => ({}),
        },
        displayOriginY: 0,
    };
}

function makeMockImage() {
    return {
        setOrigin: () => ({}),
        setTint: () => ({}),
        setBlendMode: () => ({}),
        setDepth: () => ({}),
        setFlipX: () => ({}),
        setAlpha: () => ({}),
        setVisible: () => ({}),
        getData: (_key: string) => null,
        setData: () => ({}),
        destroy: () => ({}),
        x: 0,
        y: 0,
        depth: 0,
        displayOriginY: 0,
    };
}

function makeMockBoard() {
    return {
        getIsoPosition: () => ({ x: 0, y: 0 }),
        scene: {
            add: {
                sprite: () => makeMockSprite(),
                image: () => makeMockImage(),
            },
            tweens: {
                add: () => ({}),
                addCounter: () => ({ stop: () => ({}), destroy: () => ({}) }),
            },
        },
        getLayer: () => ({ add: () => ({}) }),
        logger: { log: () => {} },
    } as unknown as Board;
}

function makeMockPlayer(name = 'Test Player') {
    return {
        castingPiece: null,
        colour: 0x0000ff,
        name,
    } as unknown as Player;
}

// Baseline stats used in most tests. Values are distinct so modifications are
// detectable without ambiguity.
const BASE_PROPERTIES = {
    id: 'test-unit',
    name: 'Test Unit',
    movement: 2,
    combat: 3,
    rangedCombat: 0,
    range: 0,
    defense: 4,
    maneuverability: 2,
    magicResistance: 3,
    attackType: 'hit',
    rangedType: 'shot',
    status: [] as UnitStatus[],
};

// ─── MockPiece ───────────────────────────────────────────────────────────────

class MockPiece extends Piece {
    constructor(board: Board, id: number, config: PieceConfig) {
        super(board, id, config);
        // Synchronously initialise sprites so _sprite / _shadow are available
        // immediately (the base Piece defers this via setTimeout).
        this.initSprites();
    }

    protected createSprite() {
        if (!this._sprite) {
            this._sprite = makeMockSprite() as unknown as Phaser.GameObjects.Sprite;
        }
        return this._sprite;
    }

    protected createShadow() {
        if (!this._shadow) {
            this._shadow = makeMockImage() as unknown as Phaser.GameObjects.Image;
        }
        return this._shadow;
    }

    // createShaders accesses board.scene.game.plugins, which does not exist in
    // tests. Override to no-op.
    protected createShaders() { /* intentional no-op */ }
}

function makePiece(overrides: Partial<PieceConfig> = {}): MockPiece {
    return new MockPiece(makeMockBoard(), 0, {
        type: UnitType.Creature,
        properties: { ...BASE_PROPERTIES, status: [] },
        x: 0,
        y: 0,
        ...overrides,
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Piece', () => {

    describe('construction', () => {
        it('is an instance of Piece', () => {
            expect(makePiece()).toBeInstanceOf(Piece);
        });

        it('sets position from config', () => {
            const piece = makePiece({ x: 3, y: 5 });
            expect(piece.position.x).toBe(3);
            expect(piece.position.y).toBe(5);
        });

        it('sets type from config', () => {
            const piece = makePiece({ type: UnitType.Static });
            expect(piece.type).toBe(UnitType.Static);
        });

        it('sets owner from config', () => {
            const owner = makeMockPlayer();
            const piece = makePiece({ owner });
            expect(piece.owner).toBe(owner);
        });

        it('owner is null when not provided', () => {
            const piece = makePiece();
            expect(piece.owner).toBeNull();
        });

        it('illusion is false by default', () => {
            expect(makePiece().illusion).toBe(false);
        });

        it('illusion reflects the config value', () => {
            expect(makePiece({ illusion: true }).illusion).toBe(true);
        });

        it('dead is false on construction', () => {
            expect(makePiece().dead).toBe(false);
        });

        it('throws when board is null', () => {
            expect(() => makePiece({ x: 0, y: 0 } as any)).not.toThrow();
            expect(() => new MockPiece(null as unknown as Board, 0, {
                type: UnitType.Creature,
                properties: { ...BASE_PROPERTIES, status: [] },
                x: 0,
                y: 0,
            })).toThrow();
        });

        it('throws when coordinates are non-integers', () => {
            expect(() => makePiece({ x: 1.5, y: 0 })).toThrow(TypeError);
            expect(() => makePiece({ x: 0, y: 2.7 })).toThrow(TypeError);
        });
    });

    describe('name and fullName getters', () => {
        it('name returns properties.name', () => {
            expect(makePiece().name).toBe('Test Unit');
        });

        it('name returns "Unnamed unit" when properties.name is absent', () => {
            const piece = makePiece({
                properties: { ...BASE_PROPERTIES, name: undefined, status: [] },
            });
            expect(piece.name).toBe('Unnamed unit');
        });

        it('fullName includes owner name when an owner is set', () => {
            const owner = makeMockPlayer('Alice');
            const piece = makePiece({ owner });
            expect(piece.fullName).toBe("Alice's Test Unit");
        });

        it('fullName returns just the piece name when there is no owner', () => {
            expect(makePiece().fullName).toBe('Test Unit');
        });
    });

    describe('owner getter and setter', () => {
        it('setter updates the owner', () => {
            const piece = makePiece();
            const newOwner = makeMockPlayer('Bob');
            piece.owner = newOwner;
            expect(piece.owner).toBe(newOwner);
        });

        it('setter can clear the owner to null', () => {
            const owner = makeMockPlayer();
            const piece = makePiece({ owner });
            piece.owner = null;
            expect(piece.owner).toBeNull();
        });
    });

    describe('position getter and setter', () => {
        it('setter updates integer coordinates', () => {
            const piece = makePiece();
            piece.position = new Geom.Point(4, 7);
            expect(piece.position.x).toBe(4);
            expect(piece.position.y).toBe(7);
        });

        it('setter throws for non-integer x', () => {
            const piece = makePiece();
            expect(() => { piece.position = new Geom.Point(1.5, 0); }).toThrow(TypeError);
        });

        it('setter throws for non-integer y', () => {
            const piece = makePiece();
            expect(() => { piece.position = new Geom.Point(0, 3.14); }).toThrow(TypeError);
        });
    });

    describe('direction getter and setter', () => {
        it('can be set and retrieved', () => {
            const piece = makePiece();
            piece.direction = UnitDirection.Left;
            expect(piece.direction).toBe(UnitDirection.Left);
            piece.direction = UnitDirection.Right;
            expect(piece.direction).toBe(UnitDirection.Right);
        });

        it('setting the same direction twice does not change it', () => {
            const piece = makePiece();
            piece.direction = UnitDirection.Left;
            piece.direction = UnitDirection.Left;
            expect(piece.direction).toBe(UnitDirection.Left);
        });
    });

    describe('status methods', () => {
        it('hasStatus returns false for a status not yet added', () => {
            expect(makePiece().hasStatus(UnitStatus.Flying)).toBe(false);
        });

        it('addStatus adds the status and returns true', () => {
            const piece = makePiece();
            expect(piece.hasStatus(UnitStatus.Flying)).toBe(false);
            expect(piece.addStatus(UnitStatus.Flying)).toBe(true);
            expect(piece.hasStatus(UnitStatus.Flying)).toBe(true);
        });

        it('addStatus returns false when the status is already present', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Flying);
            expect(piece.addStatus(UnitStatus.Flying)).toBe(false);
        });

        it('removeStatus removes the status and returns true', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Flying);
            expect(piece.removeStatus(UnitStatus.Flying)).toBe(true);
            expect(piece.hasStatus(UnitStatus.Flying)).toBe(false);
        });

        it('removeStatus returns false when the status is not present', () => {
            expect(makePiece().removeStatus(UnitStatus.Flying)).toBe(false);
        });

        it('multiple statuses can coexist independently', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Flying);
            piece.addStatus(UnitStatus.Undead);
            expect(piece.hasStatus(UnitStatus.Flying)).toBe(true);
            expect(piece.hasStatus(UnitStatus.Undead)).toBe(true);
            piece.removeStatus(UnitStatus.Flying);
            expect(piece.hasStatus(UnitStatus.Flying)).toBe(false);
            expect(piece.hasStatus(UnitStatus.Undead)).toBe(true);
        });
    });

    describe('stats getter', () => {
        it('returns base stats unmodified when no buffs are active', () => {
            const stats = makePiece().stats;
            expect(stats.movement).toBe(BASE_PROPERTIES.movement);
            expect(stats.combat).toBe(BASE_PROPERTIES.combat);
            expect(stats.defense).toBe(BASE_PROPERTIES.defense);
            expect(stats.rangedCombat).toBe(BASE_PROPERTIES.rangedCombat);
            expect(stats.range).toBe(BASE_PROPERTIES.range);
        });

        it('ShadowForm sets movement to 3 and increases defense', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.ShadowForm);
            expect(piece.stats.movement).toBe(3);
            expect(piece.stats.defense).toBe(Math.min(BASE_PROPERTIES.defense + 3, 9));
        });

        it('MagicSword increases combat (capped at 9)', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicSword);
            expect(piece.stats.combat).toBe(Math.min(BASE_PROPERTIES.combat + 6, 9));
        });

        it('MagicKnife increases combat (capped at 9)', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicKnife);
            expect(piece.stats.combat).toBe(Math.min(BASE_PROPERTIES.combat + 3, 9));
        });

        it('MagicSword takes priority over MagicKnife for combat boost', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicSword);
            piece.addStatus(UnitStatus.MagicKnife);
            expect(piece.stats.combat).toBe(Math.min(BASE_PROPERTIES.combat + 6, 9));
        });

        it('MagicArmour increases defense (capped at 9)', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicArmour);
            expect(piece.stats.defense).toBe(Math.min(BASE_PROPERTIES.defense + 6, 9));
        });

        it('MagicShield increases defense', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicShield);
            expect(piece.stats.defense).toBe(Math.min(BASE_PROPERTIES.defense + 3, 9));
        });

        it('MagicArmour takes priority over MagicShield for defense boost', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicArmour);
            piece.addStatus(UnitStatus.MagicShield);
            expect(piece.stats.defense).toBe(Math.min(BASE_PROPERTIES.defense + 6, 9));
        });

        it('MagicBow sets rangedCombat to 3 and range to 6', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicBow);
            expect(piece.stats.rangedCombat).toBe(3);
            expect(piece.stats.range).toBe(6);
        });

        it('MagicWings sets movement to 6', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicWings);
            expect(piece.stats.movement).toBe(6);
        });
    });

    describe('strength getter', () => {
        it('returns a positive number based on base stats', () => {
            const piece = makePiece();
            // combat(3) + movement(2) + defense(4) + magicResistance/2(1.5) = 10.5
            expect(piece.strength).toBe(10.5);
        });

        it('increases when magic weapon statuses are active', () => {
            const base = makePiece().strength;
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicSword);
            expect(piece.strength).toBeGreaterThan(base);
        });

        it('adds 2 when the piece is raised dead', () => {
            const base = makePiece().strength;
            const piece = makePiece();
            piece.raisedDead = true;
            expect(piece.strength).toBe(base + 2);
        });

        it('adds 2 for the Undead status', () => {
            const base = makePiece().strength;
            const piece = makePiece();
            piece.addStatus(UnitStatus.Undead);
            expect(piece.strength).toBe(base + 2);
        });
    });

    describe('defaultTint getter', () => {
        it('returns white (0xffffff) for a normal piece', () => {
            expect(makePiece().defaultTint).toBe(0xffffff);
        });

        it('returns RAISED_DEAD_TINT for a raised-dead piece', () => {
            const piece = makePiece();
            piece.raisedDead = true;
            expect(piece.defaultTint).toBe(Piece.RAISED_DEAD_TINT);
        });
    });

    describe('moved, attacked, and rangedAttacked', () => {
        it('moved is false initially when movement > 0', () => {
            expect(makePiece().moved).toBe(false);
        });

        it('moved is true when engaged', () => {
            const piece = makePiece();
            piece.engaged = true;
            expect(piece.moved).toBe(true);
        });

        it('moved is true when movement stat is 0', () => {
            const piece = makePiece({
                properties: { ...BASE_PROPERTIES, movement: 0, status: [] },
            });
            expect(piece.moved).toBe(true);
        });

        it('setting moved = true is reflected by the getter', () => {
            const piece = makePiece();
            piece.moved = true;
            expect(piece.moved).toBe(true);
        });

        it('attacked is false initially when combat > 0', () => {
            expect(makePiece().attacked).toBe(false);
        });

        it('setting attacked = true also marks the piece as moved', () => {
            const piece = makePiece();
            piece.attacked = true;
            expect(piece.attacked).toBe(true);
            expect(piece.moved).toBe(true);
        });

        it('rangedAttacked is always true when rangedCombat or range is 0', () => {
            // BASE_PROPERTIES has rangedCombat=0 and range=0
            expect(makePiece().rangedAttacked).toBe(true);
        });

        it('rangedAttacked reflects the flag after gaining a ranged attack', () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicBow); // grants rangedCombat=3, range=6
            expect(piece.rangedAttacked).toBe(false);
            piece.rangedAttacked = true;
            expect(piece.rangedAttacked).toBe(true);
        });
    });

    describe('board getter', () => {
        it('returns the board supplied at construction', () => {
            const board = makeMockBoard();
            const piece = new MockPiece(board, 0, {
                type: UnitType.Creature,
                properties: { ...BASE_PROPERTIES, status: [] },
                x: 0,
                y: 0,
            });
            expect(piece.board).toBe(board);
        });
    });

    describe('depth getter', () => {
        it('returns 0 when the sprite y position is 0', () => {
            expect(makePiece().depth).toBe(0);
        });
    });

    describe('updateDepth', () => {
        it('does not throw', () => {
            const piece = makePiece();
            expect(() => (piece as any).updateDepth()).not.toThrow();
        });
    });

    describe('properties getter', () => {
        it('returns the piece properties', () => {
            const piece = makePiece();
            expect(piece.properties.combat).toBe(BASE_PROPERTIES.combat);
            expect(piece.properties.movement).toBe(BASE_PROPERTIES.movement);
        });
    });

    describe('sprite and shadow lazy getters', () => {
        it('createSprite is called on first access to sprite', () => {
            const piece = makePiece();
            (piece as any)._sprite = undefined; // ensure sprite is uninitialised
            expect(piece.sprite).toBeDefined();
        });

        it('createShadow is called on first access to shadow', () => {
            const piece = makePiece();
            (piece as any)._shadow = undefined; // ensure shadow is uninitialised
            expect(piece.shadow).toBeDefined();
        });
    });
});
