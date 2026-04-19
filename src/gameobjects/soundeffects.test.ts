import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SoundEffects } from "./soundeffects";
import { Scene } from "phaser";

vi.mock("./chaossounds", () => ({
    playSound: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@assets/data/chaossounds.json", () => ({
    default: [
        {
            id: "new-turn",
            outerCount: 1,
            middleCount: 1,
            pitch: [1, 1, 1, 1],
            increments: [0, 0, 0, 0],
        },
    ],
}));

import { playSound } from "./chaossounds";

describe("SoundEffects", () => {
    let mockScene: any;
    let mockSound: any;
    let soundEffects: SoundEffects;

    beforeEach(() => {
        mockSound = {
            play: vi.fn(),
            destroy: vi.fn(),
            manager: { mute: false },
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

    it("should play a sound effect", () => {
        soundEffects.play("effect1", false);
        expect(mockSound.play).toHaveBeenCalledWith("effect1");
    });

    it("should play a sound effect asynchronously with options", async () => {
        vi.useFakeTimers();
        const promise = soundEffects.playAsync("effect2", { repeat: 2, delay: 100 }, false);
        await vi.runAllTimersAsync();
        await promise;
        vi.useRealTimers();
        expect(mockSound.play).toHaveBeenCalledWith("effect2");
        expect(mockSound.play).toHaveBeenCalledTimes(2);
    });

    it("should play a sound effect asynchronously without options", async () => {
        await soundEffects.playAsync("effect4", undefined, false);
        expect(mockSound.play).toHaveBeenCalledWith("effect4");
    });

    it("should use default repeat and delay when options are empty", async () => {
        await soundEffects.playAsync("effect7", {}, false);
        expect(mockSound.play).toHaveBeenCalledWith("effect7");
        expect(mockSound.play).toHaveBeenCalledTimes(1);
    });

    it("should return the existing instance on subsequent calls to getInstance", () => {
        const second = SoundEffects.getInstance(mockScene as unknown as Scene);
        expect(second).toBe(soundEffects);
        expect(mockScene.sound.addAudioSprite).toHaveBeenCalledTimes(1);
    });

    it("should handle errors when playing a sound effect asynchronously", async () => {
        mockSound.play.mockImplementation(() => {
            throw new Error("Play error");
        });
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        await soundEffects.playAsync("effect6", undefined, false);
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error playing sound effect 'effect6':", expect.any(Error));
    });

    it("should console error when playing a sound effect fails", () => {
        mockSound.play.mockImplementation(() => {
            throw new Error("Play error");
        });
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        soundEffects.play("effect5", false);
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error playing sound effect 'effect5':", expect.any(Error));
    });

    it("should handle errors when playing a sound effect", () => {
        mockSound.play.mockImplementation(() => {
            throw new Error("Play error");
        });
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        soundEffects.play("effect3", false);
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error playing sound effect 'effect3':", expect.any(Error));
    });

    it("should destroy the sound effects manager", () => {
        soundEffects.destroy();
        expect(mockSound.destroy).toHaveBeenCalled();
    });

    it("should dispatch to the chaos sound generator by default", () => {
        soundEffects.play("new-turn");
        expect(playSound).toHaveBeenCalledWith(expect.objectContaining({ id: "new-turn" }));
        expect(mockSound.play).not.toHaveBeenCalled();
    });

    it("should log an error when the generated sound id is unknown", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        soundEffects.play("does-not-exist");
        // Allow the fire-and-forget promise chain to settle
        await Promise.resolve();
        await Promise.resolve();
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error playing sound effect 'does-not-exist':", expect.any(Error));
    });

    it("should await the chaos sound generator in playAsync by default", async () => {
        await soundEffects.playAsync("new-turn");
        expect(playSound).toHaveBeenCalledWith(expect.objectContaining({ id: "new-turn" }));
        expect(mockSound.play).not.toHaveBeenCalled();
    });

    it("should log an error when playAsync is given an unknown generated id", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        await soundEffects.playAsync("does-not-exist");
        expect(consoleErrorSpy).toHaveBeenCalledWith("Error playing sound effect 'does-not-exist':", expect.any(Error));
    });

    it("should skip the chaos sound generator when the sound manager is muted", async () => {
        vi.mocked(playSound).mockClear();
        mockSound.manager.mute = true;
        await soundEffects.playAsync("new-turn");
        soundEffects.play("new-turn");
        expect(playSound).not.toHaveBeenCalled();
    });
});
