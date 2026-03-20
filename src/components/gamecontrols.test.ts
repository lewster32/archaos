import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-vue';
import GameControls from './GameControls.vue';

const allHidden = { gameStarted: false, canEndTurn: false, canCancel: false, canDismount: false };
const allVisible = { gameStarted: true, canEndTurn: true, canCancel: true, canDismount: true };

describe('GameControls', () => {
    it('renders three labelled buttons', async () => {
        const screen = await render(GameControls, { props: allHidden });
        await expect.element(screen.getByTitle('End Turn')).toBeInTheDocument();
        await expect.element(screen.getByTitle('Cancel')).toBeInTheDocument();
        await expect.element(screen.getByTitle('Dismount')).toBeInTheDocument();
    });

    it('hides all buttons when game has not started', async () => {
        const screen = await render(GameControls, { props: allHidden });
        await expect.element(screen.getByTitle('End Turn')).toHaveClass('big-button--hide');
        await expect.element(screen.getByTitle('Cancel')).toHaveClass('big-button--hide');
        await expect.element(screen.getByTitle('Dismount')).toHaveClass('big-button--hide');
    });

    it('shows all buttons when game started and all actions available', async () => {
        const screen = await render(GameControls, { props: allVisible });
        await expect.element(screen.getByTitle('End Turn')).not.toHaveClass('big-button--hide');
        await expect.element(screen.getByTitle('Cancel')).not.toHaveClass('big-button--hide');
        await expect.element(screen.getByTitle('Dismount')).not.toHaveClass('big-button--hide');
    });

    it('hides end-turn button when canEndTurn is false', async () => {
        const screen = await render(GameControls, { props: { ...allVisible, canEndTurn: false } });
        await expect.element(screen.getByTitle('End Turn')).toHaveClass('big-button--hide');
    });

    it('shows end-turn button when gameStarted and canEndTurn are true', async () => {
        const screen = await render(GameControls, { props: allVisible });
        await expect.element(screen.getByTitle('End Turn')).not.toHaveClass('big-button--hide');
    });

    it('hides cancel button when canCancel is false', async () => {
        const screen = await render(GameControls, { props: { ...allVisible, canCancel: false } });
        await expect.element(screen.getByTitle('Cancel')).toHaveClass('big-button--hide');
    });

    it('shows cancel button when gameStarted and canCancel are true', async () => {
        const screen = await render(GameControls, { props: allVisible });
        await expect.element(screen.getByTitle('Cancel')).not.toHaveClass('big-button--hide');
    });

    it('hides dismount button when canDismount is false', async () => {
        const screen = await render(GameControls, { props: { ...allVisible, canDismount: false } });
        await expect.element(screen.getByTitle('Dismount')).toHaveClass('big-button--hide');
    });

    it('shows dismount button when gameStarted and canDismount are true', async () => {
        const screen = await render(GameControls, { props: allVisible });
        await expect.element(screen.getByTitle('Dismount')).not.toHaveClass('big-button--hide');
    });

    it('emits end-turn when end-turn button is clicked', async () => {
        const onEndTurn = vi.fn();
        const screen = await render(GameControls, { props: { ...allVisible, onEndTurn } });
        await screen.getByTitle('End Turn').click();
        expect(onEndTurn).toHaveBeenCalled();
    });

    it('emits cancel when cancel button is clicked', async () => {
        const onCancel = vi.fn();
        const screen = await render(GameControls, { props: { ...allVisible, onCancel } });
        await screen.getByTitle('Cancel').click();
        expect(onCancel).toHaveBeenCalled();
    });

    it('emits dismount when dismount button is clicked', async () => {
        const onDismount = vi.fn();
        const screen = await render(GameControls, { props: { ...allVisible, onDismount } });
        await screen.getByTitle('Dismount').click();
        expect(onDismount).toHaveBeenCalled();
    });

    it('hides all buttons when gameStarted is false regardless of capability flags', async () => {
        const screen = await render(GameControls, {
            props: { gameStarted: false, canEndTurn: true, canCancel: true, canDismount: true },
        });
        await expect.element(screen.getByTitle('End Turn')).toHaveClass('big-button--hide');
        await expect.element(screen.getByTitle('Cancel')).toHaveClass('big-button--hide');
        await expect.element(screen.getByTitle('Dismount')).toHaveClass('big-button--hide');
    });
});
