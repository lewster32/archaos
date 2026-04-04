# Generic Piece Type Parameter — Design Spec

**Goal:** Eliminate structural type incompatibility between engine and client
classes by adding a generic type parameter `P extends Piece = Piece` to
`Board` and `Spell`, so the client can extend engine classes with additional
fields and methods without causing tsc errors.

**Context:** The engine package (`packages/engine/`) defines base classes
(`Board`, `Piece`, `Spell`, etc.) that the client (`src/gameobjects/`)
extends with Phaser-specific fields (sprites, shadows, tweens). TypeScript's
structural type system rejects these subclasses because method parameter
contravariance makes `ClientPiece` incompatible with `Piece` when Board
methods return `Piece` but the client expects `ClientPiece`.

**Approach:** Generic `Board<P>` (Approach A from brainstorming). The type
parameter propagates to `Spell` (and subclasses) and `Player` (to carry
`Spell<P>` through its spell fields), but not to `Piece`, `Rules`, or
`ComputerWizard`.

---

## What becomes generic

### Board\<P extends Piece = Piece\>

Every property and method that stores or returns pieces uses `P`:

| Member | Current type | New type |
|--------|-------------|----------|
| `_pieces` | `Map<number, Piece>` | `Map<number, P>` |
| `_selected` | `Piece \| null` | `P \| null` |
| `_players` | `Map<number, Player>` | `Map<number, Player<P>>` |
| `_currentPlayer` | `Player \| null` | `Player<P> \| null` |
| `pieces` (getter) | `Piece[]` | `P[]` |
| `selected` (getter) | `Piece \| null` | `P \| null` |
| `getPiece()` | `Piece \| null` | `P \| null` |
| `getPiecesByOwner()` | `Piece[]` | `P[]` |
| `getPiecesAtPosition()` | `Piece[]` | `P[]` |
| `getAdjacentPiecesAtPosition()` | `Piece[]` | `P[]` |
| `addPiece()` | `Piece` | `P` |
| `addWizard()` | `Wizard` | `P` |
| `selectWizard()` | `Piece \| null` | `P \| null` |
| `movePiece()` | `Piece` | `P` |
| `attackPiece()` | `Promise<Piece \| null>` | `Promise<P \| null>` |
| `rangedAttackPiece()` | `Promise<Piece \| null>` | `Promise<P \| null>` |
| `mountPiece()` | `Piece \| null` | `P \| null` |
| `dismountPiece()` | `Piece \| null` | `P \| null` |
| `addSpell()` | `Spell` | `Spell<P>` |
| `players` (getter) | `Player[]` | `Player<P>[]` |
| `currentPlayer` (getter) | `Player \| null` | `Player<P> \| null` |
| `selectPlayer()` | uses `Player` | uses `Player<P>` |
| Filter callbacks | `(piece: Piece) => boolean` | `(piece: P) => boolean` |

**`addPiece` / `addWizard` construction:** These methods do `new Piece(...)`
which can't be `new P()` in TypeScript. The engine implementation constructs
`Piece` and returns `as P`. This is safe because the client always overrides
these methods to construct `ClientPiece`.

### Spell\<P extends Piece = Piece\>

| Member | Current type | New type |
|--------|-------------|----------|
| `_board` | `Board` | `Board<P>` |
| `_castingPiece` | `Piece` | `P` |
| `_owner` | `Player` | `Player<P>` |
| `constructor` board param | `Board` | `Board<P>` |
| `doCast` params | `castingPiece: Piece, targets?: Piece[]` | `castingPiece: P, targets?: P[]` |
| `doCast` return | `Promise<Piece \| boolean \| null>` | `Promise<P \| boolean \| null>` |
| `cast` params | `castingPiece: Piece, castPiece?: Piece` | `castingPiece: P, castPiece?: P` |
| `cast` return | `Promise<Piece \| boolean \| null>` | `Promise<P \| boolean \| null>` |
| `castFail` param | `castingPiece: Piece` | `castingPiece: P` |
| `getValidTarget` | `Point \| Piece` | `Point \| P` |

### SpellCastTarget type alias

```typescript
// Before
export type SpellCastTarget = Point | Piece | null;

// After
export type SpellCastTarget<P extends Piece = Piece> = Point | P | null;
```

### Spell subclasses

Each passes through the parameter:

- `AttackSpell<P extends Piece = Piece> extends Spell<P>`
- `SummonSpell<P extends Piece = Piece> extends Spell<P>`
- `DisbelieveSpell<P extends Piece = Piece> extends Spell<P>`
- `RaiseDeadSpell<P extends Piece = Piece> extends Spell<P>`
- `StatusEffectSpell<P extends Piece = Piece> extends Spell<P>`
- `SubversionSpell<P extends Piece = Piece> extends Spell<P>`
- `TurmoilSpell<P extends Piece = Piece> extends Spell<P>`

Their `doCast` overrides use `P` for `castingPiece` and `targets` params.

### createSpell factory

```typescript
// Before
export function createSpell(board: Board, id: number, config: SpellConfig): Spell

// After
export function createSpell<P extends Piece = Piece>(
    board: Board<P>, id: number, config: SpellConfig
): Spell<P>
```

The `SpellConstructor` type becomes:

```typescript
type SpellConstructor<P extends Piece = Piece> =
    new (board: Board<P>, id: number, config: SpellConfig) => Spell<P>;
```

---

## What stays non-generic

### Piece

Self-referencing methods use the base `Piece` type:

```typescript
class Piece {
    attack(piece: Piece): Promise<boolean> { ... }
    rangedAttack(piece: Piece): Promise<boolean> { ... }
    mount(piece: Piece): void { ... }
    canAttackPiece(piece: Piece): boolean { ... }
    getNeighbours(): Piece[] { ... }
    getFirstEngagingPiece(): Piece | null { ... }
}
```

Client overrides accept `Piece` (the base type). If a client method needs
sprite access on the argument, it casts internally — this is safe because
the client knows all pieces at runtime are `ClientPiece`.

### Player\<P extends Piece = Piece\>

Player becomes generic to carry the `P` through its spell-related fields.
`Spell<P>` is invariant in `P` (P appears in both parameter and return
positions of `doCast`), so `Spell<ClientPiece>` is not assignable to
`Spell<Piece>`. Since `Board.addSpell` creates `Spell<P>` and passes it
to `player.addSpell(spell: Spell)`, Player must accept `Spell<P>`.

| Member | Current type | New type |
|--------|-------------|----------|
| `_board` | `Board` | `Board<P>` |
| `_castingPiece` | `Piece \| null` | `P \| null` |
| `_spells` | `Map<number, Spell>` | `Map<number, Spell<P>>` |
| `_selectedSpell` | `Spell \| null` | `Spell<P> \| null` |
| `addSpell()` | `Spell` | `Spell<P>` |
| `pickSpell()` | `Promise<Spell>` | `Promise<Spell<P>>` |
| `useSpell()` | `Promise<Spell \| null>` | `Promise<Spell<P> \| null>` |
| `discardSpell()` | `Promise<Spell \| null>` | `Promise<Spell<P> \| null>` |
| `spells` (getter) | `Spell[]` | `Spell<P>[]` |
| constructor board param | `Board` | `Board<P>` |

Player is not subclassed by the client. The default `= Piece` means all
engine-internal code (Rules, ComputerWizard, tests) stays unchanged.

### Wizard

Extends `Piece`, not subclassed further. No generic parameter needed.
`Wizard.createAll(board: Board, players: Player[])` stays with defaulted
types since it's called from engine-internal code.

### Rules

Engine-internal. Operates on `Board` (defaulted). Its `processIntent`
method and internal locals use `Piece` and `Board` without type parameters.

### ComputerWizard

Engine-internal. Stores `_board: Board` and `_player: Player`, both
defaulted. No changes.

---

## Client integration

The client specifies the type argument once on Board:

```typescript
class ClientBoard extends Board<ClientPiece> {
    // Inherited methods now return ClientPiece
    // Override addPiece/addWizard to construct ClientPiece
}
```

Spells are constructed by the engine via `createSpell(board, ...)`. The
`P` is inferred from the board's type parameter — no explicit annotation
needed in client spell code.

---

## Testing

Engine tests are unaffected. They construct `Board` (defaulted to `Piece`)
or use mock boards with `as unknown as Board` casts. No generic parameter
needed in test code.

Spell test mocks (`spell.testhelpers.ts`, `attackspell.test.ts`,
`summonspell.test.ts`) use `as unknown as Board` — these continue to work
because the default type parameter matches the existing mock shape.

---

## Success criteria

1. `npx vue-tsc --noEmit` produces zero errors from `src/gameobjects/`
   and `packages/engine/src/`. Only pre-existing `@steelbreeze/types`
   errors in `node_modules/` remain.
2. All engine tests pass (556+) unchanged or with minimal mock type
   adjustments.
3. No Phaser imports in `packages/engine/src/` (excluding test files).
4. Client code gets proper `ClientPiece` types from Board methods without
   manual casts.

---

## Files changed

**Engine (generic parameter added):**
- `packages/engine/src/board.ts` — `Board<P>`
- `packages/engine/src/spells/spell.ts` — `Spell<P>`, `SpellCastTarget<P>`
- `packages/engine/src/spells/attackspell.ts` — `AttackSpell<P>`
- `packages/engine/src/spells/summonspell.ts` — `SummonSpell<P>`
- `packages/engine/src/spells/disbelievespell.ts` — `DisbelieveSpell<P>`
- `packages/engine/src/spells/raisedeadspell.ts` — `RaiseDeadSpell<P>`
- `packages/engine/src/spells/statuseffectspell.ts` — `StatusEffectSpell<P>`
- `packages/engine/src/spells/subversionspell.ts` — `SubversionSpell<P>`
- `packages/engine/src/spells/turmoilspell.ts` — `TurmoilSpell<P>`
- `packages/engine/src/spells/spellfactory.ts` — `createSpell<P>`, `SpellConstructor<P>`

**Engine (generic parameter added):**
- `packages/engine/src/player.ts` — `Player<P>`

**Engine (no changes):**
- `packages/engine/src/piece.ts`
- `packages/engine/src/wizard.ts`
- `packages/engine/src/rules.ts`
- `packages/engine/src/ai/computerwizard.ts`

**Client (specify type argument):**
- `src/gameobjects/board.ts` — `extends Board<ClientPiece>`

**Tests (no changes expected):**
- All test files use defaulted type parameters or `as unknown as Board`
