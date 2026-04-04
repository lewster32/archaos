# Engine RangeGizmo Extraction

## Purpose

Extract the pure data/logic from the client `RangeGizmo` into an
engine-level class so the same pathfinding and range logic works
in a headless (server) environment. The client class inherits
from the engine class and adds Phaser-dependent visuals.

## Architecture

### Engine `RangeGizmo` (`packages/engine/src/rangegizmo.ts`)

A new class containing all range calculation, node traversal,
and A* pathfinding logic. No Phaser imports.

**State fields (moved from client):**

- `_piece: Piece | null` — the piece whose range is computed
- `_validNodes: Node[]` — computed valid/terminal/warning nodes
- `_paths: Map<string, Path>` — cached paths keyed by `"x,y"`

**Constructor:** takes an engine `Board` reference.

**Public methods (all pure logic):**

| Method | Signature | Notes |
|---|---|---|
| `generate` | `async (unit: Piece) => Promise<void>` | Computes valid nodes, paths, warning flags. Async to allow client override with visual work. |
| `reset` | `async () => Promise<RangeGizmo>` | Clears `_piece`, `_validNodes`, `_paths`. Async for same reason. |
| `getNode` | `(pt: Point) => Node \| null` | Look up a valid/terminal node at position. |
| `getPathTo` | `(pt: Point) => Path \| null` | Get or compute+cache shortest path. |
| `getAllValidPaths` | `(ignoreTerminal?: boolean) => Set<Path>` | All reachable paths. |
| `getAllTerminalPaths` | `() => Set<Path>` | Paths to terminal (attackable/mountable) nodes. |
| `findPath` | `(from: Point, to: Point) => Path` | A* pathfinding between two positions. |
| `findConnectedNodes` | `(node: Node) => Node[]` | 8-connected neighbours in valid nodes. |

**Protected methods:**

| Method | Signature | Notes |
|---|---|---|
| `checkNodeTraversal` | `(node: Node) => Node` | Determine if node is traversable/terminal based on pieces at position. |

### Client `RangeGizmo` (`src/gameobjects/rangegizmo.ts`)

Extends the engine `RangeGizmo`. Adds all Phaser-dependent code.

**Additional state:**

- `_rangeLayer`, `_pathLayer` (Phaser layers)
- `lastSimplePosition`, `lastDistance`, `lastCursor`,
  `lastLoS` (simple range cache)

**Overrides:**

- `generate()` — calls `await super.generate(unit)`, then
  renders visual range/paths
- `reset()` — animates layer fade-out, then
  `await super.reset()`

**Client-only methods (not in engine):**

- `generateVisualRange()`, `generateVisualPaths()`
- `generateSimpleRange()`, `showSimpleRange()`,
  `hideSimpleRange()`
- `showPath()`
- `showDebugGrid()` (static)

### Board Integration

**Engine Board:**

- Constructor creates `new RangeGizmo(this)` and assigns to
  `_rangeGizmo`
- `_rangeGizmo` type changes from `RangeGizmoLike | null` to
  `RangeGizmo`
- `RangeGizmoLike` interface is removed
- `rangeGizmo` getter returns `RangeGizmo` (non-nullable)

**Client Board:**

- Overrides `_rangeGizmo` to create client
  `RangeGizmo(this)` instead
- `rangeGizmo` getter override returns client `RangeGizmo`
  (unchanged pattern from today, just different base)

### Piece Upgrades

With the engine `RangeGizmo` available headlessly, three
methods on engine `Piece` can be upgraded from distance-only
fallbacks to movement-path-aware logic:

**`inMovementRange(point)`:**
Current engine version uses distance-only. Updated to:
1. Return false if point equals current position
2. If mounted, check distance <= 1.5
3. If flying, check fly distance <= movement stat
4. Otherwise, check `board.rangeGizmo.getPathTo(point)`

This matches the current client override, which can then be
removed.

**`inAttackRange(point)`:**
Current engine version uses distance-only. Updated to:
1. If not moved AND `inMovementRange(point)` AND (flying OR
   path exists), return true
2. If distance > 1.5, return false
3. Otherwise return true

This matches the current client override, which can then be
removed.

**`findThreatPieces()`:**
Current engine version uses simplified distance checks.
Updated to use `inAttackRange` (which now has path awareness),
matching the client's current logic. Client override removed.

## Testing

### Engine `RangeGizmo` Tests

New file `packages/engine/src/rangegizmo.test.ts`. Tests cover:

- `checkNodeTraversal` — empty tile, self-occupied tile,
  mountable piece, attackable piece, blocking piece
- `generate` — flying units (all valid nodes, no pathfinding),
  ground units (pathfinding, unreachable nodes filtered),
  warning node marking
- `findPath` — straight line, diagonal, obstacle routing,
  terminal nodes, unreachable returns null
- `findConnectedNodes` — adjacency, 8-neighbour, exclusion
- `getNode`, `getPathTo` — lookup, caching, null cases
- `getAllValidPaths`, `getAllTerminalPaths` — filtering
- `reset` — clears state

Mock board provides `getPointsInRange`,
`getPiecesAtPosition`, `getAdjacentPiecesAtPosition`,
`getAdjacentPoints` (all already on engine Board).

### Existing Tests

- Existing `src/gameobjects/rangegizmo.test.ts` tests for
  `Node`, `Path`, `buildPath`, `diagonalHeuristic`, `isOpen`,
  `isClosed` already test engine `pathfinding.ts` — these stay
  as-is
- Client-specific tests (constructor layers, reset tweens,
  showPath, hideSimpleRange, showDebugGrid) stay in the
  client test file
- Tests for `checkNodeTraversal`, A* integration,
  `findConnectedNodes`, `getPathTo` caching, and
  `getAllValidPaths`/`getAllTerminalPaths` move to the engine
  test file (since the logic moves to the engine class)

### Engine Piece Tests

Update existing engine `Piece` tests to cover the upgraded
`inMovementRange`, `inAttackRange`, and `findThreatPieces`
methods now that they use `board.rangeGizmo`.

## Scope

**In scope:**
- Engine `RangeGizmo` class with all pure logic
- Client `RangeGizmo` extends engine, adds visuals
- Engine Board creates engine RangeGizmo
- Remove `RangeGizmoLike` interface
- Upgrade engine Piece range/threat methods
- Remove client Piece range/threat overrides
- Engine tests for new class
- Update engine exports

**Out of scope:**
- Changing the `generateSimpleRange` / `showSimpleRange` /
  `hideSimpleRange` API (client-only, used for spell casting
  range display)
- Refactoring the A* algorithm itself
- Changing the `emitAsync` pattern
