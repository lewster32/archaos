import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager, States, Events } from './statemanager';
import type { Board } from './board';

describe('StateManager', () => {
    let sm: StateManager;

    beforeEach(() => {
        // Board is stored but never read by StateManager, so null is safe here
        sm = new StateManager(null as unknown as Board);
    });

    describe('initial state', () => {
        it('starts in the Idle state (can send StartGame)', () => {
            expect(sm.canSendEvent(Events.StartGame)).toBe(true);
        });

        it('cannot send NoSpellsAvailable from Idle', () => {
            expect(sm.canSendEvent(Events.NoSpellsAvailable)).toBe(false);
        });

        it('cannot send SpellsAvailable from Idle', () => {
            expect(sm.canSendEvent(Events.SpellsAvailable)).toBe(false);
        });

        it('cannot send SkipTurn from Idle', () => {
            expect(sm.canSendEvent(Events.SkipTurn)).toBe(false);
        });
    });

    describe('sendEvent', () => {
        it('returns true for a valid transition', async () => {
            const result = await sm.sendEvent(Events.StartGame);
            expect(result).toBe(true);
        });

        it('returns false for an invalid transition (wrong state)', async () => {
            const result = await sm.sendEvent(Events.NoSpellsAvailable);
            expect(result).toBe(false);
        });

        it('transitions to StartCastingPhase after StartGame', async () => {
            await sm.sendEvent(Events.StartGame);
            // Now SpellsAvailable is possible (we are in StartCastingPhase)
            expect(sm.canSendEvent(Events.SpellsAvailable)).toBe(true);
            expect(sm.canSendEvent(Events.StartGame)).toBe(false);
        });
    });

    describe('callback', () => {
        it('invokes the callback when a valid transition occurs', async () => {
            const callback = vi.fn();
            sm = new StateManager(null as unknown as Board, callback);
            await sm.sendEvent(Events.StartGame);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(States.StartCastingPhase);
        });

        it('does not invoke the callback when a transition is invalid', async () => {
            const callback = vi.fn();
            sm = new StateManager(null as unknown as Board, callback);
            await sm.sendEvent(Events.NoSpellsAvailable); // invalid from Idle
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('happy-path spell casting flow', () => {
        it('walks through the full casting sequence', async () => {
            // Idle → StartCastingPhase
            await sm.sendEvent(Events.StartGame);
            expect(sm.canSendEvent(Events.SpellsAvailable)).toBe(true);

            // StartCastingPhase → ChooseSpell
            await sm.sendEvent(Events.SpellsAvailable);
            expect(sm.canSendEvent(Events.SelectSpellTargetEnemyPiece)).toBe(true);

            // ChooseSpell → SelectSpellTargetEnemyPiece
            await sm.sendEvent(Events.SelectSpellTargetEnemyPiece);
            expect(sm.canSendEvent(Events.SelectSpellTargetEnemyPiece)).toBe(true);

            // SelectSpellTargetEnemyPiece → CastSpell
            await sm.sendEvent(Events.SelectSpellTargetEnemyPiece);
            expect(sm.canSendEvent(Events.CastSucceeded)).toBe(true);

            // CastSpell → ApplySpellEffect
            await sm.sendEvent(Events.CastSucceeded);
            expect(sm.canSendEvent(Events.CompleteSpellCasting)).toBe(true);

            // ApplySpellEffect → NextTurn
            await sm.sendEvent(Events.CompleteSpellCasting);
            expect(sm.canSendEvent(Events.AllPlayersTurnsComplete)).toBe(true);

            // NextTurn → StartMovementPhase
            await sm.sendEvent(Events.AllPlayersTurnsComplete);
            // StartMovementPhase has no outbound transitions defined yet
            expect(sm.canSendEvent(Events.AllPlayersTurnsComplete)).toBe(false);
        });

        it('handles cast failure: CastSpell → NextTurn via CastFailed', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);
            await sm.sendEvent(Events.SelectSpellTargetBoardTile);
            await sm.sendEvent(Events.SelectSpellTargetBoardTile);

            // CastSpell → NextTurn (on failure)
            expect(sm.canSendEvent(Events.CastFailed)).toBe(true);
            await sm.sendEvent(Events.CastFailed);
            expect(sm.canSendEvent(Events.PlayersStillHaveTurns)).toBe(true);
        });

        it('cycles back to ChooseSpell when more players have turns', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.NoSpellsAvailable); // → NextTurn

            // NextTurn → ChooseSpell (more players still have turns)
            await sm.sendEvent(Events.PlayersStillHaveTurns);
            expect(sm.canSendEvent(Events.SkipTurn)).toBe(true);
        });
    });

    describe('cancellation', () => {
        it('cancels spell target selection and returns to ChooseSpell', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);
            await sm.sendEvent(Events.SelectSpellTargetBoardTile);

            // SelectSpellTargetBoardTile → ChooseSpell on cancel
            expect(sm.canSendEvent(Events.CancelSpellCasting)).toBe(true);
            await sm.sendEvent(Events.CancelSpellCasting);

            // Back in ChooseSpell
            expect(sm.canSendEvent(Events.SkipTurn)).toBe(true);
            expect(sm.canSendEvent(Events.SelectSpellTargetAllyPiece)).toBe(true);
        });

        it('cancels ally piece target selection and returns to ChooseSpell', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);
            await sm.sendEvent(Events.SelectSpellTargetAllyPiece);

            await sm.sendEvent(Events.CancelSpellCasting);
            expect(sm.canSendEvent(Events.SkipTurn)).toBe(true);
        });

        it('cancels enemy piece target selection and returns to ChooseSpell', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);
            await sm.sendEvent(Events.SelectSpellTargetEnemyPiece);

            await sm.sendEvent(Events.CancelSpellCasting);
            expect(sm.canSendEvent(Events.SkipTurn)).toBe(true);
        });
    });

    describe('skip turn', () => {
        it('skips from ChooseSpell to NextTurn', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);

            await sm.sendEvent(Events.SkipTurn);
            expect(sm.canSendEvent(Events.PlayersStillHaveTurns)).toBe(true);
        });

        it('skips from SelectSpellTargetAllyPiece to NextTurn', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);
            await sm.sendEvent(Events.SelectSpellTargetAllyPiece);

            await sm.sendEvent(Events.SkipTurn);
            expect(sm.canSendEvent(Events.AllPlayersTurnsComplete)).toBe(true);
        });

        it('skips from SelectSpellTargetEnemyPiece to NextTurn', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);
            await sm.sendEvent(Events.SelectSpellTargetEnemyPiece);

            await sm.sendEvent(Events.SkipTurn);
            expect(sm.canSendEvent(Events.AllPlayersTurnsComplete)).toBe(true);
        });
    });

    describe('illusion selection flow', () => {
        it('routes through ChooseIllusion for spells that allow illusions', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);

            // ChooseSpell → ChooseIllusion
            await sm.sendEvent(Events.SelectSpellAllowIllusion);
            expect(sm.canSendEvent(Events.SelectIllusion)).toBe(true);

            // ChooseIllusion → SelectSpellTargetBoardTile
            await sm.sendEvent(Events.SelectIllusion);
            expect(sm.canSendEvent(Events.SelectSpellTargetBoardTile)).toBe(true);
        });
    });

    describe('immediate cast spells', () => {
        it('casts immediately with SelectSpellTargetSelf (self-target spells)', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);

            // ChooseSpell → CastSpell directly
            await sm.sendEvent(Events.SelectSpellTargetSelf);
            expect(sm.canSendEvent(Events.CastSucceeded)).toBe(true);
        });

        it('casts immediately with SelectSpellTargetNone', async () => {
            await sm.sendEvent(Events.StartGame);
            await sm.sendEvent(Events.SpellsAvailable);

            // ChooseSpell → CastSpell directly
            await sm.sendEvent(Events.SelectSpellTargetNone);
            expect(sm.canSendEvent(Events.CastSucceeded)).toBe(true);
        });
    });
});
