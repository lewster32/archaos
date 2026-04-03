/** @internal – only for use in unit tests */
/* v8 ignore start */
import { UnitType } from "@archaos/engine";
import type { SpellConfig } from "@archaos/engine";
import { vi } from "vitest";
import { Geom } from "phaser";
import type { Board } from "../board";
import { TestRNG } from "@archaos/engine";

export function makeMockBoard(
    opts: {
        balance?: number;
        rollChanceResult?: boolean;
        players?: any[];
    } = {},
): Board {
    const { balance = 0, rollChanceResult = true, players = [] } = opts;
    return {
        balance,
        balanceShift: 0,
        rollChance: vi.fn().mockReturnValue(rollChanceResult),
        roll: vi.fn().mockReturnValue(true),
        hasLineOfSight: vi.fn().mockReturnValue(true),
        getAdjacentPiecesAtPosition: vi.fn().mockReturnValue([]),
        getPiecesAtPosition: vi.fn().mockReturnValue([]),
        playEffect: vi.fn().mockResolvedValue(undefined),
        idleDelay: vi.fn().mockResolvedValue(undefined),
        logger: { log: vi.fn() },
        sound: { play: vi.fn() },
        rangeGizmo: {
            showSimpleRange: vi.fn(),
            reset: vi.fn(),
        },
        pieces: [],
        players,
        rng: new TestRNG(),
    } as unknown as Board;
}

export function makeMockPiece(
    opts: {
        id?: number;
        type?: UnitType;
        owner?: any;
        dead?: boolean;
        currentMount?: any;
        engulfed?: boolean;
        canBeDisbelieved?: boolean;
        canBeSubverted?: boolean;
        canBeMagicAttacked?: boolean;
        illusion?: boolean;
        x?: number;
        y?: number;
        name?: string;
    } = {},
): any {
    const {
        id = 1,
        type = UnitType.Creature,
        owner = null,
        dead = false,
        currentMount = null,
        engulfed = false,
        canBeDisbelieved = false,
        canBeSubverted = false,
        canBeMagicAttacked = true,
        illusion = false,
        x = 0,
        y = 0,
        name = "Test Piece",
    } = opts;
    return {
        id,
        type,
        owner,
        dead,
        currentMount,
        engulfed,
        canBeDisbelieved,
        canBeSubverted,
        canBeMagicAttacked,
        illusion,
        position: new Geom.Point(x, y),
        stats: { magicResistance: 0 },
        hasStatus: vi.fn().mockReturnValue(false),
        sprite: { getCenter: vi.fn().mockReturnValue({ x: 0, y: 0 }) },
        kill: vi.fn().mockResolvedValue(undefined),
        raiseDead: vi.fn().mockResolvedValue(undefined),
        addStatus: vi.fn().mockReturnValue(true),
        moveTo: vi.fn(),
        name,
    };
}

export function makeMockPlayer(castingPiece?: any): any {
    return {
        castingPiece: castingPiece ?? null,
        name: "Test Player",
        ai: null,
    };
}

export function makeConfig(overrides: Partial<SpellConfig> = {}): SpellConfig {
    return {
        id: "test-spell",
        name: "Test Spell",
        chance: 0.8,
        balance: 0,
        ...overrides,
    };
}
/* v8 ignore stop */
