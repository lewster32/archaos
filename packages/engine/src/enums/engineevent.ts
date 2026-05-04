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

    /**
     * A phase-changed broadcast outcome was emitted. Forwarded onto the
     * engine event bus so in-process listeners (UI, AI controllers) can
     * react without parsing the broadcast log. Payload is the matching
     * `PhaseChangedOutcome`.
     */
    PhaseChanged = "engine:phase-changed",

    /** Move-piece batch - payload describes a single move-piece command's full traversal. */
    MovePieceBatch = "engine:move-piece-batch",

    /** Attack-piece batch - payload describes a melee attack and its result. */
    AttackPieceBatch = "engine:attack-piece-batch",

    /** Ranged-attack-piece batch - payload describes a ranged attack and its result. */
    RangedAttackPieceBatch = "engine:ranged-attack-piece-batch",

    /** Mount-piece batch - payload describes a wizard mounting a piece. */
    MountPieceBatch = "engine:mount-piece-batch",

    /** Dismount-piece batch - payload describes a wizard dismounting a piece. */
    DismountPieceBatch = "engine:dismount-piece-batch",

    /** Select-piece visual - payload describes the visual side of a select-piece command. */
    SelectPieceVisual = "engine:select-piece-visual",

    /** Cancel-piece-action visual - payload describes a cancelled piece action. */
    CancelPieceActionVisual = "engine:cancel-piece-action-visual",

    /**
     * A command was rejected. Payload is a {@link CommandRejectedPayload}
     * so subscribers can react without polling the test-only buffer.
     */
    CommandRejected = "engine:command-rejected",
}
