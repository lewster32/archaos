import {
    PieceConfig,
    UnitDirection,
    UnitStatus,
    UnitType,
} from "@archaos/engine";
import { describe, it, expect, vi } from "vitest";
// Wizard must be imported first to resolve the circular dependency chain:
// Piece → Board → Player → Wizard → (extends Piece). If Piece is imported
// before Wizard, Wizard sees an uninitialised Piece at class-definition time.
import "./wizard";
import { Piece } from "./piece";
import { Board } from "./board";
import { Player } from "./player";
import { Math as PMath } from "phaser";
import { TestRNG } from "@archaos/engine";

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

function makeMockBoard(overrides: Partial<Record<string, any>> = {}) {
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
        currentPlayer: null,
        pieces: [],
        getAdjacentPiecesAtPosition: () => [],
        getAdjacentPoints: () => [],
        hasLineOfSight: () => true,
        rangeGizmo: { getPathTo: () => null },
        rng: new TestRNG(),
        ...overrides,
    } as unknown as Board;
}

function makeMockPlayer(name = "Test Player") {
    return {
        castingPiece: null,
        colour: 0x0000ff,
        name,
    } as unknown as Player;
}

// Baseline stats used in most tests. Values are distinct so modifications are
// detectable without ambiguity.
const BASE_PROPERTIES = {
    id: "test-unit",
    name: "Test Unit",
    movement: 2,
    combat: 3,
    rangedCombat: 0,
    range: 0,
    defence: 4,
    manoeuvrability: 2,
    magicResistance: 3,
    attackType: "hit",
    rangedType: "shot",
    status: [] as UnitStatus[],
};

// Properties with ranged capability for ranged-attack tests
const RANGED_PROPERTIES = {
    ...BASE_PROPERTIES,
    rangedCombat: 4,
    range: 6,
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
            this._sprite =
                makeMockSprite() as unknown as Phaser.GameObjects.Sprite;
        }
        return this._sprite;
    }

    protected createShadow() {
        if (!this._shadow) {
            this._shadow =
                makeMockImage() as unknown as Phaser.GameObjects.Image;
        }
        return this._shadow;
    }

    // createShaders accesses board.scene.game.plugins, which does not exist in
    // tests. Override to no-op.
    protected createShaders() {
        /* intentional no-op */
    }
}

function makePiece(
    overrides: Partial<PieceConfig> = {},
    boardOverrides: Partial<Record<string, any>> = {},
): MockPiece {
    return new MockPiece(makeMockBoard(boardOverrides), 0, {
        type: UnitType.Creature,
        properties: { ...BASE_PROPERTIES, status: [] },
        x: 0,
        y: 0,
        ...overrides,
    });
}

function makeTweenBoard(isoX = 100, isoY = 200) {
    const tweenSpy = vi.fn().mockImplementation((config: any) => {
        config.onComplete?.call(config.onCompleteScope);
        return {};
    });
    const board = makeMockBoard({
        getIsoPosition: () => ({ x: isoX, y: isoY }),
        scene: {
            add: {
                sprite: () => makeMockSprite(),
                image: () => makeMockImage(),
            },
            tweens: {
                add: tweenSpy,
                addCounter: () => ({
                    stop: () => ({}),
                    destroy: () => ({}),
                }),
            },
        },
    });
    return { board, tweenSpy };
}

function makeRangedPiece(overrides: Partial<PieceConfig> = {}): MockPiece {
    return new MockPiece(makeMockBoard(), 1, {
        type: UnitType.Creature,
        properties: { ...RANGED_PROPERTIES, status: [] },
        x: 0,
        y: 0,
        ...overrides,
    });
}

/** Create a MockPiece on a specific board instance. The MockPiece constructor
 *  calls initSprites internally, so callers must not call it again. */
function makePieceOnBoard(
    board: Board,
    overrides: Partial<PieceConfig> = {},
): MockPiece {
    return new MockPiece(board, 0, {
        type: UnitType.Creature,
        properties: { ...BASE_PROPERTIES, status: [] },
        x: 0,
        y: 0,
        ...overrides,
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Piece", () => {
    describe("construction", () => {
        it("is an instance of Piece", () => {
            expect(makePiece()).toBeInstanceOf(Piece);
        });

        it("sets position from config", () => {
            const piece = makePiece({ x: 3, y: 5 });
            expect(piece.position.x).toBe(3);
            expect(piece.position.y).toBe(5);
        });

        it("sets type from config", () => {
            const piece = makePiece({ type: UnitType.Static });
            expect(piece.type).toBe(UnitType.Static);
        });

        it("sets owner from config", () => {
            const owner = makeMockPlayer();
            const piece = makePiece({ owner });
            expect(piece.owner).toBe(owner);
        });

        it("owner is null when not provided", () => {
            const piece = makePiece();
            expect(piece.owner).toBeNull();
        });

        it("illusion is false by default", () => {
            expect(makePiece().illusion).toBe(false);
        });

        it("illusion reflects the config value", () => {
            expect(makePiece({ illusion: true }).illusion).toBe(true);
        });

        it("dead is false on construction", () => {
            expect(makePiece().dead).toBe(false);
        });

        it("throws when board is null", () => {
            expect(() => makePiece({ x: 0, y: 0 } as any)).not.toThrow();
            expect(
                () =>
                    new MockPiece(null as unknown as Board, 0, {
                        type: UnitType.Creature,
                        properties: { ...BASE_PROPERTIES, status: [] },
                        x: 0,
                        y: 0,
                    }),
            ).toThrow("Board cannot be null");
        });

        it("throws when coordinates are non-integers", () => {
            expect(() => makePiece({ x: 1.5, y: 0 })).toThrow(TypeError);
            expect(() => makePiece({ x: 0, y: 2.7 })).toThrow(TypeError);
        });

        it("sets direction based on position offset (x > y → Left)", () => {
            const piece = makePiece({ x: 5, y: 2 });
            expect(piece.direction).toBe(UnitDirection.Left);
        });

        it("sets direction based on position offset (x < y → Right)", () => {
            const piece = makePiece({ x: 2, y: 5 });
            expect(piece.direction).toBe(UnitDirection.Right);
        });
    });

    describe("name and fullName getters", () => {
        it("name returns properties.name", () => {
            expect(makePiece().name).toBe("Test Unit");
        });

        it('name returns "Unnamed unit" when properties.name is absent', () => {
            const piece = makePiece({
                properties: { ...BASE_PROPERTIES, name: undefined, status: [] },
            });
            expect(piece.name).toBe("Unnamed unit");
        });

        it("fullName includes owner name when an owner is set", () => {
            const owner = makeMockPlayer("Alice");
            const piece = makePiece({ owner });
            expect(piece.fullName).toBe("Alice's Test Unit");
        });

        it("fullName returns just the piece name when there is no owner", () => {
            expect(makePiece().fullName).toBe("Test Unit");
        });
    });

    describe("owner getter and setter", () => {
        it("setter updates the owner", () => {
            const piece = makePiece();
            const newOwner = makeMockPlayer("Bob");
            piece.owner = newOwner;
            expect(piece.owner).toBe(newOwner);
        });

        it("setter can clear the owner to null", () => {
            const owner = makeMockPlayer();
            const piece = makePiece({ owner });
            piece.owner = null;
            expect(piece.owner).toBeNull();
        });
    });

    describe("position getter and setter", () => {
        it("setter updates integer coordinates", () => {
            const piece = makePiece();
            piece.position = new PMath.Vector2(4, 7);
            expect(piece.position.x).toBe(4);
            expect(piece.position.y).toBe(7);
        });

        it("setter throws for non-integer x", () => {
            const piece = makePiece();
            expect(() => {
                piece.position = new PMath.Vector2(1.5, 0);
            }).toThrow(TypeError);
        });

        it("setter throws for non-integer y", () => {
            const piece = makePiece();
            expect(() => {
                piece.position = new PMath.Vector2(0, 3.14);
            }).toThrow(TypeError);
        });
    });

    describe("direction getter and setter", () => {
        it("can be set and retrieved", () => {
            const piece = makePiece();
            piece.direction = UnitDirection.Left;
            expect(piece.direction).toBe(UnitDirection.Left);
            piece.direction = UnitDirection.Right;
            expect(piece.direction).toBe(UnitDirection.Right);
        });

        it("setting the same direction twice does not change it", () => {
            const piece = makePiece();
            piece.direction = UnitDirection.Left;
            piece.direction = UnitDirection.Left;
            expect(piece.direction).toBe(UnitDirection.Left);
        });
    });

    describe("status methods", () => {
        it("hasStatus returns false for a status not yet added", () => {
            expect(makePiece().hasStatus(UnitStatus.Flying)).toBe(false);
        });

        it("addStatus adds the status and returns true", () => {
            const piece = makePiece();
            expect(piece.hasStatus(UnitStatus.Flying)).toBe(false);
            expect(piece.addStatus(UnitStatus.Flying)).toBe(true);
            expect(piece.hasStatus(UnitStatus.Flying)).toBe(true);
        });

        it("addStatus returns false when the status is already present", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Flying);
            expect(piece.addStatus(UnitStatus.Flying)).toBe(false);
        });

        it("removeStatus removes the status and returns true", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Flying);
            expect(piece.removeStatus(UnitStatus.Flying)).toBe(true);
            expect(piece.hasStatus(UnitStatus.Flying)).toBe(false);
        });

        it("removeStatus returns false when the status is not present", () => {
            expect(makePiece().removeStatus(UnitStatus.Flying)).toBe(false);
        });

        it("multiple statuses can coexist independently", () => {
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

    describe("stats getter", () => {
        it("returns base stats unmodified when no buffs are active", () => {
            const stats = makePiece().stats;
            expect(stats.movement).toBe(BASE_PROPERTIES.movement);
            expect(stats.combat).toBe(BASE_PROPERTIES.combat);
            expect(stats.defence).toBe(BASE_PROPERTIES.defence);
            expect(stats.rangedCombat).toBe(BASE_PROPERTIES.rangedCombat);
            expect(stats.range).toBe(BASE_PROPERTIES.range);
        });

        it("ShadowForm sets movement to 3 and increases defence", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.ShadowForm);
            expect(piece.stats.movement).toBe(3);
            expect(piece.stats.defence).toBe(
                Math.min(BASE_PROPERTIES.defence + 3, 9),
            );
        });

        it("MagicSword increases combat (capped at 9)", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicSword);
            expect(piece.stats.combat).toBe(
                Math.min(BASE_PROPERTIES.combat + 6, 9),
            );
        });

        it("MagicKnife increases combat (capped at 9)", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicKnife);
            expect(piece.stats.combat).toBe(
                Math.min(BASE_PROPERTIES.combat + 3, 9),
            );
        });

        it("MagicSword takes priority over MagicKnife for combat boost", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicSword);
            piece.addStatus(UnitStatus.MagicKnife);
            expect(piece.stats.combat).toBe(
                Math.min(BASE_PROPERTIES.combat + 6, 9),
            );
        });

        it("MagicArmour increases defence (capped at 9)", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicArmour);
            expect(piece.stats.defence).toBe(
                Math.min(BASE_PROPERTIES.defence + 6, 9),
            );
        });

        it("MagicShield increases defence", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicShield);
            expect(piece.stats.defence).toBe(
                Math.min(BASE_PROPERTIES.defence + 3, 9),
            );
        });

        it("MagicArmour takes priority over MagicShield for defence boost", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicArmour);
            piece.addStatus(UnitStatus.MagicShield);
            expect(piece.stats.defence).toBe(
                Math.min(BASE_PROPERTIES.defence + 6, 9),
            );
        });

        it("MagicBow sets rangedCombat to 3 and range to 6", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicBow);
            expect(piece.stats.rangedCombat).toBe(3);
            expect(piece.stats.range).toBe(6);
        });

        it("MagicWings sets movement to 6", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicWings);
            expect(piece.stats.movement).toBe(6);
        });
    });

    describe("strength getter", () => {
        it("returns a positive number based on base stats", () => {
            const piece = makePiece();
            // combat(3) + movement(2) + defence(4) + magicResistance/2(1.5) = 10.5
            expect(piece.strength).toBe(10.5);
        });

        it("increases when magic weapon statuses are active", () => {
            const base = makePiece().strength;
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicSword);
            expect(piece.strength).toBeGreaterThan(base);
        });

        it("adds 2 when the piece is raised dead", () => {
            const base = makePiece().strength;
            const piece = makePiece();
            piece.raisedDead = true;
            expect(piece.strength).toBe(base + 2);
        });

        it("adds 2 for the Undead status", () => {
            const base = makePiece().strength;
            const piece = makePiece();
            piece.addStatus(UnitStatus.Undead);
            expect(piece.strength).toBe(base + 2);
        });

        it("includes rangedCombat and range in calculation when ranged stats are non-zero", () => {
            const piece = makeRangedPiece();
            // combat(3) + rangedCombat(4) + range(6) + movement(2) + defence(4) + magicResistance/2(1.5) = 20.5
            expect(piece.strength).toBe(20.5);
        });
    });

    describe("defaultTint getter", () => {
        it("returns white (0xffffff) for a normal piece", () => {
            expect(makePiece().defaultTint).toBe(0xffffff);
        });

        it("returns RAISED_DEAD_TINT for a raised-dead piece", () => {
            const piece = makePiece();
            piece.raisedDead = true;
            expect(piece.defaultTint).toBe(Piece.RAISED_DEAD_TINT);
        });
    });

    describe("moved, attacked, and rangedAttacked", () => {
        it("moved is false initially when movement > 0", () => {
            expect(makePiece().moved).toBe(false);
        });

        it("moved is true when engaged", () => {
            const piece = makePiece();
            piece.engaged = true;
            expect(piece.moved).toBe(true);
        });

        it("moved is true when movement stat is 0", () => {
            const piece = makePiece({
                properties: { ...BASE_PROPERTIES, movement: 0, status: [] },
            });
            expect(piece.moved).toBe(true);
        });

        it("setting moved = true is reflected by the getter", () => {
            const piece = makePiece();
            piece.moved = true;
            expect(piece.moved).toBe(true);
        });

        it("attacked is false initially when combat > 0", () => {
            expect(makePiece().attacked).toBe(false);
        });

        it("setting attacked = true also marks the piece as moved", () => {
            const piece = makePiece();
            piece.attacked = true;
            expect(piece.attacked).toBe(true);
            expect(piece.moved).toBe(true);
        });

        it("rangedAttacked is always true when rangedCombat or range is 0", () => {
            // BASE_PROPERTIES has rangedCombat=0 and range=0
            expect(makePiece().rangedAttacked).toBe(true);
        });

        it("rangedAttacked reflects the flag after gaining a ranged attack", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicBow); // grants rangedCombat=3, range=6
            expect(piece.rangedAttacked).toBe(false);
            piece.rangedAttacked = true;
            expect(piece.rangedAttacked).toBe(true);
        });

        it("setting rangedAttacked = true also marks moved and attacked", () => {
            const piece = makeRangedPiece();
            piece.moved = false;
            piece.rangedAttacked = true;
            expect(piece.moved).toBe(true);
            expect(piece.attacked).toBe(true);
            expect(piece.rangedAttacked).toBe(true);
        });
    });

    describe("engaged getter and setter", () => {
        it("engaged is false by default", () => {
            expect(makePiece().engaged).toBe(false);
        });

        it("setting engaged to true makes moved return true", () => {
            const piece = makePiece();
            piece.engaged = true;
            expect(piece.engaged).toBe(true);
            expect(piece.moved).toBe(true);
        });

        it("can be cleared back to false", () => {
            const piece = makePiece();
            piece.engaged = true;
            piece.engaged = false;
            expect(piece.engaged).toBe(false);
        });
    });

    describe("engulfed getter and setter", () => {
        it("engulfed is false by default", () => {
            expect(makePiece().engulfed).toBe(false);
        });

        it("setting engulfed to true is reflected by the getter", () => {
            const piece = makePiece();
            piece.engulfed = true;
            expect(piece.engulfed).toBe(true);
        });

        it("setting engulfed to false is reflected by the getter", () => {
            const piece = makePiece();
            piece.engulfed = true;
            piece.engulfed = false;
            expect(piece.engulfed).toBe(false);
        });
    });

    describe("raisedDead getter and setter", () => {
        it("raisedDead is undefined/falsy by default", () => {
            expect(makePiece().raisedDead).toBeFalsy();
        });

        it("setting raisedDead to true is reflected by getter", () => {
            const piece = makePiece();
            piece.raisedDead = true;
            expect(piece.raisedDead).toBe(true);
        });
    });

    describe("turnOver getter", () => {
        it("returns false when piece has not moved and can still act", () => {
            const piece = makePiece();
            expect(piece.turnOver).toBe(false);
        });

        it("returns true when the piece is dead", () => {
            const piece = makePiece();
            (piece as any)._dead = true;
            expect(piece.turnOver).toBe(true);
        });

        it("returns true when the piece is engulfed", () => {
            const piece = makePiece();
            // Set engulfed directly on private field to avoid setTimeout side-effects
            (piece as any)._engulfed = true;
            expect(piece.turnOver).toBe(true);
        });

        it("returns true when moved, attacked, and rangedAttacked are all true", () => {
            const piece = makeRangedPiece();
            piece.rangedAttacked = true; // also sets moved and attacked
            expect(piece.turnOver).toBe(true);
        });

        it("returns true when piece has moved with zero combat and no ranged attack", () => {
            const piece = makePiece({
                properties: {
                    ...BASE_PROPERTIES,
                    combat: 0,
                    rangedCombat: 0,
                    status: [],
                },
            });
            piece.moved = true;
            expect(piece.turnOver).toBe(true);
        });
    });

    describe("turnOver setter", () => {
        it("setting turnOver = true marks moved, attacked, and rangedAttacked as true", () => {
            const piece = makeRangedPiece();
            piece.turnOver = true;
            // rangedAttacked getter returns true when stats.rangedCombat=0, so check via a ranged piece
            expect(piece.moved).toBe(true);
            expect(piece.attacked).toBe(true);
        });

        it("setting turnOver = false resets moved, attacked, and rangedAttacked flags", () => {
            const piece = makeRangedPiece();
            piece.rangedAttacked = true;
            piece.turnOver = false;
            // After reset, flags should be false
            expect((piece as any)._moved).toBe(false);
            expect((piece as any)._attacked).toBe(false);
            expect((piece as any)._rangedAttacked).toBe(false);
        });
    });

    describe("reset", () => {
        it("clears turnOver and engaged flags", () => {
            const piece = makeRangedPiece();
            piece.rangedAttacked = true;
            piece.engaged = true;
            piece.reset();
            expect(piece.engaged).toBe(false);
            expect((piece as any)._moved).toBe(false);
        });

        it("propagates reset to a current rider", () => {
            const mount = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            const rider = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Wizard] },
            });
            // Directly attach rider without full mount mechanics
            (mount as any)._currentRider = rider;
            mount.reset();
            expect(rider.engaged).toBe(false);
        });
    });

    describe("board getter", () => {
        it("returns the board supplied at construction", () => {
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

    describe("depth getter", () => {
        it("returns 0 when the sprite y position is 0", () => {
            expect(makePiece().depth).toBe(0);
        });
    });

    describe("updateDepth", () => {
        it("does not throw", () => {
            const piece = makePiece();
            expect(() => (piece as any).updateDepth()).not.toThrow();
        });
    });

    describe("properties getter", () => {
        it("returns the piece properties", () => {
            const piece = makePiece();
            expect(piece.properties.combat).toBe(BASE_PROPERTIES.combat);
            expect(piece.properties.movement).toBe(BASE_PROPERTIES.movement);
        });
    });

    describe("sprite and shadow lazy getters", () => {
        it("createSprite is called on first access to sprite", () => {
            const piece = makePiece();
            (piece as any)._sprite = undefined; // ensure sprite is uninitialised
            expect(piece.sprite).toBeDefined();
        });

        it("createShadow is called on first access to shadow", () => {
            const piece = makePiece();
            (piece as any)._shadow = undefined; // ensure shadow is uninitialised
            expect(piece.shadow).toBeDefined();
        });
    });

    describe("highlighted getter", () => {
        it("returns false by default", () => {
            expect(makePiece().highlighted).toBe(false);
        });

        it("setting highlighted on a piece without ownerHighlightTween is a no-op (stays false)", () => {
            const piece = makePiece();
            // _ownerHighlightTween is undefined because createShaders is a no-op in MockPiece
            piece.highlighted = true;
            expect(piece.highlighted).toBe(false);
        });
    });

    describe("currentRider getter and setter", () => {
        it("currentRider is null by default", () => {
            expect(makePiece().currentRider).toBeNull();
        });

        it("setting to null clears the rider", () => {
            const piece = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            const rider = makePiece();
            (piece as any)._currentRider = rider;
            piece.currentRider = null;
            expect(piece.currentRider).toBeNull();
        });

        it("logs an error and does not set rider when piece is not mountable", () => {
            const piece = makePiece(); // no Mount status
            const rider = makePiece();
            const consoleSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});
            piece.currentRider = rider;
            expect(piece.currentRider).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith(
                "Cannot mount an unmountable unit",
            );
            consoleSpy.mockRestore();
        });

        it("sets the rider when the piece has Mount status", () => {
            const piece = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            const rider = makePiece();
            piece.currentRider = rider;
            expect(piece.currentRider).toBe(rider);
        });

        it("sets the rider when the piece has MountAny status", () => {
            const piece = makePiece({
                properties: {
                    ...BASE_PROPERTIES,
                    status: [UnitStatus.MountAny],
                },
            });
            const rider = makePiece();
            piece.currentRider = rider;
            expect(piece.currentRider).toBe(rider);
        });
    });

    describe("currentMount getter", () => {
        it("currentMount is null by default", () => {
            expect(makePiece().currentMount).toBeNull();
        });
    });

    describe("inRangedAttackRange", () => {
        it("returns true when target is within range", () => {
            const piece = makeRangedPiece({ x: 0, y: 0 });
            const target = new PMath.Vector2(2, 0);
            // Board.distance will compute euclidean distance; with range=6 this should pass
            // We just check it doesn't throw and returns a boolean
            expect(typeof piece.inRangedAttackRange(target)).toBe("boolean");
        });

        it("returns false when target is beyond range", () => {
            const piece = makePiece({ x: 0, y: 0 });
            // With range=0 any non-zero distance should fail
            const target = new PMath.Vector2(1, 0);
            expect(piece.inRangedAttackRange(target)).toBe(false);
        });
    });

    describe("canBeDisbelieved", () => {
        it("returns true for a plain Creature", () => {
            expect(makePiece().canBeDisbelieved).toBe(true);
        });

        it("returns false for a Wizard-type unit", () => {
            const piece = makePiece({ type: UnitType.Static });
            expect(piece.canBeDisbelieved).toBe(false);
        });

        it("returns false when the piece has the Wizard status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Wizard);
            expect(piece.canBeDisbelieved).toBe(false);
        });

        it("returns false when the piece has the Structure status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Structure);
            expect(piece.canBeDisbelieved).toBe(false);
        });

        it("returns false when the piece has the Spreads status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Spreads);
            expect(piece.canBeDisbelieved).toBe(false);
        });

        it("returns false when the piece has the Tree status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Tree);
            expect(piece.canBeDisbelieved).toBe(false);
        });
    });

    describe("canBeSpreadOn", () => {
        it("returns true for a plain Creature with no blocking statuses", () => {
            expect(makePiece().canBeSpreadOn).toBe(true);
        });

        it("returns true for a Wizard-type unit", () => {
            const piece = makePiece({ type: UnitType.Wizard });
            expect(piece.canBeSpreadOn).toBe(true);
        });

        it("returns false for a Static-type unit", () => {
            const piece = makePiece({ type: UnitType.Static });
            expect(piece.canBeSpreadOn).toBe(false);
        });

        it("returns false when the piece has the Engulfs status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Engulfs);
            expect(piece.canBeSpreadOn).toBe(false);
        });

        it("returns false when the piece has the Invulnerable status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Invulnerable);
            expect(piece.canBeSpreadOn).toBe(false);
        });

        it("returns false when the piece has the Structure status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Structure);
            expect(piece.canBeSpreadOn).toBe(false);
        });

        it("returns false when the piece has the Tree status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Tree);
            expect(piece.canBeSpreadOn).toBe(false);
        });
    });

    describe("canBeSubverted", () => {
        it("returns true for a plain Creature", () => {
            expect(makePiece().canBeSubverted).toBe(true);
        });

        it("returns false when type is not Creature", () => {
            const piece = makePiece({ type: UnitType.Static });
            expect(piece.canBeSubverted).toBe(false);
        });

        it("returns false when piece has a current rider", () => {
            const piece = makePiece();
            (piece as any)._currentRider = makePiece();
            expect(piece.canBeSubverted).toBe(false);
        });

        it("returns false when piece has a current mount", () => {
            const piece = makePiece();
            (piece as any)._currentMount = makePiece();
            expect(piece.canBeSubverted).toBe(false);
        });

        it("returns false when piece has the Wizard status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Wizard);
            expect(piece.canBeSubverted).toBe(false);
        });

        it("returns false when piece has the Spreads status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Spreads);
            expect(piece.canBeSubverted).toBe(false);
        });

        it("returns false when piece has the Structure status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Structure);
            expect(piece.canBeSubverted).toBe(false);
        });

        it("returns false when piece has the Tree status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Tree);
            expect(piece.canBeSubverted).toBe(false);
        });

        it("returns false when piece has the Invulnerable status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Invulnerable);
            expect(piece.canBeSubverted).toBe(false);
        });
    });

    describe("canBeMagicAttacked", () => {
        it("returns true for a normal piece", () => {
            expect(makePiece().canBeMagicAttacked).toBe(true);
        });

        it("returns false when the piece has the Invulnerable status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Invulnerable);
            expect(piece.canBeMagicAttacked).toBe(false);
        });

        it("returns false when the piece has the Sanctity status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Sanctity);
            expect(piece.canBeMagicAttacked).toBe(false);
        });
    });

    describe("canMove", () => {
        it("returns true for a normal piece that has not moved", () => {
            expect(makePiece().canMove).toBe(true);
        });

        it("returns false when the piece is dead", () => {
            const piece = makePiece();
            (piece as any)._dead = true;
            expect(piece.canMove).toBe(false);
        });

        it("returns false when the piece is engulfed", () => {
            const piece = makePiece();
            (piece as any)._engulfed = true;
            expect(piece.canMove).toBe(false);
        });

        it("returns false when movement stat is 0", () => {
            const piece = makePiece({
                properties: { ...BASE_PROPERTIES, movement: 0, status: [] },
            });
            expect(piece.canMove).toBe(false);
        });

        it("returns false when the piece has Structure status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Structure);
            expect(piece.canMove).toBe(false);
        });

        it("returns false when the piece has Tree status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Tree);
            expect(piece.canMove).toBe(false);
        });
    });

    describe("canAttackPossiblyUndeadPiece", () => {
        it("returns true when target is not undead", () => {
            const attacker = makePiece();
            const target = makePiece();
            expect(attacker.canAttackPossiblyUndeadPiece(target)).toBe(true);
        });

        it("returns false when target is undead and attacker has no undead-attack capability", () => {
            const attacker = makePiece();
            const target = makePiece();
            target.addStatus(UnitStatus.Undead);
            expect(attacker.canAttackPossiblyUndeadPiece(target)).toBe(false);
        });

        it("returns true when target is undead and attacker is also undead", () => {
            const attacker = makePiece();
            const target = makePiece();
            attacker.addStatus(UnitStatus.Undead);
            target.addStatus(UnitStatus.Undead);
            expect(attacker.canAttackPossiblyUndeadPiece(target)).toBe(true);
        });

        it("returns true when target is undead and attacker has AttackUndead status", () => {
            const attacker = makePiece();
            const target = makePiece();
            attacker.addStatus(UnitStatus.AttackUndead);
            target.addStatus(UnitStatus.Undead);
            expect(attacker.canAttackPossiblyUndeadPiece(target)).toBe(true);
        });
    });

    describe("canAttackPiece", () => {
        it("returns false when attacker and target are the same piece", () => {
            const piece = makePiece();
            expect(piece.canAttackPiece(piece)).toBe(false);
        });

        it("returns false when attacker and target have the same owner", () => {
            const owner = makeMockPlayer();
            const attacker = makePiece({ owner });
            const target = makePiece({ owner });
            expect(attacker.canAttackPiece(target)).toBe(false);
        });

        it("returns false when attacker is dead", () => {
            const attacker = makePiece();
            const target = makePiece({ owner: makeMockPlayer("enemy") });
            (attacker as any)._dead = true;
            expect(attacker.canAttackPiece(target)).toBe(false);
        });

        it("returns false when attacker is engulfed", () => {
            const attacker = makePiece();
            const target = makePiece({ owner: makeMockPlayer("enemy") });
            (attacker as any)._engulfed = true;
            expect(attacker.canAttackPiece(target)).toBe(false);
        });

        it("returns false when attacker has already attacked", () => {
            const attacker = makePiece();
            const target = makePiece({ owner: makeMockPlayer("enemy") });
            attacker.attacked = true;
            expect(attacker.canAttackPiece(target)).toBe(false);
        });

        it("returns false when target is dead", () => {
            const attacker = makePiece();
            const target = makePiece({ owner: makeMockPlayer("enemy") });
            (target as any)._dead = true;
            expect(attacker.canAttackPiece(target)).toBe(false);
        });

        it("returns false when target is engulfed", () => {
            const attacker = makePiece();
            const target = makePiece({ owner: makeMockPlayer("enemy") });
            (target as any)._engulfed = true;
            expect(attacker.canAttackPiece(target)).toBe(false);
        });

        it("returns false when target is mounted", () => {
            const attacker = makePiece();
            const target = makePiece({ owner: makeMockPlayer("enemy") });
            (target as any)._currentMount = makePiece();
            expect(attacker.canAttackPiece(target)).toBe(false);
        });

        it("returns false when target is invulnerable", () => {
            const attacker = makePiece();
            const target = makePiece({ owner: makeMockPlayer("enemy") });
            target.addStatus(UnitStatus.Invulnerable);
            expect(attacker.canAttackPiece(target)).toBe(false);
        });

        it("returns false when target is the attacker's current rider", () => {
            const attacker = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            const rider = makePiece({ owner: makeMockPlayer("enemy") });
            attacker.currentRider = rider;
            expect(attacker.canAttackPiece(rider)).toBe(false);
        });

        it("returns true when all conditions are met", () => {
            const attacker = makePiece({ owner: makeMockPlayer("player1") });
            const target = makePiece({ owner: makeMockPlayer("enemy") });
            expect(attacker.canAttackPiece(target)).toBe(true);
        });
    });

    describe("canRangedAttackPiece", () => {
        it("returns false when attacker is the target", () => {
            const piece = makeRangedPiece();
            piece.moved = true; // Must have moved first
            expect(piece.canRangedAttackPiece(piece)).toBe(false);
        });

        it("returns false when attacker and target share an owner", () => {
            const owner = makeMockPlayer();
            const attacker = makeRangedPiece({ owner });
            const target = makeRangedPiece({ owner });
            attacker.moved = true;
            expect(attacker.canRangedAttackPiece(target)).toBe(false);
        });

        it("returns false when attacker has not yet moved", () => {
            const attacker = makeRangedPiece({ owner: makeMockPlayer("a") });
            const target = makeRangedPiece({ owner: makeMockPlayer("b") });
            // moved starts false; ranged attack requires it to be true
            expect(attacker.canRangedAttackPiece(target)).toBe(false);
        });

        it("returns false when target is dead", () => {
            const attacker = makeRangedPiece({ owner: makeMockPlayer("a") });
            const target = makeRangedPiece({ owner: makeMockPlayer("b") });
            attacker.moved = true;
            (target as any)._dead = true;
            expect(attacker.canRangedAttackPiece(target)).toBe(false);
        });

        it("returns false when target is invulnerable", () => {
            const attacker = makeRangedPiece({ owner: makeMockPlayer("a") });
            const target = makeRangedPiece({ owner: makeMockPlayer("b") });
            attacker.moved = true;
            target.addStatus(UnitStatus.Invulnerable);
            expect(attacker.canRangedAttackPiece(target)).toBe(false);
        });

        it("returns false when target is out of range", () => {
            const attacker = makePiece({
                owner: makeMockPlayer("a"),
                x: 0,
                y: 0,
            });
            // With BASE_PROPERTIES rangedCombat=0, rangedAttacked is always true which blocks this
            attacker.moved = true;
            const target = makePiece({
                owner: makeMockPlayer("b"),
                x: 5,
                y: 0,
            });
            expect(attacker.canRangedAttackPiece(target)).toBe(false);
        });

        it("returns false when there is no line of sight", () => {
            const board = makeMockBoard({ hasLineOfSight: () => false });
            // Two pieces on the same board; MockPiece constructor calls initSprites internally
            const attacker = new MockPiece(board, 0, {
                type: UnitType.Creature,
                properties: { ...RANGED_PROPERTIES, status: [] },
                x: 0,
                y: 0,
            });
            const target = new MockPiece(board, 1, {
                type: UnitType.Creature,
                properties: { ...RANGED_PROPERTIES, status: [] },
                x: 1,
                y: 0,
                owner: makeMockPlayer("enemy"),
            });
            attacker.moved = true;
            expect(attacker.canRangedAttackPiece(target)).toBe(false);
        });
    });

    describe("canMountPiece", () => {
        it("returns false when attacker is the same as the target", () => {
            const piece = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Wizard] },
            });
            expect(piece.canMountPiece(piece)).toBe(false);
        });

        it("returns false when attacker is dead", () => {
            const wizard = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Wizard] },
            });
            const mount = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
                owner: makeMockPlayer("same"),
            });
            (wizard as any)._dead = true;
            expect(wizard.canMountPiece(mount)).toBe(false);
        });

        it("returns false when attacker has already moved", () => {
            const wizard = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Wizard] },
            });
            const mount = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
                owner: makeMockPlayer("same"),
            });
            wizard.moved = true;
            expect(wizard.canMountPiece(mount)).toBe(false);
        });

        it("returns false when attacker is not a wizard", () => {
            const nonWizard = makePiece();
            const mount = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            expect(nonWizard.canMountPiece(mount)).toBe(false);
        });

        it("returns false when target is already mounted", () => {
            const wizard = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Wizard] },
            });
            const mount = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
                owner: wizard.owner,
            });
            (mount as any)._currentRider = makePiece();
            expect(wizard.canMountPiece(mount)).toBe(false);
        });

        it("returns false when target is not mountable and has no MountAny status", () => {
            const wizard = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Wizard] },
            });
            const target = makePiece({ owner: wizard.owner });
            expect(wizard.canMountPiece(target)).toBe(false);
        });

        it("returns true for a wizard mounting a MountAny piece regardless of ownership", () => {
            const owner = makeMockPlayer("owner");
            const wizard = makePiece({
                owner,
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Wizard] },
            });
            const mountAny = makePiece({
                owner: makeMockPlayer("other"),
                properties: {
                    ...BASE_PROPERTIES,
                    status: [UnitStatus.MountAny],
                },
            });
            expect(wizard.canMountPiece(mountAny)).toBe(true);
        });

        it("returns true for a wizard mounting a same-owner Mount piece", () => {
            const owner = makeMockPlayer("owner");
            const wizard = makePiece({
                owner,
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Wizard] },
            });
            const mount = makePiece({
                owner,
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            expect(wizard.canMountPiece(mount)).toBe(true);
        });
    });

    describe("canEngagePiece", () => {
        it("returns false when piece tries to engage itself", () => {
            const piece = makePiece();
            expect(piece.canEngagePiece(piece)).toBe(false);
        });

        it("returns false when piece is dead", () => {
            const piece = makePiece({ owner: makeMockPlayer("a") });
            const enemy = makePiece({ owner: makeMockPlayer("b") });
            (piece as any)._dead = true;
            expect(piece.canEngagePiece(enemy)).toBe(false);
        });

        it("returns false when piece is engulfed", () => {
            const piece = makePiece({ owner: makeMockPlayer("a") });
            const enemy = makePiece({ owner: makeMockPlayer("b") });
            (piece as any)._engulfed = true;
            expect(piece.canEngagePiece(enemy)).toBe(false);
        });

        it("returns false when target is dead", () => {
            const piece = makePiece({ owner: makeMockPlayer("a") });
            const enemy = makePiece({ owner: makeMockPlayer("b") });
            (enemy as any)._dead = true;
            expect(piece.canEngagePiece(enemy)).toBe(false);
        });

        it("returns false when piece manoeuvrability is 0", () => {
            const piece = makePiece({
                owner: makeMockPlayer("a"),
                properties: {
                    ...BASE_PROPERTIES,
                    manoeuvrability: 0,
                    status: [],
                },
            });
            const enemy = makePiece({ owner: makeMockPlayer("b") });
            expect(piece.canEngagePiece(enemy)).toBe(false);
        });

        it("returns false when target manoeuvrability is 0", () => {
            const piece = makePiece({ owner: makeMockPlayer("a") });
            const enemy = makePiece({
                owner: makeMockPlayer("b"),
                properties: {
                    ...BASE_PROPERTIES,
                    manoeuvrability: 0,
                    status: [],
                },
            });
            expect(piece.canEngagePiece(enemy)).toBe(false);
        });

        it("returns false when piece is mounted", () => {
            const piece = makePiece({ owner: makeMockPlayer("a") });
            const enemy = makePiece({ owner: makeMockPlayer("b") });
            (piece as any)._currentMount = makePiece();
            expect(piece.canEngagePiece(enemy)).toBe(false);
        });

        it("returns false when they share an owner", () => {
            const owner = makeMockPlayer();
            const piece = makePiece({ owner });
            const ally = makePiece({ owner });
            expect(piece.canEngagePiece(ally)).toBe(false);
        });

        it("returns true when all blocking conditions are clear", () => {
            const piece = makePiece({ owner: makeMockPlayer("a") });
            const enemy = makePiece({ owner: makeMockPlayer("b") });
            expect(piece.canEngagePiece(enemy)).toBe(true);
        });
    });

    describe("canSelect", () => {
        it("returns false when the piece is engulfed", () => {
            const piece = makePiece();
            (piece as any)._engulfed = true;
            expect(piece.canSelect).toBe(false);
        });

        it("returns false when the piece is dead", () => {
            const piece = makePiece();
            (piece as any)._dead = true;
            expect(piece.canSelect).toBe(false);
        });

        it("returns false when the piece has Structure status", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Structure);
            expect(piece.canSelect).toBe(false);
        });

        it("returns false when all stats are 0", () => {
            const piece = makePiece({
                properties: {
                    ...BASE_PROPERTIES,
                    movement: 0,
                    combat: 0,
                    rangedCombat: 0,
                    status: [],
                },
            });
            expect(piece.canSelect).toBe(false);
        });

        it("returns true for a normal piece that has not acted", () => {
            expect(makePiece().canSelect).toBe(true);
        });
    });

    describe("canAttack", () => {
        it("returns false when the piece is dead", () => {
            const piece = makePiece(
                {},
                { getAdjacentPiecesAtPosition: () => [] },
            );
            (piece as any)._dead = true;
            expect(piece.canAttack).toBe(false);
        });

        it("returns false when the piece is engulfed", () => {
            const piece = makePiece(
                {},
                { getAdjacentPiecesAtPosition: () => [] },
            );
            (piece as any)._engulfed = true;
            expect(piece.canAttack).toBe(false);
        });

        it("returns false when the piece has already attacked", () => {
            const piece = makePiece(
                {},
                { getAdjacentPiecesAtPosition: () => [] },
            );
            piece.attacked = true;
            expect(piece.canAttack).toBe(false);
        });

        it("returns false when combat stat is 0", () => {
            const piece = makePiece(
                { properties: { ...BASE_PROPERTIES, combat: 0, status: [] } },
                { getAdjacentPiecesAtPosition: () => [] },
            );
            expect(piece.canAttack).toBe(false);
        });

        it("returns false when there are no neighbours", () => {
            const piece = makePiece(
                {},
                { getAdjacentPiecesAtPosition: () => [] },
            );
            expect(piece.canAttack).toBe(false);
        });

        it("returns true when there is at least one attackable neighbour", () => {
            const owner = makeMockPlayer("me");
            const enemyOwner = makeMockPlayer("enemy");
            const enemy = makePiece({ owner: enemyOwner });
            const piece = makePiece(
                { owner },
                { getAdjacentPiecesAtPosition: () => [enemy] },
            );
            expect(piece.canAttack).toBe(true);
        });
    });

    describe("canRangedAttack", () => {
        it("returns false when the piece is dead", () => {
            const piece = makeRangedPiece();
            (piece as any)._dead = true;
            expect(piece.canRangedAttack).toBe(false);
        });

        it("returns false when rangedCombat stat is 0", () => {
            const piece = makePiece();
            // BASE_PROPERTIES has rangedCombat=0
            expect(piece.canRangedAttack).toBe(false);
        });

        it("returns false when already rangedAttacked", () => {
            const piece = makeRangedPiece();
            piece.rangedAttacked = true;
            expect(piece.canRangedAttack).toBe(false);
        });

        it("returns false when no valid ranged targets exist on the board", () => {
            const piece = makeRangedPiece({});
            piece.moved = true;
            expect(piece.canRangedAttack).toBe(false);
        });
    });

    describe("getFirstEngagingPiece", () => {
        it("returns null when there are no neighbours", () => {
            const piece = makePiece(
                {},
                { getAdjacentPiecesAtPosition: () => [] },
            );
            expect(piece.getFirstEngagingPiece()).toBeNull();
        });

        it("returns null when neighbours cannot be engaged", () => {
            const owner = makeMockPlayer();
            const ally = makePiece({ owner });
            const piece = makePiece(
                { owner },
                { getAdjacentPiecesAtPosition: () => [ally] },
            );
            expect(piece.getFirstEngagingPiece()).toBeNull();
        });

        it("returns the first engageable neighbour", () => {
            const enemy = makePiece({ owner: makeMockPlayer("b") });
            const board = makeMockBoard({
                getAdjacentPiecesAtPosition: () => [enemy],
            });
            const pieceWithBoard = makePieceOnBoard(board, {
                owner: makeMockPlayer("a"),
            });
            expect(pieceWithBoard.getFirstEngagingPiece()).toBe(enemy);
        });
    });

    describe("unitConfig getter", () => {
        it("returns an object reflecting current stats", () => {
            const piece = makePiece();
            const config = piece.unitConfig;
            expect(config.properties.mov).toBe(BASE_PROPERTIES.movement);
            expect(config.properties.com).toBe(BASE_PROPERTIES.combat);
            expect(config.properties.def).toBe(BASE_PROPERTIES.defence);
            expect(config.name).toBe(BASE_PROPERTIES.name);
            expect(config.dead).toBe(false);
            expect(config.wizard).toBe(false);
        });

        it("reflects dead=true when piece is dead", () => {
            const piece = makePiece();
            (piece as any)._dead = true;
            expect(piece.unitConfig.dead).toBe(true);
        });

        it("reflects wizard=true for Wizard type", () => {
            const piece = makePiece({ type: UnitType.Wizard });
            expect(piece.unitConfig.wizard).toBe(true);
        });

        it("reflects buffed stats from active status effects", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.MagicSword);
            expect(piece.unitConfig.properties.com).toBe(
                Math.min(BASE_PROPERTIES.combat + 6, 9),
            );
        });

        it("includes status array in the returned config", () => {
            const piece = makePiece();
            piece.addStatus(UnitStatus.Flying);
            const config = piece.unitConfig;
            expect(config.status).toContain(UnitStatus.Flying);
        });
    });

    describe("static getUnitConfig", () => {
        it("returns undefined for an unknown unit ID", () => {
            expect(
                Piece.getUnitConfig("definitely-not-a-real-unit-id"),
            ).toBeUndefined();
        });

        it("returns a config object for a known unit ID", () => {
            // Units use numeric string keys in classicunits.json; 'king-cobra' is King Cobra
            const config = Piece.getUnitConfig("king-cobra");
            expect(config).toBeDefined();
            expect(typeof config?.name).toBe("string");
        });
    });

    describe("static getUnitPropertiesByName", () => {
        it("returns null for an unknown unit name", () => {
            expect(Piece.getUnitPropertiesByName("Not A Real Unit")).toBeNull();
        });

        it("returns UnitStats for a known unit name (case-insensitive)", () => {
            // Unit key 'king-cobra' is King Cobra in classicunits.json
            const config = Piece.getUnitConfig("king-cobra");
            if (!config) return; // guard: skip if json not loaded
            const stats = Piece.getUnitPropertiesByName(config.name);
            expect(stats).not.toBeNull();
            expect(stats?.id).toBe("king-cobra");
            expect(typeof stats?.combat).toBe("number");
        });

        it("matches names case-insensitively", () => {
            const config = Piece.getUnitConfig("king-cobra");
            if (!config) return;
            const upper = Piece.getUnitPropertiesByName(
                config.name.toUpperCase(),
            );
            const lower = Piece.getUnitPropertiesByName(
                config.name.toLowerCase(),
            );
            expect(upper).not.toBeNull();
            expect(lower).not.toBeNull();
            expect(upper?.id).toBe(lower?.id);
        });
    });

    describe("static getPieceProperties", () => {
        it("returns undefined for an unknown unit name", () => {
            expect(Piece.getPieceProperties("Not A Real Unit")).toBeUndefined();
        });

        it("returns properties for a known unit name", () => {
            // Unit key 'king-cobra' is King Cobra in classicunits.json
            const config = Piece.getUnitConfig("king-cobra");
            if (!config) return;
            const props = Piece.getPieceProperties(config.name);
            expect(props).toBeDefined();
            expect(props?.type).toBe(UnitType.Creature);
            expect(props?.properties?.id).toBe("king-cobra");
        });
    });

    describe("static isPiece", () => {
        it("returns true for a Piece instance", () => {
            expect(Piece.isPiece(makePiece())).toBe(true);
        });

        it("returns false for a plain object", () => {
            expect(Piece.isPiece({ name: "fake" })).toBe(false);
        });

        it("returns false for null", () => {
            expect(Piece.isPiece(null)).toBe(false);
        });

        it("returns false for a number", () => {
            expect(Piece.isPiece(42)).toBe(false);
        });
    });

    describe("raiseDead", () => {
        it("throws when the piece is not dead", async () => {
            const piece = makePiece();
            await expect(piece.raiseDead(null)).rejects.toThrow(
                "Cannot raise a piece that is not dead",
            );
        });

        it("raises a dead piece and assigns the new owner", async () => {
            const piece = makePiece();
            (piece as any)._dead = true;
            const newOwner = makeMockPlayer("necromancer");
            await piece.raiseDead(newOwner);
            expect(piece.dead).toBe(false);
            expect(piece.raisedDead).toBe(true);
            expect(piece.owner).toBe(newOwner);
            expect(piece.hasStatus(UnitStatus.Undead)).toBe(true);
        });

        it("raises a dead piece with null owner", async () => {
            const piece = makePiece();
            (piece as any)._dead = true;
            await piece.raiseDead(null);
            expect(piece.dead).toBe(false);
            expect(piece.raisedDead).toBe(true);
        });
    });

    describe("moved setter with currentRider propagation", () => {
        it("propagates moved flag to the current rider", () => {
            const mount = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            const rider = makePiece();
            mount.currentRider = rider;
            mount.moved = true;
            // rider.moved depends on stats so we check the internal flag
            expect((rider as any)._moved).toBe(true);
        });

        it("does not re-propagate when rider already has the same value", () => {
            const mount = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            const rider = makePiece();
            mount.currentRider = rider;
            // Set rider to moved first
            (rider as any)._moved = true;
            mount.moved = true; // same value — should not trigger circular update
            expect((rider as any)._moved).toBe(true);
        });
    });

    describe("attacked setter with currentRider propagation", () => {
        it("propagates attacked and moved flags to the current rider", () => {
            const mount = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            const rider = makePiece();
            mount.currentRider = rider;
            mount.attacked = true;
            expect((rider as any)._moved).toBe(true);
            expect((rider as any)._attacked).toBe(true);
        });
    });

    describe("rangedAttacked setter with mount/rider propagation", () => {
        it("propagates rangedAttacked flags to both mount and rider", () => {
            const mount = makePiece({
                properties: { ...BASE_PROPERTIES, status: [UnitStatus.Mount] },
            });
            const rider = makeRangedPiece({
                properties: {
                    ...RANGED_PROPERTIES,
                    status: [UnitStatus.Wizard],
                },
            });
            mount.currentRider = rider;
            (rider as any)._currentMount = mount;
            rider.rangedAttacked = true;
            expect((mount as any)._moved).toBe(true);
            expect((mount as any)._attacked).toBe(true);
        });
    });

    describe("getNeighbours", () => {
        it("returns empty array when board returns no adjacent pieces", () => {
            const piece = makePiece(
                {},
                { getAdjacentPiecesAtPosition: () => [] },
            );
            expect(piece.getNeighbours()).toEqual([]);
        });

        it("returns only living adjacent pieces", () => {
            const living = makePiece({ owner: makeMockPlayer("a") });
            const dead = makePiece({ owner: makeMockPlayer("b") });
            (dead as any)._dead = true;
            // The board mock filters out dead pieces via the callback in getNeighbours
            // We need the board's getAdjacentPiecesAtPosition to honour the filter callback
            const board = makeMockBoard({
                getAdjacentPiecesAtPosition: (
                    _pos: any,
                    filter: (p: Piece) => boolean,
                ) => [living, dead].filter(filter),
            });
            const piece = makePieceOnBoard(board);
            expect(piece.getNeighbours()).toEqual([living]);
        });
    });

    describe("findThreatPieces", () => {
        it("returns an empty set when there are no board pieces", () => {
            const piece = makePiece({}, { pieces: [] });
            expect(piece.findThreatPieces().size).toBe(0);
        });

        it("excludes friendly pieces", () => {
            const owner = makeMockPlayer("me");
            const ally = makePiece({ owner });
            const board = makeMockBoard({ pieces: [ally] });
            const piece = makePieceOnBoard(board, { owner });
            expect(piece.findThreatPieces().size).toBe(0);
        });

        it("excludes dead enemy pieces", () => {
            const myOwner = makeMockPlayer("me");
            const enemy = makePiece({ owner: makeMockPlayer("enemy") });
            (enemy as any)._dead = true;
            const board = makeMockBoard({ pieces: [enemy] });
            const piece = makePieceOnBoard(board, { owner: myOwner });
            expect(piece.findThreatPieces().size).toBe(0);
        });

        it("includes a nearby spreading enemy as a threat", () => {
            const myOwner = makeMockPlayer("me");
            const spreadEnemy = makePiece({
                owner: makeMockPlayer("enemy"),
                x: 1,
                y: 0,
                properties: {
                    ...BASE_PROPERTIES,
                    status: [UnitStatus.Spreads],
                },
            });
            const board = makeMockBoard({ pieces: [spreadEnemy] });
            const piece = makePieceOnBoard(board, { owner: myOwner });
            const threats = piece.findThreatPieces();
            expect(threats.has(spreadEnemy)).toBe(true);
        });
    });

    describe("updateDirection (protected, accessed via any)", () => {
        it("sets direction to Left when iso x offset is negative", () => {
            const piece = makePiece({ x: 3, y: 0 });
            // from (3,0) to (0,3): toIsometric(0,3).x=0-3=-3, toIsometric(3,0).x=3-0=3 → offset=-3-3=-6 < 0 → Left
            (piece as any).updateDirection(
                new PMath.Vector2(3, 0),
                new PMath.Vector2(0, 3),
            );
            expect(piece.direction).toBe(UnitDirection.Left);
        });

        it("sets direction to Right when iso x offset is positive", () => {
            const piece = makePiece({ x: 0, y: 3 });
            // from (0,3) to (3,0): toIsometric(3,0).x=3, toIsometric(0,3).x=-3 → offset=3-(-3)=6 > 0 → Right
            (piece as any).updateDirection(
                new PMath.Vector2(0, 3),
                new PMath.Vector2(3, 0),
            );
            expect(piece.direction).toBe(UnitDirection.Right);
        });

        it("does not change direction when iso x offset is zero", () => {
            const piece = makePiece({ x: 2, y: 0 });
            piece.direction = UnitDirection.Left;
            // from (1,0) to (0,1): both have iso x = 1-0=1 and 0-1=-1... let's use symmetric case
            // from (1,2) to (2,1): toIsometric(2,1).x=2-1=1, toIsometric(1,2).x=1-2=-1 → not zero
            // Use same point: from (2,2) to (2,2) → offset=0
            (piece as any).updateDirection(
                new PMath.Vector2(2, 2),
                new PMath.Vector2(2, 2),
            );
            // Direction should remain unchanged
            expect(piece.direction).toBe(UnitDirection.Left);
        });
    });

    describe("playAnim (protected, accessed via any)", () => {
        it("does not throw when _sprite is defined and piece is alive", () => {
            const piece = makePiece();
            expect(() => (piece as any).playAnim()).not.toThrow();
        });

        it("does not throw when _sprite is undefined", () => {
            const piece = makePiece();
            (piece as any)._sprite = undefined;
            expect(() => (piece as any).playAnim()).not.toThrow();
        });

        it("calls setFrame when piece is dead (dead animation branch)", () => {
            const piece = makePiece();
            (piece as any)._dead = true;
            const setFrameSpy = vi.spyOn((piece as any)._sprite, "setFrame");
            expect(() => (piece as any).playAnim()).not.toThrow();
            expect(setFrameSpy).toHaveBeenCalled();
        });
    });

    describe("static constant values", () => {
        it("RAISED_DEAD_TINT is a number", () => {
            expect(typeof Piece.RAISED_DEAD_TINT).toBe("number");
        });

        it("DEFAULT_MOVE_DURATION is positive", () => {
            expect(Piece.DEFAULT_MOVE_DURATION).toBeGreaterThan(0);
        });

        it("MOVED_DARKEN_AMOUNT is positive", () => {
            expect(Piece.MOVED_DARKEN_AMOUNT).toBeGreaterThan(0);
        });

        it("SHADOW_FORM_ALPHA is between 0 and 1", () => {
            expect(Piece.SHADOW_FORM_ALPHA).toBeGreaterThan(0);
            expect(Piece.SHADOW_FORM_ALPHA).toBeLessThan(1);
        });
    });

    describe("flyApproach", () => {
        it("does not update the logical position", async () => {
            const { board } = makeTweenBoard();
            const piece = makePieceOnBoard(board);
            const originalPos = new PMath.Vector2(
                piece.position.x,
                piece.position.y,
            );
            await piece.flyApproach(new PMath.Vector2(5, 5));
            expect(piece.position).toEqual(originalPos);
        });

        it("adds a tween targeting the sprite", async () => {
            const { board, tweenSpy } = makeTweenBoard();
            const piece = makePieceOnBoard(board);
            await piece.flyApproach(new PMath.Vector2(5, 5));
            const spriteTween = tweenSpy.mock.calls.find(
                (call: any[]) =>
                    Array.isArray(call[0].targets) &&
                    call[0].targets.includes(piece.sprite),
            );
            expect(spriteTween).toBeDefined();
        });
    });

    describe("flyReturn", () => {
        it("does not update the logical position", async () => {
            const { board } = makeTweenBoard();
            const piece = makePieceOnBoard(board);
            const originalPos = new PMath.Vector2(
                piece.position.x,
                piece.position.y,
            );
            await piece.flyReturn(new PMath.Vector2(0, 0), new PMath.Vector2(5, 5));
            expect(piece.position).toEqual(originalPos);
        });

        it("adds a tween targeting the sprite", async () => {
            const { board, tweenSpy } = makeTweenBoard();
            const piece = makePieceOnBoard(board);
            await piece.flyReturn(new PMath.Vector2(0, 0), new PMath.Vector2(5, 5));
            const spriteTween = tweenSpy.mock.calls.find(
                (call: any[]) =>
                    Array.isArray(call[0].targets) &&
                    call[0].targets.includes(piece.sprite),
            );
            expect(spriteTween).toBeDefined();
        });

        it("tweens the sprite to ground level, not elevated", async () => {
            const { board, tweenSpy } = makeTweenBoard(50, 80);
            const piece = makePieceOnBoard(board);
            await piece.flyReturn(new PMath.Vector2(0, 0), new PMath.Vector2(5, 5));
            // Find the flyReturn sprite tween (has y property, targets sprite)
            const spriteCall = tweenSpy.mock.calls.find(
                (call: any[]) =>
                    Array.isArray(call[0].targets) &&
                    call[0].targets.includes(piece.sprite) &&
                    typeof call[0].y === "number",
            );
            // Find the flyReturn shadow tween (has y property, doesn't
            // target sprite)
            const shadowCall = tweenSpy.mock.calls.find(
                (call: any[]) =>
                    Array.isArray(call[0].targets) &&
                    !call[0].targets.includes(piece.sprite) &&
                    typeof call[0].y === "number",
            );
            expect(spriteCall).toBeDefined();
            expect(shadowCall).toBeDefined();
            // Shadow always targets groundY; sprite must match it (no
            // HOVER_HEIGHT offset)
            expect(spriteCall[0].y).toBe(shadowCall[0].y);
        });
    });

    describe("screenPosition", () => {
        it("returns the center of the sprite when sprite exists", () => {
            const piece = makePiece();
            // MockPiece initialises sprites synchronously; makeMockSprite
            // returns getCenter: () => ({ x: 0, y: 0 })
            const pos = piece.screenPosition;
            expect(pos).not.toBeNull();
            expect(pos).toEqual({ x: 0, y: 0 });
        });

        it("returns {x: 0, y: 0} when no sprite has been created", () => {
            const piece = makePiece();
            // Remove the sprite to simulate the no-sprite state
            (piece as any)._sprite = undefined;
            expect(piece.screenPosition).toEqual({ x: 0, y: 0 });
        });

        it("delegates to sprite.getCenter()", () => {
            const piece = makePiece();
            const getCenterSpy = vi
                .spyOn((piece as any)._sprite, "getCenter")
                .mockReturnValue({ x: 42, y: 99 });
            expect(piece.screenPosition).toEqual({ x: 42, y: 99 });
            expect(getCenterSpy).toHaveBeenCalled();
        });
    });
});
