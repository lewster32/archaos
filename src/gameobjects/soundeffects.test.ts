import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SoundEffects } from './soundeffects';
import { Scene } from 'phaser';

describe('SoundEffects', () => {
    let mockScene: any;
    let mockSound: any;
    let soundEffects: SoundEffects;

    beforeEach(() => {
        mockSound = {
            play: vi.fn(),
            destroy: vi.fn(),
        };
        mockScene = {
            sound: {
                addAudioSprite: vi.fn().mockReturnValue(mockSound),
            },
        };
        soundEffects = SoundEffects.getInstance(mockScene as unknown as Scene);
    });

    afterEach(() => {
        soundEffects.destroy();
        vi.restoreAllMocks();
    });

    it('should play a sound effect', () => {
        soundEffects.play('effect1');
        expect(mockSound.play).toHaveBeenCalledWith('effect1');
    });

    it('should play a sound effect asynchronously with options', async () => {
        vi.useFakeTimers();
        const promise = soundEffects.playAsync('effect2', { repeat: 2, delay: 100 });
        await vi.runAllTimersAsync();
        await promise;
        vi.useRealTimers();
        expect(mockSound.play).toHaveBeenCalledWith('effect2');
        expect(mockSound.play).toHaveBeenCalledTimes(2);
    });

    it('should play a sound effect asynchronously without options', async () => {
        await soundEffects.playAsync('effect4');
        expect(mockSound.play).toHaveBeenCalledWith('effect4');
    });

    it('should use default repeat and delay when options are empty', async () => {
        await soundEffects.playAsync('effect7', {});
        expect(mockSound.play).toHaveBeenCalledWith('effect7');
        expect(mockSound.play).toHaveBeenCalledTimes(1);
    });

    it('should return the existing instance on subsequent calls to getInstance', () => {
        const second = SoundEffects.getInstance(mockScene as unknown as Scene);
        expect(second).toBe(soundEffects);
        expect(mockScene.sound.addAudioSprite).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when playing a sound effect asynchronously', async () => {
        mockSound.play.mockImplementation(() => { throw new Error('Play error'); });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await soundEffects.playAsync('effect6');
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error playing sound effect 'effect6':", expect.any(Error));
    });

    it('should console error when playing a sound effect fails', () => {
        mockSound.play.mockImplementation(() => { throw new Error('Play error'); });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        soundEffects.play('effect5');
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error playing sound effect 'effect5':", expect.any(Error));
    });

    it('should handle errors when playing a sound effect', () => {
        mockSound.play.mockImplementation(() => { throw new Error('Play error'); });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        soundEffects.play('effect3');
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error playing sound effect 'effect3':", expect.any(Error));
    });

    it('should destroy the sound effects manager', () => {
        soundEffects.destroy();
        expect(mockSound.destroy).toHaveBeenCalled();
    });
});
