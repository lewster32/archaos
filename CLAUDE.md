# Archaos

A modern remake of [Chaos: The Battle of Wizards](https://en.wikipedia.org/wiki/Chaos:_The_Battle_of_Wizards), an original Sinclair Spectrum game from 1985 by Julian Gollop. This version uses web technology such as Vite, Phaser and Vue and runs in a browser. It includes modern amenities such as a mouse-driven interface, improved graphics (most notably an isometric perspective instead of the original's top-down view) and quality-of-life improvements to make the game more accessible to new players.

**Live build:** https://www.archaos.co.uk/

## Game Features

- Isometric perspective with pixel art based on the original graphics
- Crunchy beeper sounds faithfully ported from the 48K Spectrum
- Up to 8 local players with computer-controlled opponents
- All original spells and units, plus new content in `assets/data/enhanced/`
- Mobile support: responsive viewport resizing via media query, auto-pan to current wizard on turn start, horizontal drag-to-pan on narrow viewports
- Quality-of-life: mouse-driven UI, inline help, safeguards (e.g. warns if no valid targets in range)
- AI with difficulty-scaled tactical behaviour: threat-aware wizard movement, smart summon placement (general summons towards highest threat, spreading units near enemies, Magic Wood near wizard, Shadow Wood blocking LoS, Wall building contiguous barriers), illusion-suspicion Disbelieve preference (suspects high-strength low-cast-chance units; dampened by distance, boosted by threat proximity; tempered by world balance and known-non-illusion memory)

### Not yet implemented

- Online multiplayer
- New units/spells/scenarios (see the [original design document](https://www.rotates.org/old/chaos/) for where this may go)

## Tech Stack

- **Phaser 3.90** — game engine (WebGL/Canvas 2D rendering)
- **Vue 3** — reactive UI components overlaid on the canvas
- **TypeScript 5** — language; strict mode is off but `noImplicitReturns` is on
- **Vite 8** — build tool; Phaser and Vue are split into separate manual chunks
- **typescript-fsm** — FSM library used by `StateManager` to drive game phase transitions (not yet implemented in-game)
- **Tauri 2** — standalone desktop packaging (uses system WebView2 on Windows); Steam integration planned
- **Vitest + @vitest/coverage-v8** — unit testing and coverage reporting
- **Playwright** — e2e testing (mobile camera panning scenarios)
- **jsdom** — DOM environment for tests (mocks Canvas API and rAF in `vitest.setup.ts`)

## Project Structure

```
e2e/                  Playwright e2e tests (mobile panning scenarios)
src/
  components/       Vue UI components (Game, Spellbook, Log, Minimap, UnitInfo, SpellInfo)
  game/             Phaser GameScene initialisation
  gameobjects/      Core game logic — the bulk of the codebase
    enums/          15+ enums for type-safe game states, directions, spell types, etc.
    configs/        Interfaces for PieceConfig, PlayerConfig, SpellConfig
    interfaces/     UI communication contracts and data structures
    services/       Singleton services: Rules (game logic) and Logger (UI event bus)
    spells/         Spell hierarchy: Spell → AttackSpell / SummonSpell; SpellUtils helpers; spellfactory.ts
src-tauri/
  src/              Rust entry point (thin wrapper — no game logic here)
  Cargo.toml        Rust dependencies (tauri, steamworks in future)
  tauri.conf.json   Window config, bundling, build commands
assets/
  data/             JSON configs for units, spells and effects; enhanced/ subdir loaded via Vite glob
    enhanced/       New (i.e. not present in the original game) spells and units
    effects.json    Config-driven visual effects (particle emitters, tweens, etc.)
  spritesheets/     PNG atlases + JSON metadata
  sounds/           Audio sprite (faithful 48K Spectrum beeper sounds)
  plugins/          Rex Phaser plugins (colour replacement pipeline, Perlin noise)
```

## Architecture

### Model Class Hierarchy

```
Model                     — base class; validates unique IDs
├── Entity                — board-positioned object with x/y coordinates
│   ├── Piece             — game units and creatures on the board
│   │   └── Wizard        — player-controlled wizard; extends Piece
├── Spell                 — base class
│   ├── AttackSpell       — direct-attack spells
│   ├── DisbelieveSpell   — Disbelieve spell
│   ├── RaiseDeadSpell    — Raise Dead spell
│   ├── StatusEffectSpell — buff spells such as Magic Sword etc.
│   ├── SubversionSpell   — Subversion spell
│   ├── SummonSpell       — spells which summon pieces to the board
│   └── TurmoilSpell      — Turmoil spell
└── Player                — a player in the game, owns spells and pieces
```

### Key Classes

| Class            | Role                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Board`          | Central game state — grid, pieces, players, turn order. Owns the seedable `IRNG` instance (`board.rng`). Delegates dice rolls to `Rules`, spell construction to `createSpell`, and wizard placement to `Wizard.createAll` |
| `GameScene`      | Phaser Scene; loads assets and bootstraps `Board`                                                                                                                                                                         |
| `Rules`          | Singleton service — validates and executes all game actions; owns `roll`/`rollChance` (dice), `doSpread`/`doExpire` (turn automata)                                                                                       |
| `Spell`          | Spell handling and casting logic                                                                                                                                                                                          |
| `Logger`         | Singleton service — emits structured events consumed by Vue components                                                                                                                                                    |
| `ComputerWizard` | AI controller implementing the `RemotePlayer` interface; `autoCastSpell` dispatches to spell-class methods for casting                                                                                                    |
| `SummonSpell`    | Summon spells; owns AI auto-cast logic via `autoCast(player)` and private tile-selection helpers                                                                                                                          |
| `Cursor`         | Translates Phaser pointer input into game actions, displays context-sensitive UI on the board surface, and handles drag-to-pan on narrow viewports                                                                        |
| `RangeGizmo`     | Calculates and displays movement ranges and A\* paths for pieces; owns `Node` (tile in range graph) and `Path` (ordered node sequence with cost)                                                                          |
| `EffectEmitter`  | Config-driven particle effects (extends Phaser `ParticleEmitter`); definitions in `effects.json`                                                                                                                          |

### Data Flow

1. `Game.vue` calls `launch()` → creates Phaser game instance
2. `GameScene` loads assets and constructs `Board`
3. `Board` drives game flow (casting phase → movement phase → next turn)
4. Player input (or `ComputerWizard` AI) calls into `Rules`
5. `Rules` mutates board state and calls `Logger`
6. `Logger` emits events that Vue components react to for text-based UI updates

### Board Delegation Pattern

`Board` was reduced from ~2,450 to ~2,130 lines by extracting self-contained logic to the classes and services where it conceptually belongs. Board retains thin delegation wrappers (e.g. `board.roll()` → `rules.roll()`) so existing call sites remain unchanged.

| Extracted to                                      | What moved                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Wizard.createAll(board, players)`                | 198-line wizard placement switch (static method)                                                         |
| `createSpell()` in `spells/spellfactory.ts`       | Spell subclass discriminator — priority-ordered `[predicate, Constructor][]` rule table                  |
| `Rules.doSpread(board)` / `Rules.doExpire(board)` | Turn automata for spreading creatures and expiring structures                                            |
| `Rules.roll()` / `Rules.rollChance()`             | Dice roll probability logic (accept `IRNG` param); Board keeps delegation wrappers that pass `this._rng` |
| `enums/rangetype.ts`                              | `RangeType` enum (was defined at the bottom of board.ts)                                                 |
| `utils.ts` `delay()`                              | Generic setTimeout promise wrapper; `Board.delay` delegates to it                                        |

### RemotePlayer Interface

`RemotePlayer` abstracts human vs. AI vs. (future) network players — `selectSpell`, `castSpell`, `moveUnit`. `ComputerWizard` is the current AI implementation.

## Conventions

- Private fields use underscore prefix: `_fieldName`
- Class-level constants use `UPPERCASE_SNAKE_CASE`
- Enums used extensively for type-safe state (avoid raw strings/numbers)
- Service singletons use a protected constructor + `getInstance()` pattern
- Vue components use SFC `<template>` + `<script lang="ts">` with TypeScript

## Testing

The test suite is split into unit tests (Vitest) and e2e tests (Playwright):

| Suite        | Environment                | Scope                                           |
| ------------ | -------------------------- | ----------------------------------------------- |
| `unit`       | jsdom                      | `src/**/*.test.ts` (excludes `src/components/`) |
| `components` | Real Chromium (Playwright) | `src/components/**/*.test.ts`                   |
| `e2e`        | Chromium (Playwright)      | `e2e/**/*.spec.ts` — mobile panning scenarios   |

Run all unit/component tests:

```bash
npm test
```

Run e2e tests:

```bash
npm run test:e2e
```

Run only component tests (browser):

```bash
npx vitest run --project=components
```

Run with coverage (scoped to gameobjects):

```bash
npm test -- --coverage --coverage.include="src/gameobjects/**"
```

### What's tested (and at 100% coverage)

- `Model`, `Entity`, `StateManager`, `Player`, `Logger`
- All spell classes: `Spell`, `AttackSpell`, `SummonSpell`, `DisbelieveSpell`, `RaiseDeadSpell`, `StatusEffectSpell`, `SubversionSpell`, `SpellUtils`, `createSpell` (spell factory)
- `EffectEmitter` (100% lines/functions, ~99% statements, ~93% branches) — Phaser `ParticleEmitter` base class mocked via `vi.mock('phaser')`
- Vue components: `GameMenu`, `LoadingScreen`, `Log`, `GameControls`, `UnitStats` — tested in real Chromium via `vitest-browser-vue`

### What's partially tested

- `Cursor` — `translateCursorPosition`, `update`, `action`, drag-to-pan (including `panningEnabled` setter) fully tested via mock board; remaining gaps are Phaser-coupled visual methods
- `Wizard` (~64%) — remaining gaps are Phaser-coupled methods (sprite creation, animations)
- `RangeGizmo` (~59%) — `Node`, `Path`, static helpers, A\* pathfinding, and `checkNodeTraversal` fully tested; visual methods (tween-based reveal/hide) are the remaining gap
- `TurmoilSpell` (~94%)
- `Piece` (~26%) — heavily Phaser-coupled (sprites, tweens, scene references)
- `ComputerWizard` (~33%) — `getSpellChanceForUnit`, `selectSpell` illusion-suspicion logic, `withPreferredFirst`, `preferredTargetId`, `findSpellTargets`, `evaluateEnemyPlayerPriorities`, `rememberNonIllusionPiece`/`forgetIllusionKnowledge` tested; remaining gaps are `autoCastSpell`, `moveUnit`/`moveAllUnits` (Phaser-coupled movement and combat)

### AI spell-selection architecture

`ComputerWizard.selectSpell` evaluates enemy threat priorities, then filters and ranks available spells. Before the normal weighted-pick, it checks whether Disbelieve should be preferred: for each disbelievable enemy piece, it computes a suspicion score = `strength × (1 − effectiveCastChance) × 5/(5 + distance)`, doubled if the piece threatens the wizard. The `5/(5+d)` curve keeps most suspicion at close range (factor 0.83 at distance 1, 0.625 at 3, 0.5 at 5) while fading for distant units (0.33 at 10). The effective cast chance is looked up via `getSpellChanceForUnit` (which applies the same world-balance adjustment as `Spell.chance`). The resulting preference is normalised to 0–1 and gated by difficulty, so higher-difficulty wizards are much more likely to Disbelieve a suspected illusion (e.g. a dragon). Pieces already known to be non-illusions (via `_knownNonIllusionPieces`) are skipped. When suspicion fires, `selectSpell` sets `preferredTargetId`, which `autoCastSpell` consumes via `withPreferredFirst` + `weightedPick` to strongly favour that target. This preferred-target mechanism is reusable across all piece-targeting spell types (attack, Disbelieve, Subversion, Raise Dead, etc.).

### AI auto-cast architecture

`SummonSpell.autoCast(player)` drives all summon-spell casting for both AI and human auto-place spells (e.g. Magic Wood). `ComputerWizard.autoCastSpell` delegates to it for `SpellType.Summon` and handles the other spell types directly. Private helpers on `SummonSpell`:

| Method                 | Used for                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `selectDefaultTile`    | General summons — finds highest-threat enemy (strength / distance), places unit nearby; gated by `rollChance(difficulty)` |
| `selectSpreadingTile`  | Gooey Blob etc. — prefers tiles near enemies                                                                             |
| `selectMagicWoodTile`  | Magic Wood — clusters near the casting wizard                                                                            |
| `selectShadowWoodTile` | Shadow Wood — scores by LoS blocking + enemy adjacency                                                                   |
| `trySelectWallTile`    | Wall — hard-filters adjacent tiles, scores by LoS + contiguity + run direction; returns `null` to cancel remaining casts |
| `scoreLoSBlock`        | Shared geometry: scores a tile by how closely it lies on the enemy→wizard line segment                                   |

### Randomness architecture (`rng.ts`)

All gameplay-affecting randomness goes through `board.rng`, a dependency-injectable `IRNG` instance:

| Export                 | Role                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `IRNG`                 | Interface — `frac`, `pick`, `weightedPick`, `integerInRange`, `realInRange`, `between`, `shuffle`                                |
| `GameRNG`              | Production implementation wrapping Phaser's `RandomDataGenerator`; optional seed via Board constructor                           |
| `TestRNG`              | Deterministic stub for unit tests — `frac()` returns a configurable value (default 0.5), `pick`/`weightedPick` return `array[0]` |
| `weightedRandomPick()` | Standalone function for biased array selection; also available as `IRNG.weightedRandomPick` instance method                      |

**Convention:** Code with gameplay consequences (dice rolls, AI decisions, spell selection, spread actions) must use `board.rng`. Code with purely visual/audio effects (animation delays, particle colours, sound variants) must use `Math.random()`.

Tests provide `rng: new TestRNG()` on mock board objects instead of stubbing `PMath.RND` globally.

### Improving testability

The main blocker for the Phaser-coupled classes is that they create sprites and call Phaser APIs (scene textures, etc.) in their constructors or early in methods. Improvements already made:

- All gameplay randomness injected via `board.rng` (`IRNG` interface) — no direct `Phaser.Math.RND` calls remain outside `rng.ts`
- `Wizard.randomWizCode()` uses `Math.random` (visual-only)
- `EffectEmitter` tests use `vi.mock('phaser')` to replace the entire Phaser module with stubs (mock `ParticleEmitter` base class, `Curves.Path`, `Display.Color`, `BlendModes`, etc.), allowing full coverage of a class that extends a Phaser `GameObjects` class

Remaining pattern to follow for further coverage: **inject** Phaser-dependent dependencies (scene) rather than calling them directly, so tests can pass a stub/null. For classes that extend Phaser base classes, the `vi.mock('phaser')` approach (as used in `effectemitter.test.ts`) provides a viable alternative.

### Test setup

`vitest.setup.ts` (unit project only) mocks:

- `HTMLCanvasElement` methods (`getContext`, `fillRect`, `strokeRect`, etc.)
- `requestAnimationFrame` / `cancelAnimationFrame`

Component tests use `vitest-browser-vue` as the setup file, which registers `render()` and per-test cleanup in the real browser. Failure screenshots are written to `src/components/__screenshots__/` (git-ignored).

### Cheat flags (for manual debugging)

`Board` exposes static booleans:

- `Board.CHEAT_FORCE_HIT` — attacks always succeed
- `Board.CHEAT_FORCE_CAST` — spells always succeed
- `Board.CHEAT_SHORT_DELAY` — reduces animation/timing delays

## Build & Deploy

**Requirements:** Node.js 24+, a modern browser (desktop or mobile). Standalone builds also require Rust 1.77.2+.

```bash
npm install        # install dependencies
npm start          # dev server (Vite HMR)
npm run build      # type-check (vue-tsc) then Vite build → dist/
npm run deploy     # references a private deployment script — will not work from a clone
```

### Standalone Desktop Build (Tauri)

```bash
npm run tauri:dev    # dev mode — Vite HMR + native window with devtools
npm run tauri:build  # production build → src-tauri/target/release/bundle/
```

Tauri uses the system WebView2 (Chromium-based on Windows) — WebGL/Phaser runs identically to Chrome. The bundled executable is ~5-10 MB.

Vite uses a relative base path (`./`) for deployment flexibility. Chunk size warning threshold is 1500 KB.

> Note: `deploy`, `manifest` and `release` scripts reference a private deployment script not included in the repo.

## Linting & Formatting

**oxlint** for linting, **oxfmt** for formatting (replaces ESLint and Prettier).

```bash
npm run lint          # lint all files
npm run lint:fix      # lint and auto-fix
npm run fmt           # format all files in-place
npm run fmt:check     # check formatting without writing
```

Configuration files: `.oxlintrc.json`, `.oxfmtrc.json`.
