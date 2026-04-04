# Engine Type Compatibility & Missing Methods

## Goal

Eliminate all TypeScript build errors in the client gameobjects
caused by the engine extraction. After this work, `npm run build`
should produce zero errors from `src/gameobjects/` and
`packages/engine/src/` (excluding the 5 pre-existing
`@steelbreeze/types` declaration errors in `node_modules/`).

## Architecture

Two-phase approach:

1. **Phase 1 — Type compatibility:** Change `private` fields to
   `protected` in engine classes so client subclasses are
   structurally compatible. Fix covariant return types where
   client overrides narrow the return type.

2. **Phase 2 — Missing methods:** Add pure-state engine methods
   for game logic that Rules and spells depend on. Convert
   rendering-only calls in spell `doCast()` methods to event
   emissions.

## Phase 1: Type Compatibility

### Private to Protected

Engine classes need fields changed from `private` to `protected`
so that client subclasses don't introduce structural
incompatibility (TypeScript treats classes with different private
fields as structurally distinct types).

**Engine Player** (`packages/engine/src/player.ts`):
- `_name`, `_wizcode`, `_spells`, `_colour`
- `_castingPiece`, `_selectedSpell`
- `_forceHit`, `_forceCast`

**Engine Wizard** (`packages/engine/src/wizard.ts`):
- `_wizCode`

**Engine Board** (`packages/engine/src/board.ts`):
- `_width`, `_height` — change to `protected` if the client
  accesses them, otherwise leave as `private`

**Engine Piece** — already all `protected`. No changes.

### Covariant Return Types

Client Board overrides methods returning `Piece`, `Piece[]`,
`Player`, etc. with narrowed client types. Once private fields
are removed (Phase 1), the structural incompatibility should
resolve. Any remaining mismatches use explicit casts in the
client override (the existing `as Piece` pattern).

## Phase 2: Missing Methods

### 2a. Pure State Logic — Move to Engine

These methods are called by `rules.ts` or spell code but only
exist on the client. They contain game logic and belong on the
engine class. Each gets a synchronous or async engine
implementation with pure state logic (no Phaser). The client
overrides with its animated version.

**Async/sync constraint:** If the client override is `async`,
the engine method MUST also be `async`. TypeScript does not
allow overriding a synchronous method with an async one.

| Method | Engine class | Async? | What it does |
|--------|-------------|--------|-------------|
| `nextPlayer()` | Board | Yes | Advance to next player in turn order |
| `newTurn()` | Board | Yes | Start new game turn (spread, expire, reset) |
| `spread()` | Piece | Yes | Execute spread action for spreading pieces |
| `inAttackRange(point)` | Piece | No | Check if point is within melee range |
| `inMovementRange(point)` | Piece | No | Check if point is within movement range |
| `moveTo(point)` | Piece | Yes | Move piece to position |
| `raiseDead(owner)` | Piece | Yes | Raise dead piece as undead |

For each method:
1. Read the client implementation to understand the full
   behaviour (state changes, side effects, events).
2. Extract the pure state logic into the engine method.
3. The client overrides to add animation, sound, visual effects.

### 2b. Rendering Calls — Convert to Events

Spell `doCast()` methods currently call client-only APIs
directly. Convert these to event emissions. The client Board
already subscribes to these events (wired in the previous
extraction phase).

| Current call | Replacement |
|-------------|-------------|
| `board.sound.play(name)` | `board.events.emit("effectRequested", { sound: name })` |
| `board.playEffect(type, pos, end, piece)` | `board.events.emit("effectRequested", { type, pieceId, startPos, endPos })` |
| `piece.sprite.getCenter()` | Pass `piece.id` in event; client resolves position |
| `board.getIsoPosition(point)` | Pass logical position in event; client resolves |
| `board.rangeGizmo.showSimpleRange(...)` | `board.events.emit("showCastRange", { ... })` |
| `board.rangeGizmo.reset()` | `board.events.emit("resetCastRange")` |

The client Board must add a handler for `resetCastRange`:
```typescript
this.events.on("resetCastRange", () => {
    this.rangeGizmo.reset();
});
```

Affected files:
- `packages/engine/src/spells/attackspell.ts`
- `packages/engine/src/spells/disbelievespell.ts`
- `packages/engine/src/spells/raisedeadspell.ts`
- `packages/engine/src/spells/statuseffectspell.ts`
- `packages/engine/src/spells/subversionspell.ts`
- `packages/engine/src/spells/summonspell.ts`
- `packages/engine/src/spells/turmoilspell.ts`
- `packages/engine/src/spells/spell.ts` (base class `doCast`)
- `packages/engine/src/rules.ts`

### 2c. RangeGizmoLike Interface

Expand the `RangeGizmoLike` interface on engine Board to include
methods that spells reference:

Since all spell `rangeGizmo` calls are converted to events in
Section 2b (`showCastRange` and `resetCastRange`), the
`RangeGizmoLike` interface does NOT need `showSimpleRange` or
`reset`. It keeps only the pathfinding methods used by
ComputerWizard's `moveUnit`:

```typescript
export interface RangeGizmoLike {
    getAllValidPaths(ignoreTerminal?: boolean): Set<Path>;
    getPathTo(point: { x: number; y: number }): Path | null;
}
```

The client Board's `rangeGizmo` (full `RangeGizmo`) satisfies
this interface and also handles the events.

## Success Criteria

- `npm run build` produces zero errors from `src/` and
  `packages/engine/src/` (only `node_modules/` errors remain)
- All existing tests pass (1213+ across engine and client)
- No new Phaser imports in engine package
- Engine can be imported and instantiated without Phaser

## Out of Scope

- `@steelbreeze/types` declaration errors (pre-existing,
  `node_modules/`)
- RangeGizmo pathfinding extraction to engine (separate project)
- New test coverage for moved methods (existing tests suffice)
- Tutorial files (`tutorial-movement.ts` casts — fix with the
  same pattern as other client files)
