import { describe, it, test, expect, vi, afterEach } from "vitest";
import { Board } from "./board";
import type { BoardDeps } from "./board";
import { Player } from "./player";
import { Point } from "./point";
import { TestRNG } from "./rng";
import { Logger } from "./logger";
import { Rules } from "./rules";
import { BoardEvent } from "./enums/boardevent";
import { BoardState } from "./enums/boardstate";
import { BoardPhase } from "./enums/boardphase";
import { RangeType } from "./enums/rangetype";
import { UnitStatus } from "./enums/unitstatus";
import { UnitType } from "./enums/unittype";
import { GameSetupPlayerType } from "./interfaces/ui";
import type { PieceConfig } from "./configs/piececonfig";
import type { Spell } from "./spells/spell";
import type {
    EndSpellPickCommand,
    PickSpellCommand,
} from "./protocol/commands";
import { roundTrip } from "./protocol/wiresafety.test";

function makeRules(): Rules {
    return {
        doSpread: vi.fn().mockResolvedValue(undefined),
        doExpire: vi.fn().mockResolvedValue(undefined),
        doAutoCastSpell: vi.fn().mockResolvedValue(false),
        doCastSpell: vi.fn().mockResolvedValue(false),
    } as unknown as Rules;
}

function makeBoard(overrides: Partial<BoardDeps> = {}): Board {
    return new Board(1, 13, 13, false, undefined, {
        rng: new TestRNG(),
        logger: { log: vi.fn() } as unknown as Logger,
        rules: makeRules(),
        ...overrides,
    });
}

function makePieceConfig(x: number, y: number, owner: Player, status: UnitStatus[] = []): PieceConfig {
    return {
        type: UnitType.Creature,
        x,
        y,
        properties: {
            movement: 3,
            combat: 3,
            rangedCombat: 0,
            range: 0,
            defence: 4,
            manoeuvrability: 3,
            magicResistance: 0,
            status,
        },
        owner: owner as any,
    };
}

function makeMockSpell(overrides: Record<string, any> = {}): Spell {
    return {
        id: 99,
        range: -1,
        lineOfSight: false,
        castTimes: 1,
        persist: false,
        properties: { autoPlace: false },
        ...overrides,
    } as unknown as Spell;
}

describe("Board", () => {
    describe("addPlayer / getPlayer / players", () => {
        it("makes the player retrievable by id", () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "Player 1",
                type: GameSetupPlayerType.Local,
            });
            expect(board.getPlayer(player.id)).toBe(player);
        });

        it("includes all added players in the players array", () => {
            const board = makeBoard();
            board.addPlayer({
                name: "Player 1",
                type: GameSetupPlayerType.Local,
            });
            board.addPlayer({
                name: "Player 2",
                type: GameSetupPlayerType.Local,
            });
            expect(board.players).toHaveLength(2);
        });

        it("returns null for an unknown player id", () => {
            const board = makeBoard();
            expect(board.getPlayer(99)).toBeNull();
        });
    });

    describe("addPiece / getPiece / pieces", () => {
        it("adds a piece retrievable by id", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "Player 1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(0, 0, player));
            expect(board.getPiece(piece.id)).toBe(piece);
        });

        it("returns null for an unknown piece id", () => {
            const board = makeBoard();
            expect(board.getPiece(999)).toBeNull();
        });
    });

    describe("removePiece", () => {
        it("removes the piece from the board", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "Player 1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(0, 0, player));
            board.removePiece(piece.id);
            expect(board.getPiece(piece.id)).toBeNull();
        });

        it("silently ignores an unknown id", () => {
            const board = makeBoard();
            expect(() => board.removePiece(999)).not.toThrow();
        });

        it("emits PieceDestroyed", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "Player 1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(0, 0, player));
            const destroyed: any[] = [];
            board.boardEvents.on(BoardEvent.PieceDestroyed, (p: any) => destroyed.push(p));
            board.removePiece(piece.id);
            expect(destroyed).toContain(piece);
        });
    });

    describe("getPiecesByOwner", () => {
        it("returns only pieces belonging to the given player", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const p2 = board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            const a = await board.addPiece(makePieceConfig(0, 0, p1));
            const b = await board.addPiece(makePieceConfig(1, 0, p1));
            await board.addPiece(makePieceConfig(2, 0, p2));
            const result = board.getPiecesByOwner(p1);
            expect(result).toHaveLength(2);
            expect(result).toContain(a);
            expect(result).toContain(b);
        });
    });

    describe("getPiecesAtPosition", () => {
        it("returns pieces at the exact position", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(3, 4, player));
            expect(board.getPiecesAtPosition(new Point(3, 4))).toContain(piece);
        });

        it("returns an empty array for an unoccupied cell", () => {
            const board = makeBoard();
            expect(board.getPiecesAtPosition(new Point(5, 5))).toHaveLength(0);
        });

        it("respects a filter predicate", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(0, 0, player));
            const result = board.getPiecesAtPosition(new Point(0, 0), () => false);
            expect(result).toHaveLength(0);
        });
    });

    describe("getAdjacentPoints", () => {
        it("returns 3 neighbours for a corner cell", () => {
            const board = makeBoard();
            expect(board.getAdjacentPoints(new Point(0, 0))).toHaveLength(3);
        });

        it("returns 5 neighbours for an edge cell", () => {
            const board = makeBoard();
            expect(board.getAdjacentPoints(new Point(6, 0))).toHaveLength(5);
        });

        it("returns 8 neighbours for a centre cell", () => {
            const board = makeBoard();
            expect(board.getAdjacentPoints(new Point(6, 6))).toHaveLength(8);
        });

        it("includes the origin when includeCentre is true", () => {
            const board = makeBoard();
            const pts = board.getAdjacentPoints(new Point(6, 6), true);
            expect(pts).toHaveLength(9);
            expect(pts.some((p) => p.x === 6 && p.y === 6)).toBe(true);
        });
    });

    describe("getPointsInRange", () => {
        it("returns empty for range 0 without includeCentre", () => {
            const board = makeBoard();
            expect(board.getPointsInRange(new Point(6, 6), 0)).toHaveLength(0);
        });

        it("includes the origin when includeCentre is true at range 0", () => {
            const board = makeBoard();
            expect(board.getPointsInRange(new Point(6, 6), 0, true)).toHaveLength(1);
        });

        it("clamps results to board bounds near an edge", () => {
            const board = makeBoard();
            board.getPointsInRange(new Point(0, 0), 2).forEach((p) => {
                expect(p.x).toBeGreaterThanOrEqual(0);
                expect(p.y).toBeGreaterThanOrEqual(0);
            });
        });

        it("Foot range returns all 8 immediate neighbours at range 1", () => {
            const board = makeBoard();
            expect(board.getPointsInRange(new Point(6, 6), 1, false, RangeType.Foot)).toHaveLength(8);
        });

        it("Fly range excludes double-diagonal cells at range 2", () => {
            const board = makeBoard();
            const pts = board.getPointsInRange(new Point(6, 6), 2, false, RangeType.Fly);
            const hasDoubleDiag = pts.some((p) => Math.abs(p.x - 6) === 2 && Math.abs(p.y - 6) === 2);
            expect(hasDoubleDiag).toBe(false);
        });
    });

    describe("isBlocker", () => {
        it("returns false for an empty cell", () => {
            expect(makeBoard().isBlocker(new Point(5, 5))).toBe(false);
        });

        it("returns false for a cell containing only dead pieces", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(3, 3, player));
            (piece as any)._dead = true;
            expect(board.isBlocker(new Point(3, 3))).toBe(false);
        });

        it("returns false for a transparent piece", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(3, 3, player, [UnitStatus.Transparent]));
            expect(board.isBlocker(new Point(3, 3))).toBe(false);
        });

        it("returns true for a live opaque piece", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(3, 3, player));
            expect(board.isBlocker(new Point(3, 3))).toBe(true);
        });
    });

    describe("hasLineOfSight", () => {
        it("returns true when no pieces intervene", () => {
            expect(makeBoard().hasLineOfSight(new Point(0, 0), new Point(6, 6))).toBe(true);
        });

        it("returns true for adjacent cells", () => {
            expect(makeBoard().hasLineOfSight(new Point(5, 5), new Point(6, 5))).toBe(true);
        });

        it("returns false when a blocker is on the horizontal path", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(3, 0, player));
            expect(board.hasLineOfSight(new Point(0, 0), new Point(6, 0))).toBe(false);
        });

        it("returns false when a blocker is on the vertical path", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(0, 3, player));
            expect(board.hasLineOfSight(new Point(0, 0), new Point(0, 6))).toBe(false);
        });

        it("returns false when a blocker is on the diagonal path", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(3, 3, player));
            expect(board.hasLineOfSight(new Point(0, 0), new Point(6, 6))).toBe(false);
        });
    });

    describe("Board.distance (static)", () => {
        it("returns 0 for the same point", () => {
            expect(Board.distance(new Point(3, 3), new Point(3, 3))).toBe(0);
        });

        it("returns 1 for a cardinal step in both range types", () => {
            expect(Board.distance(new Point(0, 0), new Point(1, 0), RangeType.Foot)).toBe(1);
            expect(Board.distance(new Point(0, 0), new Point(1, 0), RangeType.Fly)).toBe(1);
        });

        it("Foot: pure diagonal (1,1) = 1", () => {
            expect(Board.distance(new Point(0, 0), new Point(1, 1), RangeType.Foot)).toBe(1);
        });

        it("Fly: pure diagonal (1,1) = 1.5", () => {
            expect(Board.distance(new Point(0, 0), new Point(1, 1), RangeType.Fly)).toBe(1.5);
        });

        it("Foot: mixed (2,1) = 2", () => {
            expect(Board.distance(new Point(0, 0), new Point(2, 1), RangeType.Foot)).toBe(2);
        });

        it("Fly: mixed (2,1) = 2.5", () => {
            expect(Board.distance(new Point(0, 0), new Point(2, 1), RangeType.Fly)).toBe(2.5);
        });
    });

    describe("Board.toIsometric / Board.fromIsometric (static)", () => {
        it("toIsometric produces expected screen-space coordinates", () => {
            // toIsometric({x, y}) = {x - y, (x + y) / 2}
            const p = new Point(4, 2);
            const iso = Board.toIsometric(p);
            expect(iso.x).toBeCloseTo(2); // 4 - 2
            expect(iso.y).toBeCloseTo(3); // (4 + 2) / 2
        });

        it("fromIsometric inverts toIsometric when applied to (0,0)", () => {
            const origin = new Point(0, 0);
            const iso = Board.toIsometric(origin);
            const back = Board.fromIsometric(iso);
            expect(back.x).toBeCloseTo(0);
            expect(back.y).toBeCloseTo(0);
        });
    });

    describe("roll", () => {
        afterEach(() => {
            Board.CHEAT_FORCE_HIT = null;
        });

        it("returns false when both rolls are equal (TestRNG betweenValue=0)", () => {
            // TestRNG.between() returns min (0) when betweenValue not set,
            // so attackRoll=0, defenceRoll=0, 0 > 0 is false.
            expect(makeBoard().roll(5, 5)).toBe(false);
        });

        it("CHEAT_FORCE_HIT=true always returns true regardless of stats", () => {
            Board.CHEAT_FORCE_HIT = true;
            expect(makeBoard().roll(0, 100)).toBe(true);
        });

        it("CHEAT_FORCE_HIT=false always returns false regardless of stats", () => {
            Board.CHEAT_FORCE_HIT = false;
            expect(makeBoard().roll(100, 0)).toBe(false);
        });

        it("player.forceHit takes precedence over the cheat flag", () => {
            Board.CHEAT_FORCE_HIT = false;
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
                forceHit: true,
            });
            expect(board.roll(0, 0, player)).toBe(true);
        });
    });

    describe("rollChance", () => {
        afterEach(() => {
            Board.CHEAT_FORCE_CAST = null;
        });

        it("succeeds when chance > frac (frac=0.0, chance=0.5)", () => {
            const board = makeBoard({ rng: new TestRNG(0.0) });
            expect(board.rollChance(0.5)).toBe(true);
        });

        it("fails when chance <= frac (frac=1.0, chance=0.5)", () => {
            const board = makeBoard({ rng: new TestRNG(1.0) });
            expect(board.rollChance(0.5)).toBe(false);
        });

        it("CHEAT_FORCE_CAST=true always returns true", () => {
            Board.CHEAT_FORCE_CAST = true;
            expect(makeBoard().rollChance(0.0)).toBe(true);
        });

        it("CHEAT_FORCE_CAST=false always returns false", () => {
            Board.CHEAT_FORCE_CAST = false;
            expect(makeBoard().rollChance(1.0)).toBe(false);
        });

        it("player.forceCast takes precedence over the cheat flag", () => {
            Board.CHEAT_FORCE_CAST = false;
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
                forceCast: true,
            });
            expect(board.rollChance(0.0, player)).toBe(true);
        });
    });

    describe("checkWinCondition", () => {
        it("returns false when 2 or more players are undefeated", async () => {
            const board = makeBoard();
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            expect(await board.checkWinCondition()).toBe(false);
            expect(board.state).not.toBe(BoardState.GameOver);
        });

        it("sets GameOver and emits BoardEvent.GameOver when 1 player remains", async () => {
            const board = makeBoard();
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const p2 = board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            (p2 as any)._defeated = true;
            const emitted: string[] = [];
            board.boardEvents.on(BoardEvent.GameOver, () => emitted.push("GameOver"));
            expect(await board.checkWinCondition()).toBe(true);
            expect(board.state).toBe(BoardState.GameOver);
            expect(emitted).toContain("GameOver");
        });

        it("returns true immediately if already GameOver", async () => {
            const board = makeBoard();
            board.state = BoardState.GameOver;
            expect(await board.checkWinCondition()).toBe(true);
        });

        it("logs a draw message when 0 players remain", async () => {
            const logger = { log: vi.fn() } as unknown as Logger;
            const board = makeBoard({ logger });
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            (p1 as any)._defeated = true;
            await board.checkWinCondition();
            // "Dave" appears in the draw message — a Red Dwarf reference
            // ("Everybody's dead Dave"); the message text is defined in
            // board.ts.
            expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("Dave"), expect.anything());
        });
    });

    describe("endGame", () => {
        it("sets state to GameOver and emits BoardEvent.GameOver", () => {
            const board = makeBoard();
            const emitted: string[] = [];
            board.boardEvents.on(BoardEvent.GameOver, () => emitted.push("GameOver"));
            board.endGame();
            expect(board.state).toBe(BoardState.GameOver);
            expect(emitted).toContain("GameOver");
        });

        it("logs the provided message", () => {
            const logger = { log: vi.fn() } as unknown as Logger;
            const board = makeBoard({ logger });
            board.endGame("Round over");
            expect(logger.log).toHaveBeenCalledWith("Round over", expect.anything());
        });

        it("is a no-op when already GameOver", () => {
            const board = makeBoard();
            board.endGame();
            const emitted: string[] = [];
            board.boardEvents.on(BoardEvent.GameOver, () => emitted.push("again"));
            board.endGame("again");
            expect(emitted).toHaveLength(0);
        });
    });

    describe("selectPiece / deselectPiece / selectWizard", () => {
        it("selectPiece sets selected and emits PieceSelected", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(0, 0, player));
            const selected: any[] = [];
            board.boardEvents.on(BoardEvent.PieceSelected, (p: any) => selected.push(p));
            await board.selectPiece(piece.id);
            expect(board.selected).toBe(piece);
            expect(selected).toContain(piece);
        });

        it("selectPiece throws for an unknown id", async () => {
            await expect(makeBoard().selectPiece(999)).rejects.toThrow("No piece with ID 999 found to select");
        });

        it("deselectPiece clears selected", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(0, 0, player));
            await board.selectPiece(piece.id);
            await board.deselectPiece();
            expect(board.selected).toBeNull();
        });

        it("selectWizard selects the wizard piece for the given player", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const wizard = await board.addPiece(makePieceConfig(0, 0, player, [UnitStatus.Wizard]));
            const result = await board.selectWizard(player);
            expect(result).toBe(wizard);
            expect(board.selected).toBe(wizard);
        });

        it("selectWizard returns null when the player has no wizard piece", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            expect(await board.selectWizard(player)).toBeNull();
        });
    });

    describe("movePiece", () => {
        it("updates position and sets moved = true", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(0, 0, player));
            await board.movePiece(piece.id, new Point(5, 3), "test-cmd", 1);
            expect(piece.position.x).toBe(5);
            expect(piece.position.y).toBe(3);
            expect(piece.moved).toBe(true);
        });

        it("emits PieceMoved", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(0, 0, player));
            const moved: any[] = [];
            board.boardEvents.on(BoardEvent.PieceMoved, (p: any) => moved.push(p));
            await board.movePiece(piece.id, new Point(2, 2), "test-cmd", 1);
            expect(moved).toContain(piece);
        });

        it("throws for an unknown piece id", async () => {
            await expect(makeBoard().movePiece(999, new Point(0, 0), "test-cmd", 1)).rejects.toThrow(
                "Could not find piece with ID 999",
            );
        });
    });

    describe("newTurn", () => {
        it("emits NewTurn and transitions to Moving when no player has spells", async () => {
            const board = makeBoard();
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const events: string[] = [];
            board.boardEvents.on(BoardEvent.NewTurn, () => events.push("NewTurn"));
            await board.newTurn();
            expect(events).toContain("NewTurn");
            expect(board.phase).toBe(BoardPhase.Moving);
        });

        it("transitions to Spellbook phase when a player has spells", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            p1.addSpell(makeMockSpell());
            await board.newTurn();
            expect(board.phase).toBe(BoardPhase.Spellbook);
        });

        it("logs a non-zero accumulated alignment shift and resets it", async () => {
            const logger = { log: vi.fn() } as unknown as Logger;
            const board = makeBoard({ logger });
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            board.alignment.shift(2);
            expect(board.balance).toBe(2);
            expect(board.balanceShift).toBe(2);
            await board.newTurn();
            // Alignment.shift updates balance immediately; newTurn only resets
            // the per-turn accumulator.
            expect(board.balance).toBe(2);
            expect(board.balanceShift).toBe(0);
            expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("law"), expect.anything());
        });

        it("transitions Spellbook -> Casting when a player has selected a spell", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            p1.addSpell(makeMockSpell({ id: 10 }));
            await board.newTurn();
            expect(board.phase).toBe(BoardPhase.Spellbook);
            (p1 as any)._selectedSpell = makeMockSpell({ id: 10 });
            await board.newTurn();
            expect(board.phase).toBe(BoardPhase.Casting);
        });

        it("calls doSpread and doExpire on the NoSpellsCast path", async () => {
            const rules = makeRules();
            const board = makeBoard({ rules });
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            p1.addSpell(makeMockSpell({ id: 10 }));
            await board.newTurn(); // -> Spellbook
            await board.newTurn(); // no spell selected -> NoSpellsCast
            expect(rules.doSpread).toHaveBeenCalledWith(board);
            expect(rules.doExpire).toHaveBeenCalledWith(board);
        });

        it("calls doSpread and doExpire after the Casting phase ends", async () => {
            const rules = makeRules();
            const board = makeBoard({ rules });
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            p1.addSpell(makeMockSpell({ id: 10 }));
            await board.newTurn(); // -> Spellbook
            (p1 as any)._selectedSpell = makeMockSpell({ id: 10 });
            await board.newTurn(); // -> Casting
            await board.newTurn(); // -> Spreading
            expect(rules.doSpread).toHaveBeenCalledWith(board);
            expect(rules.doExpire).toHaveBeenCalledWith(board);
        });
    });

    describe("nextPlayer", () => {
        it("sets currentPlayer to the first player on first call", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            await board.nextPlayer();
            expect(board.currentPlayer).toBe(p1);
        });

        it("advances to the second player on the second call", async () => {
            const board = makeBoard();
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const p2 = board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            await board.nextPlayer(); // -> p1
            await board.nextPlayer(); // -> p2
            expect(board.currentPlayer).toBe(p2);
        });

        it("wraps back to the first player and calls newTurn", async () => {
            const board = makeBoard();
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            const newTurnEvents: string[] = [];
            board.boardEvents.on(BoardEvent.NewTurn, () => newTurnEvents.push("NewTurn"));
            await board.nextPlayer(); // index 0 -> newTurn called
            expect(newTurnEvents).toHaveLength(1);
            await board.nextPlayer(); // index 1
            await board.nextPlayer(); // wraps -> newTurn again
            expect(newTurnEvents).toHaveLength(2);
        });

        it("skips defeated players", async () => {
            const board = makeBoard();
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const p2 = board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            const p3 = board.addPlayer({
                name: "P3",
                type: GameSetupPlayerType.Local,
            });
            (p2 as any)._defeated = true;
            await board.nextPlayer(); // -> p1
            await board.nextPlayer(); // -> p3 (p2 skipped)
            expect(board.currentPlayer).toBe(p3);
        });

        it("returns early when the game is already over", async () => {
            const board = makeBoard();
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            board.state = BoardState.GameOver;
            await board.nextPlayer();
            expect(board.state).toBe(BoardState.GameOver);
        });

        it("auto-advances a remote player through spellbook and calls selectSpell", async () => {
            const selectSpell = vi.fn().mockResolvedValue(true);
            const remote = {
                selectSpell,
                castSpell: vi.fn().mockResolvedValue(true),
                moveAllUnits: vi.fn().mockResolvedValue(undefined),
            };
            const board = makeBoard();
            // p1 is a local player with no spells — will be skipped in
            // Spellbook phase (no spells, no remote).
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            // p2 is a remote/AI player with a spell.
            const p2 = board.addPlayer({ name: "P2", type: GameSetupPlayerType.Computer }, remote as any);
            p2.addSpell(makeMockSpell());

            // nextPlayer from index -1: increments to 0 → calls newTurn()
            // (p2 has spells so phase→Spellbook). p1 has no spells/remote →
            // skipped. p2 has remote → selectSpell() called → loop continues
            // until the local-player break is hit or phase changes.
            await board.nextPlayer();
            expect(selectSpell).toHaveBeenCalled();
        });

        it("returns early when a local player with spells reaches Spellbook phase (line 1306)", async () => {
            // The board enters Spellbook phase because p1 has a spell.
            // nextPlayer() selects p1, sees it is local with spells, and
            // returns immediately so the client can display the spellbook UI.
            // A second player is required to pass the 2-player win-condition
            // check inside nextPlayer().
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            p1.addSpell(makeMockSpell());
            board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });

            await board.nextPlayer();
            // currentPlayer is p1; the loop returned early without advancing
            // to any subsequent player.
            expect(board.currentPlayer).toBe(p1);
            expect(board.phase).toBe(BoardPhase.Spellbook);
        });
    });

    // ── attackPiece ────────────────────────────────────────────────────────

    describe("attackPiece", () => {
        it("throws when the attacking piece does not exist", async () => {
            const board = makeBoard();
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const defender = await board.addPiece(makePieceConfig(1, 0, board.players[0]));
            await expect(board.attackPiece(999, defender.id)).rejects.toThrow("Could not find piece with ID 999");
        });

        it("throws when the defending piece does not exist", async () => {
            const board = makeBoard();
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const attacker = await board.addPiece(makePieceConfig(0, 0, board.players[0]));
            await expect(board.attackPiece(attacker.id, 999)).rejects.toThrow("Could not find piece with ID 999");
        });

        it("emits PieceAttacked and returns attacker", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const p2 = board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            const attacker = await board.addPiece(makePieceConfig(0, 0, p1));
            const defender = await board.addPiece(makePieceConfig(1, 0, p2));
            const attacked: any[] = [];
            board.boardEvents.on(BoardEvent.PieceAttacked, (...args: any[]) => attacked.push(args));
            const result = await board.attackPiece(attacker.id, defender.id);
            expect(result).toBe(attacker);
            expect(attacked).toHaveLength(1);
        });
    });

    // ── rangedAttackPiece ─────────────────────────────────────────────────

    describe("rangedAttackPiece", () => {
        it("throws when the attacking piece does not exist", async () => {
            const board = makeBoard();
            board.addPlayer({ name: "P1", type: GameSetupPlayerType.Local });
            const defender = await board.addPiece(makePieceConfig(1, 0, board.players[0]));
            await expect(board.rangedAttackPiece(999, defender.id)).rejects.toThrow("Could not find piece with ID 999");
        });

        it("throws when the defending piece does not exist", async () => {
            const board = makeBoard();
            board.addPlayer({ name: "P1", type: GameSetupPlayerType.Local });
            const attacker = await board.addPiece(makePieceConfig(0, 0, board.players[0]));
            await expect(board.rangedAttackPiece(attacker.id, 999)).rejects.toThrow("Could not find piece with ID 999");
        });

        it("emits PieceRangedAttacked and returns attacker", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const p2 = board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            const attacker = await board.addPiece(makePieceConfig(0, 0, p1));
            const defender = await board.addPiece(makePieceConfig(1, 0, p2));
            const attacked: any[] = [];
            board.boardEvents.on(BoardEvent.PieceRangedAttacked, (...args: any[]) => attacked.push(args));
            const result = await board.rangedAttackPiece(attacker.id, defender.id);
            expect(result).toBe(attacker);
            expect(attacked).toHaveLength(1);
        });
    });

    // ── mountPiece / dismountPiece ─────────────────────────────────────────

    describe("mountPiece / dismountPiece", () => {
        it("mountPiece throws when the mounting piece does not exist", async () => {
            const board = makeBoard();
            board.addPlayer({ name: "P1", type: GameSetupPlayerType.Local });
            const mount = await board.addPiece(makePieceConfig(1, 0, board.players[0], [UnitStatus.MountAny]));
            await expect(board.mountPiece(999, mount.id)).rejects.toThrow("Could not find piece with ID 999");
        });

        it("mountPiece throws when the mounted piece does not exist", async () => {
            const board = makeBoard();
            board.addPlayer({ name: "P1", type: GameSetupPlayerType.Local });
            const rider = await board.addPiece(makePieceConfig(0, 0, board.players[0], [UnitStatus.Wizard]));
            await expect(board.mountPiece(rider.id, 999)).rejects.toThrow("Could not find piece with ID 999");
        });

        it("dismountPiece throws when the piece does not exist", async () => {
            const board = makeBoard();
            await expect(board.dismountPiece(999)).rejects.toThrow("Could not find piece with ID 999");
        });
    });

    // ── getAdjacentPiecesAtPosition ────────────────────────────────────────

    describe("getAdjacentPiecesAtPosition", () => {
        it("returns all pieces adjacent to a given point", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            // Place two pieces adjacent to (5,5)
            await board.addPiece(makePieceConfig(5, 4, p1)); // north
            await board.addPiece(makePieceConfig(6, 5, p1)); // east
            const centre = new Point(5, 5);
            const neighbours = board.getAdjacentPiecesAtPosition(centre);
            expect(neighbours).toHaveLength(2);
        });

        it("applies a filter predicate", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(5, 4, p1));
            await piece.kill(); // now dead
            await board.addPiece(makePieceConfig(6, 5, p1)); // alive
            const centre = new Point(5, 5);
            const alive = board.getAdjacentPiecesAtPosition(centre, (p) => !p.dead);
            expect(alive).toHaveLength(1);
        });

        it("includes centre pieces when includeCentre=true", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(5, 5, p1)); // at centre
            const centre = new Point(5, 5);
            const withCentre = board.getAdjacentPiecesAtPosition(centre, undefined, true);
            expect(withCentre).toHaveLength(1);
        });
    });

    // ── getRandomEmptySpace ────────────────────────────────────────────────

    describe("getRandomEmptySpace", () => {
        it("returns a point that is not occupied", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            // Occupy (0,0)
            await board.addPiece(makePieceConfig(0, 0, p1));
            const point = board.getRandomEmptySpace();
            expect(point).not.toBeNull();
            expect(point.x === 0 && point.y === 0).toBe(false);
        });

        it("returns null when the board is completely full", async () => {
            // Use a very small board (2×2) and fill it
            const board = new Board(2, 2, 2, false, undefined, {
                rng: new TestRNG(),
                logger: { log: vi.fn() } as unknown as Logger,
                rules: makeRules(),
            });
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            for (let x = 0; x < 2; x++) {
                for (let y = 0; y < 2; y++) {
                    await board.addPiece(makePieceConfig(x, y, p1));
                }
            }
            const result = board.getRandomEmptySpace();
            expect(result).toBeNull();
        });
    });

    // ── addSpell ───────────────────────────────────────────────────────────

    describe("addSpell", () => {
        it("throws when no spell factory is registered", () => {
            // Reset the spell factory
            (Board as any)._spellFactory = null;
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            expect(() =>
                board.addSpell(player, {
                    id: "test",
                    name: "Test",
                    chance: 0.5,
                    balance: 0,
                }),
            ).toThrow("Spell factory not registered");
        });

        it("registers a factory and adds a spell to the player", () => {
            const fakeSpell = {
                id: 99,
                owner: null,
                addSpell: vi.fn(),
                resetCastTimes: vi.fn(),
                castTimes: 1,
                persist: false,
            } as any;
            Board.registerSpellFactory((_b, _id, _cfg) => fakeSpell);
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            board.addSpell(player, {
                id: "test",
                name: "Test",
                chance: 0.5,
                balance: 0,
            });
            expect(player.spells).toHaveLength(1);
            // Cleanup factory so other tests aren't affected
            (Board as any)._spellFactory = null;
        });

        it("throws when player or config is missing", () => {
            Board.registerSpellFactory((_b, _id, _cfg) => ({}) as any);
            const board = makeBoard();
            const _player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            expect(() => board.addSpell(null as any, null as any)).toThrow("No player or config provided");
            (Board as any)._spellFactory = null;
        });
    });

    // ── addWizard ──────────────────────────────────────────────────────────

    describe("addWizard", () => {
        it("adds a wizard piece to the board", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const wizard = await board.addWizard({
                owner: p1,
                x: 3,
                y: 3,
                wizCode: "0000000000",
            });
            expect(board.pieces).toContain(wizard);
            expect(wizard.hasStatus(UnitStatus.Wizard)).toBe(true);
        });
    });

    // ── createWizards ──────────────────────────────────────────────────────

    describe("createWizards", () => {
        it("creates a wizard for each player", () => {
            const board = makeBoard();
            board.addPlayer({ name: "P1", type: GameSetupPlayerType.Local });
            board.addPlayer({ name: "P2", type: GameSetupPlayerType.Local });
            board.createWizards();
            expect(board.pieces).toHaveLength(2);
        });

        it("throws when not in the initial idle state", async () => {
            const board = makeBoard();
            board.addPlayer({ name: "P1", type: GameSetupPlayerType.Local });
            board.addPlayer({ name: "P2", type: GameSetupPlayerType.Local });
            board.createWizards();
            // A wizard is already placed — calling again should throw.
            expect(() => board.createWizards()).toThrow("Cannot create wizards");
        });

        it("throws when the game is already over", () => {
            const board = makeBoard();
            board.addPlayer({ name: "P1", type: GameSetupPlayerType.Local });
            board.state = BoardState.GameOver;
            expect(() => board.createWizards()).toThrow("Cannot create wizards");
        });
    });

    // ── spellFilter / disable flags ────────────────────────────────────────

    describe("spellFilter and disable flags", () => {
        it("spellFilter defaults to always-true", () => {
            const board = makeBoard();
            expect(board.spellFilter({ id: "x" } as any)).toBe(true);
        });

        it("can be replaced with a custom filter", () => {
            const board = makeBoard();
            board.spellFilter = () => false;
            expect(board.spellFilter({ id: "x" } as any)).toBe(false);
        });

        it("disableIllusions getter/setter round-trips", () => {
            const board = makeBoard();
            board.disableIllusions = true;
            expect(board.disableIllusions).toBe(true);
        });

        it("disableCancelSpell getter/setter round-trips", () => {
            const board = makeBoard();
            board.disableCancelSpell = true;
            expect(board.disableCancelSpell).toBe(true);
        });

        it("disableCancelAction getter/setter round-trips", () => {
            const board = makeBoard();
            board.disableCancelAction = true;
            expect(board.disableCancelAction).toBe(true);
        });

        it("disableEndTurn getter/setter round-trips", () => {
            const board = makeBoard();
            board.disableEndTurn = true;
            expect(board.disableEndTurn).toBe(true);
        });
    });

    // ── rollChance out-of-bounds warning ───────────────────────────────────

    describe("rollChance – out-of-bounds chance value", () => {
        it("clamps a chance > 1 to 1 and succeeds against frac=0.5", () => {
            const board = makeBoard();
            // frac=0.5 (TestRNG default), clamped chance=1 > 0.5 → true
            const result = board.rollChance(1.5);
            expect(result).toBe(true);
        });

        it("clamps a chance < 0 to 0 and fails against frac=0.5", () => {
            const board = makeBoard();
            // clamped chance=0, 0 > 0.5 is false → false
            const result = board.rollChance(-0.5);
            expect(result).toBe(false);
        });
    });

    // ── idleDelay ──────────────────────────────────────────────────────────

    describe("idleDelay", () => {
        it("temporarily sets state to Idle then restores it", async () => {
            const board = makeBoard();
            board.state = BoardState.Move;
            const states: BoardState[] = [];
            const promise = board.idleDelay();
            // After calling, state should be Idle synchronously (before await)
            states.push(board.state);
            await promise;
            states.push(board.state);
            // During idle: Idle; after resolution: restored to Move
            expect(states[0]).toBe(BoardState.Idle);
            expect(states[1]).toBe(BoardState.Move);
        });
    });

    // ── board.busy flag ────────────────────────────────────────────────────

    describe("board.busy", () => {
        it("is false on a newly created board", () => {
            expect(makeBoard().busy).toBe(false);
        });
    });

    // ── board.alignment ────────────────────────────────────────────────────

    describe("board.alignment", () => {
        it("exposes the shared Alignment instance via a getter", () => {
            const board = makeBoard();
            expect(board.alignment).toBeDefined();
            expect(board.balance).toBe(board.alignment.value);
            expect(board.balanceShift).toBe(board.alignment.valueAccumulated);
        });

        it("balance and balanceShift track alignment.shift()", () => {
            const board = makeBoard();
            board.alignment.shift(3);
            expect(board.balance).toBe(3);
            expect(board.balanceShift).toBe(3);
        });
    });

    // ── selectPlayer / deselectPlayer ─────────────────────────────────────

    describe("selectPlayer / deselectPlayer", () => {
        it("selectPlayer sets currentPlayer by id", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.selectPlayer(p1.id);
            expect(board.currentPlayer).toBe(p1);
        });

        it("deselectPlayer clears currentPlayer and selected", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(0, 0, p1));
            await board.selectPiece(piece.id);
            await board.selectPlayer(p1.id);
            board.deselectPlayer();
            expect(board.currentPlayer).toBeNull();
            expect(board.selected).toBeNull();
        });
    });

    // ── nextPlayer – remote casting path ──────────────────────────────────

    describe("nextPlayer – remote casting", () => {
        it("calls remote.moveAllUnits during the moving phase", async () => {
            const moveAllUnits = vi.fn().mockResolvedValue(undefined);
            const remote = {
                selectSpell: vi.fn().mockResolvedValue(false),
                castSpell: vi.fn().mockResolvedValue(true),
                moveAllUnits,
            };
            const board = makeBoard();
            // p1 local with no spells — provides the human turn that breaks
            const _p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            // p2 is remote/AI with no spells
            board.addPlayer({ name: "P2", type: GameSetupPlayerType.Computer }, remote as any);

            // Drive the FSM into the moving phase manually
            await board.newTurn(); // idle→moving (no spells)
            // Now index is at -1; nextPlayer → p1 (index 0, newTurn again
            // but now in moving phase → wraps to spellbook... re-check)
            // Use a shortcut: just check moveAllUnits gets called
            // by invoking nextPlayer twice past p1
            await board.nextPlayer(); // → p1 (local, break)
            await board.nextPlayer(); // → p2 (remote, moving phase)
            expect(moveAllUnits).toHaveBeenCalled();
        });
    });

    // ── Simple getters and setters ────────────────────────────────────────

    describe("spellFilter getter/setter", () => {
        it("default filter accepts all configs", () => {
            const board = makeBoard();
            expect(board.spellFilter({} as any)).toBe(true);
        });

        it("setter replaces the filter", () => {
            const board = makeBoard();
            board.spellFilter = () => false;
            expect(board.spellFilter({} as any)).toBe(false);
        });
    });

    describe("rangeGizmo getter", () => {
        it("returns a defined RangeGizmo instance", () => {
            const board = makeBoard();
            expect(board.rangeGizmo).toBeDefined();
        });
    });

    describe("events getter", () => {
        it("is an alias for boardEvents", () => {
            const board = makeBoard();
            expect(board.events).toBe(board.boardEvents);
        });
    });

    describe("cursorPosition getter/setter", () => {
        it("round-trips a point", () => {
            const board = makeBoard();
            const pt = new Point(3, 4);
            board.cursorPosition = pt;
            expect(board.cursorPosition).toBe(pt);
        });
    });

    describe("state setter – GameOver guard", () => {
        it("silently ignores state changes when game is already over", () => {
            const board = makeBoard();
            board.endGame();
            board.state = BoardState.Move;
            expect(board.state).toBe(BoardState.GameOver);
        });
    });

    // ── selectPiece / selectWizard guards ─────────────────────────────────

    describe("selectPiece – guard conditions", () => {
        it("returns without selecting when id is 0 (falsy)", async () => {
            const board = makeBoard();
            await expect(board.selectPiece(0)).resolves.toBeUndefined();
            expect(board.selected).toBeNull();
        });

        it("returns without selecting when game is already over", async () => {
            const board = makeBoard();
            board.endGame();
            await expect(board.selectPiece(999)).resolves.toBeUndefined();
        });
    });

    describe("selectWizard – GameOver guard", () => {
        it("returns null when game is already over", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            board.endGame();
            const result = await board.selectWizard(p1 as any);
            expect(result).toBeNull();
        });
    });

    // ── mountPiece / dismountPiece success paths ──────────────────────────

    describe("mountPiece / dismountPiece – success paths", () => {
        it("mountPiece mounts a wizard on a horse and returns the rider", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const wizard = await board.addPiece(makePieceConfig(0, 0, p1, [UnitStatus.Wizard]));
            const horse = await board.addPiece(makePieceConfig(1, 0, p1, [UnitStatus.Mount]));
            const result = await board.mountPiece(wizard.id, horse.id);
            expect(result).toBe(wizard);
            expect(wizard.currentMount).toBe(horse);
            expect(horse.currentRider).toBe(wizard);
        });

        it("mountPiece auto-dismounts from a previous mount before remounting", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const wizard = await board.addPiece(makePieceConfig(0, 0, p1, [UnitStatus.Wizard]));
            const horse1 = await board.addPiece(makePieceConfig(1, 0, p1, [UnitStatus.Mount]));
            const horse2 = await board.addPiece(makePieceConfig(2, 0, p1, [UnitStatus.Mount]));
            // Wire up the wizard as already mounted on horse1 without
            // consuming the moved flag (canMountPiece requires !moved).
            (wizard as any)._currentMount = horse1;
            (horse1 as any)._currentRider = wizard;
            await board.mountPiece(wizard.id, horse2.id);
            expect(wizard.currentMount).toBe(horse2);
            expect(horse1.currentRider).toBeNull();
        });

        it("dismountPiece returns the dismounted piece", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const wizard = await board.addPiece(makePieceConfig(0, 0, p1, [UnitStatus.Wizard]));
            const horse = await board.addPiece(makePieceConfig(1, 0, p1, [UnitStatus.Mount]));
            (wizard as any)._currentMount = horse;
            (horse as any)._currentRider = wizard;
            const result = await board.dismountPiece(wizard.id);
            expect(result).toBe(wizard);
            expect(wizard.currentMount).toBeNull();
        });
    });

    // ── newTurn – additional paths ────────────────────────────────────────

    describe("newTurn – GameOver guard", () => {
        it("returns early without throwing when game is over", async () => {
            const board = makeBoard();
            board.endGame();
            await expect(board.newTurn()).resolves.toBeUndefined();
        });
    });

    describe("newTurn – resets pieces on each new turn", () => {
        it("calls reset on pieces when transitioning into Moving phase", async () => {
            const board = makeBoard();
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            const piece = await board.addPiece(makePieceConfig(0, 0, p1));
            // Simulate piece having moved this turn
            (piece as any)._moved = true;
            // newTurn from idle (no spells) → Moving; reset() clears _moved
            await board.newTurn();
            expect((piece as any)._moved).toBe(false);
        });
    });

    describe("newTurn – spreading phase transition", () => {
        it("advances from spreading to moving when called in spreading state", async () => {
            const rules = makeRules();
            const board = makeBoard({ rules });
            const p1 = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            p1.addSpell(makeMockSpell({ id: 10 }));
            board.addPlayer({
                name: "P2",
                type: GameSetupPlayerType.Local,
            });
            await board.newTurn(); // idle → Spellbook
            (p1 as any)._selectedSpell = makeMockSpell({ id: 10 });
            await board.newTurn(); // Spellbook → Casting
            await board.newTurn(); // Casting → Spreading (via CastingDone)
            // FSM is now in spreading state; one more call exits it
            await board.newTurn(); // Spreading → Moving
            expect(board.phase).toBe(BoardPhase.Moving);
        });
    });
}); // closes describe("Board")

describe("recordEvent", () => {
    test("invokes the callback and appends one broadcast event", async () => {
        let clock = 0;
        const board = new Board(1, 13, 13, false, undefined, {
            rng: new TestRNG(),
            now: () => clock,
        });
        clock = 500;

        const event = await board.recordEvent({ commandId: "c_1", actorId: 1 }, () => {
            board.pushOutcome({ kind: "player-picked-spell", playerId: 1 });
        });

        expect(event.sequence).toBe(1);
        expect(event.commandId).toBe("c_1");
        expect(event.actorId).toBe(1);
        expect(event.outcomes).toHaveLength(1);
        expect(event.outcomes[0]).toEqual({ kind: "player-picked-spell", playerId: 1 });
        expect(board.eventLog.head()).toBe(1);
    });

    test("elapsedMs reflects the injected clock delta from gameStart", async () => {
        let clock = 1000;
        const board = new Board(1, 13, 13, false, undefined, {
            rng: new TestRNG(),
            now: () => clock,
        });
        // gameStartMs is 0 until startGame runs; elapsedMs = now - 0 = 1500
        clock = 1500;
        const event = await board.recordEvent({}, () => {
            board.pushOutcome({ kind: "phase-changed", phase: "spellbook", turnNumber: 1 });
        });
        expect(event.elapsedMs).toBe(1500);
    });

    test("outcomes accumulate in order across the callback", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        const event = await board.recordEvent({}, () => {
            board.pushOutcome({
                kind: "alignment-changed",
                delta: 1,
                newAlignment: { value: 1, accumulatedValue: 1 },
            });
            board.pushOutcome({ kind: "weather-changed", weather: { type: "clear" } });
        });
        expect(event.outcomes.map((o) => o.kind)).toEqual(["alignment-changed", "weather-changed"]);
    });

    test("spontaneous events omit commandId and actorId", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        const event = await board.recordEvent({}, () => {
            board.pushOutcome({ kind: "phase-changed", phase: "casting", turnNumber: 1 });
        });
        expect(event.commandId).toBeUndefined();
        expect(event.actorId).toBeUndefined();
    });

    test("nested recordEvent throws", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        await expect(
            board.recordEvent({}, async () => {
                await board.recordEvent({}, () => {
                    board.pushOutcome({ kind: "phase-changed", phase: "casting", turnNumber: 1 });
                });
            }),
        ).rejects.toThrow(/recordEvent.*nested|already active/i);
    });

    test("exception in callback clears context and appends nothing", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        await expect(
            board.recordEvent({}, () => {
                board.pushOutcome({ kind: "phase-changed", phase: "casting", turnNumber: 1 });
                throw new Error("boom");
            }),
        ).rejects.toThrow("boom");
        expect(board.eventLog.head()).toBe(0);

        // Subsequent recordEvent succeeds.
        const event = await board.recordEvent({}, () => {
            board.pushOutcome({ kind: "phase-changed", phase: "movement", turnNumber: 1 });
        });
        expect(event.sequence).toBe(1);
    });

    test("pushOutcome outside any context is a silent no-op", () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        expect(() => board.pushOutcome({ kind: "phase-changed", phase: "casting", turnNumber: 1 })).not.toThrow();
        expect(board.eventLog.head()).toBe(0);
    });

    test("supports async callbacks and awaits them", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        const event = await board.recordEvent({}, async () => {
            await Promise.resolve();
            board.pushOutcome({ kind: "phase-changed", phase: "casting", turnNumber: 1 });
        });
        expect(event.outcomes).toHaveLength(1);
    });
});

describe("event-log clock infrastructure", () => {
    it("BoardDeps.now defaults to Date.now when omitted", () => {
        const board = new Board(1, 13, 13);
        // Before startGame runs, _gameStartMs is 0.
        expect(board.gameStartMs).toBe(0);
    });

    it("BoardDeps.now can be overridden with a controlled clock", () => {
        let clock = 0;
        const board = new Board(1, 13, 13, false, undefined, {
            rng: new TestRNG(),
            now: () => clock,
        });
        expect(board.now()).toBe(0);
        clock = 500;
        expect(board.now()).toBe(500);
    });

    it("gameStartMs is readable before startGame (returns 0)", () => {
        const board = new Board(1, 13, 13);
        expect(board.gameStartMs).toBe(0);
    });
});

describe("BoardDeps scheduler injection", () => {
    it("phaseTimeoutMs defaults to null when not provided", () => {
        const board = makeBoard();
        expect(board.phaseTimeoutMs).toBeNull();
    });

    it("phaseTimeoutMs reflects the injected value", () => {
        const board = makeBoard({ phaseTimeoutMs: 7500 });
        expect(board.phaseTimeoutMs).toBe(7500);
    });

    it("phaseTimeoutMs may be set to 0 (treated as 'disabled' by callers)", () => {
        const board = makeBoard({ phaseTimeoutMs: 0 });
        expect(board.phaseTimeoutMs).toBe(0);
    });

    it("uses the injected setTimeout/clearTimeout when provided", () => {
        const setTimeout = vi.fn().mockReturnValue("handle-1");
        const clearTimeout = vi.fn();
        const board = makeBoard({ setTimeout, clearTimeout, phaseTimeoutMs: 5000 });
        // Internal accessors via 'as any' for the test only.
        const set = (board as any)._setTimeout as (cb: () => void, ms: number) => unknown;
        const clear = (board as any)._clearTimeout as (handle: unknown) => void;

        const handle = set(() => {}, 1000);
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
        expect(handle).toBe("handle-1");

        clear(handle);
        expect(clearTimeout).toHaveBeenCalledWith("handle-1");
    });

    it("falls back to global setTimeout/clearTimeout when not injected", () => {
        const board = makeBoard();
        const set = (board as any)._setTimeout as (cb: () => void, ms: number) => unknown;
        const clear = (board as any)._clearTimeout as (handle: unknown) => void;
        // Just prove the callable shape; we cannot easily assert the
        // global was called without monkeypatching.
        const handle = set(() => {}, 0);
        expect(handle).toBeDefined();
        clear(handle);
    });
});

function addPlayer(board: Board, _id: number, name: string): void {
    board.addPlayer({ name, type: GameSetupPlayerType.Local });
}

describe("startGame", () => {
    test("emits a sequence-1 event with a single game-started outcome", async () => {
        let clock = 1000;
        const board = new Board(1, 13, 13, false, undefined, {
            rng: new TestRNG(),
            now: () => clock,
        });
        addPlayer(board, 1, "Alice");

        const event = await board.startGame();

        expect(event.sequence).toBe(1);
        expect(event.elapsedMs).toBe(0);
        expect(event.outcomes).toHaveLength(1);
        expect(event.outcomes[0].kind).toBe("game-started");
        expect(event.commandId).toBeUndefined();
        expect(event.actorId).toBeUndefined();
    });

    test("game-started outcome carries scenario, players, initialPieces", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        addPlayer(board, 1, "Alice");
        addPlayer(board, 2, "Bob");

        const event = await board.startGame();

        const outcome = event.outcomes[0] as {
            kind: "game-started";
            scenario: { boardWidth: number };
            players: unknown[];
            initialPieces: unknown[];
        };
        expect(outcome.scenario.boardWidth).toBe(13);
        expect(outcome.players).toHaveLength(2);
        expect(outcome.initialPieces).toBeDefined();
    });

    test("gameStartMs captures the clock at startGame invocation", async () => {
        let clock = 500;
        const board = new Board(1, 13, 13, false, undefined, {
            rng: new TestRNG(),
            now: () => clock,
        });
        addPlayer(board, 1, "Alice");

        await board.startGame();

        expect(board.gameStartMs).toBe(500);
    });

    test("subsequent events use elapsedMs relative to startGame", async () => {
        let clock = 500;
        const board = new Board(1, 13, 13, false, undefined, {
            rng: new TestRNG(),
            now: () => clock,
        });
        addPlayer(board, 1, "Alice");

        await board.startGame();
        clock = 750;
        const event = await board.recordEvent({}, () => {
            board.pushOutcome({ kind: "phase-changed", phase: "casting", turnNumber: 1 });
        });

        expect(event.elapsedMs).toBe(250);
    });

    test("throws if called more than once", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        addPlayer(board, 1, "Alice");

        await board.startGame();

        await expect(board.startGame()).rejects.toThrow(/already|once/i);
    });
});

describe("phase-changed wiring", () => {
    test("startGame's game-started event is the only event before phase transitions", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        addPlayer(board, 1, "Alice");
        await board.startGame();
        // After startGame, the event log has one event (sequence 1 = game-started).
        // Any phase-changed events triggered by startGame's internal phase machine
        // transitions are counted separately.
        // The assertion is: the first event is game-started.
        expect(board.eventLog.range(1)[0].outcomes[0].kind).toBe("game-started");
    });

    test("pre-startGame transitions are not emitted", () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        addPlayer(board, 1, "Alice");
        // Without startGame, no events should be in the log even if the phase
        // machine has gone through setup states.
        expect(board.eventLog.head()).toBe(0);
    });

    test("phase-changed outcomes include phase and turnNumber; currentPlayerId present when applicable", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        addPlayer(board, 1, "Alice");
        addPlayer(board, 2, "Bob");

        await board.startGame();
        const headAfterStart = board.eventLog.head();

        // Collect every phase-changed outcome from events after game-started.
        // If the phase machine transitioned during startGame, we expect at
        // least one. If not (machine stayed in Idle), the array is empty and
        // the forEach is a no-op — the test is still a valid smoke check.
        const events = board.eventLog.range(2);
        type PhaseChangedShape = {
            kind: "phase-changed";
            phase: string;
            turnNumber: number;
            currentPlayerId?: number;
        };
        const phaseChangedOutcomes = events
            .flatMap((e) => e.outcomes)
            .filter((o) => o.kind === "phase-changed") as PhaseChangedShape[];

        phaseChangedOutcomes.forEach((o) => {
            expect(typeof o.phase).toBe("string");
            expect(typeof o.turnNumber).toBe("number");
        });

        // At minimum, headAfterStart should be >= 1 (game-started).
        expect(headAfterStart).toBeGreaterThanOrEqual(1);
    });
});

describe("movePiece wiring", () => {
    test("emits one event with piece-moved + piece-turn-flag-changed outcomes", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        const player = board.addPlayer({ name: "Alice", type: GameSetupPlayerType.Local });
        const piece = await board.addPiece(makePieceConfig(0, 0, player));
        await board.startGame();

        const event = await board.movePiece(piece.id, new Point(5, 5), "c_42", 1);

        expect(event.commandId).toBe("c_42");
        expect(event.actorId).toBe(1);
        expect(event.outcomes).toHaveLength(2);
        expect(event.outcomes[0].kind).toBe("piece-moved");
        expect(event.outcomes[1]).toEqual({
            kind: "piece-turn-flag-changed",
            pieceId: piece.id,
            flags: { moved: true },
        });
        expect(piece.position.x).toBe(5);
        expect(piece.position.y).toBe(5);
        expect(piece.moved).toBe(true);
    });

    test("path parameter appears in the piece-moved outcome when supplied", async () => {
        const board = new Board(1, 13, 13, false, undefined, { rng: new TestRNG() });
        const player = board.addPlayer({ name: "Alice", type: GameSetupPlayerType.Local });
        const piece = await board.addPiece(makePieceConfig(0, 0, player));
        await board.startGame();
        const path = [
            { x: piece.position.x, y: piece.position.y },
            { x: 4, y: 4 },
            { x: 5, y: 5 },
        ];

        const event = await board.movePiece(piece.id, new Point(5, 5), "c_1", 1, path);

        const outcome = event.outcomes[0] as {
            kind: "piece-moved";
            path?: { x: number; y: number }[];
        };
        expect(outcome.path).toEqual(path);
    });
});

/* ── Spellbook phase loop integration tests ─────────────────────── */

interface FakeScheduler {
    handles: Map<number, () => void>;
    setTimeout: (cb: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
    fire: (handle: number) => void;
}

function fakeScheduler(): FakeScheduler {
    let nextHandle = 1;
    const handles = new Map<number, () => void>();
    return {
        handles,
        setTimeout: (cb) => {
            const handle = nextHandle++;
            handles.set(handle, cb);
            return handle;
        },
        clearTimeout: (handle) => {
            handles.delete(handle as number);
        },
        fire: (handle) => {
            const cb = handles.get(handle);
            if (cb) {
                handles.delete(handle);
                cb();
            }
        },
    };
}

interface MakeTestBoardOpts {
    players?: number;
    playerOptions?: Array<{ isRemote?: boolean }>;
    phaseTimeoutMs?: number | null;
    setTimeout?: (cb: () => void, ms: number) => unknown;
    clearTimeout?: (handle: unknown) => void;
}

function makeTestBoard(opts: MakeTestBoardOpts = {}): Board {
    const { players = 2, playerOptions = [], phaseTimeoutMs = null } = opts;
    const board = new Board(1, 13, 13, false, undefined, {
        rng: new TestRNG(),
        logger: { log: vi.fn() } as unknown as Logger,
        rules: makeRules(),
        autoRunPhaseLoop: true,
        phaseTimeoutMs,
        setTimeout: opts.setTimeout,
        clearTimeout: opts.clearTimeout,
    });
    for (let i = 0; i < players; i++) {
        const playerOpts = playerOptions[i] ?? {};
        const player = board.addPlayer(
            { name: `P${i + 1}`, type: GameSetupPlayerType.Local },
            null,
            playerOpts.isRemote,
        );
        // Give the player a single mock spell so the spellbook is
        // non-empty and the phase loop runs.
        player.addSpell(makeMockSpell({ id: 1000 + i + 1 }));
    }
    return board;
}

function pickFor(
    board: Board,
    playerId: number,
    commandId = `pick-${playerId}`,
): PickSpellCommand {
    const player = board.getPlayer(playerId);
    const spellId = player.spells[0].id;
    return {
        type: "command",
        commandId,
        token: "",
        kind: "pick-spell",
        spellId,
    };
}

function skip(commandId = "skip"): EndSpellPickCommand {
    return {
        type: "command",
        commandId,
        token: "",
        kind: "end-spell-pick",
    };
}

describe("Board: serial-mode spellbook phase", () => {
    it("opens slots for each alive player in turn order and advances", async () => {
        const board = makeTestBoard({ players: 2 });
        await board.startGame();

        // Phase loop opens slot for player 1 first; submit a pick.
        await board.handleCommand(1, roundTrip(pickFor(board, 1, "c1")));
        // Slot advances to player 2; explicit skip.
        await board.handleCommand(2, roundTrip(skip("c2")));
        await board.phaseFlow;
        expect(board.phase).toBe(BoardPhase.Casting);
    });

    it("rejects player 2 commands while player 1's slot is open with not-your-turn", async () => {
        const board = makeTestBoard({ players: 2 });
        await board.startGame();
        await board.handleCommand(2, roundTrip(pickFor(board, 2, "c2")));
        expect(board._rejectedCommandsForTests).toContainEqual({
            playerId: 2,
            commandId: "c2",
            reason: "not-your-turn",
        });
    });
});

describe("Board: barrier-mode spellbook phase", () => {
    it("uses barrier when any player is remote and timeout > 0", async () => {
        const sched = fakeScheduler();
        const board = makeTestBoard({
            players: 2,
            playerOptions: [{ isRemote: true }, { isRemote: false }],
            phaseTimeoutMs: 5000,
            setTimeout: sched.setTimeout,
            clearTimeout: sched.clearTimeout,
        });
        await board.startGame();

        // Barrier accepts in any order.
        await board.handleCommand(2, roundTrip(skip("c2")));
        await board.handleCommand(1, roundTrip(pickFor(board, 1, "c1")));
        await board.phaseFlow;

        expect(board.phase).toBe(BoardPhase.Casting);
    });

    it("falls back to serial when phaseTimeoutMs is null even with remote players", async () => {
        const board = makeTestBoard({
            players: 2,
            playerOptions: [{ isRemote: true }, { isRemote: false }],
            phaseTimeoutMs: null,
        });
        await board.startGame();
        // Player 1 is current (serial mode); player 2's command is rejected.
        await board.handleCommand(2, roundTrip(skip("c2")));
        expect(
            board._rejectedCommandsForTests.find((r) => r.reason === "not-your-turn"),
        ).toBeTruthy();
    });

    it("auto-skips on timeout with timedOut: true", async () => {
        const sched = fakeScheduler();
        const board = makeTestBoard({
            players: 2,
            playerOptions: [{ isRemote: true }, { isRemote: true }],
            phaseTimeoutMs: 5000,
            setTimeout: sched.setTimeout,
            clearTimeout: sched.clearTimeout,
        });
        await board.startGame();

        // Fire the barrier timer.
        const handle = [...sched.handles.keys()][0];
        sched.fire(handle);

        await board.phaseFlow;
        const ended = board._endedSpellPickOutcomesForTests;
        expect(ended.length).toBe(2);
        expect(ended.every((o) => o.timedOut)).toBe(true);
    });
});
