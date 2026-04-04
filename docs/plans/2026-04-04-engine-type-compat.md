# Engine Type Compatibility & Missing Methods — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all TypeScript build errors in client gameobjects caused by the engine extraction, so `npm run build` produces zero errors from `src/` and `packages/engine/src/`.

**Architecture:** Three phases — (0) convert hardcoded event strings to a string enum, (1) change `private` fields to `protected` in engine classes for structural type compatibility, (2) add missing engine methods and convert spell rendering calls to event emissions.

**Tech Stack:** TypeScript 5, Vitest, `@archaos/engine` monorepo package

**Design spec:** `docs/specs/2026-04-04-engine-type-compat-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/engine/src/enums/engineevent.ts` | New `EngineEvent` string enum |
| Modify | `packages/engine/src/index.ts` | Barrel export for `EngineEvent` |
| Modify | `packages/engine/src/ai/computerwizard.ts` | Replace hardcoded event strings with `EngineEvent` |
| Modify | `packages/engine/src/rules.ts` | Replace hardcoded event strings with `EngineEvent` |
| Modify | `src/gameobjects/board.ts` | Replace hardcoded listener strings with `EngineEvent` |
| Modify | `packages/engine/src/player.ts` | `private` → `protected` for 8 fields |
| Modify | `packages/engine/src/wizard.ts` | `private` → `protected` for `_wizCode` |
| Modify | `packages/engine/src/board.ts` | `private` → `protected` for `_width`, `_height`; add `nextPlayer()`, `newTurn()` |
| Modify | `packages/engine/src/piece.ts` | Add `inAttackRange()`, `inMovementRange()`, `moveTo()`, `spread()`, `raiseDead()` |
| Modify | `packages/engine/src/spells/spell.ts` | Convert `castFail` and `showRange` to event emissions |
| Modify | `packages/engine/src/spells/attackspell.ts` | Convert `doCast` rendering calls to events |
| Modify | `packages/engine/src/spells/disbelievespell.ts` | Convert `doCast` rendering calls to events |
| Modify | `packages/engine/src/spells/raisedeadspell.ts` | Convert `doCast` rendering calls to events |
| Modify | `packages/engine/src/spells/statuseffectspell.ts` | Convert `doCast` rendering calls to events |
| Modify | `packages/engine/src/spells/subversionspell.ts` | Convert `doCast` rendering calls to events |
| Modify | `packages/engine/src/spells/summonspell.ts` | Convert `doCast` rendering calls to events |
| Modify | `packages/engine/src/spells/turmoilspell.ts` | Convert `doCast` rendering calls to events |

---

### Task 1: Create `EngineEvent` enum

**Files:**
- Create: `packages/engine/src/enums/engineevent.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Create the enum file**

Create `packages/engine/src/enums/engineevent.ts`:

```typescript
/**
 * Events emitted by engine classes for client rendering
 * and UI synchronisation. The engine emits these; the
 * client subscribes to handle Phaser-specific rendering.
 */
export enum EngineEvent {
    /** AI is thinking — client should disable cursor. */
    AiThinking = "engine:ai-thinking",

    /** AI finished thinking — client should enable cursor. */
    AiActing = "engine:ai-acting",

    /** Camera should focus on the given pieces. */
    FocusPieces = "engine:focus-pieces",

    /** Camera should focus on a board position. */
    FocusPosition = "engine:focus-position",

    /** A visual/sound effect should be played. */
    EffectRequested = "engine:effect-requested",

    /** Show casting range indicator on the board. */
    ShowCastRange = "engine:show-cast-range",

    /** Reset/hide the casting range indicator. */
    ResetCastRange = "engine:reset-cast-range",
}
```

- [ ] **Step 2: Add barrel export**

In `packages/engine/src/index.ts`, add this line alongside the other enum exports (after the `EffectType` export):

```typescript
export { EngineEvent } from "./enums/engineevent";
```

- [ ] **Step 3: Run tests to verify nothing is broken**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All 1213+ tests pass (no functional change yet)

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/enums/engineevent.ts packages/engine/src/index.ts
git commit -m "feat(engine): add EngineEvent string enum for engine-to-client events"
```

---

### Task 2: Replace hardcoded event strings in ComputerWizard

**Files:**
- Modify: `packages/engine/src/ai/computerwizard.ts`

- [ ] **Step 1: Add the import**

At the top of `packages/engine/src/ai/computerwizard.ts`, add to the imports:

```typescript
import { EngineEvent } from "../enums/engineevent";
```

- [ ] **Step 2: Replace all hardcoded event strings**

Replace every occurrence in this file:

| Old | New |
|-----|-----|
| `"aiThinking"` | `EngineEvent.AiThinking` |
| `"aiActing"` | `EngineEvent.AiActing` |
| `"focusPieces"` | `EngineEvent.FocusPieces` |
| `"focusPosition"` | `EngineEvent.FocusPosition` |
| `"effectRequested"` | `EngineEvent.EffectRequested` |

There are approximately 20 occurrences across the file. Replace each `emit("aiThinking")` with `emit(EngineEvent.AiThinking)`, and so on for all strings.

- [ ] **Step 3: Run ComputerWizard tests**

Run: `npx vitest run packages/engine/src/ai/computerwizard.test.ts --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass (tests check `emit` was called, not the string value)

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/ai/computerwizard.ts
git commit -m "refactor(engine): use EngineEvent enum in ComputerWizard"
```

---

### Task 3: Replace hardcoded event strings in Rules

**Files:**
- Modify: `packages/engine/src/rules.ts`

- [ ] **Step 1: Add the import**

At the top of `packages/engine/src/rules.ts`, add:

```typescript
import { EngineEvent } from "./enums/engineevent";
```

- [ ] **Step 2: Replace all hardcoded event strings**

Replace every occurrence in this file:

| Old | New |
|-----|-----|
| `"showCastRange"` | `EngineEvent.ShowCastRange` |
| `"effectRequested"` | `EngineEvent.EffectRequested` |
| `"focusPieces"` | `EngineEvent.FocusPieces` |

There are 3 occurrences total. For example, line ~341:

```typescript
// Before:
board.events.emit("showCastRange", {
// After:
board.events.emit(EngineEvent.ShowCastRange, {
```

- [ ] **Step 3: Run Rules tests**

Run: `npx vitest run packages/engine/src/rules.test.ts --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/rules.ts
git commit -m "refactor(engine): use EngineEvent enum in Rules"
```

---

### Task 4: Replace hardcoded event strings in client Board listeners

**Files:**
- Modify: `src/gameobjects/board.ts`

- [ ] **Step 1: Add the import**

In `src/gameobjects/board.ts`, add `EngineEvent` to the `@archaos/engine` import block:

```typescript
import {
    // ... existing imports ...
    EngineEvent,
} from "@archaos/engine";
```

- [ ] **Step 2: Replace all listener strings**

In the engine event subscriptions block (around lines 183-265), replace each `.on("stringName", ...)` with `.on(EngineEvent.EnumMember, ...)`:

```typescript
// Before:
this.events.on("aiThinking", () => {
// After:
this.events.on(EngineEvent.AiThinking, () => {

// Before:
this.events.on("aiActing", () => {
// After:
this.events.on(EngineEvent.AiActing, () => {

// Before:
this.events.on("focusPieces", (data: ...) => {
// After:
this.events.on(EngineEvent.FocusPieces, (data: ...) => {

// Before:
this.events.on("focusPosition", (data: ...) => {
// After:
this.events.on(EngineEvent.FocusPosition, (data: ...) => {

// Before:
this.events.on("effectRequested", async (data: ...) => {
// After:
this.events.on(EngineEvent.EffectRequested, async (data: ...) => {

// Before:
this.events.on("showCastRange", async (data: ...) => {
// After:
this.events.on(EngineEvent.ShowCastRange, async (data: ...) => {
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All 1213+ tests pass

- [ ] **Step 4: Commit**

```bash
git add src/gameobjects/board.ts
git commit -m "refactor(client): use EngineEvent enum in Board event listeners"
```

---

### Task 5: Change `private` to `protected` in engine Player

**Files:**
- Modify: `packages/engine/src/player.ts`

- [ ] **Step 1: Change field visibility**

In `packages/engine/src/player.ts`, change these 8 fields from `private` to `protected`:

```typescript
// Before:
private readonly _name: string;
// After:
protected readonly _name: string;

// Before:
private readonly _wizcode: string;
// After:
protected readonly _wizcode: string;

// Before:
private readonly _spells: Map<number, Spell>;
// After:
protected readonly _spells: Map<number, Spell>;

// Before:
private readonly _colour: number;
// After:
protected readonly _colour: number;

// Before:
private _castingPiece: Piece | null;
// After:
protected _castingPiece: Piece | null;

// Before:
private _selectedSpell: Spell | null;
// After:
protected _selectedSpell: Spell | null;

// Before:
private _forceHit: boolean | null = null;
// After:
protected _forceHit: boolean | null = null;

// Before:
private _forceCast: boolean | null = null;
// After:
protected _forceCast: boolean | null = null;
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass (widening visibility never breaks consumers)

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/player.ts
git commit -m "refactor(engine): change Player private fields to protected for subclass compat"
```

---

### Task 6: Change `private` to `protected` in engine Wizard and Board

**Files:**
- Modify: `packages/engine/src/wizard.ts`
- Modify: `packages/engine/src/board.ts`

- [ ] **Step 1: Change Wizard field visibility**

In `packages/engine/src/wizard.ts`, change:

```typescript
// Before:
private readonly _wizCode: WizCode;
// After:
protected readonly _wizCode: WizCode;
```

- [ ] **Step 2: Change Board field visibility**

In `packages/engine/src/board.ts`, change:

```typescript
// Before:
private readonly _width: number;
// After:
protected readonly _width: number;

// Before:
private readonly _height: number;
// After:
protected readonly _height: number;
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/wizard.ts packages/engine/src/board.ts
git commit -m "refactor(engine): change Wizard and Board private fields to protected"
```

---

### Task 7: Add `inMovementRange` and `inAttackRange` to engine Piece

**Files:**
- Modify: `packages/engine/src/piece.ts`

These methods are called by `rules.ts` and the client `findThreatPieces`. The engine versions use distance-only checks (no pathfinding — consistent with the existing `findThreatPieces` approach). The client overrides these to also check `board.rangeGizmo.getPathTo()`.

- [ ] **Step 1: Add `inMovementRange` to engine Piece**

Add this method to `packages/engine/src/piece.ts`, after the existing `inRangedAttackRange` method. The method accepts a point with `{ x: number; y: number }` (duck-typed, compatible with both `Point` and Phaser `Geom.Point`):

```typescript
    /**
     * Check if a point is within this piece's movement
     * range. Engine version uses distance only; client
     * overrides to also check pathfinding.
     */
    inMovementRange(
        point: { x: number; y: number },
    ): boolean {
        if (
            this.position.x === point.x &&
            this.position.y === point.y
        ) {
            return false;
        }
        if (this._currentMount) {
            if (
                Board.distance(
                    this.position,
                    new Point(point.x, point.y),
                ) > 1.5
            ) {
                return false;
            }
        }
        if (
            this.hasStatus(UnitStatus.Flying) &&
            Board.distance(
                this.position,
                new Point(point.x, point.y),
                RangeType.Fly,
            ) <= this.stats.movement
        ) {
            return true;
        }
        // Engine fallback: distance-only check
        // (no pathfinding). Client overrides to
        // use rangeGizmo.getPathTo().
        return (
            Board.distance(
                this.position,
                new Point(point.x, point.y),
            ) <= this.stats.movement
        );
    }
```

- [ ] **Step 2: Add `inAttackRange` to engine Piece**

Add this method immediately after `inMovementRange`:

```typescript
    /**
     * Check if a point is within this piece's melee
     * attack range. Engine version uses distance only;
     * client overrides to also check pathfinding.
     */
    inAttackRange(
        point: { x: number; y: number },
    ): boolean {
        if (
            !this._moved &&
            this.inMovementRange(point)
        ) {
            return true;
        }
        if (
            Board.distance(
                this.position,
                new Point(point.x, point.y),
            ) > 1.5
        ) {
            return false;
        }
        return true;
    }
```

- [ ] **Step 3: Add `RangeType` import if not already present**

Check the imports at the top of `packages/engine/src/piece.ts`. Add `RangeType` if missing:

```typescript
import { RangeType } from "./enums/rangetype";
```

Also ensure `Point` is imported (it should already be via `Entity`'s dependency, but verify):

```typescript
import { Point } from "./point";
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/piece.ts
git commit -m "feat(engine): add inMovementRange and inAttackRange to engine Piece"
```

---

### Task 8: Add `moveTo` and `raiseDead` to engine Piece

**Files:**
- Modify: `packages/engine/src/piece.ts`

- [ ] **Step 1: Add `moveTo` to engine Piece**

Add this method after the `inAttackRange` method. It must be `async` because the client override is async:

```typescript
    /**
     * Move this piece to the specified point. Engine
     * version updates state only; client overrides to
     * add animation.
     */
    async moveTo(
        point: { x: number; y: number },
        _stepDuration?: number,
    ): Promise<void> {
        this.updateDirection(
            this.position,
            point as Point,
        );
        this.position = new Point(point.x, point.y);
        if (this._currentRider) {
            this._currentRider.position = new Point(
                point.x,
                point.y,
            );
        }
        if (
            this._currentMount &&
            !(
                this._currentMount.position.x ===
                    this.position.x &&
                this._currentMount.position.y ===
                    this.position.y
            )
        ) {
            this._board.dismountPiece(this.id);
        }
    }
```

- [ ] **Step 2: Add `raiseDead` to engine Piece**

Add this method after `moveTo`. It must be `async` because the client override is async:

```typescript
    /**
     * Raise this piece from the dead, assigning its
     * new owner. Engine version updates state only;
     * client overrides to add visual effects.
     */
    async raiseDead(
        owner: Player | null,
    ): Promise<void> {
        if (!this._dead) {
            throw new Error(
                "Cannot raise a piece that is " +
                    "not dead",
            );
        }
        this.owner = owner;
        this._dead = false;
        this.raisedDead = true;
        this.addStatus(UnitStatus.Undead);
    }
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/piece.ts
git commit -m "feat(engine): add moveTo and raiseDead to engine Piece"
```

---

### Task 9: Add `spread` to engine Piece

**Files:**
- Modify: `packages/engine/src/piece.ts`

This is a complex method. The engine version contains the full game logic (RNG-weighted action selection, shrink/spread/none, engulf, kill, destroy, create new spread piece). The client overrides to add animations, sounds and visual effects.

- [ ] **Step 1: Add required imports**

Ensure these imports are at the top of `packages/engine/src/piece.ts` (add any missing):

```typescript
import { SpreadAction } from "./enums/spreadaction";
import { UnitAttackType } from "./enums/unitattacktype";
import { UnitRangedProjectileType } from "./enums/unitrangedprojectiletype";
```

`SpreadAction` and `UnitAttackType` may already be imported — only add if missing. `UnitRangedProjectileType` is already imported.

- [ ] **Step 2: Add `spread` method**

Add this method to engine Piece after `raiseDead`. It must be `async`:

```typescript
    /**
     * Execute spread action for this piece. Engine
     * version does pure state changes; client overrides
     * to add animations and sound.
     */
    async spread(): Promise<void> {
        if (
            !this.hasStatus(UnitStatus.Spreads) ||
            this._dead
        ) {
            throw new Error(
                "Cannot spread a non-spreading " +
                    "or dead piece",
            );
        }
        const spreadAction: SpreadAction =
            this._board.rng.weightedRandomPick(
                [
                    SpreadAction.Shrink,
                    SpreadAction.None,
                    SpreadAction.Spread,
                ],
                1.75,
                true,
            );
        if (spreadAction === SpreadAction.None) {
            return;
        }
        if (spreadAction === SpreadAction.Shrink) {
            if (this.currentEngulfed) {
                this.currentEngulfed.engulfed = false;
                this._board.logger.log(
                    `${this.currentEngulfed.fullName}` +
                        ` was released from ` +
                        `${this.fullName}`,
                    Colour.Green,
                );
            }
            await this.destroy();
            return;
        }
        if (spreadAction === SpreadAction.Spread) {
            const adjacentPoints =
                this._board.getAdjacentPoints(
                    this.position,
                );
            const spreadPoint =
                this._board.rng.pick(adjacentPoints);
            const spreadPieces =
                this._board.getPiecesAtPosition(
                    new Point(
                        spreadPoint.x,
                        spreadPoint.y,
                    ),
                    (piece: Piece) => !piece.dead,
                );

            if (spreadPieces.length > 0) {
                if (
                    spreadPieces.some(
                        (piece) =>
                            piece.owner ===
                                this.owner ||
                            !piece.canBeSpreadOn,
                    )
                ) {
                    return;
                }
                if (
                    spreadPieces.some((piece) =>
                        piece.hasStatus(
                            UnitStatus.Wizard,
                        ),
                    )
                ) {
                    const killedPiece =
                        spreadPieces.find((piece) =>
                            piece.hasStatus(
                                UnitStatus.Wizard,
                            ),
                        );
                    this._board.logger.log(
                        `${killedPiece.fullName} ` +
                            `was destroyed by ` +
                            `${this.fullName}!`,
                        Colour.Red,
                    );
                    await killedPiece.kill();
                } else if (
                    this.hasStatus(UnitStatus.Engulfs)
                ) {
                    this._board.logger.log(
                        `${this.fullName} has ` +
                            `engulfed ` +
                            `${spreadPieces[0].fullName}`,
                        Colour.Yellow,
                    );
                    spreadPieces[0].engulfed = true;
                } else {
                    await Promise.all(
                        spreadPieces.map(
                            async (piece) => {
                                this._board.logger.log(
                                    `${piece.fullName}` +
                                        ` was destroyed` +
                                        ` by ` +
                                        `${this.fullName}`,
                                    Colour.Red,
                                );
                                return await piece.destroy();
                            },
                        ),
                    );
                }
            }

            const unit: any = Piece.getUnitConfig(
                this._properties.id,
            );

            const newPiece = this._board.addPiece({
                type: UnitType.Creature,
                x: spreadPoint.x,
                y: spreadPoint.y,
                properties: {
                    id: this._unitId,
                    name: unit.name,
                    movement: unit.properties.mov,
                    combat: unit.properties.com,
                    rangedCombat: unit.properties.rcm,
                    range: unit.properties.rng,
                    defence: unit.properties.def,
                    manoeuvrability:
                        unit.properties.mnv,
                    magicResistance:
                        unit.properties.res,
                    attackType:
                        unit.attackType || "attacked",
                    rangedType:
                        unit.rangedType || "shot",
                    projectileType:
                        unit.projectileType ||
                        UnitRangedProjectileType.Arrow,
                    status: [
                        ...(unit.status || []),
                    ],
                },
                shadowScale: unit.shadowScale,
                offsetY: unit.offY,
                owner: this.owner,
                illusion: !!this._illusion,
                group: unit.group || "classicunits",
            } as PieceConfig);

            if (spreadPieces.length) {
                if (
                    newPiece.hasStatus(
                        UnitStatus.Engulfs,
                    ) &&
                    !spreadPieces[0].dead &&
                    !spreadPieces[0].hasStatus(
                        UnitStatus.Wizard,
                    )
                ) {
                    newPiece.currentEngulfed =
                        spreadPieces[0];
                }
            }
        }
    }
```

- [ ] **Step 3: Ensure `getUnitConfig` exists on engine Piece**

Verify that `Piece.getUnitConfig` is a static method on engine Piece. It should look like:

```typescript
static getUnitConfig(unitId: string): any {
    return Piece.units[unitId] ?? null;
}
```

If it doesn't exist, add it.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/piece.ts
git commit -m "feat(engine): add spread method to engine Piece"
```

---

### Task 10: Add `newTurn` and `nextPlayer` to engine Board

**Files:**
- Modify: `packages/engine/src/board.ts`

These are the two main game flow methods. The engine versions contain pure state logic and FSM transitions. The client overrides to add UI (spellbook dialogs, player highlight colours, debounced board update events, sound).

- [ ] **Step 1: Add FSM event imports**

At the top of `packages/engine/src/board.ts`, add the missing PhaseMachine event imports:

```typescript
import {
    PhaseMachine,
    GameEnd,
    StartGame,
    SpellbookReady,
    SkipSpellbook,
    SpellsDone,
    CastingReady,
    NoSpellsCast,
    CastingDone,
    SpreadingDone,
    MovingReady,
    MovingDone,
    SpellTargeting,
} from "./phasemachine";
```

(Some of these may already be imported — only add the missing ones.)

- [ ] **Step 2: Add `newTurn` method**

Add this method in the `/* ── Game flow ───────────────────────────── */` section of engine Board, after `deselectPlayer`:

```typescript
    /**
     * Start a new turn on the board. This advances
     * the phase and state as appropriate. Engine
     * version does state/FSM transitions only; client
     * overrides to add UI (spellbook dialogs, sound,
     * player colours).
     */
    async newTurn(): Promise<void> {
        this._selected = null;

        if (this.state === BoardState.GameOver) {
            return;
        }

        const pm = this._stateManager;

        if (
            pm.isActive(pm.states.idle) ||
            pm.isActive(pm.states.moving)
        ) {
            if (pm.isActive(pm.states.idle)) {
                pm.evaluate(new StartGame());
            } else {
                pm.evaluate(new MovingDone());
            }

            this.pieces.forEach((piece) => {
                piece.reset();
            });
            this._logger.log(
                `New turn`,
                Colour.Green,
            );
            this._boardEvents.emit(
                BoardEvent.NewTurn,
            );
            if (this._balanceShift !== 0) {
                this._balance += this._balanceShift;
                this._balance = Number.parseFloat(
                    this._balance.toFixed(2),
                );
                this._logger.log(
                    `World balance shifts towards ${
                        this._balanceShift < 0
                            ? "chaos"
                            : "law"
                    } by ${Number.parseInt(
                        Math.abs(
                            this._balanceShift * 100,
                        ).toFixed(2),
                        10,
                    )}%`,
                    this._balanceShift < 0
                        ? Colour.Magenta
                        : Colour.Cyan,
                );
                this._balanceShift = 0;
                await this.idleDelay(
                    Board.DEFAULT_DELAY,
                );
            }
            const anySpellsLeft = this.players.some(
                (p) =>
                    !p.defeated && p.spells.length > 0,
            );
            if (!anySpellsLeft) {
                this._logger.log(
                    `No spells to cast, skipping ` +
                        `to movement`,
                    Colour.Green,
                );
                pm.evaluate(new SkipSpellbook());
                pm.evaluate(new MovingReady());
                await this.idleDelay(
                    Board.END_TURN_DELAY,
                );
            } else {
                pm.evaluate(new SpellbookReady());
                await this.idleDelay(
                    Board.END_TURN_DELAY,
                );
            }
        } else if (
            pm.isActive(pm.states.spellbook)
        ) {
            const anySpellSelected =
                this.players.some(
                    (p) =>
                        !p.defeated && p.selectedSpell,
                );
            if (!anySpellSelected) {
                this._logger.log(
                    `No spells to cast, skipping ` +
                        `to movement`,
                    Colour.Green,
                );
                pm.evaluate(new NoSpellsCast());

                const previousPlayer =
                    this.currentPlayer;
                this.currentPlayer = null;

                await this.rules.doSpread(this);
                await this.rules.doExpire(this);

                this.currentPlayer = previousPlayer;
                this.emitBoardUpdateEvent();
            } else {
                pm.evaluate(new SpellsDone());
                pm.evaluate(new CastingReady());
                await this.idleDelay(
                    Board.END_TURN_DELAY,
                );
            }
        } else if (
            pm.isActive(pm.states.casting)
        ) {
            pm.evaluate(new CastingDone());

            const previousPlayer =
                this.currentPlayer;
            this.currentPlayer = null;

            await this.rules.doSpread(this);
            await this.rules.doExpire(this);

            this.currentPlayer = previousPlayer;
            this.emitBoardUpdateEvent();
        } else if (
            pm.isActive(pm.states.spreading)
        ) {
            pm.evaluate(new SpreadingDone());
            pm.evaluate(new MovingReady());
            await this.idleDelay(
                Board.END_TURN_DELAY,
            );
        }
        this.emitBoardUpdateEvent();
    }
```

- [ ] **Step 3: Add `nextPlayer` method**

Add this method after `newTurn`:

```typescript
    /**
     * Advance to the next player's turn. Engine
     * version handles player rotation, AI delegation,
     * and phase transitions. Client overrides to add
     * spellbook UI, player colours, cursor updates.
     */
    async nextPlayer(): Promise<void> {
        this.emitBoardUpdateEvent();
        while (true) {
            if (
                this.state ===
                    BoardState.GameOver ||
                (await this.checkWinCondition())
            ) {
                return;
            }

            this._currentPlayerIndex =
                (this._currentPlayerIndex + 1) %
                this._players.size;
            this.deselectPlayer();

            if (this._currentPlayerIndex === 0) {
                await this.newTurn();
            }

            const playerId = Array.from(
                this._players.keys(),
            )[this._currentPlayerIndex];
            if (
                this.getPlayer(playerId)?.defeated
            ) {
                continue;
            }

            await this.selectPlayer(playerId);

            // Spellbook phase
            if (
                this.phase === BoardPhase.Spellbook
            ) {
                if (
                    this.currentPlayer?.remote
                ) {
                    if (
                        await this.currentPlayer
                            .remote.selectSpell()
                    ) {
                        this._boardEvents.emit(
                            BoardEvent.SpellSelected,
                            this.currentPlayer,
                            this.currentPlayer
                                .selectedSpell,
                        );
                    }
                    continue;
                } else if (
                    this.currentPlayer?.spells
                        ?.length
                ) {
                    // Human has spells — client
                    // override opens spellbook UI
                    return;
                }
            }

            if (
                this.phase === BoardPhase.Spellbook
            ) {
                if (
                    this.currentPlayer?.spells
                        .length === 0
                ) {
                    continue;
                }
            }

            // Casting phase
            if (
                this.phase === BoardPhase.Casting
            ) {
                await this.selectWizard(
                    this.currentPlayer,
                );

                if (this.selected) {
                    const spell =
                        this.currentPlayer
                            ?.selectedSpell;
                    if (
                        spell?.properties?.autoPlace
                    ) {
                        this.stateManager.evaluate(
                            new SpellTargeting(),
                        );
                        await this.rules
                            .doAutoCastSpell(this);
                        this.emitBoardUpdateEvent();
                        continue;
                    } else if (spell?.range === 0) {
                        this.stateManager.evaluate(
                            new SpellTargeting(),
                        );
                        await this.rules
                            .doCastSpell(
                                this,
                                this.currentPlayer
                                    .castingPiece,
                            );
                        this.emitBoardUpdateEvent();
                        continue;
                    } else if (spell?.range > 0) {
                        this.stateManager.evaluate(
                            new SpellTargeting(),
                        );
                        this.events.emit(
                            EngineEvent.ShowCastRange,
                            {
                                position:
                                    this.selected
                                        .position,
                                range: spell.range,
                                lineOfSight:
                                    spell.lineOfSight,
                            },
                        );
                        if (
                            this.currentPlayer
                                ?.remote
                        ) {
                            if (
                                !(await this
                                    .currentPlayer
                                    .remote
                                    .castSpell())
                            ) {
                                console.log(
                                    "Remote player " +
                                        "could not " +
                                        "cast spell, " +
                                        "skipping...",
                                );
                            }
                            continue;
                        }
                    } else if (
                        spell?.range === -1
                    ) {
                        if (
                            this.currentPlayer
                                ?.remote
                        ) {
                            if (
                                !(await this
                                    .currentPlayer
                                    .remote
                                    .castSpell())
                            ) {
                                console.log(
                                    "Remote player " +
                                        "could not " +
                                        "cast spell, " +
                                        "skipping...",
                                );
                            }
                            continue;
                        }
                    }
                }

                if (
                    !this.currentPlayer
                        ?.selectedSpell
                ) {
                    continue;
                }
            }

            if (
                this.phase === BoardPhase.Moving &&
                this.currentPlayer?.remote
            ) {
                await this.currentPlayer.remote
                    .moveAllUnits();
                continue;
            }

            break;
        }
    }
```

- [ ] **Step 4: Add `selectPlayer` method stub if missing**

Check if engine Board has a `selectPlayer` method. If not, add it:

```typescript
    /**
     * Select a player by ID and set as current.
     * Client overrides to add visual selection.
     */
    async selectPlayer(
        playerId: number,
    ): Promise<void> {
        this._currentPlayer =
            this.getPlayer(playerId);
    }
```

- [ ] **Step 5: Add EngineEvent import to board.ts**

Add at the top of `packages/engine/src/board.ts`:

```typescript
import { EngineEvent } from "./enums/engineevent";
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/board.ts
git commit -m "feat(engine): add newTurn and nextPlayer to engine Board"
```

---

### Task 11: Convert spell `castFail` and `showRange` to events

**Files:**
- Modify: `packages/engine/src/spells/spell.ts`

- [ ] **Step 1: Add EngineEvent import**

At the top of `packages/engine/src/spells/spell.ts`, add:

```typescript
import { EngineEvent } from "../enums/engineevent";
```

- [ ] **Step 2: Convert `castFail`**

Replace the `castFail` method body (around line 601-610):

```typescript
    async castFail(
        owner: Player,
        castingPiece: Piece,
    ): Promise<void> {
        this._failed = true;
        this._castTimes = 0;
        this._board.events.emit(
            EngineEvent.EffectRequested,
            {
                type: EffectType.WizardCastFail,
                pieceId: castingPiece.id,
            },
        );
        await Board.delay(Board.DEFAULT_DELAY);
    }
```

- [ ] **Step 3: Convert `showRange`**

Replace the `showRange` method body (around line 615-626):

```typescript
    async showRange(
        show: boolean,
    ): Promise<void> {
        if (show) {
            this._board.events.emit(
                EngineEvent.ShowCastRange,
                {
                    position:
                        this._castingPiece.position,
                    range: this.range,
                    lineOfSight: this.lineOfSight,
                },
            );
            return;
        }
        this._board.events.emit(
            EngineEvent.ResetCastRange,
        );
    }
```

- [ ] **Step 4: Remove `CursorType` import if no longer used**

Check if `CursorType` is still referenced elsewhere in `spell.ts`. If the `showRange` method was the only consumer, remove it from the imports.

- [ ] **Step 5: Run spell tests**

Run: `npx vitest run packages/engine/src/spells/spell.test.ts --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass (test mocks `board.playEffect` which is already a mock function — now checking `board.events.emit` instead)

Note: If tests fail because they assert `board.playEffect` was called, update the test to assert `board.events.emit` was called with `EngineEvent.EffectRequested` instead.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/spells/spell.ts
git commit -m "refactor(engine): convert spell castFail and showRange to event emissions"
```

---

### Task 12: Convert AttackSpell `doCast` to events

**Files:**
- Modify: `packages/engine/src/spells/attackspell.ts`

- [ ] **Step 1: Add EngineEvent import**

```typescript
import { EngineEvent } from "../enums/engineevent";
```

- [ ] **Step 2: Replace all rendering calls**

Replace the `doCast` method body. Every `this._board.sound.play(x)` becomes `this._board.events.emit(EngineEvent.EffectRequested, { sound: x })`. Every `this._board.playEffect(type, start, end, piece)` becomes `this._board.events.emit(EngineEvent.EffectRequested, { type, pieceId: piece.id, startPieceId: castingPiece.id })`. Every `piece.sprite.getCenter()` is replaced by passing the piece's `id`.

Replace the full `doCast` method:

```typescript
    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Point,
        targets?: Piece[],
    ): Promise<Piece | boolean | null> {
        if (!targets?.length) {
            throw new Error(
                "No targets for attack spell",
            );
        }
        const target: Piece = targets.find((t) =>
            this.getValidTarget(t),
        );
        if (!target) {
            throw new Error(
                "No valid target for attack spell",
            );
        }
        let beamEffect: EffectType = null;
        let hitEffect: EffectType = null;
        let beamSound: string = null;
        let hitSound: string = null;

        switch (this._properties.projectile) {
            case UnitRangedProjectileType.Lightning:
                beamEffect =
                    EffectType.LightningBeam;
                hitEffect = EffectType.LightningHit;
                beamSound = "lightning4";
                hitSound = "lightningexplode";
                break;
            case UnitRangedProjectileType.MagicBolt:
                beamEffect =
                    EffectType.MagicBoltBeam;
                hitEffect =
                    EffectType.MagicBoltHit;
                beamSound = "magicbolt6";
                hitSound = "magicboltexplode";
                break;
            case UnitRangedProjectileType.Justice:
                hitEffect = EffectType.JusticeHit;
                hitSound = "justice";
                break;
            case UnitRangedProjectileType.DarkPower:
                hitEffect =
                    EffectType.DarkPowerHit;
                hitSound = "justice";
                break;
        }

        if (beamSound) {
            this._board.events.emit(
                EngineEvent.EffectRequested,
                { sound: beamSound },
            );
        }

        if (beamEffect) {
            this._board.events.emit(
                EngineEvent.EffectRequested,
                {
                    type: beamEffect,
                    pieceId: target.id,
                    startPieceId: castingPiece.id,
                },
            );
            await Board.delay(Board.DEFAULT_DELAY);
        }

        const rollSuccess: boolean =
            this._board.roll(
                this._properties.damage,
                target.stats.magicResistance,
                this._owner,
            );

        let targetKilled: boolean = false;

        if (hitSound) {
            this._board.events.emit(
                EngineEvent.EffectRequested,
                { sound: hitSound },
            );
        }
        if (hitEffect) {
            this._board.events.emit(
                EngineEvent.EffectRequested,
                {
                    type: hitEffect,
                    pieceId: target.id,
                },
            );
            await Board.delay(Board.DEFAULT_DELAY);
        }

        if (rollSuccess) {
            if (
                this.properties
                    .destroyWizardCreatures &&
                target.hasStatus(UnitStatus.Wizard)
            ) {
                this._board.events.emit(
                    EngineEvent.EffectRequested,
                    { sound: "justicesuccessful" },
                );
                await Board.delay(
                    Board.DEFAULT_DELAY,
                );
                await target.owner
                    .destroyCreations();
                this._board.logger.log(
                    `${target.fullName}'s creations` +
                        ` were dispelled by ` +
                        `${this.name}`,
                );
                await this._board.idleDelay(
                    Board.DEFAULT_DELAY,
                );
            } else {
                this._board.events.emit(
                    EngineEvent.EffectRequested,
                    { sound: "killcreature" },
                );
                await target.kill();
                targetKilled = true;
            }
        }

        if (targetKilled) {
            this._board.logger.log(
                `${target.fullName} was defeated` +
                    ` by ${this.name}`,
                Colour.Red,
            );
        }

        return true;
    }
```

- [ ] **Step 3: Run attack spell tests**

Run: `npx vitest run packages/engine/src/spells/attackspell.test.ts --reporter=verbose 2>&1 | tail -5`

If tests assert `board.playEffect` was called, update them to assert `board.events.emit` was called with `EngineEvent.EffectRequested` instead. Similarly for `board.sound.play` calls.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/spells/attackspell.ts
git commit -m "refactor(engine): convert AttackSpell doCast to event emissions"
```

---

### Task 13: Convert DisbelieveSpell `doCast` to events

**Files:**
- Modify: `packages/engine/src/spells/disbelievespell.ts`

- [ ] **Step 1: Add EngineEvent import**

```typescript
import { EngineEvent } from "../enums/engineevent";
```

- [ ] **Step 2: Replace rendering calls**

Replace the full `doCast` method:

```typescript
    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Point,
        targets?: Piece[],
    ): Promise<Piece | boolean | null> {
        const target: Piece = targets.find(
            (p: Piece) => p.canBeDisbelieved,
        );
        if (!target) {
            return false;
        }
        this._board.events.emit(
            EngineEvent.EffectRequested,
            { sound: "castloop08" },
        );
        this._board.events.emit(
            EngineEvent.EffectRequested,
            {
                type: EffectType.DisbelieveBeam,
                pieceId: target.id,
                startPieceId: castingPiece.id,
            },
        );
        await Board.delay(Board.DEFAULT_DELAY);
        if (target.illusion) {
            this._board.events.emit(
                EngineEvent.EffectRequested,
                { sound: "disbelieve" },
            );
            await target.kill();
            this._board.logger.log(
                `Disbelieve succeeded on ` +
                    `illusionary ${target.name}`,
            );
        } else {
            this._board.logger.log(
                `Disbelieve failed on ` +
                    `non-illusionary ` +
                    `${target.name}`,
                Colour.Magenta,
            );
            this._board.players.forEach(
                (player: Player) => {
                    player.ai
                        ?.rememberNonIllusionPiece(
                            target.id,
                        );
                },
            );
        }
        await this._board.idleDelay(
            Board.DEFAULT_DELAY,
        );
        return true;
    }
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run packages/engine/src/spells/ --reporter=verbose 2>&1 | tail -5`
Expected: All spell tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/spells/disbelievespell.ts
git commit -m "refactor(engine): convert DisbelieveSpell doCast to event emissions"
```

---

### Task 14: Convert RaiseDeadSpell `doCast` to events

**Files:**
- Modify: `packages/engine/src/spells/raisedeadspell.ts`

- [ ] **Step 1: Add EngineEvent import**

```typescript
import { EngineEvent } from "../enums/engineevent";
```

- [ ] **Step 2: Replace rendering calls**

Replace the full `doCast` method:

```typescript
    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Point,
        targets?: Piece[],
    ): Promise<Piece | boolean | null> {
        const target: Piece = targets.find(
            (p: Piece) => p.dead,
        );
        if (!target) {
            return false;
        }
        this._board.events.emit(
            EngineEvent.EffectRequested,
            { sound: "castloop08" },
        );
        this._board.events.emit(
            EngineEvent.EffectRequested,
            {
                type: EffectType.RaiseDeadBeam,
                pieceId: target.id,
                startPieceId: castingPiece.id,
            },
        );
        await Board.delay(Board.DEFAULT_DELAY);
        this._board.events.emit(
            EngineEvent.EffectRequested,
            { sound: "spelleffect" },
        );
        this._board.events.emit(
            EngineEvent.EffectRequested,
            {
                type: EffectType.RaiseDeadHit,
                pieceId: target.id,
            },
        );
        await Board.delay(Board.DEFAULT_DELAY);
        await target.raiseDead(this.owner);
        this._board.logger.log(
            `${target.name} was reanimated and ` +
                `now belongs to ${owner.name}`,
            Colour.LightBlue,
        );

        this._board.players.forEach(
            (player: Player) => {
                player.ai
                    ?.rememberNonIllusionPiece(
                        target.id,
                    );
            },
        );

        await this._board.idleDelay(
            Board.DEFAULT_DELAY,
        );
        return true;
    }
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/spells/raisedeadspell.ts
git commit -m "refactor(engine): convert RaiseDeadSpell doCast to event emissions"
```

---

### Task 15: Convert StatusEffectSpell `doCast` to events

**Files:**
- Modify: `packages/engine/src/spells/statuseffectspell.ts`

- [ ] **Step 1: Add EngineEvent import**

```typescript
import { EngineEvent } from "../enums/engineevent";
```

- [ ] **Step 2: Replace rendering calls**

Replace the full `doCast` method:

```typescript
    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Point,
        targets?: Piece[],
    ): Promise<Piece | boolean | null> {
        const target: Piece = targets.find(
            (p: Piece) =>
                p.type === UnitType.Wizard &&
                p.owner === this.owner,
        );
        if (!target) {
            return false;
        }

        this._board.events.emit(
            EngineEvent.EffectRequested,
            { sound: "spelleffect" },
        );
        this._board.events.emit(
            EngineEvent.EffectRequested,
            {
                type: EffectType.WizardCasting,
                pieceId: target.id,
            },
        );
        await Board.delay(Board.DEFAULT_DELAY);

        if (
            this.properties.id in
            StatusEffectSpell.STATUS_MAP
        ) {
            if (
                !target.addStatus(
                    StatusEffectSpell.STATUS_MAP[
                        this.properties.id
                    ],
                )
            ) {
                this._board.logger.log(
                    `${target.name} already has ` +
                        `${this.name} - this spell` +
                        ` has no effect`,
                    Colour.Magenta,
                );
                await this._board.idleDelay(
                    Board.DEFAULT_DELAY,
                );
                return true;
            }
        }

        this._board.logger.log(
            `${target.name} successfully casts ` +
                `'${this.name}'`,
            Colour.Green,
        );

        await this._board.idleDelay(
            Board.DEFAULT_DELAY,
        );
        return true;
    }
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/spells/statuseffectspell.ts
git commit -m "refactor(engine): convert StatusEffectSpell doCast to event emissions"
```

---

### Task 16: Convert SubversionSpell `doCast` to events

**Files:**
- Modify: `packages/engine/src/spells/subversionspell.ts`

- [ ] **Step 1: Add EngineEvent import**

```typescript
import { EngineEvent } from "../enums/engineevent";
```

- [ ] **Step 2: Replace rendering calls**

Replace the full `doCast` method:

```typescript
    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Point,
        targets?: Piece[],
    ): Promise<Piece | boolean | null> {
        const target: Piece = targets.find(
            (p: Piece) => p.owner !== this.owner,
        );
        if (!target) {
            return false;
        }

        const rollSuccess: boolean =
            this._board.roll(
                10,
                target.stats.magicResistance,
                this._owner,
            );

        this._board.events.emit(
            EngineEvent.EffectRequested,
            { sound: "castloop08" },
        );
        this._board.events.emit(
            EngineEvent.EffectRequested,
            {
                type: EffectType.SubversionBeam,
                pieceId: target.id,
                startPieceId: castingPiece.id,
            },
        );
        await Board.delay(Board.DEFAULT_DELAY);
        if (rollSuccess && !target.illusion) {
            this._board.events.emit(
                EngineEvent.EffectRequested,
                { sound: "spelleffect" },
            );
            this._board.events.emit(
                EngineEvent.EffectRequested,
                {
                    type: EffectType.SubversionHit,
                    pieceId: target.id,
                },
            );
            await Board.delay(Board.DEFAULT_DELAY);
            target.owner = this.owner;
            this._board.logger.log(
                `${target.name} was subverted ` +
                    `and now belongs to ` +
                    `${owner.name}`,
            );
        } else {
            this._board.logger.log(
                `${target.name} resisted ` +
                    `${this.name}`,
                Colour.Magenta,
            );
        }
        await this._board.idleDelay(
            Board.DEFAULT_DELAY,
        );
        return true;
    }
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/spells/subversionspell.ts
git commit -m "refactor(engine): convert SubversionSpell doCast to event emissions"
```

---

### Task 17: Convert SummonSpell `doCast` and `autoCast` to events

**Files:**
- Modify: `packages/engine/src/spells/summonspell.ts`

- [ ] **Step 1: Add EngineEvent import**

```typescript
import { EngineEvent } from "../enums/engineevent";
```

- [ ] **Step 2: Replace rendering calls in `doCast`**

In the `doCast` method (around line 144-199), replace:

```typescript
// Before:
this._board.sound.play("castloop08");
await this._board.playEffect(
    EffectType.WizardCasting,
    castingPiece.sprite.getCenter(),
);
// After:
this._board.events.emit(
    EngineEvent.EffectRequested,
    { sound: "castloop08" },
);
this._board.events.emit(
    EngineEvent.EffectRequested,
    {
        type: EffectType.WizardCasting,
        pieceId: castingPiece.id,
    },
);
await Board.delay(Board.DEFAULT_DELAY);
```

```typescript
// Before:
await this._board.playEffect(
    EffectType.WizardCastBeam,
    castingPiece.sprite.getCenter(),
    this._board.getIsoPosition(point),
    castingPiece,
);
// After:
this._board.events.emit(
    EngineEvent.EffectRequested,
    {
        type: EffectType.WizardCastBeam,
        pieceId: castingPiece.id,
        startPieceId: castingPiece.id,
        targetPosition: {
            x: point.x,
            y: point.y,
        },
    },
);
await Board.delay(Board.DEFAULT_DELAY);
```

```typescript
// Before:
this._board.sound.play("spelleffect");
await this._board.playEffect(
    EffectType.SummonPiece,
    this._board.getIsoPosition(point),
    null,
    newPiece,
);
// After:
this._board.events.emit(
    EngineEvent.EffectRequested,
    { sound: "spelleffect" },
);
this._board.events.emit(
    EngineEvent.EffectRequested,
    {
        type: EffectType.SummonPiece,
        pieceId: newPiece.id,
        targetPosition: {
            x: point.x,
            y: point.y,
        },
    },
);
await Board.delay(Board.DEFAULT_DELAY);
```

- [ ] **Step 3: Replace rendering calls in `autoCast`**

In the `autoCast` method, replace every `this._board.sound.play("cancel")` with:

```typescript
this._board.events.emit(
    EngineEvent.EffectRequested,
    { sound: "cancel" },
);
```

There are approximately 3 occurrences (around lines 251, 293, and any others).

- [ ] **Step 4: Run summon spell tests**

Run: `npx vitest run packages/engine/src/spells/summonspell.test.ts --reporter=verbose 2>&1 | tail -5`

If tests assert `board.sound.play` or `board.playEffect` was called, update them to assert `board.events.emit` was called with `EngineEvent.EffectRequested` instead.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/spells/summonspell.ts
git commit -m "refactor(engine): convert SummonSpell doCast and autoCast to event emissions"
```

---

### Task 18: Convert TurmoilSpell `doCast` to events

**Files:**
- Modify: `packages/engine/src/spells/turmoilspell.ts`

- [ ] **Step 1: Add EngineEvent import**

```typescript
import { EngineEvent } from "../enums/engineevent";
```

- [ ] **Step 2: Replace rendering calls**

Replace the full `doCast` method. The key change: `piece.sprite.getCenter()` and `this._board.getIsoPosition(randomEmptySpace)` are replaced with event data carrying piece IDs and logical positions:

```typescript
    async doCast(
        owner: Player,
        castingPiece: Piece,
        point?: Point,
        targets?: Piece[],
    ): Promise<Piece | boolean | null> {
        const target: Piece = targets.find(
            (p: Piece) =>
                p.type === UnitType.Wizard &&
                p.owner === this.owner,
        );
        if (!target) {
            return false;
        }

        this._board.events.emit(
            EngineEvent.EffectRequested,
            { sound: "spelleffect" },
        );
        this._board.events.emit(
            EngineEvent.EffectRequested,
            {
                type: EffectType.WizardCasting,
                pieceId: target.id,
            },
        );
        await Board.delay(Board.DEFAULT_DELAY);

        for (const piece of this._board.pieces
            .filter(
                (p: Piece) =>
                    !p.dead &&
                    !p.currentMount &&
                    !p.engulfed,
            )) {
            const randomEmptySpace: Point =
                this._board.getRandomEmptySpace();
            if (randomEmptySpace) {
                this._board.events.emit(
                    EngineEvent.EffectRequested,
                    { sound: "spelleffect" },
                );
                const oldPosition = {
                    x: piece.position.x,
                    y: piece.position.y,
                };
                await piece.moveTo(
                    randomEmptySpace,
                    500,
                );
                this._board.events.emit(
                    EngineEvent.EffectRequested,
                    {
                        type: EffectType.TurmoilBeam,
                        pieceId: piece.id,
                        startPosition: oldPosition,
                        targetPosition: {
                            x: randomEmptySpace.x,
                            y: randomEmptySpace.y,
                        },
                    },
                );
                await Board.delay(
                    Board.DEFAULT_DELAY,
                );
            }
        }

        this._board.logger.log(
            `${target.name} successfully casts ` +
                `'${this.name}'`,
            Colour.Green,
        );

        await this._board.idleDelay(
            Board.DEFAULT_DELAY,
        );
        return true;
    }
```

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/spells/turmoilspell.ts
git commit -m "refactor(engine): convert TurmoilSpell doCast to event emissions"
```

---

### Task 19: Add `ResetCastRange` handler to client Board

**Files:**
- Modify: `src/gameobjects/board.ts`

- [ ] **Step 1: Add event handler**

In the engine event subscriptions block of `src/gameobjects/board.ts` (after the existing `ShowCastRange` handler), add:

```typescript
        this.events.on(
            EngineEvent.ResetCastRange,
            () => {
                this.rangeGizmo.reset();
            },
        );
```

- [ ] **Step 2: Update `EffectRequested` handler for new event data shape**

The spell events now pass `pieceId`, `startPieceId`, `targetPosition`, and `startPosition` instead of raw pixel coordinates. Update the `EffectRequested` handler to resolve these:

```typescript
        this.events.on(
            EngineEvent.EffectRequested,
            async (data: {
                type?: EffectType;
                pieceId?: number;
                startPieceId?: number;
                targetPosition?: {
                    x: number;
                    y: number;
                };
                startPosition?: {
                    x: number;
                    y: number;
                };
                sound?: string;
            }) => {
                if (data.sound) {
                    this.sound.play(data.sound);
                }
                if (data.type) {
                    const piece = data.pieceId
                        ? this.getPiece(
                              data.pieceId,
                          )
                        : null;
                    const startPiece =
                        data.startPieceId
                            ? this.getPiece(
                                  data.startPieceId,
                              )
                            : null;
                    const endPos = piece
                        ? (piece as Piece).sprite
                              .getCenter()
                        : data.targetPosition
                          ? this.getIsoPosition(
                                new Geom.Point(
                                    data.targetPosition
                                        .x,
                                    data.targetPosition
                                        .y,
                                ),
                            )
                          : null;
                    const startPos = startPiece
                        ? (startPiece as Piece)
                              .sprite.getCenter()
                        : data.startPosition
                          ? this.getIsoPosition(
                                new Geom.Point(
                                    data.startPosition
                                        .x,
                                    data.startPosition
                                        .y,
                                ),
                            )
                          : null;
                    await this.playEffect(
                        data.type,
                        startPos || endPos,
                        startPos ? endPos : null,
                        piece as Piece,
                    );
                }
            },
        );
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/gameobjects/board.ts
git commit -m "feat(client): add ResetCastRange handler and expand EffectRequested handler"
```

---

### Task 20: Fix remaining spell test mocks

**Files:**
- Modify: `packages/engine/src/spells/attackspell.test.ts`
- Modify: `packages/engine/src/spells/summonspell.test.ts`
- Modify: `packages/engine/src/spells/spell.test.ts`

After the spell doCast methods now emit events instead of calling `board.sound.play` and `board.playEffect` directly, any tests that assert on those mock functions need updating.

- [ ] **Step 1: Update mock boards in test files**

In each test file, ensure the mock board has `events: { emit: vi.fn() }`. If a test asserts `board.playEffect` was called, change it to assert `board.events.emit` was called with `EngineEvent.EffectRequested` as the first argument. If a test asserts `board.sound.play` was called, change it to assert `board.events.emit` was called with `EngineEvent.EffectRequested` and `{ sound: "expectedSound" }`.

For example, in `attackspell.test.ts`:

```typescript
// Before:
expect(board.playEffect).toHaveBeenCalledTimes(2);
// After:
expect(board.events.emit).toHaveBeenCalledWith(
    EngineEvent.EffectRequested,
    expect.objectContaining({ type: expect.anything() }),
);
```

- [ ] **Step 2: Run all spell tests**

Run: `npx vitest run packages/engine/src/spells/ --reporter=verbose 2>&1 | tail -10`
Expected: All spell tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/spells/*.test.ts
git commit -m "test(engine): update spell test mocks for event-based rendering"
```

---

### Task 21: Run build and verify zero errors

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -10`
Expected: All 1213+ tests pass

- [ ] **Step 2: Run TypeScript build**

Run: `npm run build 2>&1 | grep -c "error TS"` or equivalent to count remaining errors.

Expected: Zero errors from `src/gameobjects/` and `packages/engine/src/`. Only pre-existing `@steelbreeze/types` errors in `node_modules/` should remain.

- [ ] **Step 3: Verify no Phaser imports in engine**

Run: `grep -r "from ['\"]phaser['\"]" packages/engine/src/ | grep -v node_modules | grep -v ".test."`
Expected: No matches

- [ ] **Step 4: Commit (if any fixups needed)**

If verification revealed issues that required fixes, commit those fixes:

```bash
git add -A
git commit -m "fix: address remaining build errors from type compat work"
```
