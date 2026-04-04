# Engine Extraction Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the engine extraction (Tasks 12-14 from the original plan) so `@archaos/engine` can run full headless games for the network multiplayer server.

**Architecture:** Move game flow methods (`newTurn`, `nextPlayer`, `movePiece`, `attackPiece`, etc.) into the engine Board as synchronous state mutations + event emissions. Move Rules to engine with Phaser imports replaced. Fix ComputerWizard to emit events instead of calling rendering methods. Client Board overrides engine methods to add animations. All timing/animation is client-only — engine never awaits rendering.

**Tech Stack:** TypeScript 5, Vitest, @archaos/engine (npm workspace)

**Spec:** `docs/specs/2026-04-04-engine-extraction-completion.md`

---

## File Structure

After this plan, the following files change:

```
packages/engine/src/
├── board.ts              ← MODIFY: add game flow methods + events property
├── ai/computerwizard.ts  ← MODIFY: replace rendering calls with events, type _board as Board
├── index.ts              ← MODIFY: add Rules, ComputerWizard exports
src/gameobjects/
├── board.ts              ← MODIFY: override new engine methods for rendering
├── services/
│   ├── rules.ts          ← REPLACE: re-export shim from @archaos/engine
│   └── rules.test.ts     ← MODIFY: import Rules from @archaos/engine
├── effectemitter.ts      ← MODIFY: re-export EffectType from @archaos/engine
packages/engine/src/
├── rules.ts              ← CREATE: moved from src/gameobjects/services/rules.ts
├── rules.test.ts         ← CREATE: moved from src/gameobjects/services/rules.test.ts
```

---

### Task 1: Move Game Flow Methods to Engine Board

The engine Board currently has state, geometry, and dice rolls. It needs the game action methods that both the server and ComputerWizard call. These methods mutate state and emit events — no animation, no delays.

**Files:**
- Modify: `packages/engine/src/board.ts`

- [ ] **Step 1: Add the events getter**

The engine Board already has `_boardEvents: EventEmitter` (protected) and a `boardEvents` getter. Add an `events` alias so ComputerWizard and external consumers can use `board.events.emit(...)`:

In `packages/engine/src/board.ts`, add after the `boardEvents` getter:

```typescript
/**
 * Alias for boardEvents — used by AI and
 * external consumers for event emission.
 */
get events(): EventEmitter {
    return this._boardEvents;
}
```

- [ ] **Step 2: Add `selectPiece` to engine Board**

The engine needs a minimal `selectPiece` that updates state without rendering. Add after the `removePiece` method:

```typescript
/**
 * Select a piece by ID. Client overrides to add
 * sound, engagement checks, and range gizmo.
 */
selectPiece(id: number): void {
    if (!id || this._state === BoardState.GameOver) {
        return;
    }
    this._selected = this.getPiece(id);
    if (!this._selected) {
        throw new Error(
            `No piece with ID ${id} found to select`,
        );
    }
    this._boardEvents.emit(
        BoardEvent.PieceSelected,
        this._selected,
    );
}
```

- [ ] **Step 3: Add `addPiece` to engine Board**

Add after `selectPiece`:

```typescript
/**
 * Add a piece to the board from a config. Client
 * overrides to create the Phaser-coupled Piece.
 */
addPiece(config: PieceConfig): Piece {
    const piece: Piece = new Piece(
        this,
        this._idCounter++,
        config,
    );
    this._pieces.set(piece.id, piece);
    this.emitBoardUpdateEvent();
    return piece;
}
```

Add `PieceConfig` to the imports at the top of the file:

```typescript
import type { PieceConfig } from "./configs/piececonfig";
```

- [ ] **Step 4: Add `addWizard` to engine Board**

Add the Wizard import at the top:

```typescript
import { Wizard } from "./wizard";
```

And add `WizardConfig` to the config import:

```typescript
import type {
    PieceConfig,
    WizardConfig,
} from "./configs/piececonfig";
```

Add after `addPiece`:

```typescript
/**
 * Add a wizard to the board. Client overrides to
 * create the Phaser-coupled Wizard.
 */
addWizard(config: WizardConfig): Wizard {
    const wizard: Wizard = new Wizard(
        this,
        this._idCounter++,
        config,
    );
    this._pieces.set(wizard.id, wizard);
    this.emitBoardUpdateEvent();
    return wizard;
}
```

- [ ] **Step 5: Add `createWizards` to engine Board**

Add after `addWizard`:

```typescript
/**
 * Create and place wizards for all players at the
 * start of the game.
 */
createWizards(): void {
    if (
        this.state === BoardState.GameOver ||
        this.state !== BoardState.Idle ||
        this.phase !== BoardPhase.Idle ||
        this.pieces.some((piece: Piece) =>
            piece.hasStatus(UnitStatus.Wizard),
        )
    ) {
        throw new Error(
            "Cannot create wizards - game not " +
                "in initialising state",
        );
    }
    Wizard.createAll(this, this.players);
}
```

- [ ] **Step 6: Add `addSpell` implementation to engine Board**

Replace the current `addSpell` that throws with a real implementation. Add the `createSpell` import at the top:

```typescript
import { createSpell } from "./spells/spellfactory";
```

Replace the existing `addSpell` method:

```typescript
/**
 * Add a spell to a player's spellbook.
 */
addSpell(player: Player, config: SpellConfig): Spell {
    if (!config || !player) {
        throw new Error(
            "No player or config provided",
        );
    }
    const spell = createSpell(
        this,
        this._idCounter++,
        config,
    );
    player.addSpell(spell);
    return spell;
}
```

- [ ] **Step 7: Add `movePiece` to engine Board**

Add in the `/* ── Game flow ── */` section:

```typescript
/**
 * Move a piece to a target position. Updates state
 * and emits pieceMoved. Client overrides to add
 * pathfinding, animation, and range gizmo.
 */
movePiece(id: number, position: Point): Piece {
    const piece: Piece | null = this.getPiece(id);
    if (!piece) {
        throw new Error(
            `Could not find piece with ID ${id}`,
        );
    }
    const from = Point.clone(piece.position);
    piece.position.setTo(position.x, position.y);
    piece.moved = true;
    this._boardEvents.emit(
        BoardEvent.PieceMoved,
        piece,
    );
    this.emitBoardUpdateEvent();
    return piece;
}
```

- [ ] **Step 8: Add `attackPiece` to engine Board**

Add after `movePiece`:

```typescript
/**
 * Perform a melee attack. Resolves combat and emits
 * events. Client overrides to add animation.
 */
attackPiece(
    attackingPieceId: number,
    defendingPieceId: number,
): Piece | null {
    const attackingPiece = this.getPiece(
        attackingPieceId,
    );
    const defendingPiece = this.getPiece(
        defendingPieceId,
    );
    if (!attackingPiece) {
        throw new Error(
            `Could not find piece with ` +
                `ID ${attackingPieceId}`,
        );
    }
    if (!defendingPiece) {
        throw new Error(
            `Could not find piece with ` +
                `ID ${defendingPieceId}`,
        );
    }
    this._busy = true;
    const attackResult: boolean =
        attackingPiece.attack(defendingPiece);
    this._boardEvents.emit(
        BoardEvent.PieceAttacked,
        attackingPiece,
        defendingPiece,
        attackResult,
    );
    this._busy = false;
    return attackingPiece;
}
```

Note: `Piece.attack()` in the engine is synchronous (returns `boolean`). The client Piece's `attack()` is async (plays animation). The client Board overrides `attackPiece` to call its async version.

- [ ] **Step 9: Add `rangedAttackPiece` to engine Board**

Add after `attackPiece`:

```typescript
/**
 * Perform a ranged attack. Resolves combat and emits
 * events. Client overrides to add animation.
 */
rangedAttackPiece(
    attackingPieceId: number,
    defendingPieceId: number,
): Piece | null {
    const attackingPiece = this.getPiece(
        attackingPieceId,
    );
    const defendingPiece = this.getPiece(
        defendingPieceId,
    );
    if (!attackingPiece) {
        throw new Error(
            `Could not find piece with ` +
                `ID ${attackingPieceId}`,
        );
    }
    if (!defendingPiece) {
        throw new Error(
            `Could not find piece with ` +
                `ID ${defendingPieceId}`,
        );
    }
    this._busy = true;
    const attackResult: boolean =
        attackingPiece.rangedAttack(defendingPiece);
    this._boardEvents.emit(
        BoardEvent.PieceRangedAttacked,
        attackingPiece,
        defendingPiece,
        attackResult,
    );
    this._busy = false;
    return attackingPiece;
}
```

- [ ] **Step 10: Add `mountPiece` and `dismountPiece` to engine Board**

Add after `rangedAttackPiece`:

```typescript
/**
 * Mount one piece onto another. Client overrides
 * to add sound and animation.
 */
mountPiece(
    mountingPieceId: number,
    mountedPieceId: number,
): Piece | null {
    const mountingPiece = this.getPiece(
        mountingPieceId,
    );
    const mountedPiece = this.getPiece(
        mountedPieceId,
    );
    if (!mountingPiece) {
        throw new Error(
            `Could not find piece with ` +
                `ID ${mountingPieceId}`,
        );
    }
    if (!mountedPiece) {
        throw new Error(
            `Could not find piece with ` +
                `ID ${mountedPieceId}`,
        );
    }
    if (mountingPiece.currentMount) {
        mountingPiece.dismount();
        mountingPiece.moved = false;
    }
    mountingPiece.mount(mountedPiece);
    this.emitBoardUpdateEvent();
    return mountingPiece;
}

/**
 * Dismount a piece from its current mount. Client
 * overrides to add sound and animation.
 */
dismountPiece(
    dismountingPieceId: number,
): Piece | null {
    const dismountingPiece = this.getPiece(
        dismountingPieceId,
    );
    if (!dismountingPiece) {
        console.error(
            `Could not find piece with ` +
                `ID ${dismountingPieceId}`,
        );
        return null;
    }
    dismountingPiece.dismount();
    this.emitBoardUpdateEvent();
    return dismountingPiece;
}
```

- [ ] **Step 11: Add `selectWizard` to engine Board**

Add after `dismountPiece`:

```typescript
/**
 * Select the wizard owned by the given player.
 */
selectWizard(player: Player): Piece | null {
    if (
        !player ||
        this.state === BoardState.GameOver
    ) {
        return null;
    }
    const ownedPieces: Piece[] =
        this.getPiecesByOwner(player);
    for (const piece of ownedPieces) {
        if (
            piece.hasStatus(UnitStatus.Wizard)
        ) {
            this.selectPiece(piece.id);
            return piece;
        }
    }
    throw new Error(
        `Player '${player.name}' does not ` +
            `own a wizard`,
    );
}
```

- [ ] **Step 12: Add `deselectPiece` to engine Board**

Add after `selectWizard`:

```typescript
/**
 * Deselect the currently selected piece. Client
 * overrides to add range gizmo reset and delays.
 */
deselectPiece(): void {
    this._selected = null;
    this._boardEvents.emit(
        BoardEvent.PieceDeselected,
    );
}
```

Add `PieceDeselected` to the `BoardEvent` enum in `packages/engine/src/enums/boardevent.ts` if it doesn't already exist. Check first:

```bash
grep "PieceDeselected" packages/engine/src/enums/boardevent.ts
```

If it doesn't exist, add it. If `BoardEvent` doesn't have a `PieceDeselected` value, the client Board's `deselectPiece` can emit a different event; in that case, skip the emit and just clear `_selected`.

- [ ] **Step 13: Run engine tests**

Run: `npx vitest run --project=engine`
Expected: All engine tests pass. The new methods don't break existing tests because they're additive.

- [ ] **Step 14: Verify client Board compiles**

The client Board already has `async movePiece(...)`, `async attackPiece(...)`, etc. These override the new synchronous engine methods. Since TypeScript allows an async method to override a synchronous one (the return type is a subtype), this should compile without changes.

Run: `npx vitest run` (full suite)
Expected: All tests pass.

- [ ] **Step 15: Commit**

```bash
git add packages/engine/src/board.ts
git commit -m "feat(engine): add game flow methods to engine Board

movePiece, attackPiece, rangedAttackPiece, mountPiece,
dismountPiece, selectPiece, deselectPiece, selectWizard,
addPiece, addWizard, createWizards, addSpell.
State mutation + event emission only — no rendering."
```

---

### Task 2: Move Rules to Engine

Rules has minimal Phaser coupling: one `Geom` import and a few rendering calls in `doSpread`/`doExpire`. The core logic (intent processing, action processing, dice rolls) is pure game logic.

**Files:**
- Create: `packages/engine/src/rules.ts` (moved from client)
- Modify: `src/gameobjects/services/rules.ts` (becomes re-export shim)

- [ ] **Step 1: Copy rules.ts to engine**

```bash
cp src/gameobjects/services/rules.ts packages/engine/src/rules.ts
```

- [ ] **Step 2: Replace imports in engine rules.ts**

Edit `packages/engine/src/rules.ts`. Replace the entire import block at the top:

```typescript
import {
    ActionType,
    BoardEvent,
    BoardState,
    Colour,
    CursorType,
    EventType,
    InputType,
    UnitStatus,
    Spell,
    CancelDismount,
    RequestDismount,
    SpellCastComplete,
} from "@archaos/engine";
import type { IRNG, SpellCastTarget } from "@archaos/engine";
import { Board } from "../board";
import { ComputerWizard } from "../../../packages/engine/src/ai/computerwizard";
import type { Piece } from "../piece";
import type { Player } from "../player";
import { EffectType } from "../effectemitter";

import { Geom } from "phaser";

export type { SpellCastTarget } from "@archaos/engine";
```

Replace with:

```typescript
import { ActionType } from "./enums/actiontype";
import { BoardEvent } from "./enums/boardevent";
import { BoardState } from "./enums/boardstate";
import { Colour } from "./enums/colour";
import { CursorType } from "./enums/cursortype";
import { EventType } from "./enums/eventtype";
import { InputType } from "./enums/inputtype";
import { UnitStatus } from "./enums/unitstatus";
import { Spell } from "./spells/spell";
import type { SpellCastTarget } from "./spells/spell";
import {
    CancelDismount,
    RequestDismount,
    SpellCastComplete,
} from "./phasemachine";
import type { IRNG } from "./rng";
import { Board } from "./board";
import { ComputerWizard } from "./ai/computerwizard";
import type { Piece } from "./piece";
import type { Player } from "./player";
import { EffectType } from "./enums/effecttype";
import { Point } from "./point";
```

- [ ] **Step 3: Replace Geom.Point references with Point**

In Rules, `Geom.Point` appears only via `board.cursor.position` which is already a `Point`-compatible `{ x, y }` object. Search for any remaining `Geom` references:

```bash
grep -n "Geom" packages/engine/src/rules.ts
```

If `Geom` appears anywhere (e.g. in method signatures or type annotations), replace with `Point`. Remove the `import { Geom } from "phaser"` line entirely.

- [ ] **Step 4: Handle rendering calls in doSpread and doExpire**

The `doSpread` and `doExpire` methods call client-only Board methods:
- `board.centreOnPieces(spreadPieces)` → `board.events.emit("focusPieces", { pieceIds: spreadPieces.map(p => p.id) })`
- `board.sound.play("disbelieve")` → `board.events.emit("effectRequested", { sound: "disbelieve" })`
- `board.sound.play("newspell")` → `board.events.emit("effectRequested", { sound: "newspell" })`
- `board.playEffect(EffectType.DisbelieveHit, piece.sprite.getCenter(), null, piece)` → `board.events.emit("effectRequested", { type: EffectType.DisbelieveHit, pieceId: piece.id })`
- `board.playEffect(EffectType.GiveSpell, piece.sprite.getCenter(), null, piece)` → `board.events.emit("effectRequested", { type: EffectType.GiveSpell, pieceId: piece.id })`
- `piece.sprite.getCenter()` references → remove (positions come from `piece.position`, the client handles screen coordinates)

In `doSpread`, replace:

```typescript
board.centreOnPieces(spreadPieces);
```

with:

```typescript
board.events.emit("focusPieces", {
    pieceIds: spreadPieces.map(
        (p) => p.id,
    ),
});
```

In `doExpire`, replace the structure expiry block:

```typescript
board.sound.play("disbelieve");
await board.playEffect(
    EffectType.DisbelieveHit,
    piece.sprite.getCenter(),
    null,
    piece,
);
```

with:

```typescript
board.events.emit(
    "effectRequested",
    {
        type: EffectType.DisbelieveHit,
        pieceId: piece.id,
        sound: "disbelieve",
    },
);
```

Replace the gives-spell expiry block:

```typescript
board.sound.play("newspell");
await board.playEffect(
    EffectType.GiveSpell,
    piece.sprite.getCenter(),
    null,
    piece,
);
```

with:

```typescript
board.events.emit(
    "effectRequested",
    {
        type: EffectType.GiveSpell,
        pieceId: piece.id,
        sound: "newspell",
    },
);
```

- [ ] **Step 5: Handle processCancel sound call**

In `processCancel`, replace:

```typescript
board.sound.play("cancel");
```

with:

```typescript
board.events.emit(
    "effectRequested",
    { sound: "cancel" },
);
```

- [ ] **Step 6: Handle processIntent and processAction cursor references**

`processIntent` and `processAction` reference `board.cursor.position`. The cursor is a client-only concept. For the engine Rules to work headlessly, it needs a position parameter instead of reading from the cursor.

However, changing the method signatures would break the client. Instead, add a `cursorPosition` property to the engine Board that the client Board sets from its cursor:

In `packages/engine/src/board.ts`, add a field:

```typescript
protected _cursorPosition: Point = new Point(0, 0);
```

And a getter/setter:

```typescript
get cursorPosition(): Point {
    return this._cursorPosition;
}

set cursorPosition(point: Point) {
    this._cursorPosition = point;
}
```

Then in `packages/engine/src/rules.ts`, replace all occurrences of `board.cursor.position` with `board.cursorPosition`.

The client Board keeps its `Cursor` and updates `this.cursorPosition` whenever the cursor moves. This can be done later when wiring up the client — for now, the engine Rules compiles.

- [ ] **Step 7: Handle rangeGizmo reference in doCastSpell**

In `doCastSpell`, there's a reference to `board.rangeGizmo.showSimpleRange(...)`. This is client-only rendering. Replace:

```typescript
if (casted.lineOfSight) {
    await board.rangeGizmo.showSimpleRange(
        board.selected.position,
        board.currentPlayer?.selectedSpell.range,
        CursorType.RangeCast,
        true,
    );
}
```

with:

```typescript
if (casted.lineOfSight) {
    board.events.emit(
        "showCastRange",
        {
            position: board.selected.position,
            range: board.currentPlayer
                ?.selectedSpell.range,
            lineOfSight: true,
        },
    );
}
```

- [ ] **Step 8: Handle emitUIEvent and dispatchEvent calls**

Rules calls `board.emitUIEvent(...)` and `this.dispatchEvent(...)`. Both are client-only event dispatchers.

For `board.emitUIEvent(...)` — the engine Board already has this as a no-op. No change needed.

For `this.dispatchEvent(...)` — this uses `globalThis.dispatchEvent(new CustomEvent(...))` which is a DOM API not available in pure Node. Replace with `board.events.emit(...)`:

Replace the `dispatchEvent` method:

```typescript
public dispatchEvent(
    type: EventType,
    data: any,
    board?: Board,
) {
    if (board) {
        board.events.emit(type, data);
    }
}
```

Then update all call sites in Rules to pass `board`:
- `this.dispatchEvent(EventType.PieceInfo, null)` → `this.dispatchEvent(EventType.PieceInfo, null, board)`
- `this.dispatchEvent(EventType.PieceInfo, pieceOfInterest)` → `this.dispatchEvent(EventType.PieceInfo, pieceOfInterest, board)`
- `this.dispatchEvent(EventType.PieceInfo, currentAliveHoveredPiece)` → `this.dispatchEvent(EventType.PieceInfo, currentAliveHoveredPiece, board)`
- `this.dispatchEvent(EventType.PieceInfo, currentAliveHoveredPiece.currentRider)` → `this.dispatchEvent(EventType.PieceInfo, currentAliveHoveredPiece.currentRider, board)`

- [ ] **Step 9: Remove HMR block**

Remove the `import.meta.hot` block at the bottom of the engine rules.ts — it's a client/Vite concern:

```typescript
/* v8 ignore next 5 */
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        _instance = undefined;
    });
}
```

- [ ] **Step 10: Add `_resetRulesForTesting` export**

For testability, add a reset function (same pattern as Logger):

```typescript
/**
 * Reset the singleton for testing.
 * @internal
 */
export function _resetRulesForTesting(): void {
    _instance = undefined;
}
```

- [ ] **Step 11: Add Rules to engine barrel export**

In `packages/engine/src/index.ts`, add in the appropriate section:

```typescript
// Rules
export {
    Rules,
    _resetRulesForTesting,
} from "./rules";
```

- [ ] **Step 12: Replace client rules.ts with re-export shim**

Replace the contents of `src/gameobjects/services/rules.ts` with:

```typescript
export {
    Rules,
    _resetRulesForTesting,
} from "@archaos/engine";
export type { SpellCastTarget } from "@archaos/engine";
```

- [ ] **Step 13: Run tests**

Run: `npx vitest run`
Expected: All tests pass. The Rules test imports from `./rules` which now re-exports from the engine.

- [ ] **Step 14: Commit**

```bash
git add packages/engine/src/rules.ts \
       packages/engine/src/index.ts \
       packages/engine/src/board.ts \
       src/gameobjects/services/rules.ts
git commit -m "refactor: move Rules to engine package

Replace Phaser Geom with engine Point, rendering calls
with event emissions, DOM dispatchEvent with board events.
Client rules.ts is now a re-export shim."
```

---

### Task 3: Move Rules Tests to Engine

**Files:**
- Create: `packages/engine/src/rules.test.ts` (moved from client)
- Modify: `src/gameobjects/services/rules.test.ts` (keep as client test or remove)

- [ ] **Step 1: Copy rules test to engine**

```bash
cp src/gameobjects/services/rules.test.ts packages/engine/src/rules.test.ts
```

- [ ] **Step 2: Update imports in engine rules.test.ts**

Replace the imports at the top of `packages/engine/src/rules.test.ts`:

```typescript
import {
    ActionType,
    BoardState,
    InputType,
    UnitStatus,
} from "@archaos/engine";
import { describe, it, expect, vi } from "vitest";
import { Rules } from "./rules";
import type { Board } from "../board";
import type { Piece } from "../piece";
import { Geom } from "phaser";
```

with:

```typescript
import { describe, it, expect, vi } from "vitest";
import { Rules } from "./rules";
import { ActionType } from "./enums/actiontype";
import { BoardState } from "./enums/boardstate";
import { InputType } from "./enums/inputtype";
import { Point } from "./point";
import type { Board } from "./board";
import type { Piece } from "./piece";
```

- [ ] **Step 3: Replace Geom.Point with Point in test mocks**

In `createMockPiece`, replace:

```typescript
position: new Geom.Point(0, 0),
```

with:

```typescript
position: new Point(0, 0),
```

In `createMockBoard`, replace:

```typescript
cursor: { position: new Geom.Point(4, 0) },
```

with:

```typescript
cursorPosition: new Point(4, 0),
events: { emit: vi.fn() },
```

- [ ] **Step 4: Run engine tests**

Run: `npx vitest run --project=engine`
Expected: Rules tests pass in the engine project (pure Node, no jsdom).

- [ ] **Step 5: Update or remove client rules test**

If the client `rules.test.ts` is now redundant (just testing re-exports), remove it or keep it as a smoke test. Simplest: keep it as-is since it imports from `./rules` which re-exports from the engine.

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/rules.test.ts \
       src/gameobjects/services/rules.test.ts
git commit -m "test: move Rules tests to engine package"
```

---

### Task 4: Fix ComputerWizard — Event-Based Rendering

ComputerWizard calls client-only Board methods. Now that `movePiece`, `attackPiece`, and `rangedAttackPiece` exist on the engine Board, those calls resolve naturally. The remaining rendering calls become event emissions.

**Files:**
- Modify: `packages/engine/src/ai/computerwizard.ts`

- [ ] **Step 1: Change `_board` type from `any` to `Board`**

In `packages/engine/src/ai/computerwizard.ts`, replace:

```typescript
// Typed as `any` because ComputerWizard bridges
// engine logic and client-side Board methods (cursor,
// sound, rules, movePiece, etc.) that are not on the
// engine Board type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
private readonly _board: any;
```

with:

```typescript
private readonly _board: Board;
```

- [ ] **Step 2: Replace cursor.enabled calls with events**

Search for all `this._board.cursor.enabled` references. Replace each one:

`this._board.cursor.enabled = false` → `this._board.events.emit("aiThinking")`

`this._board.cursor.enabled = true` → `this._board.events.emit("aiActing")`

- [ ] **Step 3: Replace sound.play calls with events**

Search for all `this._board.sound.play(...)` references. Replace:

`this._board.sound.play("cancel")` → `this._board.events.emit("effectRequested", { sound: "cancel" })`

`this._board.sound.play("bowselecta")` → remove entirely (the rangedAttackPiece event in the client handles this sound)

- [ ] **Step 4: Replace centreOnPieces and centreOnPosition calls with events**

`this._board.centreOnPieces([piece])` → `this._board.events.emit("focusPieces", { pieceIds: [piece.id] })`

`this._board.centreOnPosition(movePt)` → `this._board.events.emit("focusPosition", { x: movePt.x, y: movePt.y })`

- [ ] **Step 5: Remove unused CursorType import**

If `CursorType` was only used for cursor-related calls, remove its import.

- [ ] **Step 6: Add ComputerWizard to engine barrel export**

In `packages/engine/src/index.ts`, replace the AI comment block:

```typescript
// AI
// ComputerWizard not barrel-exported yet — still imports
// client Board for rendering methods. Import directly from
// ./ai/computerwizard instead.
```

with:

```typescript
// AI
export { ComputerWizard } from "./ai/computerwizard";
```

- [ ] **Step 7: Run engine tests**

Run: `npx vitest run --project=engine`
Expected: All engine tests pass. ComputerWizard tests use mock boards that don't have `cursor`/`sound` — they should be unaffected. If any test asserts on `_board.cursor.enabled`, update to assert on `_board.events.emit` calls instead.

- [ ] **Step 8: Run full tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/ai/computerwizard.ts \
       packages/engine/src/index.ts
git commit -m "refactor: ComputerWizard uses events instead of rendering calls

_board typed as Board (not any). cursor/sound/centreOn
calls replaced with board event emissions. Now barrel-exported
from @archaos/engine."
```

---

### Task 5: Wire Client Board to Handle Engine Events

The client Board needs to subscribe to the events that Rules and ComputerWizard now emit, and perform the rendering that used to be inline.

**Files:**
- Modify: `src/gameobjects/board.ts`

- [ ] **Step 1: Subscribe to AI events in client Board constructor**

In the client Board's constructor (after `this._sound = SoundEffects.getInstance(this.scene)`), add event subscriptions:

```typescript
// AI event subscriptions
this.events.on(
    "aiThinking",
    () => {
        this.cursor.enabled = false;
    },
);
this.events.on(
    "aiActing",
    () => {
        this.cursor.enabled = true;
    },
);
this.events.on(
    "focusPieces",
    (data: { pieceIds: number[] }) => {
        const pieces = data.pieceIds
            .map((id) => this.getPiece(id))
            .filter(Boolean) as Piece[];
        this.centreOnPieces(pieces);
    },
);
this.events.on(
    "focusPosition",
    (data: { x: number; y: number }) => {
        this.centreOnPosition(
            new Geom.Point(data.x, data.y),
        );
    },
);
this.events.on(
    "effectRequested",
    async (data: {
        type?: EffectType;
        pieceId?: number;
        sound?: string;
    }) => {
        if (data.sound) {
            this.sound.play(data.sound);
        }
        if (data.type && data.pieceId) {
            const piece = this.getPiece(
                data.pieceId,
            );
            if (piece) {
                await this.playEffect(
                    data.type,
                    piece.sprite.getCenter(),
                    null,
                    piece,
                );
            }
        }
    },
);
this.events.on(
    "showCastRange",
    async (data: {
        position: Geom.Point;
        range: number;
        lineOfSight: boolean;
    }) => {
        await this.rangeGizmo.showSimpleRange(
            data.position,
            data.range,
            CursorType.RangeCast,
            data.lineOfSight,
        );
    },
);
```

- [ ] **Step 2: Forward PieceInfo events to DOM for Vue components**

Rules now emits `EventType.PieceInfo` via `board.events.emit(...)` instead of `globalThis.dispatchEvent(...)`. The client Board needs to forward these as DOM CustomEvents so Vue components (UnitStats, SpellInfo) can listen:

```typescript
this.events.on(
    EventType.PieceInfo,
    (data: any) => {
        globalThis.dispatchEvent(
            new CustomEvent(EventType.PieceInfo, {
                detail: data,
            }),
        );
    },
);
```

- [ ] **Step 3: Update client Board's cursorPosition bridge**

Add a `cursorPosition` override that delegates to the cursor:

```typescript
override get cursorPosition(): Point {
    return this.cursor.position;
}
```

This way Rules can read `board.cursorPosition` and get the cursor's current position on the client, while the server can set it directly.

- [ ] **Step 4: Run full tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/gameobjects/board.ts
git commit -m "feat(client): wire Board to engine events

Subscribe to aiThinking/aiActing, focusPieces/focusPosition,
effectRequested, showCastRange, PieceInfo.
Bridge cursorPosition to cursor."
```

---

### Task 6: Client Import Rewiring

Clean up stale import paths across the client codebase.

**Files:**
- Modify: various `src/` files
- Modify: `src/gameobjects/effectemitter.ts`

- [ ] **Step 1: Fix direct engine path imports**

Search for imports that bypass the barrel:

```bash
grep -rn "packages/engine/src" src/ --include="*.ts"
```

Replace each match with an import from `@archaos/engine`. For example:

`import { ComputerWizard } from "../../../packages/engine/src/ai/computerwizard"` → `import { ComputerWizard } from "@archaos/engine"`

- [ ] **Step 2: Deduplicate EffectType**

In `src/gameobjects/effectemitter.ts`, the `EffectType` enum is defined locally (duplicate of the engine version). Find the enum definition and replace it with a re-export:

```typescript
export { EffectType } from "@archaos/engine";
```

Keep the rest of `effectemitter.ts` (the `createEffect` function, etc.) unchanged. All existing imports of `EffectType` from `"./effectemitter"` or `"../effectemitter"` continue to work.

- [ ] **Step 3: Run full tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Run component tests**

Run: `npx vitest run --project=components`
Expected: All component tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: finalise client imports and deduplicate EffectType

All engine imports go through @archaos/engine barrel.
EffectType has a single source of truth in the engine."
```

---

### Task 7: Verification and Cleanup

**Files:**
- Various cleanup across engine and client

- [ ] **Step 1: Verify zero Phaser imports in engine**

```bash
grep -r "from ['\"]phaser" packages/engine/src/ --include="*.ts"
```

Expected: No output.

- [ ] **Step 2: Verify no DOM/browser APIs in engine source**

```bash
grep -rn "document\.\|window\.\|HTMLElement\|Canvas\|WebGL\|Audio" packages/engine/src/ --include="*.ts" | grep -v "\.test\."
```

Expected: No output (test files may reference DOM mocks, but source should not).

- [ ] **Step 3: Verify no remaining `_board: any` in ComputerWizard**

```bash
grep "_board: any" packages/engine/src/ai/computerwizard.ts
```

Expected: No output.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All engine and client tests pass.

- [ ] **Step 5: Run the dev server**

Run: `npm start`
Expected: Game loads, local play works. Test: create a game, cast a spell, move a piece, attack, verify AI takes its turn. All spell types, combat, and movement should function identically to before.

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: Vite builds successfully with no errors.

- [ ] **Step 7: Clean up stale comments**

Remove any remaining stale comments:
- The "not barrel-exported" comment in `index.ts` (already done in Task 4)
- Any "TODO: remove once engine Board exists" comments in test files

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: engine extraction verification and cleanup

Zero Phaser imports in engine. All tests pass.
Local play verified. Build succeeds."
```

---

## Risk Notes

- **`Piece.attack()` sync vs async:** The engine Board's `attackPiece` calls `piece.attack()` synchronously. The engine `Piece.attack()` must be synchronous (pure state). The client `Piece.attack()` is async (plays animation). The client Board's `attackPiece` override must call the client Piece's async `attack()` and `await` it. If the engine `Piece.attack()` is currently async, it can stay async — the engine Board just doesn't await any visual delay.
- **`mount()`/`dismount()` same pattern:** Check whether engine `Piece.mount()` and `Piece.dismount()` are sync or async. Same handling as attack.
- **Rules cursor.position:** Task 2 Step 6 adds `cursorPosition` to engine Board. If any Rules test creates mock boards, those mocks need `cursorPosition` instead of `cursor.position`.
- **`dispatchEvent` signature change:** Task 2 Step 8 adds an optional `board` parameter to `dispatchEvent`. Existing callers that don't pass `board` will silently no-op. This is intentional for the engine (where DOM events don't exist) but the client Board should subscribe to these events in its constructor and forward them as DOM `CustomEvent`s if needed for Vue components.
