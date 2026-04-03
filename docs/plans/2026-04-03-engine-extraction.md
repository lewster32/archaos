# Engine Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all game logic from the current Phaser-coupled codebase into a pure TypeScript `packages/engine/` workspace package with zero Phaser dependencies, restructure the repo as a monorepo, and rewire the client to import from the engine.

**Architecture:** The existing `src/gameobjects/` code is split into engine (pure logic) and client (rendering). The engine defines its own `Point` type, lightweight `EventEmitter`, and pure-TS `GameRNG` to replace Phaser equivalents. The client imports engine types and wraps them with Phaser rendering. Local play continues to work identically — only the import paths change.

**Tech Stack:** TypeScript 5, npm workspaces, Vitest, @steelbreeze/state

---

## File Structure

After extraction, the repo will look like this:

```
archaos/
├── packages/
│   ├── engine/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts                  ← barrel export
│   │       ├── point.ts                  ← {x, y} replacement for Geom.Point
│   │       ├── events.ts                 ← lightweight typed EventEmitter
│   │       ├── models/
│   │       │   ├── model.ts
│   │       │   └── entity.ts
│   │       ├── board.ts                  ← headless board (state + turn orchestration, no rendering)
│   │       ├── piece.ts                  ← game logic only (stats, status, combat validation)
│   │       ├── wizard.ts                 ← wizard logic (wizcode, properties, extends piece)
│   │       ├── player.ts
│   │       ├── phasemachine.ts           ← renamed from statemanager.ts
│   │       ├── rules.ts                  ← action validation + state mutation
│   │       ├── rng.ts                    ← IRNG, GameRNG (pure TS PRNG), TestRNG
│   │       ├── pathfinding.ts            ← extracted from rangegizmo.ts
│   │       ├── combat.ts                 ← attack resolution extracted from board/piece
│   │       ├── spreading.ts              ← spread logic extracted from board
│   │       ├── logger.ts
│   │       ├── ai/
│   │       │   └── computerwizard.ts
│   │       ├── spells/
│   │       │   ├── spell.ts
│   │       │   ├── attackspell.ts
│   │       │   ├── summonspell.ts
│   │       │   ├── disbelievespell.ts
│   │       │   ├── raisedeadspell.ts
│   │       │   ├── statuseffectspell.ts
│   │       │   ├── subversionspell.ts
│   │       │   ├── turmoilspell.ts
│   │       │   ├── spellfactory.ts
│   │       │   └── spellutils.ts
│   │       ├── enums/                    ← all 18 enum files, unchanged
│   │       ├── configs/                  ← piececonfig.ts, playerconfig.ts, spellconfig.ts
│   │       └── interfaces/               ← remoteplayer.ts, remotewizard.ts, unitproperties.ts, wizcode.ts, ui.ts
│   └── client/                           ← current src/ minus extracted logic
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── game/                     ← game-scene.ts, game.ts (unchanged)
│           ├── gameobjects/
│           │   ├── boardview.ts          ← Phaser rendering, layers, camera, effects, sound
│           │   ├── pieceview.ts          ← sprite wrapper, animations, reads engine Piece
│           │   ├── wizardview.ts         ← wizard rendering, extends pieceview
│           │   ├── wizardsprite.ts       ← unchanged
│           │   ├── cursor.ts             ← unchanged (rendering + input)
│           │   ├── rangegizmo.ts         ← visual-only (pathfinding extracted)
│           │   ├── effectemitter.ts      ← unchanged
│           │   └── soundeffects.ts       ← unchanged
│           └── components/               ← Vue SFCs (unchanged)
├── assets/                               ← shared game data
├── package.json                          ← workspace root
├── tsconfig.json                         ← root tsconfig with project references
├── vitest.config.ts                      ← root vitest config (runs all workspace tests)
└── vite.config.mjs                       ← client build config
```

**Key decisions:**
- Engine files are **moved, not copied** — git tracks the rename for history preservation.
- Enums, configs, and interfaces move as-is (zero Phaser imports).
- `Geom.Point` is replaced by a simple `Point` type (`{ x: number; y: number }`).
- `Phaser.Events.EventEmitter` in Logger is replaced by a lightweight custom emitter.
- `GameRNG` is reimplemented with a pure TS PRNG (linear congruential or similar seedable algo), keeping the `IRNG` interface unchanged.
- `Piece`, `Wizard`, and `Board` are **split**: logic goes to engine, rendering stays in client as `*View` wrappers.

---

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/src/index.ts`
- Modify: `package.json` (workspace root)
- Modify: `tsconfig.json` (root — add project references)

- [ ] **Step 1: Create workspace root config**

Add `workspaces` to the root `package.json`:

```json
{
    "name": "archaos",
    "private": true,
    "workspaces": ["packages/*"],
    "scripts": {
        "test": "vitest",
        "test:engine": "npm test --workspace=packages/engine",
        "test:client": "npm test --workspace=packages/client",
        "lint": "oxlint",
        "lint:fix": "oxlint --fix",
        "fmt": "oxfmt --write .",
        "fmt:check": "oxfmt --check ."
    },
    "devDependencies": {
        "oxfmt": "^0.41.0",
        "oxlint": "^1.56.0",
        "typescript": "^5.9",
        "vitest": "^4.1.0",
        "@vitest/coverage-v8": "^4.1.0"
    }
}
```

- [ ] **Step 2: Create engine package.json**

```json
{
    "name": "@archaos/engine",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "main": "src/index.ts",
    "types": "src/index.ts",
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest"
    },
    "dependencies": {
        "@steelbreeze/state": "^8.3.1"
    },
    "devDependencies": {
        "typescript": "^5.9",
        "vitest": "^4.1.0",
        "@vitest/coverage-v8": "^4.1.0"
    }
}
```

- [ ] **Step 3: Create engine tsconfig.json**

```json
{
    "compilerOptions": {
        "target": "ESNext",
        "module": "ESNext",
        "lib": ["ESNext"],
        "moduleResolution": "Bundler",
        "strict": false,
        "sourceMap": true,
        "resolveJsonModule": true,
        "esModuleInterop": true,
        "noEmit": true,
        "noImplicitReturns": true,
        "useDefineForClassFields": true,
        "composite": true,
        "declaration": true,
        "declarationMap": true
    },
    "include": ["src/**/*.ts"],
    "exclude": ["src/**/*.test.ts"]
}
```

Note: no `"DOM"` in `lib` — this enforces no browser APIs in engine code.

- [ ] **Step 4: Create engine vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "engine",
        include: ["src/**/*.test.ts"],
    },
});
```

No jsdom, no canvas mocks, no Phaser setup — pure Node.js.

- [ ] **Step 5: Create placeholder barrel export**

Create `packages/engine/src/index.ts`:

```typescript
// @archaos/engine — headless game logic
// Modules will be re-exported here as they are extracted.
```

- [ ] **Step 6: Update root tsconfig.json with project references**

```json
{
    "references": [
        { "path": "packages/engine" },
        { "path": "packages/client" }
    ],
    "files": []
}
```

The root tsconfig becomes a project-references-only file. Each package has its own.

- [ ] **Step 7: Run `npm install` to set up workspaces**

Run: `npm install`
Expected: `node_modules` created with workspace symlinks. `packages/engine` is linked.

- [ ] **Step 8: Verify engine test runner works**

Create a trivial test to confirm setup:

Create `packages/engine/src/smoke.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("engine smoke test", () => {
    it("runs in pure Node (no DOM)", () => {
        expect(typeof window).toBe("undefined");
        expect(1 + 1).toBe(2);
    });
});
```

Run: `npm run test:engine`
Expected: PASS. No jsdom, no Phaser.

- [ ] **Step 9: Delete smoke test, commit**

```bash
git rm packages/engine/src/smoke.test.ts
git add .
git commit -m "feat: set up monorepo workspace with engine package"
```

---

### Task 2: Shared Primitives (Point, EventEmitter)

**Files:**
- Create: `packages/engine/src/point.ts`
- Create: `packages/engine/src/point.test.ts`
- Create: `packages/engine/src/events.ts`
- Create: `packages/engine/src/events.test.ts`

These replace `Phaser.Geom.Point` and `Phaser.Events.EventEmitter` throughout the engine.

- [ ] **Step 1: Write Point test**

Create `packages/engine/src/point.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Point } from "./point";

describe("Point", () => {
    it("creates a point with x and y", () => {
        const p = new Point(3, 5);
        expect(p.x).toBe(3);
        expect(p.y).toBe(5);
    });

    it("setTo updates coordinates", () => {
        const p = new Point(0, 0);
        p.setTo(4, 7);
        expect(p.x).toBe(4);
        expect(p.y).toBe(7);
    });

    it("equals compares by value", () => {
        expect(Point.equals(new Point(1, 2), new Point(1, 2)))
            .toBe(true);
        expect(Point.equals(new Point(1, 2), new Point(3, 4)))
            .toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:engine`
Expected: FAIL — `./point` module not found.

- [ ] **Step 3: Implement Point**

Create `packages/engine/src/point.ts`:

```typescript
/**
 * A simple 2D point. Replaces Phaser.Geom.Point in the
 * engine so that game logic has no Phaser dependency.
 */
export class Point {
    x: number;
    y: number;

    constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }

    setTo(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
    }

    static equals(a: Point, b: Point): boolean {
        return a.x === b.x && a.y === b.y;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:engine`
Expected: PASS.

- [ ] **Step 5: Write EventEmitter test**

Create `packages/engine/src/events.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "./events";

describe("EventEmitter", () => {
    it("calls listeners on emit", () => {
        const emitter = new EventEmitter();
        const fn = vi.fn();
        emitter.on("test", fn);
        emitter.emit("test", { value: 42 });
        expect(fn).toHaveBeenCalledWith({ value: 42 });
    });

    it("removes a listener with off", () => {
        const emitter = new EventEmitter();
        const fn = vi.fn();
        emitter.on("test", fn);
        emitter.off("test", fn);
        emitter.emit("test");
        expect(fn).not.toHaveBeenCalled();
    });

    it("removeAllListeners clears everything", () => {
        const emitter = new EventEmitter();
        const fn = vi.fn();
        emitter.on("a", fn);
        emitter.on("b", fn);
        emitter.removeAllListeners();
        emitter.emit("a");
        emitter.emit("b");
        expect(fn).not.toHaveBeenCalled();
    });

    it("once fires only once", () => {
        const emitter = new EventEmitter();
        const fn = vi.fn();
        emitter.once("test", fn);
        emitter.emit("test");
        emitter.emit("test");
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test:engine`
Expected: FAIL — `./events` module not found.

- [ ] **Step 7: Implement EventEmitter**

Create `packages/engine/src/events.ts`:

```typescript
type Listener = (...args: any[]) => void;

/**
 * Lightweight event emitter for the engine. Replaces
 * Phaser.Events.EventEmitter so engine code has no Phaser
 * dependency. API is a subset of Phaser's emitter.
 */
export class EventEmitter {
    private _listeners = new Map<string, Set<Listener>>();

    on(event: string, fn: Listener): this {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event)!.add(fn);
        return this;
    }

    once(event: string, fn: Listener): this {
        const wrapper: Listener = (...args) => {
            this.off(event, wrapper);
            fn(...args);
        };
        return this.on(event, wrapper);
    }

    off(event: string, fn: Listener): this {
        this._listeners.get(event)?.delete(fn);
        return this;
    }

    emit(event: string, ...args: any[]): this {
        for (const fn of this._listeners.get(event) ?? []) {
            fn(...args);
        }
        return this;
    }

    removeAllListeners(): this {
        this._listeners.clear();
        return this;
    }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test:engine`
Expected: PASS — all Point and EventEmitter tests green.

- [ ] **Step 9: Export from barrel and commit**

Update `packages/engine/src/index.ts`:

```typescript
export { Point } from "./point";
export { EventEmitter } from "./events";
```

```bash
git add packages/engine/src/point.ts packages/engine/src/point.test.ts \
       packages/engine/src/events.ts packages/engine/src/events.test.ts \
       packages/engine/src/index.ts
git commit -m "feat(engine): add Point and EventEmitter primitives"
```

---

### Task 3: Move Enums, Configs, and Interfaces

**Files:**
- Move: `src/gameobjects/enums/*.ts` → `packages/engine/src/enums/`
- Move: `src/gameobjects/configs/*.ts` → `packages/engine/src/configs/`
- Move: `src/gameobjects/interfaces/*.ts` → `packages/engine/src/interfaces/`
- Move: corresponding test files

All 18 enum files, 3 config files, and 5 interface files have zero Phaser imports. They move as-is.

- [ ] **Step 1: Move enum files**

```bash
mkdir -p packages/engine/src/enums
git mv src/gameobjects/enums/*.ts packages/engine/src/enums/
```

- [ ] **Step 2: Move config files**

```bash
mkdir -p packages/engine/src/configs
git mv src/gameobjects/configs/*.ts packages/engine/src/configs/
```

- [ ] **Step 3: Move interface files**

```bash
mkdir -p packages/engine/src/interfaces
git mv src/gameobjects/interfaces/*.ts packages/engine/src/interfaces/
```

- [ ] **Step 4: Fix import paths within moved files**

The interface files have relative imports to `../piece` and `../../gameobjects/spells/spell`. These will need updating to point to the engine-internal paths once Piece and Spell are moved in later tasks. For now, create temporary type-only stubs if needed to keep the engine compiling, or adjust imports to use the engine's eventual paths.

Key files to check:
- `interfaces/remoteplayer.ts` — imports `Piece` from `../piece`
- `interfaces/ui.ts` — imports `Spell` from `../../gameobjects/spells/spell`, `Piece` from `../piece`, `UnitProperties` from `./unitproperties`
- `interfaces/unitproperties.ts` — imports enum types (will resolve once enums are in place)

The `UnitProperties` import is internal and will resolve. The `Piece` and `Spell` imports should be updated to reference the engine path (`../piece`, `../spells/spell`) — these files will be moved in Tasks 6 and 7.

- [ ] **Step 5: Move existing enum/config/interface test files**

Check for and move any test files that exist alongside these:

```bash
# Move any test files in enums/configs/interfaces
git mv src/gameobjects/enums/*.test.ts packages/engine/src/enums/ 2>/dev/null || true
git mv src/gameobjects/configs/*.test.ts packages/engine/src/configs/ 2>/dev/null || true
git mv src/gameobjects/interfaces/*.test.ts packages/engine/src/interfaces/ 2>/dev/null || true
```

- [ ] **Step 6: Add to barrel export**

Update `packages/engine/src/index.ts` to re-export all enums, configs, and interfaces. Example:

```typescript
export { Point } from "./point";
export { EventEmitter } from "./events";

// Enums
export { ActionType } from "./enums/actiontype";
export { BoardEvent } from "./enums/boardevent";
export { BoardLayer } from "./enums/boardlayer";
export { BoardPhase } from "./enums/boardphase";
export { BoardState } from "./enums/boardstate";
export { Colour } from "./enums/colour";
export { CursorType } from "./enums/cursortype";
export { EventType } from "./enums/eventtype";
export { InputType } from "./enums/inputtype";
export { RangeType } from "./enums/rangetype";
export { SpellTarget } from "./enums/spelltarget";
export { SpellType } from "./enums/spelltype";
export { SpreadAction } from "./enums/spreadaction";
export { UnitAttackType } from "./enums/unitattacktype";
export { UnitDirection } from "./enums/unitdirection";
export { UnitRangedProjectileType } from "./enums/unitrangedprojectiletype";
export { UnitStatus } from "./enums/unitstatus";
export { UnitType } from "./enums/unittype";

// Configs
export type { PieceConfig } from "./configs/piececonfig";
export type { PlayerConfig } from "./configs/playerconfig";
export type { SpellConfig } from "./configs/spellconfig";

// Interfaces
export type { RemotePlayer } from "./interfaces/remoteplayer";
export type { UnitProperties, IUnitStats } from "./interfaces/unitproperties";
export type { WizCode } from "./interfaces/wizcode";
```

Note: `ui.ts` interfaces may stay partially in the client if they reference Phaser-specific UI concepts. Evaluate during this step — game-logic interfaces (SetupData, GameScenarioData, etc.) go to engine; Phaser-UI-specific interfaces (SpellbookData with callback references) may stay in client.

- [ ] **Step 7: Run engine tests**

Run: `npm run test:engine`
Expected: PASS — enums and interfaces have no logic to test, but any moved test files should pass.

- [ ] **Step 8: Update client imports**

All files in `src/` that imported from `./gameobjects/enums/`, `./gameobjects/configs/`, or `./gameobjects/interfaces/` need to update their import paths to `@archaos/engine`. This is a bulk find-and-replace operation.

Search for patterns like:
- `from "../enums/` → `from "@archaos/engine"`
- `from "../../gameobjects/enums/` → `from "@archaos/engine"`
- `from "../configs/` → `from "@archaos/engine"`
- `from "../interfaces/` → `from "@archaos/engine"`

Verify the client still compiles after updating imports.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: move enums, configs, and interfaces to engine package"
```

---

### Task 4: Move Pure Models (Model, Entity, RNG)

**Files:**
- Move: `src/gameobjects/model.ts` → `packages/engine/src/models/model.ts`
- Move: `src/gameobjects/entity.ts` → `packages/engine/src/models/entity.ts`
- Move: `src/gameobjects/rng.ts` → `packages/engine/src/rng.ts`
- Move: corresponding test files
- Modify: `entity.ts` to use engine `Point` instead of `Geom.Point`
- Modify: `rng.ts` to use a pure TS PRNG instead of Phaser's `RandomDataGenerator`

- [ ] **Step 1: Move Model (no changes needed)**

```bash
mkdir -p packages/engine/src/models
git mv src/gameobjects/model.ts packages/engine/src/models/model.ts
git mv src/gameobjects/model.test.ts packages/engine/src/models/model.test.ts
```

- [ ] **Step 2: Run engine test for Model**

Run: `npm run test:engine -- --run src/models/model.test.ts`
Expected: PASS — Model has zero Phaser imports.

- [ ] **Step 3: Move and modify Entity**

```bash
git mv src/gameobjects/entity.ts packages/engine/src/models/entity.ts
git mv src/gameobjects/entity.test.ts packages/engine/src/models/entity.test.ts
```

Edit `packages/engine/src/models/entity.ts` — replace Phaser `Geom.Point` with engine `Point`:

```typescript
// BEFORE
import { Geom } from "phaser";
// ...
private readonly _position: Geom.Point;
// ...
this._position = new Geom.Point(x, y);

// AFTER
import { Point } from "../point";
// ...
private readonly _position: Point;
// ...
this._position = new Point(x, y);
```

The `position` getter/setter return type changes from `Geom.Point` to `Point`. The `setTo` method is compatible (we implemented it in Task 2). Update the Entity test to remove any Phaser mocks if present and use the engine `Point` directly.

- [ ] **Step 4: Run Entity tests**

Run: `npm run test:engine -- --run src/models/entity.test.ts`
Expected: PASS.

- [ ] **Step 5: Move and modify RNG**

```bash
git mv src/gameobjects/rng.ts packages/engine/src/rng.ts
git mv src/gameobjects/rng.test.ts packages/engine/src/rng.test.ts
```

Edit `packages/engine/src/rng.ts` — replace the `GameRNG` implementation. Remove the `import { Math as PMath } from "phaser"` line entirely. Reimplement `GameRNG` with a pure TS seedable PRNG:

```typescript
/**
 * Pure TypeScript seedable PRNG. Uses a simple linear congruential
 * generator (same family as many libc rand() implementations).
 * Replaces Phaser's RandomDataGenerator so the engine has no
 * Phaser dependency.
 */
export class GameRNG implements IRNG {
    private _state: number;

    constructor(seed?: string) {
        this._state = seed ? GameRNG._hashSeed(seed) : Date.now();
    }

    private static _hashSeed(seed: string): number {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
        }
        return hash >>> 0 || 1;
    }

    private _next(): number {
        // Mulberry32 — fast 32-bit PRNG with good distribution
        this._state += 0x6d2b79f5;
        let t = this._state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    frac(): number {
        return this._next();
    }

    pick<T>(array: T[]): T {
        return array[Math.floor(this._next() * array.length)];
    }

    weightedPick<T>(array: T[]): T {
        return array[
            Math.floor(
                Math.pow(this._next(), 2) * array.length
            )
        ];
    }

    integerInRange(min: number, max: number): number {
        return Math.floor(
            this._next() * (max - min + 1) + min
        );
    }

    realInRange(min: number, max: number): number {
        return this._next() * (max - min) + min;
    }

    between(min: number, max: number): number {
        return this.integerInRange(min, max);
    }

    shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this._next() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    weightedRandomPick<T>(
        array: T[],
        weight: number,
        exponential: boolean = true,
    ): T {
        return weightedRandomPick(this, array, weight, exponential);
    }
}
```

`IRNG`, `TestRNG`, and `weightedRandomPick` remain unchanged — they had no Phaser imports.

- [ ] **Step 6: Run RNG tests**

Run: `npm run test:engine -- --run src/rng.test.ts`
Expected: PASS. TestRNG and weightedRandomPick tests pass unchanged. Add a basic GameRNG test:

```typescript
describe("GameRNG", () => {
    it("produces deterministic output from the same seed", () => {
        const a = new GameRNG("test-seed");
        const b = new GameRNG("test-seed");
        expect(a.frac()).toBe(b.frac());
        expect(a.frac()).toBe(b.frac());
    });

    it("frac returns values in [0, 1)", () => {
        const rng = new GameRNG("seed");
        for (let i = 0; i < 100; i++) {
            const v = rng.frac();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it("integerInRange stays within bounds", () => {
        const rng = new GameRNG("bounds");
        for (let i = 0; i < 100; i++) {
            const v = rng.integerInRange(3, 7);
            expect(v).toBeGreaterThanOrEqual(3);
            expect(v).toBeLessThanOrEqual(7);
            expect(Number.isInteger(v)).toBe(true);
        }
    });
});
```

- [ ] **Step 7: Update barrel export and commit**

Add to `packages/engine/src/index.ts`:

```typescript
export { Model } from "./models/model";
export { Entity } from "./models/entity";
export { IRNG, GameRNG, TestRNG, weightedRandomPick } from "./rng";
```

```bash
git add -A
git commit -m "refactor: move Model, Entity, RNG to engine package"
```

---

### Task 5: Move PhaseMachine

**Files:**
- Move: `src/gameobjects/statemanager.ts` → `packages/engine/src/phasemachine.ts`
- Move: `src/gameobjects/statemanager.test.ts` → `packages/engine/src/phasemachine.test.ts`

The PhaseMachine has zero Phaser imports — it only depends on `@steelbreeze/state`, which is already in the engine's dependencies.

- [ ] **Step 1: Move files**

```bash
git mv src/gameobjects/statemanager.ts packages/engine/src/phasemachine.ts
git mv src/gameobjects/statemanager.test.ts packages/engine/src/phasemachine.test.ts
```

- [ ] **Step 2: Update import paths in test file**

The test file imports from `./statemanager` — update to `./phasemachine`.

- [ ] **Step 3: Run tests**

Run: `npm run test:engine -- --run src/phasemachine.test.ts`
Expected: PASS — all state machine tests green.

- [ ] **Step 4: Update barrel export and commit**

Add to `packages/engine/src/index.ts`:

```typescript
export {
    PhaseMachine,
    StartGame, GameEnd, SpellbookReady, SkipSpellbook,
    SpellsDone, NoSpellsCast, CastingDone, SpreadingDone,
    MovingDone, SelectPiece, PieceDeselected,
    SpellTargeting, SpellCastComplete,
    // ... all other exported event classes
} from "./phasemachine";
```

```bash
git add -A
git commit -m "refactor: move PhaseMachine to engine package"
```

---

### Task 6: Move Spell System

**Files:**
- Move: `src/gameobjects/spells/*.ts` → `packages/engine/src/spells/`
- Move: corresponding test files
- Modify: Remove `Geom` imports, use engine `Point`

The spell system is mostly pure logic. The only Phaser imports are `Geom.Point` (for targeting positions) and `Math.PMath.Clamp` (trivially replaced with `Math.min(Math.max(...))`).

- [ ] **Step 1: Move all spell files**

```bash
mkdir -p packages/engine/src/spells
git mv src/gameobjects/spells/*.ts packages/engine/src/spells/
git mv src/gameobjects/spells/*.test.ts packages/engine/src/spells/ 2>/dev/null || true
```

- [ ] **Step 2: Replace Phaser imports across spell files**

In each spell file, replace:
- `import { Geom } from "phaser"` → `import { Point } from "../point"`
- `import { Math as PMath } from "phaser"` → remove (use native `Math`)
- `Geom.Point` → `Point`
- `PMath.Clamp(v, min, max)` → `Math.min(Math.max(v, min), max)`

Also update relative imports to reference engine-internal paths (e.g., `../piece` will be correct once Piece is moved in Task 7).

- [ ] **Step 3: Run spell tests**

Run: `npm run test:engine -- --run src/spells/`
Expected: Some tests may fail if they depend on Piece/Board types not yet moved. If so, note the failures — they will resolve after Tasks 7-9. Tests for pure spell logic (targeting, chance calculations, spell factory) should pass.

- [ ] **Step 4: Update barrel export and commit**

Add to `packages/engine/src/index.ts`:

```typescript
export { Spell } from "./spells/spell";
export { AttackSpell } from "./spells/attackspell";
export { SummonSpell } from "./spells/summonspell";
export { DisbelieveSpell } from "./spells/disbelievespell";
export { RaiseDeadSpell } from "./spells/raisedeadspell";
export { StatusEffectSpell } from "./spells/statuseffectspell";
export { SubversionSpell } from "./spells/subversionspell";
export { TurmoilSpell } from "./spells/turmoilspell";
export { createSpell } from "./spells/spellfactory";
export { SpellUtils } from "./spells/spellutils";
```

```bash
git add -A
git commit -m "refactor: move spell system to engine package"
```

---

### Task 7: Extract Piece Logic

**Files:**
- Move: `src/gameobjects/piece.ts` → `packages/engine/src/piece.ts` (logic only)
- Keep: `src/gameobjects/piece.ts` → renamed to `src/gameobjects/pieceview.ts` (rendering only)
- Move: logic-related tests

This is the first major split. The current `Piece` class (~2,068 lines) mixes game logic (~60%) with Phaser rendering (~40%). The engine's `Piece` keeps stats, status, combat validation, movement range, and state transitions. The client's `PieceView` wraps the engine Piece and adds sprites, tweens, and animations.

- [ ] **Step 1: Identify the split boundary**

Read `src/gameobjects/piece.ts` carefully. Categorise every method and property:

**Engine (pure logic) — move to `packages/engine/src/piece.ts`:**
- Constructor (stats initialisation from config)
- All stat getters/setters (movement, combat, rangedCombat, range, defence, manoeuvrability, magicResistance)
- Status management (`addStatus`, `removeStatus`, `hasStatus`, `statuses`)
- Combat validation (`canAttackPiece`, `canRangedAttackPiece`, `inAttackRange`, `canMountPiece`)
- Movement validation (`canMoveTo`, `getMovementRange`)
- State transitions (dead, engulfed, mounted, raisedDead, shadowForm)
- Owner/player references
- Static unit data loading (`Piece.units`)
- `kill()` — state change only (mark as dead, update owner)
- `damage()` — apply damage, check for death
- Direction/facing (if used by combat/movement logic)

**Client (rendering) — keep in `src/gameobjects/pieceview.ts`:**
- Sprite creation (`_sprite`, `_shadow`, `_effects`)
- Animation methods (`drawSelection`, `drawFlash`, `drawMovement`, `highlightForNewTurn`)
- Attack animations (`playAttackAnimation`, `playRangedAttackAnimation`)
- Movement animations (`moveTowardTile`, `playKnockbackEffect`)
- Effect playback (`playEffect`, `disbelieveEffect`)
- Visual state (tinting, alpha, scale)
- Sprite positioning and direction sprites

- [ ] **Step 2: Create the engine Piece class**

Create `packages/engine/src/piece.ts` with only the logic methods. Remove all Phaser imports. Replace `Geom.Point` with engine `Point`. Replace `GameObjects.*`, `Tweens.*`, `Display.*` — these should not exist in the engine piece at all.

The engine Piece constructor should accept a config object (unit stats, type, owner) but NOT a Phaser scene. It should not create sprites.

Key: any method that currently returns a `Promise` due to animation timing (e.g., `kill()` that plays a death animation) must be split. The engine version performs the state change synchronously and emits an event. The client PieceView listens for the event and plays the animation.

- [ ] **Step 3: Create PieceView in client**

Rename/refactor `src/gameobjects/piece.ts` to `src/gameobjects/pieceview.ts`. This class:
- Holds a reference to the engine `Piece` (imported from `@archaos/engine`)
- Creates and manages Phaser sprites
- Subscribes to engine piece events (`moved`, `died`, `statusChanged`, etc.)
- Contains all animation methods

```typescript
import { Piece } from "@archaos/engine";
// ... Phaser imports ...

export class PieceView {
    private _piece: Piece;
    private _sprite: GameObjects.Sprite;
    // ... other Phaser objects ...

    constructor(scene: Scene, piece: Piece) {
        this._piece = piece;
        // Create sprites based on piece.type, piece.position, etc.
    }

    // Animation methods moved from old Piece class
    animateMove(path: Point[]): Promise<void> { /* tweens */ }
    animateAttack(target: PieceView, hit: boolean): Promise<void> { /* tweens */ }
    // ...
}
```

- [ ] **Step 4: Move Piece tests**

Move logic-focused tests to `packages/engine/src/piece.test.ts`. Tests that depend on Phaser sprites/animations stay in the client as `pieceview.test.ts`.

Run: `npm run test:engine -- --run src/piece.test.ts`
Expected: Logic tests pass in pure Node (no jsdom, no canvas mocks).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract Piece logic to engine, create PieceView in client"
```

---

### Task 8: Extract Wizard Logic

**Files:**
- Move: logic from `src/gameobjects/wizard.ts` → `packages/engine/src/wizard.ts`
- Keep: rendering in `src/gameobjects/wizardview.ts`
- `wizardsprite.ts` stays in client unchanged

Same pattern as Task 7. The engine `Wizard` extends engine `Piece` and adds:
- WizCode parsing/generation (pure string manipulation)
- Magical weapon status tracking
- Wizard-specific properties and death mechanics
- `castSpell()`, `dismount()` — game logic portions

The client's `WizardView` extends `PieceView` and adds:
- `WizardSprite` creation
- Shadow form animations
- Stun/headstrike animations

- [ ] **Step 1: Create engine Wizard class**

Create `packages/engine/src/wizard.ts` extending engine `Piece`. Move WizCode parsing, properties, and game logic. Remove all Phaser imports.

- [ ] **Step 2: Create WizardView in client**

Create `src/gameobjects/wizardview.ts` extending `PieceView`, holding rendering code.

- [ ] **Step 3: Move tests and verify**

Run: `npm run test:engine -- --run src/wizard.test.ts`
Expected: WizCode and property tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: extract Wizard logic to engine, create WizardView in client"
```

---

### Task 9: Move Player and Logger

**Files:**
- Move: `src/gameobjects/player.ts` → `packages/engine/src/player.ts`
- Move: `src/gameobjects/services/logger.ts` → `packages/engine/src/logger.ts`
- Move: corresponding test files

- [ ] **Step 1: Move Player**

Player has zero Phaser imports. Move as-is. Update import paths for Wizard, Spell, RemotePlayer to engine-internal paths.

```bash
git mv src/gameobjects/player.ts packages/engine/src/player.ts
git mv src/gameobjects/player.test.ts packages/engine/src/player.test.ts
```

The `defeat()` method currently calls `board.sound.play()` and `board.playEffect()` — these are rendering orchestration calls. In the engine, `defeat()` should perform the game state change (mark defeated, destroy creations) and emit a `playerDefeated` event. The sound/effect playback moves to the client's board view.

- [ ] **Step 2: Move and modify Logger**

```bash
git mv src/gameobjects/services/logger.ts packages/engine/src/logger.ts
git mv src/gameobjects/services/logger.test.ts packages/engine/src/logger.test.ts
```

Edit `packages/engine/src/logger.ts` — replace `Phaser.Events.EventEmitter` with the engine's `EventEmitter`:

```typescript
// BEFORE
import { Events } from "phaser";
const _emitter: Events.EventEmitter = ...

// AFTER
import { EventEmitter } from "./events";
const _emitter: EventEmitter = ...
```

Remove the HMR disposal block (`import.meta.hot`) — that's a Vite/client concern. The client can re-add HMR handling in its own wrapper if needed.

- [ ] **Step 3: Run tests**

Run: `npm run test:engine -- --run src/player.test.ts src/logger.test.ts`
Expected: PASS.

- [ ] **Step 4: Update barrel export and commit**

```bash
git add -A
git commit -m "refactor: move Player and Logger to engine package"
```

---

### Task 10: Extract Pathfinding from RangeGizmo

**Files:**
- Create: `packages/engine/src/pathfinding.ts`
- Create: `packages/engine/src/pathfinding.test.ts`
- Modify: `src/gameobjects/rangegizmo.ts` (remove extracted logic, import from engine)

The current `RangeGizmo` contains both A* pathfinding (pure logic) and Phaser visualisation (layers, tweens). Extract the logic.

- [ ] **Step 1: Identify pathfinding code in RangeGizmo**

Read `src/gameobjects/rangegizmo.ts`. The pure logic includes:
- `Node` class (position, cost, parent, status)
- `Path` class (node sequence, cost calculation)
- A* / BFS reachability algorithm
- `checkNodeTraversal()` — movement validation against board state
- Movement range generation

- [ ] **Step 2: Create engine pathfinding module**

Create `packages/engine/src/pathfinding.ts` with the extracted `Node`, `Path`, and pathfinding algorithm. Replace `Geom.Point` with engine `Point`.

- [ ] **Step 3: Move pathfinding tests**

Move the Node/Path/A* tests from `rangegizmo.test.ts` to `packages/engine/src/pathfinding.test.ts`.

Run: `npm run test:engine -- --run src/pathfinding.test.ts`
Expected: PASS.

- [ ] **Step 4: Update RangeGizmo to import from engine**

Modify `src/gameobjects/rangegizmo.ts` to import `Node`, `Path`, and pathfinding functions from `@archaos/engine` instead of defining them inline. The visual-only code (layers, tweens, gizmo rendering) stays.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract pathfinding to engine package"
```

---

### Task 11: Move ComputerWizard AI

**Files:**
- Move: `src/gameobjects/computerwizard.ts` → `packages/engine/src/ai/computerwizard.ts`
- Move: corresponding test files

- [ ] **Step 1: Move files**

```bash
mkdir -p packages/engine/src/ai
git mv src/gameobjects/computerwizard.ts packages/engine/src/ai/computerwizard.ts
git mv src/gameobjects/computerwizard.test.ts packages/engine/src/ai/computerwizard.test.ts
```

- [ ] **Step 2: Replace Phaser imports**

The only Phaser import is `Geom` for point types — replace with engine `Point`.

- [ ] **Step 3: Verify AI methods don't call rendering**

ComputerWizard delegates all visual work to Board methods. In the engine version, these Board methods will be the headless engine Board (Task 12), which emits events instead of rendering. No changes needed to ComputerWizard logic — it calls `board.movePiece()`, `board.castSpell()`, etc., which are engine methods.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test:engine -- --run src/ai/computerwizard.test.ts`
Expected: Most logic tests pass. Some may fail if they depend on Board methods not yet extracted.

```bash
git add -A
git commit -m "refactor: move ComputerWizard AI to engine package"
```

---

### Task 12: Extract Board Game Logic and Rules

**Files:**
- Create: `packages/engine/src/board.ts` (headless board — state + turn orchestration)
- Move: logic from `src/gameobjects/services/rules.ts` → `packages/engine/src/rules.ts`
- Keep: rendering in `src/gameobjects/boardview.ts`

This is the largest and most complex extraction. The current `Board` class (2,671 lines) is the "kitchen sink" — it owns state, orchestrates turns, manages pieces, AND handles all rendering. The engine Board keeps state and orchestration. The client BoardView handles rendering.

- [ ] **Step 1: Define the engine Board interface**

The engine Board must provide:
- Player and piece management (add, remove, query)
- Turn flow orchestration (newTurn, nextPlayer, phase transitions)
- Game state (balance, currentPlayer, phase, state)
- RNG access (`board.rng`)
- Event emission (newTurn, phaseChange, pieceMoved, etc.)
- Rules integration (processIntent, processAction)
- Spell casting orchestration (validate, apply, emit results)
- Attack resolution (damage calculation, kill, emit results)
- Pathfinding integration
- Board geometry (width, height, getPiecesAtPosition)

The engine Board must NOT:
- Hold a Phaser `Scene` reference
- Create sprites or layers
- Play animations or sounds
- Manage camera or cursor
- Reference `GameObjects`, `Tweens`, `Display`, etc.

- [ ] **Step 2: Create engine Board class**

Create `packages/engine/src/board.ts`. This is a substantial file — extract all pure state management and turn orchestration from `src/gameobjects/board.ts`. Every method that currently triggers a Phaser animation should instead emit an event.

Example pattern:

```typescript
// BEFORE (in client board.ts):
async movePiece(piece: Piece, x: number, y: number): Promise<void> {
    const from = { x: piece.x, y: piece.y };
    piece.position = new Geom.Point(x, y);
    await piece.sprite.playMoveTween(x, y); // Phaser animation
    this._boardEvents.emit(BoardEvent.PieceMoved, { piece, from });
}

// AFTER (in engine board.ts):
movePiece(piece: Piece, x: number, y: number): void {
    const from = { x: piece.position.x, y: piece.position.y };
    piece.position = new Point(x, y);
    this._events.emit("pieceMoved", {
        pieceId: piece.id, from, to: { x, y }
    });
}
```

The engine Board's turn flow methods (`newTurn`, `nextPlayer`) use `async/await` for RemotePlayer calls but do NOT await animations — that's the client's job.

- [ ] **Step 3: Move Rules service**

```bash
git mv src/gameobjects/services/rules.ts packages/engine/src/rules.ts
git mv src/gameobjects/services/rules.test.ts packages/engine/src/rules.test.ts
```

Replace `Geom` imports with engine `Point`. The Rules service is mostly pure logic — `processIntent` and `processAction` validate against board state. Any rendering orchestration calls (`board.playEffect`, `board.sound.play`) should be removed and replaced with event emissions from the Board.

- [ ] **Step 4: Create client BoardView**

Refactor `src/gameobjects/board.ts` into `src/gameobjects/boardview.ts`. This class:
- Holds a reference to the engine `Board` (imported from `@archaos/engine`)
- Creates and manages Phaser layers, camera, cursor, range gizmo
- Creates `PieceView` instances for each engine Piece
- Subscribes to engine Board events and maps them to animations:

```typescript
import { Board } from "@archaos/engine";

export class BoardView {
    private _board: Board;
    private _scene: Scene;
    private _pieceViews: Map<number, PieceView>;

    constructor(scene: Scene, board: Board) {
        this._board = board;
        this._scene = scene;
        this._pieceViews = new Map();

        // Subscribe to engine events
        board.on("pieceMoved", async (e) => {
            const view = this._pieceViews.get(e.pieceId);
            await view.animateMove(e.path);
        });

        board.on("pieceAttacked", async (e) => {
            const attacker = this._pieceViews.get(e.attackerId);
            const defender = this._pieceViews.get(e.defenderId);
            await attacker.animateAttack(defender, e.hit);
        });

        // ... etc for all game events
    }
}
```

- [ ] **Step 5: Run all engine tests**

Run: `npm run test:engine`
Expected: All engine tests pass in pure Node. Some may need mock Board objects — use the same pattern as existing tests but with the engine Board.

- [ ] **Step 6: Run client tests**

Run: `npm test` (from root)
Expected: Client tests pass with updated imports.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract Board game logic and Rules to engine, create BoardView in client"
```

---

### Task 13: Finalise Barrel Export and Client Rewiring

**Files:**
- Modify: `packages/engine/src/index.ts` (complete barrel export)
- Modify: all client files that imported from `src/gameobjects/` (update to `@archaos/engine` or local view classes)
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`

- [ ] **Step 1: Complete engine barrel export**

Update `packages/engine/src/index.ts` to export everything:

```typescript
// Primitives
export { Point } from "./point";
export { EventEmitter } from "./events";

// Models
export { Model } from "./models/model";
export { Entity } from "./models/entity";

// Core
export { Board } from "./board";
export { Piece } from "./piece";
export { Wizard } from "./wizard";
export { Player } from "./player";
export { PhaseMachine } from "./phasemachine";
export { Rules } from "./rules";
export { Logger } from "./logger";

// RNG
export { IRNG, GameRNG, TestRNG, weightedRandomPick } from "./rng";

// Pathfinding
export { Node, Path } from "./pathfinding";

// AI
export { ComputerWizard } from "./ai/computerwizard";

// Spells
export { Spell } from "./spells/spell";
export { AttackSpell } from "./spells/attackspell";
export { SummonSpell } from "./spells/summonspell";
export { DisbelieveSpell } from "./spells/disbelievespell";
export { RaiseDeadSpell } from "./spells/raisedeadspell";
export { StatusEffectSpell } from "./spells/statuseffectspell";
export { SubversionSpell } from "./spells/subversionspell";
export { TurmoilSpell } from "./spells/turmoilspell";
export { createSpell } from "./spells/spellfactory";
export { SpellUtils } from "./spells/spellutils";

// Enums (all 18)
export { ActionType } from "./enums/actiontype";
export { BoardEvent } from "./enums/boardevent";
export { BoardLayer } from "./enums/boardlayer";
export { BoardPhase } from "./enums/boardphase";
export { BoardState } from "./enums/boardstate";
export { Colour } from "./enums/colour";
export { CursorType } from "./enums/cursortype";
export { EventType } from "./enums/eventtype";
export { InputType } from "./enums/inputtype";
export { RangeType } from "./enums/rangetype";
export { SpellTarget } from "./enums/spelltarget";
export { SpellType } from "./enums/spelltype";
export { SpreadAction } from "./enums/spreadaction";
export { UnitAttackType } from "./enums/unitattacktype";
export { UnitDirection } from "./enums/unitdirection";
export { UnitRangedProjectileType } from "./enums/unitrangedprojectiletype";
export { UnitStatus } from "./enums/unitstatus";
export { UnitType } from "./enums/unittype";

// Configs
export type { PieceConfig } from "./configs/piececonfig";
export type { PlayerConfig } from "./configs/playerconfig";
export type { SpellConfig } from "./configs/spellconfig";

// Interfaces
export type { RemotePlayer } from "./interfaces/remoteplayer";
export type { UnitProperties, IUnitStats } from "./interfaces/unitproperties";
export type { WizCode } from "./interfaces/wizcode";

// Re-export all PhaseMachine event classes
export {
    StartGame, GameEnd, SpellbookReady, SkipSpellbook,
    SpellsDone, NoSpellsCast, CastingDone, SpreadingDone,
    MovingDone, SelectPiece, PieceDeselected,
    SpellTargeting, SpellCastComplete,
} from "./phasemachine";
```

- [ ] **Step 2: Create client package.json**

```json
{
    "name": "@archaos/client",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "scripts": {
        "start": "vite",
        "build": "vue-tsc --noEmit && vite build",
        "serve": "vite preview",
        "test": "vitest",
        "tauri": "tauri",
        "tauri:dev": "tauri dev",
        "tauri:build": "tauri build"
    },
    "dependencies": {
        "@archaos/engine": "workspace:*",
        "@steelbreeze/state": "^8.3.1",
        "@tauri-apps/api": "^2.10.1",
        "phaser": "^3.90.0",
        "vue": "^3.5.30"
    },
    "devDependencies": {
        "@playwright/test": "^1.58.2",
        "@tauri-apps/cli": "^2.10.1",
        "@vitejs/plugin-vue": "^6.0.5",
        "@vitest/browser-playwright": "^4.1.0",
        "@vue/test-utils": "^2.4.6",
        "jsdom": "^28.1.0",
        "phaser3spectorjs": "^0.0.8",
        "playwright": "^1.58.2",
        "sass": "^1.98.0",
        "vite": "^8.0.0",
        "vitest-browser-vue": "^2.1.0",
        "vue-tsc": "^3.2.5"
    }
}
```

- [ ] **Step 3: Create client tsconfig.json**

```json
{
    "compilerOptions": {
        "target": "ESNext",
        "module": "ESNext",
        "lib": ["ESNext", "DOM", "scripthost"],
        "moduleResolution": "Bundler",
        "jsx": "preserve",
        "strict": false,
        "sourceMap": true,
        "resolveJsonModule": true,
        "esModuleInterop": true,
        "types": ["vite/client"],
        "noEmit": true,
        "noUnusedLocals": false,
        "noUnusedParameters": false,
        "noImplicitReturns": true,
        "useDefineForClassFields": true,
        "allowSyntheticDefaultImports": true
    },
    "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"],
    "exclude": ["src/**/*.test.ts"],
    "references": [
        { "path": "../engine" }
    ]
}
```

- [ ] **Step 4: Update all client imports**

Bulk find-and-replace across all client files. Any import that previously referenced a file now in the engine should import from `@archaos/engine` instead:

```typescript
// BEFORE
import { Player } from "../gameobjects/player";
import { BoardPhase } from "../gameobjects/enums/boardphase";
import { Spell } from "../gameobjects/spells/spell";

// AFTER
import { Player, BoardPhase, Spell } from "@archaos/engine";
```

Client files that reference view classes (PieceView, BoardView, WizardView) continue to import locally.

- [ ] **Step 5: Update Vite config for monorepo**

Ensure `vite.config.mjs` resolves `@archaos/engine` correctly. With npm workspaces and Vite's default resolution, this should work automatically. Add an explicit alias if needed:

```javascript
resolve: {
    alias: {
        "@archaos/engine": path.resolve(__dirname, "../engine/src"),
    },
},
```

- [ ] **Step 6: Run all tests**

Run: `npm test` (from workspace root)
Expected: All engine tests and client tests pass.

- [ ] **Step 7: Run the dev server and verify local play**

Run: `npm start` (or `npm run start --workspace=packages/client`)
Expected: Game loads, local play works identically to before. All spells, AI, combat, movement, effects function correctly.

- [ ] **Step 8: Run the build**

Run: `npm run build --workspace=packages/client`
Expected: Vite builds successfully. No Phaser code leaked into the engine chunk.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: complete engine extraction and client rewiring

Local play fully functional. All game logic now lives in
@archaos/engine with zero Phaser dependencies. Client imports
engine types and wraps them with Phaser rendering."
```

---

### Task 14: Verification and Cleanup

**Files:**
- Verify: no Phaser imports in `packages/engine/`
- Verify: all tests pass
- Verify: local play works end-to-end
- Clean up: remove empty directories, stale imports

- [ ] **Step 1: Verify zero Phaser imports in engine**

```bash
grep -r "from ['\"]phaser" packages/engine/src/
```

Expected: No output. If any results found, those files still have Phaser dependencies and must be fixed.

- [ ] **Step 2: Verify no DOM/browser APIs in engine**

```bash
grep -rn "document\.\|window\.\|HTMLElement\|Canvas\|WebGL\|Audio" packages/engine/src/ --include="*.ts" | grep -v "test"
```

Expected: No output (tests may reference DOM mocks, but source should not).

- [ ] **Step 3: Run full test suite**

Run: `npm test` (from root)
Expected: All engine and client tests pass.

- [ ] **Step 4: Run e2e tests**

Run: `npm run test:e2e`
Expected: All Playwright tests pass (mobile panning, etc.).

- [ ] **Step 5: Clean up empty directories**

Remove any empty directories left behind after file moves:

```bash
find src/gameobjects/enums src/gameobjects/configs src/gameobjects/interfaces src/gameobjects/spells -empty -type d -delete 2>/dev/null || true
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: cleanup after engine extraction"
```

---

## Notes for Subsequent Plans

This plan produces a working monorepo with a headless engine package. The next two plans build on this:

- **Plan 2 (Server):** Creates `packages/server/` that imports `@archaos/engine`, adds Socket.IO rooms, protocol handling, snapshot filtering, and NetworkPlayer.
- **Plan 3 (Client Online Mode):** Adds Socket.IO client to `packages/client/`, NetworkPlayer implementation, online rendering mode, spectator mode, and the bare-bones lobby/connection UI components.

## Risk Notes

- **Circular dependencies:** Board ↔ Piece ↔ Player ↔ Spell — these are tightly interlinked. The extraction must preserve the same reference graph. Use interfaces and forward declarations where needed to break cycles.
- **Animation timing:** Some game logic currently `await`s animations (e.g., attack resolution waits for the attack tween to complete before checking for death). In the engine, these become synchronous state changes. The client must handle animation sequencing independently, possibly using an event queue.
- **Test breakage during extraction:** Some intermediate commits may have failing tests as dependencies are moved piecemeal. Track these and fix in the same task where possible. The goal is green tests at every commit boundary.
- **Asset loading:** The engine needs access to JSON unit/spell configs from `assets/data/`. These can be loaded at startup and passed to the engine Board constructor, or the engine can import them directly via `resolveJsonModule`. Decide during Task 7 (Piece extraction) based on what works cleanly with both Vite and plain Node.
