/** @internal – only for use in unit tests */
/* v8 ignore start */
import { UnitType } from "../enums/unittype";
import type { SpellConfig } from "../configs/spellconfig";
import { vi } from "vitest";
import { Point } from "../point";
import type { Board } from "../board";
import { Alignment } from "../alignment";
import { TestRNG } from "../rng";

/**
 * Build an Alignment for tests. `balance` uses the legacy float form
 * (e.g. 0.2 = 20% toward law) and is converted to the equivalent integer
 * alignment value via the quantisation used by
 * {@link Alignment.adjustChance} (multiply by 40 so |value|/4/10 matches
 * the legacy 0..1 scale). The private `_value` field is seeded directly so
 * tests can set up any balance — the real `shift()` method is clamped to ±4.
 *
 * @param balance The balance value to seed (legacy float, -1..+1).
 * @param classicBalance If true, use the original asymmetric chance mode.
 */
function makeAlignment(balance: number, classicBalance: boolean): Alignment {
    const alignment: Alignment = new Alignment(classicBalance);
    if (balance !== 0) {
        (alignment as any)._value = Math.round(balance * 40);
    }
    return alignment;
}

export function makeMockBoard(
    opts: {
        balance?: number;
        classicBalance?: boolean;
        rollChanceResult?: boolean;
        players?: any[];
    } = {},
): Board {
    const {
        balance = 0,
        classicBalance = false,
        rollChanceResult = true,
        players = [],
    } = opts;
    const alignment: Alignment = makeAlignment(balance, classicBalance);
    return {
        alignment,
        get balance() {
            return alignment.value;
        },
        get balanceShift() {
            return alignment.valueAccumulated;
        },
        rollChance: vi.fn().mockReturnValue(rollChanceResult),
        roll: vi.fn().mockReturnValue(true),
        hasLineOfSight: vi.fn().mockReturnValue(true),
        getAdjacentPiecesAtPosition: vi.fn().mockReturnValue([]),
        getPiecesAtPosition: vi.fn().mockReturnValue([]),
        playEffect: vi.fn().mockResolvedValue(undefined),
        idleDelay: vi.fn().mockResolvedValue(undefined),
        events: {
            emit: vi.fn(),
            emitAsync: vi.fn().mockResolvedValue(undefined),
        },
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
        position: new Point(x, y),
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
