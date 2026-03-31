# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Archaos

A modern remake of [Chaos: The Battle of Wizards](https://en.wikipedia.org/wiki/Chaos:_The_Battle_of_Wizards) using Vite, Phaser and Vue. Isometric perspective, up to 8 local players (human or AI), all original spells/units plus new content in `assets/data/enhanced/`.

**Live build:** https://www.archaos.co.uk/

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

### Data Flow

1. `Game.vue` calls `launch()` → creates Phaser game instance
2. `GameScene` loads assets and constructs `Board`
3. `Board` drives game flow (casting phase → movement phase → next turn)
4. Player input (or `ComputerWizard` AI) calls into `Rules`
5. `Rules` mutates board state and calls `Logger`
6. `Logger` emits events that Vue components react to for text-based UI updates
### RemotePlayer Interface

`RemotePlayer` abstracts human vs. AI vs. (future) network players — `selectSpell`, `castSpell`, `moveUnit`. `ComputerWizard` is the current AI implementation.

## Conventions

- Private fields use underscore prefix: `_fieldName`
- Class-level constants use `UPPERCASE_SNAKE_CASE`
- Enums used extensively for type-safe state (avoid raw strings/numbers)
- Service singletons use a protected constructor + `getInstance()` pattern
- Vue components use SFC `<template>` + `<script lang="ts">` with TypeScript

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
