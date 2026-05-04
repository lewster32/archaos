# Spell Failure Cast Effect - Design Spec

## Summary

When a spell fails its cast roll, the visual feedback should mirror a real
cast attempt:

- For target-targeted spells: the wizard performs the casting flourish, the
  cast-beam sound plays, a beam travels to the target tile, and then the
  fizzle effect plays at the target tile (not at the wizard's tile).
- For self-cast spells: the wizard performs the casting flourish, then a
  short burst plays at the wizard's tile (the existing `SummonPiece`
  effect, which is a point-source sparkle visual using the same purple
  palette as `WizardCasting` / `WizardCastBeam`), then the fizzle. The
  cast-beam sound is *not* played for self-casts because no beam is drawn.

The `die` sound is paired with the fizzle in both sequences - it accents
the moment the magic collapses regardless of whether a beam was drawn.

## Motivation

Currently a failed spell plays only `WizardCastFail` at the wizard's tile.
This reads as "nothing happened" - the player doesn't see where they were
aiming, and there is no visual or audible cue that the cast was even
attempted. The desired behaviour shows the cast was attempted (flourish,
plus a beam to the target tile when there is one), and then plays the
fizzle at the destination, giving the failure weight and reinforcing the
targeting.

## Current behaviour

`packages/engine/src/spells/spell.ts`

- `cast()` (line 474) rolls for success; on failure calls
  `castFail(owner, castingPiece)` and returns `null`.
- `castFail()` (line 519) sets `_failed = true`, resets `_castTimes`, and
  emits a single `WizardCastFail` effect with `pieceId: castingPiece.id` -
  rendered at the wizard's tile.

`packages/engine/src/rules.ts`

- `doCastSpell()` line 225-226 logs `"X failed to cast Y"` after `cast()`
  returns. This already runs after the fizzle effect, so log timing is
  preserved automatically.

`src/gameobjects/board.ts`

- The `EffectRequested` handler (line 213-255) already supports
  `startPieceId` + `targetPosition` for beam effects, and accepts
  `targetPosition` without `pieceId` to play a positional effect at a tile.
  No new client wiring is required.

## Design

### Failure sequence for a target-targeted spell (target tile != caster tile)

1. Emit `EngineEvent.EffectRequested` with `sound: "cast-beam"`.
2. `await` `EffectRequested` with `type: WizardCasting, pieceId: caster.id`.
3. Emit `EffectRequested` with `sound: "die"` (pairs with the fizzle
   coming next).
4. `await` `EffectRequested` with `type: WizardCastBeam,
   startPieceId: caster.id, targetPosition: { x, y }`.
5. `await` `EffectRequested` with `type: WizardCastFail,
   targetPosition: { x, y }` (no `pieceId` - plays at the tile, not the
   wizard).

### Failure sequence for a self-target spell (or no target supplied)

1. `await` `EffectRequested` with `type: WizardCasting, pieceId: caster.id`.
2. Emit `EffectRequested` with `sound: "die"` (pairs with the burst that
   follows; this is the same pairing `SummonSpell.doCast` uses for
   `SummonPiece`, see `summonspell.ts:172`).
3. `await` `EffectRequested` with `type: SummonPiece, pieceId: caster.id`
   (reuses the existing point-source sparkle burst).
4. `await` `EffectRequested` with `type: WizardCastFail,
   pieceId: caster.id`.

No `cast-beam` sound is emitted - the burst represents the magic gathering
and impacting at the wizard's tile, with no travelling beam.

The decision between the two sequences is based on whether `castPoint` was
supplied to `cast()` and whether it differs from the casting piece's
position.

### Code changes

No new effect entry or enum value is needed - `SummonPiece` already exists
in both `EffectType` (`packages/engine/src/enums/effecttype.ts`) and
`assets/data/effects.json`. It is currently emitted only by `SummonSpell`
on success; this spec also uses it on the self-cast failure path.

`packages/engine/src/spells/spell.ts`

1. `cast()` already computes `castPoint` from the `target` argument. Pass it
   through to `castFail()`:
   ```ts
   if (this._castTimes === this._totalCastTimes && !this.roll()) {
       await this.castFail(owner, castingPiece, castPoint);
       return null;
   }
   ```
2. Update `castFail` signature and body:
   ```ts
   async castFail(
       owner: Player<P>,
       castingPiece: P,
       castPoint?: Point,
   ): Promise<void> {
       this._failed = true;
       this._castTimes = 0;

       const isSelfTarget =
           !castPoint ||
           (castPoint.x === castingPiece.position.x &&
               castPoint.y === castingPiece.position.y);

       if (!isSelfTarget) {
           this._board.events.emit(EngineEvent.EffectRequested, {
               sound: "cast-beam",
           });
       }
       await this._board.events.emitAsync(EngineEvent.EffectRequested, {
           type: EffectType.WizardCasting,
           pieceId: castingPiece.id,
       });

       this._board.events.emit(EngineEvent.EffectRequested, {
           sound: "die",
       });

       if (isSelfTarget) {
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

No changes are needed to `rules.ts`, `board.ts`, `effecttype.ts`,
`effects.json`, individual spell classes, or the `EffectRequested` payload.

### Multi-target spells

Multi-target spells (e.g. a 3-cast Lightning) only enter `castFail()` on the
first cast attempt of the multi-cast (the existing
`if (this._castTimes === this._totalCastTimes && !this.roll())` guard
ensures this). The `castPoint` passed through is the originally-clicked
target tile, so the fizzle plays there.

### Why generic `WizardCastBeam` (not spell-specific beams) on failure

A failed Magic Bolt won't play `MagicBoltBeam` - it plays the generic
`WizardCastBeam`. A failure means the spell never manifested, so the
spell-specific projectile would be misleading. The generic beam reads as
"the wizard tried to project a spell" without committing to any particular
spell type's visual identity.

## Testing

`packages/engine/src/spells/spell.test.ts`

- The existing test "emits EffectRequested with WizardCastFail" (line 1124)
  needs updating. Replace the single-effect assertion with the new
  expected sequence for the case under test.
- Add a new test for the self-target fallback path: call `castFail` with
  no `castPoint` (or with `castPoint` equal to the caster's position) and
  assert that:
  - No `cast-beam` sound is emitted.
  - `WizardCasting` is emitted with `pieceId`.
  - `die` sound is emitted.
  - `SummonPiece` is emitted with `pieceId`.
  - `WizardCastFail` is emitted with `pieceId` (not `targetPosition`).
  - `WizardCastBeam` is *not* emitted.
- Add a new test for the target-targeted path: call `castFail` with a
  distinct `castPoint` and assert the sequence:
  - `cast-beam` sound is emitted.
  - `WizardCasting` is emitted with `pieceId`.
  - `WizardCastBeam` is emitted with `startPieceId` + `targetPosition`.
  - `WizardCastFail` is emitted with `targetPosition`.
  - `SummonPiece` is *not* emitted.

`packages/engine/src/spells/summonspell.test.ts`

- The existing summon-success tests assert `WizardCasting` and
  `WizardCastBeam` are emitted from `doCast`. These remain unaffected -
  failures route through `castFail` and never enter `doCast`.

No new tests are required for `effectemitter.test.ts` because no new
effect type is being added.

Run with:
```
npx vitest run --project=engine packages/engine/src/spells/spell.test.ts
```

## Out of scope

- Replacing `WizardCastBeam` with spell-specific beams on failure.
- Restructuring how successful casts emit `WizardCasting` /
  `WizardCastBeam` (currently inconsistent across spell classes - some
  emit them, some only emit a sound). This spec only changes the failure
  path.
- Adjusting `SummonPiece`'s appearance or sound pairing in its existing
  use site (`SummonSpell.doCast`).
- Changes to the failure log message wording or colour.
