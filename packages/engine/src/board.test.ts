import { describe, it, expect, vi, afterEach } from "vitest";
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

function makePieceConfig(
    x: number,
    y: number,
    owner: Player,
    status: UnitStatus[] = [],
): PieceConfig {
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
            board.boardEvents.on(
                BoardEvent.PieceDestroyed,
                (p: any) => destroyed.push(p),
            );
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
            const piece = await board.addPiece(
                makePieceConfig(3, 4, player),
            );
            expect(
                board.getPiecesAtPosition(new Point(3, 4)),
            ).toContain(piece);
        });

        it("returns an empty array for an unoccupied cell", () => {
            const board = makeBoard();
            expect(
                board.getPiecesAtPosition(new Point(5, 5)),
            ).toHaveLength(0);
        });

        it("respects a filter predicate", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(0, 0, player));
            const result = board.getPiecesAtPosition(
                new Point(0, 0),
                () => false,
            );
            expect(result).toHaveLength(0);
        });
    });

    describe("getAdjacentPoints", () => {
        it("returns 3 neighbours for a corner cell", () => {
            const board = makeBoard();
            expect(
                board.getAdjacentPoints(new Point(0, 0)),
            ).toHaveLength(3);
        });

        it("returns 5 neighbours for an edge cell", () => {
            const board = makeBoard();
            expect(
                board.getAdjacentPoints(new Point(6, 0)),
            ).toHaveLength(5);
        });

        it("returns 8 neighbours for a centre cell", () => {
            const board = makeBoard();
            expect(
                board.getAdjacentPoints(new Point(6, 6)),
            ).toHaveLength(8);
        });

        it("returns 8 points even when includeCentre is true (centre excluded by outer guard)", () => {
            const board = makeBoard();
            // The outer loop condition `(x !== point.x || y !== point.y)` always
            // excludes the origin, so includeCentre=true still yields 8 points.
            const pts = board.getAdjacentPoints(new Point(6, 6), true);
            expect(pts).toHaveLength(8);
        });
    });

    describe("getPointsInRange", () => {
        it("returns empty for range 0 without includeCentre", () => {
            const board = makeBoard();
            expect(
                board.getPointsInRange(new Point(6, 6), 0),
            ).toHaveLength(0);
        });

        it("includes the origin when includeCentre is true at range 0", () => {
            const board = makeBoard();
            expect(
                board.getPointsInRange(new Point(6, 6), 0, true),
            ).toHaveLength(1);
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
            expect(
                board.getPointsInRange(
                    new Point(6, 6),
                    1,
                    false,
                    RangeType.Foot,
                ),
            ).toHaveLength(8);
        });

        it("Fly range excludes double-diagonal cells at range 2", () => {
            const board = makeBoard();
            const pts = board.getPointsInRange(
                new Point(6, 6),
                2,
                false,
                RangeType.Fly,
            );
            const hasDoubleDiag = pts.some(
                (p) =>
                    Math.abs(p.x - 6) === 2 && Math.abs(p.y - 6) === 2,
            );
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
            const piece = await board.addPiece(
                makePieceConfig(3, 3, player),
            );
            (piece as any)._dead = true;
            expect(board.isBlocker(new Point(3, 3))).toBe(false);
        });

        it("returns false for a transparent piece", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(
                makePieceConfig(3, 3, player, [UnitStatus.Transparent]),
            );
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
            expect(
                makeBoard().hasLineOfSight(
                    new Point(0, 0),
                    new Point(6, 6),
                ),
            ).toBe(true);
        });

        it("returns true for adjacent cells", () => {
            expect(
                makeBoard().hasLineOfSight(
                    new Point(5, 5),
                    new Point(6, 5),
                ),
            ).toBe(true);
        });

        it("returns false when a blocker is on the horizontal path", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(3, 0, player));
            expect(
                board.hasLineOfSight(new Point(0, 0), new Point(6, 0)),
            ).toBe(false);
        });

        it("returns false when a blocker is on the vertical path", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(0, 3, player));
            expect(
                board.hasLineOfSight(new Point(0, 0), new Point(0, 6)),
            ).toBe(false);
        });

        it("returns false when a blocker is on the diagonal path", async () => {
            const board = makeBoard();
            const player = board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            await board.addPiece(makePieceConfig(3, 3, player));
            expect(
                board.hasLineOfSight(new Point(0, 0), new Point(6, 6)),
            ).toBe(false);
        });
    });

    describe("Board.distance (static)", () => {
        it("returns 0 for the same point", () => {
            expect(
                Board.distance(new Point(3, 3), new Point(3, 3)),
            ).toBe(0);
        });

        it("returns 1 for a cardinal step in both range types", () => {
            expect(
                Board.distance(
                    new Point(0, 0),
                    new Point(1, 0),
                    RangeType.Foot,
                ),
            ).toBe(1);
            expect(
                Board.distance(
                    new Point(0, 0),
                    new Point(1, 0),
                    RangeType.Fly,
                ),
            ).toBe(1);
        });

        it("Foot: pure diagonal (1,1) = 1", () => {
            expect(
                Board.distance(
                    new Point(0, 0),
                    new Point(1, 1),
                    RangeType.Foot,
                ),
            ).toBe(1);
        });

        it("Fly: pure diagonal (1,1) = 1.5", () => {
            expect(
                Board.distance(
                    new Point(0, 0),
                    new Point(1, 1),
                    RangeType.Fly,
                ),
            ).toBe(1.5);
        });

        it("Foot: mixed (2,1) = 2", () => {
            expect(
                Board.distance(
                    new Point(0, 0),
                    new Point(2, 1),
                    RangeType.Foot,
                ),
            ).toBe(2);
        });

        it("Fly: mixed (2,1) = 2.5", () => {
            expect(
                Board.distance(
                    new Point(0, 0),
                    new Point(2, 1),
                    RangeType.Fly,
                ),
            ).toBe(2.5);
        });
    });

    describe("Board.toIsometric / Board.fromIsometric (static)", () => {
        it("toIsometric produces expected screen-space coordinates", () => {
            // toIsometric({x, y}) = {x - y, (x + y) / 2}
            const p = new Point(4, 2);
            const iso = Board.toIsometric(p);
            expect(iso.x).toBeCloseTo(2);  // 4 - 2
            expect(iso.y).toBeCloseTo(3);  // (4 + 2) / 2
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
            board.boardEvents.on(BoardEvent.GameOver, () =>
                emitted.push("GameOver"),
            );
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
            expect(logger.log).toHaveBeenCalledWith(
                expect.stringContaining("Dave"),
                expect.anything(),
            );
        });
    });

    describe("endGame", () => {
        it("sets state to GameOver and emits BoardEvent.GameOver", () => {
            const board = makeBoard();
            const emitted: string[] = [];
            board.boardEvents.on(BoardEvent.GameOver, () =>
                emitted.push("GameOver"),
            );
            board.endGame();
            expect(board.state).toBe(BoardState.GameOver);
            expect(emitted).toContain("GameOver");
        });

        it("logs the provided message", () => {
            const logger = { log: vi.fn() } as unknown as Logger;
            const board = makeBoard({ logger });
            board.endGame("Round over");
            expect(logger.log).toHaveBeenCalledWith(
                "Round over",
                expect.anything(),
            );
        });

        it("is a no-op when already GameOver", () => {
            const board = makeBoard();
            board.endGame();
            const emitted: string[] = [];
            board.boardEvents.on(BoardEvent.GameOver, () =>
                emitted.push("again"),
            );
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
            board.boardEvents.on(BoardEvent.PieceSelected, (p: any) =>
                selected.push(p),
            );
            await board.selectPiece(piece.id);
            expect(board.selected).toBe(piece);
            expect(selected).toContain(piece);
        });

        it("selectPiece throws for an unknown id", async () => {
            await expect(makeBoard().selectPiece(999)).rejects.toThrow();
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
            const wizard = await board.addPiece(
                makePieceConfig(0, 0, player, [UnitStatus.Wizard]),
            );
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
            await board.movePiece(piece.id, new Point(5, 3));
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
            board.boardEvents.on(BoardEvent.PieceMoved, (p: any) =>
                moved.push(p),
            );
            await board.movePiece(piece.id, new Point(2, 2));
            expect(moved).toContain(piece);
        });

        it("throws for an unknown piece id", async () => {
            await expect(
                makeBoard().movePiece(999, new Point(0, 0)),
            ).rejects.toThrow();
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
            board.boardEvents.on(BoardEvent.NewTurn, () =>
                events.push("NewTurn"),
            );
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

        it("applies a non-zero balanceShift, logs it, then resets it to 0", async () => {
            const logger = { log: vi.fn() } as unknown as Logger;
            const board = makeBoard({ logger });
            board.addPlayer({
                name: "P1",
                type: GameSetupPlayerType.Local,
            });
            board.balanceShift = 0.1;
            await board.newTurn();
            expect(board.balance).toBeCloseTo(0.1);
            expect(board.balanceShift).toBe(0);
            expect(logger.log).toHaveBeenCalledWith(
                expect.stringContaining("law"),
                expect.anything(),
            );
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
            board.boardEvents.on(BoardEvent.NewTurn, () =>
                newTurnEvents.push("NewTurn"),
            );
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
            const p2 = board.addPlayer(
                { name: "P2", type: GameSetupPlayerType.Computer },
                remote as any,
            );
            p2.addSpell(makeMockSpell());

            // nextPlayer from index -1: increments to 0 → calls newTurn()
            // (p2 has spells so phase→Spellbook). p1 has no spells/remote →
            // skipped. p2 has remote → selectSpell() called → loop continues
            // until the local-player break is hit or phase changes.
            await board.nextPlayer();
            expect(selectSpell).toHaveBeenCalled();
        });
    });
}); // closes describe("Board")
