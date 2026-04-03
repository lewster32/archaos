# Network Multiplayer Design Spec

**Date:** 2026-04-03
**Status:** Approved
**Scope:** Full parity with local play — up to 8 players (human or AI), spectators, all spells/units

## Overview

Add client-server network multiplayer to Archaos. An authoritative Node.js server runs the game engine, validates all player actions, and broadcasts results to connected clients via Socket.IO. Local play is preserved unchanged.

## Decisions

| Decision | Choice |
|----------|--------|
| Server tech | Node.js, shared TypeScript with client |
| Transport | Socket.IO |
| Discovery | Room codes only (no lobby browser) |
| Authority | Authoritative server (validates all actions) |
| Code structure | Monorepo: packages/engine + packages/server + packages/client |
| Engine extraction | Full extraction upfront — pure TS, no Phaser |
| Hosting | Single dedicated server |
| Disconnection | 30s grace, then host-configured policy (AI takeover or deferred defeat) |
| Spectators | Yes (join anytime, read-only, no late-join for players) |
| Information security | Server-side filtering — hidden state never sent to unauthorised clients |
| RNG | Server-only, seeded, seed never sent to clients |
| New UI | Bare-bones functional only — user will style |

## 1. Monorepo Structure

```
archaos/
├── packages/
│   ├── engine/        ← pure TS game logic (Board, Rules, Spells, RNG, AI, FSM)
│   ├── server/        ← Node.js + Socket.IO (imports engine)
│   └── client/        ← Vite + Phaser + Vue (imports engine for local, renders server events for online)
├── assets/            ← shared game data (JSON configs)
└── package.json       ← workspace root
```

npm/pnpm workspaces for dependency management. TypeScript project references for incremental builds.

## 2. Headless Engine (`packages/engine/`)

Pure TypeScript game logic with zero Phaser dependencies. Models the board, applies rules, resolves combat, and advances turns — but never renders anything.

### Module Map

```
packages/engine/src/
├── models/
│   ├── model.ts            ← base class (ID validation)
│   ├── entity.ts           ← x/y positioned object
│   ├── piece.ts            ← units/creatures (stats, status, combat — no sprites)
│   ├── wizard.ts           ← extends Piece (properties merge, spell list)
│   ├── player.ts           ← owns wizard + spells, turn state
│   └── spell.ts            ← spell hierarchy (Summon, Attack, StatusEffect, etc.)
├── board.ts                ← game state container (pieces, players, balance, turn)
├── rules.ts                ← action validation + state mutation
├── phasemachine.ts         ← FSM for game phases (@steelbreeze/state)
├── rng.ts                  ← IRNG interface, GameRNG (seedable), TestRNG
├── combat.ts               ← attack resolution, defence rolls, ranged attacks
├── spreading.ts            ← fire, gooey blob spread logic
├── pathfinding.ts          ← movement range, path validation
├── spells/
│   ├── spellfactory.ts     ← creates spell instances from config
│   ├── spellutils.ts       ← targeting, range, line-of-sight
│   └── effects/            ← per-spell-type logic
├── ai/
│   └── computerwizard.ts   ← AI decision-making
├── configs/                ← interfaces for JSON data
├── enums/                  ← all game enums
├── interfaces/
│   ├── remoteplayer.ts     ← RemotePlayer interface
│   └── events.ts           ← game event type definitions
├── events.ts               ← typed EventEmitter (lightweight, not Phaser's)
└── index.ts                ← public API barrel export
```

### Core Principle

The engine emits events, never mutates visuals. When a piece moves, the engine updates `piece.x` and `piece.y`, then emits `PieceMoved { id, from, to, path }`. The client's `PieceView` listens for that event and plays the tween. The server broadcasts it to other clients.

### Engine Event Types

```typescript
type GameEvents = {
    newTurn:        { turn: number; playerIndex: number }
    phaseChange:    { phase: BoardPhase }
    pieceMoved:     { pieceId: number; from: Point; to: Point; path: Point[] }
    pieceAttacked:  { attackerId: number; defenderId: number; hit: boolean }
    pieceDied:      { pieceId: number; killerId: number }
    spellCast:      { playerId: number; spellId: number; target: Point; success: boolean }
    pieceCreated:   { piece: PieceSnapshot }
    playerDefeated: { playerId: number }
    gameOver:       { winnerId: number }
}
```

Both server and client subscribe to these events. The server serialises them as Socket.IO messages. The client maps them to Phaser animations.

## 3. Server (`packages/server/`)

### Module Map

```
packages/server/src/
├── index.ts              ← HTTP + Socket.IO server entry point
├── roommanager.ts        ← creates/destroys rooms, generates room codes
├── room.ts               ← one active game session (owns engine Board instance)
├── clientconnection.ts   ← per-player socket wrapper, auth, reconnection token
├── networkplayer.ts      ← implements engine RemotePlayer interface via socket
├── spectator.ts          ← read-only connection, receives events but can't act
├── snapshotfilter.ts     ← per-player state filtering (security)
├── protocol.ts           ← message type definitions (shared with client)
└── config.ts             ← server settings (timeouts, max rooms, max players)
```

### Room Lifecycle

1. **Create Room** — host sends `createRoom`, gets a short code (e.g. `CHAOS42`)
2. **Lobby** — players join via code, host configures game (player count, AI slots, disconnect policy)
3. **Ready Check** — all players confirm ready, host starts game
4. **Playing** — server runs engine, clients render + input
5. **Game Over** — results shown, room cleaned up

### Message Protocol

**Client → Server (Intents):**

```
// Lobby
createRoom    { playerName }
joinRoom      { code, playerName }
leaveRoom     { }
setReady      { ready: boolean }
startGame     { config: GameSetupData }

// Spellbook
selectSpell   { spellId | null }

// Casting
castSpell     { targetX, targetY }
cancelCast    { }

// Movement
selectPiece   { pieceId }
movePiece     { pieceId, targetX, targetY }
attackPiece   { pieceId, targetId }
rangedAttack  { pieceId, targetId }
dismount      { pieceId }
endMovement   { }
```

**Server → Client (Events):**

```
// Lobby
roomCreated   { code, playerId }
playerJoined  { playerId, name, slot }
playerLeft    { playerId }
playerReady   { playerId, ready }
gameStarting  { config, playerMap }

// Game events (from engine)
newTurn       { turn, playerIndex }
phaseChange   { phase }
yourTurn      { phase }
spellSelected { playerId }              // no spell details for other players
spellCast     { playerId, spellId, target, success }
pieceMoved    { pieceId, from, to, path }
pieceAttacked { attackerId, defenderId, hit, damage }
pieceDied     { pieceId, killerId }
pieceCreated  { piece: PieceSnapshot }
playerDefeated { playerId }
gameOver      { winnerId, rankings }

// System
error         { code, message }
reconnected   { gameState: FilteredSnapshot }
```

### Server Game Loop

The server creates a headless engine `Board` instance per room. When it's a player's turn, the server waits for their socket intent. The engine's `RemotePlayer` for that slot is a `NetworkPlayer` that resolves its promises when the right socket message arrives.

**Flow for a human player's cast:**

1. Engine calls `networkPlayer.castSpell()` → returns a Promise
2. Server emits `yourTurn { phase: "casting" }` to that client
3. Client shows targeting UI, player picks a target
4. Client sends `castSpell { targetX, targetY }`
5. Server validates (in range? legal target? correct phase?)
6. If valid: resolves the Promise, engine applies the spell, emits events
7. If invalid: sends `error`, waits for another intent
8. Engine events are broadcast to all clients + spectators

### Turn Timeouts

Each player action has a configurable timeout (e.g. 60s for spell selection, 90s for movement). Server-enforced. If the timer expires:

- **Spellbook phase:** auto-select no spell (pass)
- **Casting phase:** auto-cancel the cast
- **Movement phase:** auto-end movement (skip remaining pieces)

Clients show a countdown timer synced to the server's clock.

## 4. Client Architecture (`packages/client/`)

### Client Modes

| Mode | Engine Location | Input Handling |
|------|----------------|----------------|
| **Local** | Client runs engine directly (current behaviour, preserved) | All players input locally, hot-seat style |
| **Online Player** | Server runs engine. Client is a renderer + input sender. | Only acts on own turn. Sends intents via socket. |
| **Spectator** | Server runs engine. Client is a read-only renderer. | No input — receives all events, renders everything. Free camera. |

### Unified Rendering

The rendering code is identical across modes — only the event source changes:

```typescript
// Local mode: client owns the engine
board.on("pieceMoved", (e) => pieceViews.get(e.pieceId).animateMove(e.path));

// Online mode: server owns the engine, client just renders
socket.on("pieceMoved", (e) => pieceViews.get(e.pieceId).animateMove(e.path));
```

### Spectators

- Join a room with `spectate { code }` instead of `joinRoom`
- Server sends `FilteredSnapshot` on connect (same as reconnect)
- Receive all game events — same stream as players
- No `yourTurn` messages — input is permanently disabled
- Free camera control
- Can join/leave at any time without affecting the game
- Defeated players who reconnect automatically become spectators

### New Vue Components (bare-bones functional only)

```
Lobby.vue            — create/join room, player list, ready toggle, start button
ConnectionStatus.vue — connected/reconnecting/disconnected indicator
TurnTimer.vue        — countdown bar synced to server timeout
```

Minimal markup, no styling — wired to Socket.IO events and reactive state only.

## 5. Disconnection & Reconnection

### Reconnection Token

On join, the server issues an opaque token (UUID) per client, stored in `sessionStorage`. On reconnect:

1. Socket.IO auto-reconnects (built-in backoff)
2. Client sends `reconnect { token }` on the new socket
3. Server matches token to the disconnected player slot
4. If alive (or AI-controlled): server sends `reconnected { gameState: FilteredSnapshot }`
5. If defeated via disconnect policy: server sends `reconnected { defeated: true }` — client spectates

Token expires when the room is destroyed.

### Grace Period (30 seconds)

| Scenario | Behaviour |
|----------|-----------|
| Disconnected player's turn | Game **pauses**. All clients see "Waiting for [name] to reconnect..." with countdown. |
| Another player's turn | Game **continues normally**. Clients see "[name] disconnected" indicator. |
| Reconnect within grace period | Full snapshot sent, game resumes seamlessly. No policy triggered. |

### Host-Configurable Disconnect Policy

During lobby setup, the host chooses what happens when a player's grace period expires:

**AI Takeover:** Server swaps `NetworkPlayer` → `ComputerWizard`. Wizard stays in the game under AI control. Player can reconnect and reclaim (AI finishes current action first).

**Defeat:** Player is flagged `pendingDefeat`. Their remaining actions in the current phase are cancelled. Wizard is killed at the next appropriate phase boundary:

| Current Phase | Immediate Action | Wizard Killed When |
|---------------|------------------|--------------------|
| Spellbook (their turn) | Auto-select no spell, skip to next player | Start of casting phase |
| Spellbook (other's turn) | When their turn comes, auto-skip | Start of casting phase |
| Casting (their turn) | Cancel cast, skip to next player | Start of movement phase |
| Casting (other's turn) | When their turn comes, auto-skip | Start of movement phase |
| Movement (their turn) | End movement immediately | Immediately (already in movement phase) |
| Movement (other's turn) | Nothing yet | When their movement turn comes |

The wizard kill uses the existing defeat path in the engine — same as dying in combat. All owned pieces follow existing rules for wizard death.

## 6. Information Security

### Core Principle

The server is the only place that holds full game truth. Clients receive a filtered view of the game state — a projection specific to their player. If information would not be known to that player in a local hot-seat game, it must not appear in any socket message, snapshot, or event sent to that client.

### Hidden State

| Hidden Data | Who Knows | Filtering Rule |
|-------------|-----------|----------------|
| **Illusion flag** | Server only. Not even the caster's client. | Never included in `PieceSnapshot`. Piece looks identical to a real summon. Only revealed via Disbelieve result. |
| **Disbelieve result memory** | Per-player. Each player (and each AI) tracks independently. | Server maintains per-player `knownIllusions: Set<pieceId>`. Only relevant for AI decisions; Disbelieve outcomes are broadcast to all as they happen. |
| **Other players' spell lists** | Only the owning player | `PlayerSnapshot` for other clients omits the `spells` array entirely. No spell count. |
| **Selected spell details** | Only the owning player (until cast) | Others receive `spellSelected { playerId }` with no spell ID. Cast result is public. |
| **AI decision internals** | Server only | Targeting weights, threat scores, spell priorities — never sent to any client. |

### Illusion Handling

**Summoning an Illusion:**

1. Caster selects an illusion spell and targets a tile
2. Server creates piece with `illusion: true` in the engine state only
3. Server broadcasts `pieceCreated { piece: PieceSnapshot }` to all clients
4. The `PieceSnapshot` contains stats, type, position — but no illusion field
5. All clients (including the caster) render it identically to a real creature

**Casting Disbelieve:**

1. Player casts Disbelieve, targeting a piece
2. Server checks engine state: is the target an illusion?
3. If illusion: piece is destroyed. Server broadcasts `disbelieveResult { pieceId, wasIllusion: true }` to all — everyone sees it vanish
4. If real: server broadcasts `disbelieveResult { pieceId, wasIllusion: false }` to all — the spell fizzles visibly

Even the player who cast an illusion does not receive the illusion flag from the server. The caster's memory of what they cast is a client-side UX concern, not a server-transmitted fact.

### Snapshot Filtering

Every outbound snapshot passes through a per-player filter:

```typescript
function filterForPlayer(
    fullState: FullSnapshot,
    playerId: number
): FilteredSnapshot {
    return {
        ...fullState,
        pieces: fullState.pieces.map(p => stripHidden(p)),
        players: fullState.players.map(p =>
            p.id === playerId
                ? p
                : { ...p, spells: undefined }
        ),
    };
}

function stripHidden(piece: EnginePiece): PieceSnapshot {
    const { illusion, ...safe } = piece.serialize();
    return safe;
}
```

Applied to: game start, reconnection, and spectator join snapshots. Spectators see the same filtered view as a non-active player — no omniscient mode.

## 7. RNG & Testing

### RNG in the Authoritative Server

Only the server rolls dice. Clients in online mode receive outcomes via events, never run game RNG.

| Where | RNG Source | Notes |
|-------|------------|-------|
| Server engine (gameplay) | `board.rng` (seeded `GameRNG`) | All combat, spells, AI, spreading. Seed stored per room. |
| Client local mode | `board.rng` (seeded `GameRNG`) | Same as today. |
| Client online mode (visuals) | `Math.random()` | Particle colours, animation jitter — cosmetic only. |
| Unit tests | `TestRNG` | Deterministic stub, unchanged. |

Seed is generated per room, stored for debugging/replay, and never sent to clients.

### Test Layers

| Layer | What's Tested | Environment |
|-------|---------------|-------------|
| Engine unit tests | Rules, combat, spells, FSM, pathfinding, AI | Pure Node.js — no jsdom, no canvas mock, no Phaser |
| Server integration tests | Room lifecycle, protocol, reconnection, filtering, timeouts | Node.js + Socket.IO test client |
| Client unit tests | Vue components, event-to-render mapping, network client | jsdom + Phaser mocks (as today) |
| E2E tests | Full game flows — local and online | Playwright |

### Scenario Replay

The existing `GameScenarioData` maps to server snapshots. Seed + ordered action log enables deterministic replay and bug reproduction.
