# Archaos

A modern remake of [Chaos: The Battle of Wizards](https://en.wikipedia.org/wiki/Chaos:_The_Battle_of_Wizards), an original Sinclair Spectrum game from 1985 by Julian Gollop. This version uses web technology such as Vite, Phaser and Vue and runs in a browser. It includes modern amenities such as a mouse-driven interface, improved graphics (most notably an isometric perspective instead of the original's top-down view) and quality-of-life improvements to make the game more accessible to new players.

**Live build:** https://www.archaos.co.uk/2021/

## Game Features

- Isometric perspective with pixel art based on the original graphics
- Crunchy beeper sounds faithfully ported from the 48K Spectrum
- Up to 8 local players with computer-controlled opponents
- All original spells and units, plus new content in `assets/data/enhanced/`
- Quality-of-life: mouse-driven UI, inline help, safeguards (e.g. warns if no valid targets in range)

### Not yet implemented

- Online multiplayer
- Standalone (non-browser) client
- New units/spells/scenarios (see the [original design document](https://www.rotates.org/old/chaos/) for where this may go)

## Tech Stack

- **Phaser 3.90** — game engine (WebGL/Canvas 2D rendering)
- **Vue 3** — reactive UI components overlaid on the canvas
- **TypeScript 5** — language; strict mode is off but `noImplicitReturns` is on
- **Vite (rolldown-vite)** — build tool; Phaser and Vue are split into separate manual chunks
- **typescript-fsm** — FSM library used by `StateManager` to drive game phase transitions (not yet implemented in-game)
- **Vitest + @vitest/coverage-v8** — unit testing and coverage reporting
- **jsdom** — DOM environment for tests (mocks Canvas API and rAF in `vitest.setup.ts`)

## Project Structure

```
src/
  components/       Vue UI components (Game, Spellbook, Log, Minimap, UnitInfo, SpellInfo)
  game/             Phaser GameScene initialisation
  gameobjects/      Core game logic — the bulk of the codebase
    enums/          15+ enums for type-safe game states, directions, spell types, etc.
    configs/        Interfaces for PieceConfig, PlayerConfig, SpellConfig
    interfaces/     UI communication contracts and data structures
    services/       Singleton services: Rules (game logic) and Logger (UI event bus)
    spells/         Spell hierarchy: Spell → AttackSpell / SummonSpell; SpellUtils helpers
assets/
  data/             JSON configs for units and spells; enhanced/ subdir loaded via Vite glob
    enhanced/       New (i.e. not present in the original game) spells and units
  spritesheets/     PNG atlases + JSON metadata
  sounds/           Audio sprite (faithful 48K Spectrum beeper sounds)
  plugins/          Rex Phaser plugins (colour replacement pipeline, Perlin noise)
```

## Architecture

### Model Class Hierarchy

```
Model               — base class; validates unique IDs
├── Entity          — board-positioned object with x/y coordinates
│   ├── Piece       — game units and creatures on the board
│   │   └── Wizard  — player-controlled wizard; extends Piece
├── Spell           — base class
│   ├── AttackSpell — direct-attack spells
│   └── SummonSpell — spells which summon pieces to the board
└── Player          — a player in the game, owns spells and pieces
```

### Key Classes

| Class | Role |
|---|---|
| `Board` | Central game state — grid, pieces, players, turn order |
| `GameScene` | Phaser Scene; loads assets and bootstraps `Board` |
| `Rules` | Singleton service — validates and executes all game actions |
| `Spell` | Spell handling and casting logic |
| `Logger` | Singleton service — emits structured events consumed by Vue components |
| `ComputerWizard` | AI controller implementing the `RemotePlayer` interface |
| `Cursor` | Translates Phaser pointer input into game actions, and displays context-sensitive UI on the board surface |

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

## Testing

Run tests:
```bash
npm test
```

Run with coverage (scoped to gameobjects):
```bash
npm test -- --coverage --coverage.include="src/gameobjects/**"
```

### What's tested (and at 100% coverage)

- `Model`, `Entity`, `StateManager`, `Player`, `spells/SpellUtils`

### What's partially tested

- `Wizard` (~6%) — most instance methods require a live Phaser scene
- `ComputerWizard` (~4%) — AI methods require `Board` + Phaser math context

### Improving testability

The main blocker for the Phaser-coupled classes is that they create sprites and call Phaser math (`PMath.RND`, scene textures, etc.) in their constructors or early in methods. Improvements already made:
- Removed direct `Phaser.Math.RND` calls from `Wizard.randomWizCode()` (replaced with `Math.random`)

Remaining pattern to follow for further coverage: **inject** Phaser-dependent dependencies (scene, rng) rather than calling them directly, so tests can pass a stub/null.

### Test setup

`vitest.setup.ts` mocks:
- `HTMLCanvasElement` methods (`getContext`, `fillRect`, `strokeRect`, etc.)
- `requestAnimationFrame` / `cancelAnimationFrame`

### Cheat flags (for manual debugging)

`Board` exposes static booleans:
- `Board.CHEAT_FORCE_HIT` — attacks always succeed
- `Board.CHEAT_FORCE_CAST` — spells always succeed
- `Board.CHEAT_SHORT_DELAY` — reduces animation/timing delays

## Build & Deploy

**Requirements:** Node.js 24+, a desktop browser (mobile is partially supported)

```bash
npm install        # install dependencies
npm start          # dev server (Vite HMR)
npm run build      # type-check (vue-tsc) then Vite build → dist/
npm run deploy     # references a private deployment script — will not work from a clone
```

Vite uses a relative base path (`./`) for deployment flexibility. Chunk size warning threshold is 1500 KB.

> Note: `deploy`, `manifest` and `release` scripts reference a private deployment script not included in the repo.

## Linting

ESLint was removed; migration to **oxlint** is planned but not yet configured.
