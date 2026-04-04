# Engine Extraction Completion — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Complete Tasks 12-14 of the engine extraction plan, making `@archaos/engine` fully functional for headless server use.

## Context

The engine extraction plan (`docs/plans/2026-04-03-engine-extraction.md`) is partially complete. Tasks 1-11 moved enums, configs, interfaces, models, spells, Piece, Wizard, Player, Logger, PhaseMachine, pathfinding, and ComputerWizard into `packages/engine/`. Client classes extend engine classes and override for rendering.

Three tasks remain: Board/Rules extraction (Task 12), barrel export and client rewiring (Task 13), and verification (Task 14). These must be completed before the server package (`packages/server/`) can import `@archaos/engine` and run headless games.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Board split approach | Incremental bridge | Move game action methods to engine Board; client Board overrides to add rendering. Matches the pattern already used for Piece/Wizard/Player. |
| Rules | Move to engine | Rules is game logic. Replace the single Phaser import (`Geom`) with engine `Point`. Client re-exports from `@archaos/engine`. |
| ComputerWizard rendering calls | Emit events | Replace `cursor`, `sound`, `centreOn*` calls with board event emissions. Client subscribes; server ignores. |
| Client `packages/client/` restructure | Skip | Not needed for engine extraction. `src/` works with Vite as-is. Restructure can happen when the client package is created for multiplayer. |
| Timing coupling | Decoupled | Engine/server updates state and emits events instantly. Client plays through events at its own pace with client-side timings. Server never waits for client animations. |
| EffectType duplication | Single source in engine | Client `effectemitter.ts` re-exports from `@archaos/engine` instead of defining its own copy. |

## 1. Engine Board — Game Flow Methods

The engine `Board` (`packages/engine/src/board.ts`) currently holds state and geometry queries. It gains game action methods that the server and ComputerWizard call to drive gameplay.

### Methods to Add

| Method | Engine behaviour | Event emitted |
|--------|-----------------|---------------|
| `movePiece(pieceId, target)` | Update piece position | `pieceMoved { pieceId, from, to, path }` |
| `attackPiece(attackerId, targetId)` | Resolve combat (damage/defence rolls) | `pieceAttacked { attackerId, defenderId, hit }` + possibly `pieceDied` |
| `rangedAttackPiece(attackerId, targetId)` | Resolve ranged combat | `pieceAttacked { attackerId, defenderId, hit }` |
| `castSpell(playerId, spellId, target)` | Validate and apply spell | `spellCast { playerId, spellId, target, success }` + `pieceCreated`/etc. |
| `killPiece(pieceId)` | Mark dead, remove from board | `pieceDied { pieceId, killerId }` |
| `createPiece(config, position, owner)` | Instantiate Piece, add to board | `pieceCreated { piece }` |
| `defeatPlayer(playerId)` | Call `player.defeat()`, check game over | `playerDefeated { playerId }` |

### Event Emission

The engine Board gains an `events: EventEmitter` property using the engine's lightweight emitter. Events align with the multiplayer spec (`docs/specs/2026-04-03-network-multiplayer-design.md` Section 2):

```typescript
this.events.emit("pieceMoved", {
    pieceId, from: { x, y }, to: { x, y }, path
});
```

### Client Board Override Pattern

The client `Board` (extends engine Board) overrides each method: calls `super.method(...)` for state mutation + event emission, then runs animations/effects.

```typescript
async movePiece(pieceId: number, target: Point): Promise<void> {
    super.movePiece(pieceId, target);       // state + event
    const view = this.getPieceView(pieceId);
    await view.animateMove(target);         // rendering
}
```

## 2. Timing — Decoupled by Design

### Core Principle

The engine (and by extension the server) updates state and emits events without waiting for rendering. The client receives events and plays through them at its own pace using client-side timings. The server never blocks on client animations.

This means:

- **Engine game action methods are synchronous.** `movePiece`, `attackPiece`, `castSpell` etc. mutate state and emit events, then return immediately. No `await` for animation delays.
- **Client overrides are async.** The client Board overrides call `super.method()` (instant), then `await` their own animations. The client controls pacing.
- **The server sends events as fast as the engine produces them.** The client queues and replays them in order at a comfortable rate for human viewers.
- **No animation timing constants in the engine.** Delays like `Board.DEFAULT_DELAY` that exist purely for visual pacing are client concerns. The engine Board may retain a `delay()` utility but it resolves instantly (or is removed). Actual delay values live in the client.

### Implication for Multiplayer

The server runs the engine at full speed. When a player submits an action, the server validates it, the engine applies it, and the server broadcasts the resulting events immediately. Clients buffer and animate at their own speed. A fast connection doesn't mean faster animations; a slow animation doesn't block the server from processing the next action.

### Disconnection Timeout

The 30-second reconnection grace period (from the multiplayer spec) is handled entirely server-side. The server tracks the timer internally and makes the policy decision (AI takeover or deferred defeat) when it expires. Clients receive a simple `playerDisconnected { playerId }` event and can display whatever UI they choose — but do not receive a running countdown from the server.

## 3. Rules — Move to Engine

`src/gameobjects/services/rules.ts` moves to `packages/engine/src/rules.ts`.

### Import Replacements

| Current import | Replaced with |
|----------------|---------------|
| `Geom` from `"phaser"` | `Point` from `"./point"` |
| `Board` from `"../board"` | `Board` from `"./board"` |
| `Piece` from `"../piece"` | `Piece` from `"./piece"` |
| `Player` from `"../player"` | `Player` from `"./player"` |
| `EffectType` from `"../effectemitter"` | `EffectType` from `"./enums/effecttype"` |
| `ComputerWizard` from relative path | `ComputerWizard` from `"./ai/computerwizard"` |

### Rendering Calls in Rules

Any direct rendering calls in Rules (e.g. `board.playEffect()`, `board.sound.play()`) are replaced with event emissions via `board.events.emit(...)`. The engine Board's game action methods handle the core events; Rules emits supplementary effect events where needed:

```typescript
board.events.emit("effectRequested", {
    type: EffectType.X, position
});
```

### Singleton Pattern

`getInstance()` pattern stays. The server will have its own Rules singleton per game context.

### Client Shim

`src/gameobjects/services/rules.ts` becomes a re-export:

```typescript
export { Rules } from "@archaos/engine";
```

Same pattern already used for Logger.

## 4. ComputerWizard — Event-Based Rendering

ComputerWizard stays at `packages/engine/src/ai/computerwizard.ts`. Game action calls resolve naturally once those methods exist on the engine Board. Rendering calls become event emissions.

### Game Action Calls (Self-Resolving)

- `this._board.movePiece()` — exists on engine Board after Section 1
- `this._board.attackPiece()` — exists on engine Board after Section 1
- `this._board.rangedAttackPiece()` — exists on engine Board after Section 1

### Rendering Calls Replaced with Events

| Current call | Replaced with |
|---|---|
| `this._board.cursor.enabled = false` | `this._board.events.emit("aiThinking")` |
| `this._board.cursor.enabled = true` | `this._board.events.emit("aiActing")` |
| `this._board.sound.play("cancel")` | `this._board.events.emit("aiSkipped", { reason })` |
| `this._board.sound.play("bowselecta")` | Removed — `rangedAttackPiece` event handles this |
| `this._board.centreOnPieces([piece])` | `this._board.events.emit("focusPieces", { pieceIds })` |
| `this._board.centreOnPosition(pt)` | `this._board.events.emit("focusPosition", { x, y })` |

### Type Safety Restored

`_board` changes from `any` to `Board` (engine type). ComputerWizard becomes barrel-exportable.

### Client Subscriptions

The client Board subscribes to AI events in its constructor:

```typescript
this.events.on("aiThinking", () => {
    this.cursor.enabled = false;
});
this.events.on("focusPieces", ({ pieceIds }) => {
    this.centreOnPieces(pieceIds.map(id => this.getPiece(id)));
});
// etc.
```

The server ignores these events.

## 5. Barrel Export and Client Rewiring

### Barrel Export Additions

Add to `packages/engine/src/index.ts`:

- `Rules` class
- `ComputerWizard` class
- Remove the "not barrel-exported" comment for AI section

### Client Import Rewiring

Bulk find-and-replace across `src/`:

| Pattern | Replacement |
|---------|-------------|
| `from "../../../packages/engine/src/..."` | `from "@archaos/engine"` |
| Remaining `from "./enums/..."` / `from "../enums/..."` pointing to old locations | `from "@archaos/engine"` |

Client-only imports (`Cursor`, `RangeGizmo`, `EffectEmitter`, `SoundEffects`, `WizardSprite`) stay as local imports.

### EffectType Deduplication

`src/gameobjects/effectemitter.ts` currently defines its own `EffectType` enum (duplicate of the engine version). Replace with a re-export:

```typescript
export { EffectType } from "@archaos/engine";
```

All consumer imports remain unchanged.

## 6. Verification and Cleanup

### Zero Phaser in Engine

- `grep` for `from "phaser"` across `packages/engine/src/` — expect no matches
- `grep` for `document.`, `window.`, `HTMLElement`, `Canvas` in engine source (excluding tests) — expect no matches

### Tests

- `npx vitest run` — all engine and client unit tests pass
- `npx vitest run --project=components` — component tests pass

### Runtime

- `npm start` — dev server loads, local play works (all spell types, AI, combat, movement)
- `npm run build` — Vite production build succeeds

### Cleanup

- Remove empty directories from prior file moves
- Remove stale comments ("not barrel-exported" in index.ts)
- Remove `_board: any` in ComputerWizard (now `Board`)
- Remove duplicate `EffectType` in effectemitter.ts
- Remove any unused imports left from rewiring
