/**
 * Events emitted by engine classes for client rendering
 * and UI synchronisation. The engine emits these; the
 * client subscribes to handle Phaser-specific rendering.
 */
export enum EngineEvent {
    /** AI is thinking — client should disable cursor. */
    AiThinking = "engine:ai-thinking",

    /** AI finished thinking — client should enable cursor. */
    AiActing = "engine:ai-acting",

    /** Camera should focus on the given pieces. */
    FocusPieces = "engine:focus-pieces",

    /** Camera should focus on a board position. */
    FocusPosition = "engine:focus-position",

    /** A visual/sound effect should be played. */
    EffectRequested = "engine:effect-requested",

    /** Show casting range indicator on the board. */
    ShowCastRange = "engine:show-cast-range",

    /** Reset/hide the casting range indicator. */
    ResetCastRange = "engine:reset-cast-range",

    /** Batch of spread actions for client replay. */
    SpreadBatch = "engine:spread-batch",

    /** Batch of turmoil teleports for client replay. */
    TurmoilBatch = "engine:turmoil-batch",
}
