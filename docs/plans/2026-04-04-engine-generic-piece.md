# Generic Piece Type Parameter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `<P extends Piece = Piece>` to Board, Spell, and Player so the client can extend engine classes without structural type errors.

**Architecture:** Board becomes `Board<P>`, which propagates to `Player<P>` (for spell fields) and `Spell<P>` (+ all subclasses). Piece, Wizard, Rules, and ComputerWizard stay non-generic. The default `= Piece` means all engine-internal code works unchanged.

**Tech Stack:** TypeScript 5, Vitest

**Design spec:** `docs/specs/2026-04-04-engine-generic-piece-design.md`

---

### Task 1: Add generic parameter to Board

**Files:**
- Modify: `packages/engine/src/board.ts`

- [ ] **Step 1: Add type parameter to class declaration and constructor**

Change line 56 (class declaration) and update the constructor's `Map` initialisations:

```typescript
// Line ~56: class declaration
export class Board<
    P extends Piece = Piece,
> extends Model {
```

```typescript
// Line ~210: constructor body — update Map types
this._pieces = new Map<number, P>();
this._players = new Map<number, Player<P>>();
```

- [ ] **Step 2: Update field declarations**

```typescript
// Line ~169-174
protected readonly _pieces: Map<number, P>;
protected _selected: P | null;

protected readonly _players: Map<number, Player<P>>;
protected _currentPlayer: Player<P> | null;
```

- [ ] **Step 3: Update piece getter/setter return types**

```typescript
get pieces(): P[] {
    return Array.from(this._pieces.values());
}

get selected(): P | null {
    return this._selected;
}

getPiece(id: number): P | null {
    if (this._pieces.has(id)) {
        return this._pieces.get(id);
    }
    return null;
}

getPiecesByOwner(owner: Player<P>): P[] {
    return this.pieces.filter(
        (piece) => piece.owner === owner,
    );
}
```

- [ ] **Step 4: Update player getter/setter return types**

```typescript
get players(): Player<P>[] {
    return Array.from(this._players.values());
}

get currentPlayer(): Player<P> | null {
    return this._currentPlayer;
}

set currentPlayer(player: Player<P> | null) {
    this._currentPlayer = player;
}

getPlayer(id: number): Player<P> | null {
    if (this._players.has(id)) {
        return this._players.get(id);
    }
    return null;
}
```

- [ ] **Step 5: Update filter-based methods**

```typescript
getAdjacentPiecesAtPosition(
    point: Point,
    filter?: (piece: P) => boolean,
    includeCentre?: boolean,
): P[] {
    const neighbours: Set<P> = new Set();
    const position: Point = Point.clone(point);
    for (const direction of Board.NEIGHBOUR_DIRECTIONS) {
        const directionNeighbours: P[] =
            this.getPiecesAtPosition(
                new Point(
                    position.x + direction.x,
                    position.y + direction.y,
                ),
                filter,
            );
        if (directionNeighbours) {
            directionNeighbours.forEach((piece) =>
                neighbours.add(piece),
            );
        }
    }
    if (includeCentre) {
        const centreNeighbours: P[] =
            this.getPiecesAtPosition(position, filter);
        if (centreNeighbours) {
            centreNeighbours.forEach((piece) =>
                neighbours.add(piece),
            );
        }
    }
    return Array.from(neighbours);
}

getPiecesAtPosition(
    point: Point,
    filter?: (piece: P) => boolean,
): P[] {
    return Array.from(
        this.pieces.filter((piece: P) => {
            return (
                Point.equals(piece.position, point) &&
                (filter ? filter(piece) : true)
            );
        }),
    );
}
```

- [ ] **Step 6: Update piece action methods**

```typescript
addPiece(config: PieceConfig): P {
    const piece: Piece = new Piece(
        this,
        this._idCounter++,
        config,
    );
    this._pieces.set(piece.id, piece as P);
    this.emitBoardUpdateEvent();
    return piece as P;
}

addWizard(config: WizardConfig): P {
    const wizard: Wizard = new Wizard(
        this,
        this._idCounter++,
        config,
    );
    this._pieces.set(wizard.id, wizard as P);
    this.emitBoardUpdateEvent();
    return wizard as P;
}

selectWizard(player: Player<P>): P | null {
    if (
        !player ||
        this._state === BoardState.GameOver
    ) {
        return null;
    }
    const ownedPieces: P[] =
        this.getPiecesByOwner(player);
    for (const piece of ownedPieces) {
        if (piece.hasStatus(UnitStatus.Wizard)) {
            this.selectPiece(piece.id);
            return piece;
        }
    }
    return null;
}

movePiece(id: number, position: Point): P {
    const piece: P | null = this.getPiece(id);
    if (!piece) {
        throw new Error(
            `Could not find piece with ID ${id}`,
        );
    }
    piece.position.setTo(position.x, position.y);
    piece.moved = true;
    this._boardEvents.emit(
        BoardEvent.PieceMoved,
        piece,
    );
    this.emitBoardUpdateEvent();
    return piece;
}

async attackPiece(
    attackingPieceId: number,
    defendingPieceId: number,
): Promise<P | null> {
    const attackingPiece =
        this.getPiece(attackingPieceId);
    const defendingPiece =
        this.getPiece(defendingPieceId);
    // ... (error checks unchanged) ...
    this._busy = true;
    const attackResult: boolean =
        await attackingPiece.attack(defendingPiece);
    this._boardEvents.emit(
        BoardEvent.PieceAttacked,
        attackingPiece,
        defendingPiece,
        attackResult,
    );
    this._busy = false;
    return attackingPiece;
}

async rangedAttackPiece(
    attackingPieceId: number,
    defendingPieceId: number,
): Promise<P | null> {
    // Same pattern as attackPiece — return types
    // change from Piece to P, logic unchanged
    const attackingPiece =
        this.getPiece(attackingPieceId);
    const defendingPiece =
        this.getPiece(defendingPieceId);
    // ... (error checks unchanged) ...
    this._busy = true;
    const attackResult: boolean =
        await attackingPiece.rangedAttack(
            defendingPiece,
        );
    this._boardEvents.emit(
        BoardEvent.PieceRangedAttacked,
        attackingPiece,
        defendingPiece,
        attackResult,
    );
    this._busy = false;
    return attackingPiece;
}

mountPiece(
    mountingPieceId: number,
    mountedPieceId: number,
): P | null {
    // Return type changes to P, logic unchanged
    // ...
    return mountingPiece;
}

dismountPiece(
    dismountingPieceId: number,
): P | null {
    // Return type changes to P, logic unchanged
    // ...
    return piece;
}
```

- [ ] **Step 7: Update spell factory reference and addSpell**

The static `_spellFactory` and `registerSpellFactory` stay non-generic (they use defaulted types). `addSpell` becomes:

```typescript
addSpell(
    player: Player<P>,
    config: SpellConfig,
): Spell<P> {
    if (!config || !player) {
        throw new Error(
            "No player or config provided",
        );
    }
    if (!Board._spellFactory) {
        throw new Error(
            "Spell factory not registered. " +
                "Import spellfactory and call " +
                "Board.registerSpellFactory() " +
                "first.",
        );
    }
    const spell = Board._spellFactory(
        this,
        this._idCounter++,
        config,
    ) as Spell<P>;
    player.addSpell(spell);
    return spell;
}
```

- [ ] **Step 8: Update remaining local variables that use `Piece` explicitly**

Search for all remaining `Piece` type annotations in local variables within board.ts methods (e.g. `isBlocker`, `createWizards`, `selectPiece`). These reference `this.pieces` or `this.getPiece()` which now return `P`/`P[]`, so update the local variable annotations from `Piece` to `P` or remove explicit annotations and let inference handle it. Specifically:

```typescript
// isBlocker — line ~747
const pieces: P[] = this.getPiecesAtPosition(
    point,
    (piece) => {
        return (
            !piece.hasStatus(UnitStatus.Transparent) &&
            !piece.dead
        );
    },
);

// createWizards — line ~921
this.pieces.some((piece: P) =>
    piece.hasStatus(UnitStatus.Wizard),
)

// Any other local Piece[] or Piece | null variables
// that receive values from Board methods
```

- [ ] **Step 9: Run engine type-check**

Run: `npx tsc -p packages/engine/tsconfig.json --noEmit 2>&1`
Expected: Errors in files that reference Board but haven't been updated yet (player.ts, spell.ts, etc). Board itself should have no internal errors.

- [ ] **Step 10: Commit**

```bash
git add packages/engine/src/board.ts
git commit -m "refactor(engine): add generic <P extends Piece> to Board"
```

---

### Task 2: Add generic parameter to Player

**Files:**
- Modify: `packages/engine/src/player.ts`

- [ ] **Step 1: Add type parameter to class declaration**

```typescript
export class Player<
    P extends Piece = Piece,
> extends Model {
```

- [ ] **Step 2: Update field declarations**

```typescript
protected readonly _board: Board<P>;
protected readonly _spells: Map<number, Spell<P>>;

protected _castingPiece: P | null;
protected _selectedSpell: Spell<P> | null;
```

- [ ] **Step 3: Update constructor signature**

```typescript
constructor(
    board: Board<P>,
    id: number,
    config: PlayerConfig,
    colour: number,
    remote?: RemotePlayer | null,
) {
```

And in the constructor body:

```typescript
this._spells = new Map<number, Spell<P>>();
```

- [ ] **Step 4: Update imports**

Add `Board` and `Spell` to imports. `Board` is currently a type-only import (line 10). `Spell` is currently a type-only import (line 5). Both stay as type imports:

```typescript
import type { Spell } from "./spells/spell";
import type { Piece } from "./piece";
import type { Board } from "./board";
```

No changes needed to import statements — they already import the base types, and the generic defaults handle the rest.

- [ ] **Step 5: Update getter/setter return types**

```typescript
get board(): Board<P> {
    return this._board;
}

get spells(): Spell<P>[] {
    return Array.from(this._spells.values());
}

get castingPiece(): P | null {
    return this._castingPiece;
}

set castingPiece(piece: P | null) {
    this._castingPiece = piece;
}

get selectedSpell(): Spell<P> | null {
    return this._selectedSpell;
}
```

- [ ] **Step 6: Update spell methods**

```typescript
addSpell(spell: Spell<P>) {
    this._spells.set(spell.id, spell);
}

async pickSpell(id: number): Promise<Spell<P>> {
    const spell: Spell<P> | undefined =
        this._spells.get(id);
    if (spell) {
        this._selectedSpell = spell;
        return this._selectedSpell;
    }
    return null;
}

async useSpell(): Promise<Spell<P> | null> {
    if (this._selectedSpell) {
        if (
            this._selectedSpell.castTimes <= 0
        ) {
            this.discardSpell();
        } else {
            return this._selectedSpell;
        }
    }
    return null;
}

async discardSpell(): Promise<Spell<P> | null> {
    if (this._selectedSpell) {
        const spell: Spell<P> =
            this._selectedSpell;
        // ... rest unchanged ...
        this._selectedSpell = null;
        return spell;
    }
    return null;
}
```

- [ ] **Step 7: Run engine type-check**

Run: `npx tsc -p packages/engine/tsconfig.json --noEmit 2>&1`
Expected: Fewer errors than before. Player and Board should be clean.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/player.ts
git commit -m "refactor(engine): add generic <P extends Piece> to Player"
```

---

### Task 3: Add generic parameter to Spell and SpellCastTarget

**Files:**
- Modify: `packages/engine/src/spells/spell.ts`

- [ ] **Step 1: Update SpellCastTarget type alias**

```typescript
export type SpellCastTarget<
    P extends Piece = Piece,
> = Point | P | null;
```

- [ ] **Step 2: Add type parameter to Spell class**

```typescript
export class Spell<
    P extends Piece = Piece,
> extends Model {
```

- [ ] **Step 3: Update field declarations**

```typescript
protected _board: Board<P>;
protected _castingPiece: P;
protected _owner: Player<P>;
```

- [ ] **Step 4: Update constructor**

```typescript
constructor(
    board: Board<P>,
    id: number,
    config: SpellConfig,
) {
```

- [ ] **Step 5: Update owner getter/setter**

```typescript
get owner(): Player<P> {
    return this._owner;
}

set owner(owner: Player<P>) {
    this._owner = owner;
    this._castingPiece = owner?.castingPiece;
}
```

- [ ] **Step 6: Update cast, doCast, castFail, and getValidTarget**

```typescript
getValidTarget(
    target: Point | P,
    showReason?: boolean,
): SpellCastTarget<P> {
    // ... logic unchanged ...
}

async cast(
    owner: Player<P>,
    castingPiece: P,
    target?: Point | P,
): Promise<P | boolean | null> {
    // ... logic unchanged ...
}

async doCast(
    owner: Player<P>,
    castingPiece: P,
    point?: Point,
    targets?: P[],
): Promise<P | boolean | null> {
    return null;
}

async castFail(
    owner: Player<P>,
    castingPiece: P,
): Promise<void> {
    // ... logic unchanged ...
}
```

- [ ] **Step 7: Update autoCast and canCastAtTarget**

```typescript
async autoCast(
    owner: Player<P>,
): Promise<boolean> {
    // ... logic unchanged ...
}
```

Check `canCastAtTarget` and any other methods that reference `Piece`, `Board`, `Player`, or `SpellCastTarget` — update their annotations to use `P`, `Board<P>`, `Player<P>`, `SpellCastTarget<P>`.

- [ ] **Step 8: Run engine type-check**

Run: `npx tsc -p packages/engine/tsconfig.json --noEmit 2>&1`
Expected: Errors only in spell subclasses and spellfactory (not yet updated).

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/spells/spell.ts
git commit -m "refactor(engine): add generic <P extends Piece> to Spell"
```

---

### Task 4: Add generic parameter to all Spell subclasses

**Files:**
- Modify: `packages/engine/src/spells/attackspell.ts`
- Modify: `packages/engine/src/spells/summonspell.ts`
- Modify: `packages/engine/src/spells/disbelievespell.ts`
- Modify: `packages/engine/src/spells/raisedeadspell.ts`
- Modify: `packages/engine/src/spells/statuseffectspell.ts`
- Modify: `packages/engine/src/spells/subversionspell.ts`
- Modify: `packages/engine/src/spells/turmoilspell.ts`

- [ ] **Step 1: Update each spell subclass**

For each of the 7 spell subclasses, make two changes:

1. Add generic parameter to the class declaration
2. Update the `doCast` signature to use `P`

Example for AttackSpell (repeat pattern for all 7):

```typescript
export class AttackSpell<
    P extends Piece = Piece,
> extends Spell<P> {
    constructor(
        board: Board<P>,
        id: number,
        config: SpellConfig,
    ) {
        super(board, id, config);
        this._type = SpellType.Attack;
    }

    async doCast(
        owner: Player<P>,
        castingPiece: P,
        point?: Point,
        targets?: P[],
    ): Promise<P | boolean | null> {
        // ... logic unchanged ...
    }
}
```

For SummonSpell, also update `autoCast`:

```typescript
async autoCast(
    owner: Player<P>,
): Promise<boolean> {
    // ... logic unchanged ...
}
```

Update imports in each file: ensure `Board` import uses the correct path. Most spell files already import `Board` — no import changes needed, just the generic annotations.

For each file, update any local variables that are typed as `Piece` when they receive values from `targets` parameter (already typed as `P[]`). For example in subversionspell.ts:

```typescript
const target: P = targets.find(
    (p: P) => p.owner !== this.owner,
);
```

- [ ] **Step 2: Run engine type-check**

Run: `npx tsc -p packages/engine/tsconfig.json --noEmit 2>&1`
Expected: Only spellfactory.ts errors remain.

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/spells/attackspell.ts packages/engine/src/spells/summonspell.ts packages/engine/src/spells/disbelievespell.ts packages/engine/src/spells/raisedeadspell.ts packages/engine/src/spells/statuseffectspell.ts packages/engine/src/spells/subversionspell.ts packages/engine/src/spells/turmoilspell.ts
git commit -m "refactor(engine): add generic <P extends Piece> to spell subclasses"
```

---

### Task 5: Update spellfactory

**Files:**
- Modify: `packages/engine/src/spells/spellfactory.ts`

- [ ] **Step 1: Update SpellConstructor type and createSpell function**

```typescript
import type { Piece } from "../piece";

type SpellConstructor<P extends Piece = Piece> = new (
    board: Board<P>,
    id: number,
    config: SpellConfig,
) => Spell<P>;

const SPELL_RULES: [
    (config: SpellConfig) => boolean,
    SpellConstructor,
][] = [
    [(c) => !!(c.unitId || c.unit), SummonSpell],
    [(c) => !!c.damage, AttackSpell],
    [(c) => c.id === "disbelieve", DisbelieveSpell],
    [(c) => c.id === "raise-dead", RaiseDeadSpell],
    [(c) => c.id === "subversion", SubversionSpell],
    [(c) => c.id === "turmoil", TurmoilSpell],
    [(c) => c.target === SpellTarget.Self, StatusEffectSpell],
];

export function createSpell<
    P extends Piece = Piece,
>(
    board: Board<P>,
    id: number,
    config: SpellConfig,
): Spell<P> {
    const SpellClass =
        SPELL_RULES.find(([match]) => match(config))?.[1] ?? Spell;
    return new SpellClass(board, id, config) as Spell<P>;
}
```

Note: The `SPELL_RULES` array stays with the defaulted type. The `as Spell<P>` cast is needed because the array stores constructors with defaulted `Piece`, but at runtime they work with any `P`.

- [ ] **Step 2: Run engine type-check**

Run: `npx tsc -p packages/engine/tsconfig.json --noEmit 2>&1`
Expected: Zero errors from engine package.

- [ ] **Step 3: Run all engine tests**

Run: `npx vitest run packages/engine/ 2>&1 | tail -10`
Expected: All 556+ tests pass. No test changes needed — all tests use defaulted type parameters.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/spells/spellfactory.ts
git commit -m "refactor(engine): add generic <P extends Piece> to createSpell"
```

---

### Task 6: Update client Board to specify type argument

**Files:**
- Modify: `src/gameobjects/board.ts`

- [ ] **Step 1: Update the extends clause**

Change line 67:

```typescript
// Before
export class Board extends EngineBoard {

// After
export class Board extends EngineBoard<Piece> {
```

Where `Piece` here is the client's `import { Piece } from "./piece"` (already imported at line 43).

- [ ] **Step 2: Run full project type-check**

Run: `npx vue-tsc --noEmit 2>&1 | grep "error TS" | grep -v "@steelbreeze"`
Expected: Zero errors from `src/gameobjects/` and `packages/engine/src/`.

If errors remain, they will likely be in:
- Client Board method overrides that have explicit `Piece` return types — these now inherit the correct type from `EngineBoard<Piece>` so the override signatures should match.
- Any explicit `Player` references that now need `Player<Piece>` — check and update.

- [ ] **Step 3: Run all engine tests**

Run: `npx vitest run packages/engine/ 2>&1 | tail -10`
Expected: All 556+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/gameobjects/board.ts
git commit -m "refactor: specify Piece type argument on client Board"
```

---

### Task 7: Verify build and no Phaser in engine

**Files:** None (verification only)

- [ ] **Step 1: Run full project type-check**

Run: `npx vue-tsc --noEmit 2>&1 | grep "error TS" | grep -v "@steelbreeze" | wc -l`
Expected: `0`

- [ ] **Step 2: Run all engine tests**

Run: `npx vitest run packages/engine/ 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 3: Verify no Phaser in engine**

Run: `grep -r "from ['\"]phaser['\"]" packages/engine/src/ | grep -v node_modules | grep -v ".test."`
Expected: No matches.

- [ ] **Step 4: Commit any fixups**

If verification revealed issues that required fixes:

```bash
git add -A
git commit -m "fix: address remaining build errors from generic piece work"
```
