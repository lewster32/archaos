import type { Board } from "./board";
import type { Piece } from "./piece";
import { Point } from "./point";

/**
 * Per-step movement primitives shared by RangeGizmo (UI prediction)
 * and Board.validatePath (server authority). Pure functions, no
 * state, no class. By sharing the primitives, the two consumers
 * agree by construction (invariant 13).
 */

/**
 * The +0.5 terminal-step bump applied to movement budgets so a piece
 * can attack into a tile it could just barely move to.
 */
export const TERMINAL_STEP_BUMP: number = 0.5;

/**
 * Cost of an orthogonal (cardinal) step.
 */
export const ORTHOGONAL_STEP_COST: number = 1;

/**
 * Cost of a diagonal step.
 */
export const DIAGONAL_STEP_COST: number = 1.5;

/**
 * The movement cost of a single step. Diagonal moves cost
 * DIAGONAL_STEP_COST; orthogonal moves cost ORTHOGONAL_STEP_COST.
 * Use `flyingPathCost` for flying pieces; this function is for
 * ground-step cost accumulation.
 *
 * @param from The origin tile of the step.
 * @param to The destination tile of the step.
 * @returns The per-step cost.
 */
export function stepCost(from: Point, to: Point): number {
    const dx: number = Math.abs(to.x - from.x);
    const dy: number = Math.abs(to.y - from.y);
    return dx === 1 && dy === 1 ? DIAGONAL_STEP_COST : ORTHOGONAL_STEP_COST;
}

/**
 * The total cost of a path for a flying piece - simply the
 * fly-distance from origin to the path's terminal step. Intermediate
 * steps do not contribute (flying pieces fly point-to-point).
 *
 * Returns 0 for an empty path.
 *
 * @param origin The starting tile of the flight.
 * @param path The ordered list of waypoints; only the last one
 *             determines the cost.
 * @returns The total flight cost from origin to the terminal step.
 */
export function flyingPathCost(origin: Point, path: ReadonlyArray<Point>): number {
    if (path.length === 0) {
        return 0;
    }
    const terminal: Point = path[path.length - 1];
    const dx: number = Math.abs(terminal.x - origin.x);
    const dy: number = Math.abs(terminal.y - origin.y);
    const max: number = Math.max(dx, dy);
    const min: number = Math.min(dx, dy);
    return max - min + min * DIAGONAL_STEP_COST;
}

/**
 * The movement budget for a piece taking a path. Wraps
 * `piece.stats.movement` with the +0.5 terminal-step bump that
 * current code applies (a piece can attack into a tile it could just
 * barely move to).
 *
 * @param piece The piece whose budget we are computing.
 * @returns The movement budget including the terminal-step bump.
 */
export function movementBudget(piece: Piece): number {
    return piece.stats.movement + TERMINAL_STEP_BUMP;
}

/**
 * Whether `piece` may move from `from` to `to` in a single step.
 * `allowTerminalException` relaxes the blocking-piece check so the
 * tile may be occupied by a mountable (the moving piece can mount)
 * or attackable (the moving piece can attack) target.
 *
 * The `from` parameter is part of the contract for symmetry with
 * future per-step validators (e.g. Board.validatePath) that may
 * use it to enforce 8-connectedness or other from-relative rules.
 * Today this function only inspects `to`; bounds and adjacency
 * are the caller's responsibility.
 *
 * @param piece The moving piece.
 * @param _from The origin tile - reserved for future per-step
 *        validators; see notes above.
 * @param to The destination tile of the step.
 * @param board The board to query for blockers.
 * @param allowTerminalException Whether to permit the destination
 *        to be occupied by a mountable or attackable target.
 * @returns True if `piece` may step from `from` to `to`.
 */
export function isStepTraversable(
    piece: Piece,
    _from: Point,
    to: Point,
    board: Board,
    allowTerminalException: boolean,
): boolean {
    if (to.x < 0 || to.y < 0 || to.x >= board.width || to.y >= board.height) {
        return false;
    }
    const livePieces = board.getPiecesAtPosition(new Point(to.x, to.y), (p: Piece) => !p.dead);
    if (livePieces.length === 0) {
        return true;
    }
    // The rider of the moving piece occupies the same tile but
    // moves with it - treat it as part of the moving piece for
    // traversal purposes.
    const rider = piece.currentRider;
    const others = livePieces.filter((p: Piece) => p !== piece && p !== rider);
    if (others.length === 0) {
        return true;
    }
    if (!allowTerminalException) {
        return false;
    }
    for (const other of others) {
        if (piece.canMountPiece(other) || piece.canAttackPiece(other)) {
            return true;
        }
    }
    return false;
}

/**
 * Enemies adjacent to `tile` that could engage `piece` if `piece`
 * stood at `tile`. Used by RangeGizmo for warning-tile annotation
 * and by handlers for engagement-roll-between-steps. Excludes the
 * moving piece itself and dead pieces.
 *
 * @param piece The moving piece.
 * @param tile The tile under consideration.
 * @param board The board to query for adjacent pieces.
 * @returns The list of enemies that can engage `piece` at `tile`.
 */
export function engageableEnemiesAt(piece: Piece, tile: Point, board: Board): Piece[] {
    return board.getAdjacentPiecesAtPosition(tile, (candidate: Piece) => {
        if (candidate === piece || candidate.dead) {
            return false;
        }
        return candidate.canEngagePiece(piece);
    });
}
