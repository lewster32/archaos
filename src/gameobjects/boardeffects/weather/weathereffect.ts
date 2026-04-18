export interface WeatherEffect {
    /**
     * Start the weather effect. This will typically involve adding particles,
     * timers, and other game objects to the board's scene. The effect should
     * be fully visible and active after this method is called.
     */
    start(): void;

    /**
     * Destroy the weather effect. This should clean up any particles, timers,
     * or other game objects that were created by the effect, and restore the
     * board to its normal state. After this method is called, the effect should
     * no longer be visible or active on the board.
     */
    destroy(): void;
}

export enum WeatherType {
    Rain = "rain",
    Snow = "snow",
}
