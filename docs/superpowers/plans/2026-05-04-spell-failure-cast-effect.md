# Spell Failure Cast Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make spell failures play a fuller cast attempt visual (flourish, beam, fizzle at the target tile) instead of just fizzling at the wizard tile, with a tailored shorter sequence for self-cast failures.

**Architecture:** All work happens in `Spell.castFail` in `packages/engine/src/spells/spell.ts`. `Spell.cast` already computes a `castPoint` from the supplied target; we thread it through to `castFail`, which branches on whether the target tile equals the caster's tile. No new `EffectType` value, no `effects.json` change, no client-side wiring. The existing `EffectRequested` event handler in `src/gameobjects/board.ts` already supports every payload shape this plan emits.

**Tech Stack:** TypeScript, Vitest (engine project under `npx vitest run --project=engine`).

**Spec:** [docs/superpowers/specs/2026-05-04-spell-failure-cast-effect-design.md](../specs/2026-05-04-spell-failure-cast-effect-design.md)

---

## File Structure

| File | Change |
| --- | --- |
| `packages/engine/src/spells/spell.ts` | Modify: thread `castPoint` from `cast()` to `castFail()`; rewrite `castFail()` body to emit one of two sequences depending on whether the target tile differs from the caster's tile. |
| `packages/engine/src/spells/spell.test.ts` | Modify: replace the existing single-effect assertion in the `Spell.castFail` describe block with the new self-target sequence assertion. Add a new test for the target-targeted sequence. |

No other files are touched.

---

### Task 1: Self-target failure sequence (RED-GREEN)

This task threads the optional `castPoint` parameter through `cast()` and `castFail()`, and implements the self-target failure branch (no `castPoint`, or `castPoint` equal to the caster's tile).

**Files:**
- Modify: `packages/engine/src/spells/spell.ts` (the `cast()` failure call site at ~line 487-489 and the `castFail()` method at ~line 519-526)
- Modify: `packages/engine/src/spells/spell.test.ts` (the existing test at lines 1124-1135 inside `describe("Spell.castFail", ...)`)

- [ ] **Step 1: Replace the existing self-target failure test**

Open `packages/engine/src/spells/spell.test.ts` and replace the test currently at lines 1124-1135 (the `it("emits EffectRequested with WizardCastFail", ...)` block) with the following:

```ts
it("emits the self-target failure sequence when no castPoint is supplied", async () => {
    const board = makeMockBoard();
    const piece = makeMockPiece({ id: 42, x: 5, y: 5 });
    const owner = makeMockPlayer(piece);
    const s = new Spell(board, 1, makeConfig());
    s.owner = owner;

    await s.castFail(owner, piece);

    const emit = (board as any).events.emit as ReturnType<typeof vi.fn>;
    const emitAsync = (board as any).events.emitAsync as ReturnType<typeof vi.fn>;

    // No cast-beam sound on the self-target path.
    expect(emit).not.toHaveBeenCalledWith(EngineEvent.EffectRequested, { sound: "cast-beam" });

    // Sequence: WizardCasting -> die sound -> SummonPiece -> WizardCastFail.
    expect(emitAsync).toHaveBeenNthCalledWith(1, EngineEvent.EffectRequested, {
        type: EffectType.WizardCasting,
        pieceId: 42,
    });
    expect(emit).toHaveBeenCalledWith(EngineEvent.EffectRequested, { sound: "die" });
    expect(emitAsync).toHaveBeenNthCalledWith(2, EngineEvent.EffectRequested, {
        type: EffectType.SummonPiece,
        pieceId: 42,
    });
    expect(emitAsync).toHaveBeenNthCalledWith(3, EngineEvent.EffectRequested, {
        type: EffectType.WizardCastFail,
        pieceId: 42,
    });

    // WizardCastBeam must not be emitted on the self-target path.
    const beamCall = emitAsync.mock.calls.find(
        ([, payload]: any) => payload?.type === EffectType.WizardCastBeam,
    );
    expect(beamCall).toBeUndefined();
});

it("treats a castPoint equal to the caster's position as self-target", async () => {
    const board = makeMockBoard();
    const piece = makeMockPiece({ id: 7, x: 4, y: 4 });
    const owner = makeMockPlayer(piece);
    const s = new Spell(board, 1, makeConfig());
    s.owner = owner;

    await s.castFail(owner, piece, new Point(4, 4));

    const emitAsync = (board as any).events.emitAsync as ReturnType<typeof vi.fn>;
    expect(emitAsync).toHaveBeenCalledWith(EngineEvent.EffectRequested, {
        type: EffectType.SummonPiece,
        pieceId: 7,
    });
    const beamCall = emitAsync.mock.calls.find(
        ([, payload]: any) => payload?.type === EffectType.WizardCastBeam,
    );
    expect(beamCall).toBeUndefined();
});
```

The first test exercises the no-`castPoint` path. The second test proves that supplying a `castPoint` equal to the caster's tile takes the same branch (this matters for self-targeting spells like buffs that pass the wizard as the target).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project=engine packages/engine/src/spells/spell.test.ts -t "Spell.castFail"`

Expected: both new tests FAIL. The current `castFail` only emits `WizardCastFail`, so the assertions on `WizardCasting`, `SummonPiece`, and the `die` sound will not be satisfied. The second test will also fail because the current `castFail` signature accepts only two arguments - depending on TypeScript's strictness this may surface as a compile error in the test file, which counts as a failing run.

- [ ] **Step 3: Update `cast()` to pass `castPoint` to `castFail()`**

Open `packages/engine/src/spells/spell.ts`. Find the failure call site (currently around line 487):

```ts
        if (this._castTimes === this._totalCastTimes && !this.roll()) {
            await this.castFail(owner, castingPiece);
            return null;
        }
```

Change the `castFail` call to pass `castPoint`:

```ts
        if (this._castTimes === this._totalCastTimes && !this.roll()) {
            await this.castFail(owner, castingPiece, castPoint);
            return null;
        }
```

`castPoint` is already declared and populated earlier in `cast()` (lines 475-482). It is `undefined` when no target was supplied, which `castFail` handles.

- [ ] **Step 4: Update `castFail()` signature and implement the self-target branch**

In the same file, find `castFail` (currently around lines 519-526):

```ts
    async castFail(owner: Player<P>, castingPiece: P): Promise<void> {
        this._failed = true;
        this._castTimes = 0;
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.WizardCastFail,
            pieceId: castingPiece.id,
        });
    }
```

Replace it with:

```ts
    async castFail(owner: Player<P>, castingPiece: P, castPoint?: Point): Promise<void> {
        this._failed = true;
        this._castTimes = 0;

        const isSelfTarget =
            !castPoint ||
            (castPoint.x === castingPiece.position.x && castPoint.y === castingPiece.position.y);

        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.WizardCasting,
            pieceId: castingPiece.id,
        });

        if (isSelfTarget) {
            this._board.events.emit(EngineEvent.EffectRequested, {
                sound: "die",
            });
            await this._board.events.emitAsync(EngineEvent.EffectRequested, {
                type: EffectType.SummonPiece,
                pieceId: castingPiece.id,
            });
            await this._board.events.emitAsync(EngineEvent.EffectRequested, {
                type: EffectType.WizardCastFail,
                pieceId: castingPiece.id,
            });
            return;
        }

        // Target-targeted branch is filled in by the next task. For now
        // fall back to the self-target visual so this task is committable
        // on its own.
        this._board.events.emit(EngineEvent.EffectRequested, {
            sound: "die",
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.SummonPiece,
            pieceId: castingPiece.id,
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.WizardCastFail,
            pieceId: castingPiece.id,
        });
    }
```

The temporary fall-through in the non-self-target branch keeps the engine's existing failure tests passing (they call `castFail(owner, piece)` with no `castPoint`, so they take the self-target branch). Task 2 replaces the fall-through with the real target-targeted sequence.

If `Point` is not already imported in `spell.ts`, leave it - the parameter type uses the existing `Point` import. Verify by skimming the imports at the top of the file: there should already be `import { Point } from "../point";`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --project=engine packages/engine/src/spells/spell.test.ts`

Expected: PASS. All previous `Spell.castFail` tests, all `Spell.cast` tests, and the two new tests added in Step 1 must pass. If any other test now fails, it almost certainly asserts on the old `WizardCastFail`-only payload - update it to match the new self-target sequence.

- [ ] **Step 6: Run the full engine test suite**

Run: `npx vitest run --project=engine`

Expected: PASS. This catches downstream tests in other spell files that may exercise the failure path indirectly.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/spells/spell.ts packages/engine/src/spells/spell.test.ts
git commit -m "Threaded castPoint through Spell.cast into Spell.castFail and rewrote the self-cast failure sequence to play WizardCasting, the die sound, SummonPiece, and finally WizardCastFail at the wizard's tile."
```

---

### Task 2: Target-targeted failure sequence (RED-GREEN)

This task replaces the temporary fall-through in `castFail` with the real target-targeted sequence: cast-beam sound, `WizardCasting` at the caster, `WizardCastBeam` from the caster to the target tile, then `WizardCastFail` at the target tile (using `targetPosition` instead of `pieceId`).

**Files:**
- Modify: `packages/engine/src/spells/spell.ts` (the non-self-target branch of `castFail()`)
- Modify: `packages/engine/src/spells/spell.test.ts` (add a new test at the end of the `describe("Spell.castFail", ...)` block)

- [ ] **Step 1: Add a failing test for the target-targeted sequence**

Open `packages/engine/src/spells/spell.test.ts` and add the following test at the end of the `describe("Spell.castFail", ...)` block (just before its closing `});`):

```ts
it("emits the target-targeted failure sequence when castPoint differs from the caster's position", async () => {
    const board = makeMockBoard();
    const caster = makeMockPiece({ id: 11, x: 2, y: 3 });
    const owner = makeMockPlayer(caster);
    const s = new Spell(board, 1, makeConfig());
    s.owner = owner;

    await s.castFail(owner, caster, new Point(8, 9));

    const emit = (board as any).events.emit as ReturnType<typeof vi.fn>;
    const emitAsync = (board as any).events.emitAsync as ReturnType<typeof vi.fn>;

    // cast-beam sound is emitted because a beam is being drawn.
    expect(emit).toHaveBeenCalledWith(EngineEvent.EffectRequested, { sound: "cast-beam" });
    // die sound is NOT emitted on the target-targeted path.
    expect(emit).not.toHaveBeenCalledWith(EngineEvent.EffectRequested, { sound: "die" });

    // Sequence: WizardCasting -> WizardCastBeam -> WizardCastFail at target.
    expect(emitAsync).toHaveBeenNthCalledWith(1, EngineEvent.EffectRequested, {
        type: EffectType.WizardCasting,
        pieceId: 11,
    });
    expect(emitAsync).toHaveBeenNthCalledWith(2, EngineEvent.EffectRequested, {
        type: EffectType.WizardCastBeam,
        startPieceId: 11,
        targetPosition: { x: 8, y: 9 },
    });
    expect(emitAsync).toHaveBeenNthCalledWith(3, EngineEvent.EffectRequested, {
        type: EffectType.WizardCastFail,
        targetPosition: { x: 8, y: 9 },
    });

    // SummonPiece must not be emitted on the target-targeted path.
    const summonCall = emitAsync.mock.calls.find(
        ([, payload]: any) => payload?.type === EffectType.SummonPiece,
    );
    expect(summonCall).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project=engine packages/engine/src/spells/spell.test.ts -t "target-targeted failure sequence"`

Expected: FAIL. The current implementation falls through to the self-target branch when `isSelfTarget` is false, so it emits the `die` sound and `SummonPiece` instead of `cast-beam`, `WizardCastBeam`, and a target-positioned `WizardCastFail`.

- [ ] **Step 3: Replace the temporary fall-through with the real target-targeted branch**

Open `packages/engine/src/spells/spell.ts`. Find the comment-marked fall-through inside `castFail`:

```ts
        // Target-targeted branch is filled in by the next task. For now
        // fall back to the self-target visual so this task is committable
        // on its own.
        this._board.events.emit(EngineEvent.EffectRequested, {
            sound: "die",
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.SummonPiece,
            pieceId: castingPiece.id,
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.WizardCastFail,
            pieceId: castingPiece.id,
        });
    }
```

Also remove the comment immediately above the early `return` in the self-target branch if it referenced the fall-through. The full revised method should look like this:

```ts
    async castFail(owner: Player<P>, castingPiece: P, castPoint?: Point): Promise<void> {
        this._failed = true;
        this._castTimes = 0;

        const isSelfTarget =
            !castPoint ||
            (castPoint.x === castingPiece.position.x && castPoint.y === castingPiece.position.y);

        if (!isSelfTarget) {
            this._board.events.emit(EngineEvent.EffectRequested, {
                sound: "cast-beam",
            });
        }

        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.WizardCasting,
            pieceId: castingPiece.id,
        });

        if (isSelfTarget) {
            this._board.events.emit(EngineEvent.EffectRequested, {
                sound: "die",
            });
            await this._board.events.emitAsync(EngineEvent.EffectRequested, {
                type: EffectType.SummonPiece,
                pieceId: castingPiece.id,
            });
            await this._board.events.emitAsync(EngineEvent.EffectRequested, {
                type: EffectType.WizardCastFail,
                pieceId: castingPiece.id,
            });
            return;
        }

        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.WizardCastBeam,
            startPieceId: castingPiece.id,
            targetPosition: { x: castPoint.x, y: castPoint.y },
        });
        await this._board.events.emitAsync(EngineEvent.EffectRequested, {
            type: EffectType.WizardCastFail,
            targetPosition: { x: castPoint.x, y: castPoint.y },
        });
    }
```

Note that the `cast-beam` sound emission moves to *before* the `WizardCasting` await, so it overlaps with the casting flourish (matching how `SummonSpell.doCast` orders the same two emissions on the success path).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project=engine packages/engine/src/spells/spell.test.ts`

Expected: PASS. All `Spell.castFail` tests now pass, including the new target-targeted test.

- [ ] **Step 5: Run the full engine test suite**

Run: `npx vitest run --project=engine`

Expected: PASS. No regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/spells/spell.ts packages/engine/src/spells/spell.test.ts
git commit -m "Implemented the target-targeted spell-failure sequence in Spell.castFail. Failed casts now play the cast-beam sound, the wizard's casting flourish, a beam to the target tile, and finally the fizzle effect at the target tile."
```

---

### Task 3: Manual smoke test in the browser

This task confirms the visual behaviour matches the spec. Failure paths are not covered by automated visual regression tests in this repo, so we verify by eye.

**Files:**
- None modified.

- [ ] **Step 1: Start the dev server**

Run: `npm start`

Open the URL printed by Vite (typically `http://localhost:5173/`). Start a quick local game with at least one human wizard.

- [ ] **Step 2: Force a target-targeted failure**

In the browser DevTools console, override the cast-roll on the live board so every cast fails:

```js
currentBoard.rollChance = () => false;
// Optional - speeds up animations:
currentBoard.constructor.CHEAT_SHORT_DELAY = true;
```

`currentBoard` is exposed by `src/gameobjects/board.ts` as a debugging aid. Pick any spell with a target tile distinct from the wizard - for example, summon a creature on a far tile. Cast it. Confirm visually:
- The cast-beam sound plays.
- A purple beam travels from the wizard to the target tile.
- The fizzle (`WizardCastFail`) plays at the *target* tile, not the wizard.
- The "X failed to cast Y" log line appears after the fizzle.

- [ ] **Step 3: Force a self-target failure**

Pick a buff or status-effect spell that targets the wizard (e.g. `Magic Shield`). Re-apply the same forced-failure setup as Step 2 if needed. Cast it. Confirm visually:
- No cast-beam sound.
- The casting flourish (`WizardCasting`) plays around the wizard.
- The `die` sound plays.
- The `SummonPiece` purple sparkle burst plays at the wizard's tile.
- The fizzle (`WizardCastFail`) plays at the wizard's tile.
- The "X failed to cast Y" log line appears after the fizzle.

- [ ] **Step 4: Confirm multi-cast spells fizzle on the first clicked target**

Pick a multi-cast spell (e.g. a 3-cast Magic Bolt). Re-apply forced-failure. Cast it at a chosen target. Confirm:
- The fizzle plays at the originally-clicked target tile.
- The remaining casts are not consumed (the spell is removed from the book regardless because it failed).

- [ ] **Step 5: Stop the dev server**

`Ctrl+C` in the dev server terminal.

No commit.

---

### Task 4: Final verification

- [ ] **Step 1: Run the full client + engine test suites**

Run: `npm test && npx vitest run --project=engine`

Expected: PASS for both. If any client tests assert on emitted effects from the failure path, update them to match the new sequences (none are expected based on the spec's analysis, but verify).

- [ ] **Step 2: Lint and format**

Run: `npm run lint && npm run fmt:check`

Expected: PASS. If `fmt:check` fails, run `npm run fmt` and re-stage the formatted files before committing.

- [ ] **Step 3: If lint/format produced changes, commit them**

```bash
git add packages/engine/src/spells/spell.ts packages/engine/src/spells/spell.test.ts
git commit -m "Applied lint and format fixes to the spell-failure cast-effect changes."
```

If there were no changes, skip this commit.

---

## Notes

- The spec confirms that no `EffectType` value, `effects.json` entry, or client-side handler change is needed - everything reuses existing primitives.
- The "X failed to cast Y" log message lives in `packages/engine/src/rules.ts:226`. It runs after `cast()` returns, which is after every effect awaited inside `castFail` has resolved, so log ordering is preserved without any change to `rules.ts`.
- The `cast-beam` sound is emitted with `events.emit` (fire-and-forget), not `events.emitAsync`, matching the convention used by `SummonSpell.doCast` and the existing failure path.
- The `die` sound on the self-target branch is the same sound `SummonSpell.doCast` pairs with `SummonPiece` (see `summonspell.ts:172-174`).
