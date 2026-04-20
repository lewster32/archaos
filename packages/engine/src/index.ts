// @archaos/engine — headless game logic
// Modules will be re-exported here as they are extracted.
export { Point } from "./point";
export { EventEmitter } from "./events";

// Enums
export { ActionType } from "./enums/actiontype";
export { BoardEvent } from "./enums/boardevent";
export { BoardLayer } from "./enums/boardlayer";
export { BoardPhase } from "./enums/boardphase";
export { BoardState } from "./enums/boardstate";
export { Colour } from "./enums/colour";
export { CursorType } from "./enums/cursortype";
export { EventType } from "./enums/eventtype";
export { InputType } from "./enums/inputtype";
export { RangeType } from "./enums/rangetype";
export { SpellTarget } from "./enums/spelltarget";
export { SpellType } from "./enums/spelltype";
export { SpreadAction } from "./enums/spreadaction";
export { UnitAttackType } from "./enums/unitattacktype";

// Actions (batch payloads)
export type {
    SpreadResult,
    SpreadShrinkResult,
    SpreadGrowResult,
    SpreadIterationPayload,
    SpreadBatchPayload,
    TurmoilMoveResult,
    TurmoilBatchPayload,
} from "./actions";
export { UnitDirection } from "./enums/unitdirection";
export { UnitRangedProjectileType } from "./enums/unitrangedprojectiletype";
export { UnitStatus } from "./enums/unitstatus";
export { UnitType } from "./enums/unittype";
export { EffectType } from "./enums/effecttype";
export { EngineEvent } from "./enums/engineevent";

// Configs
export { type PieceConfig, type WizardConfig } from "./configs/piececonfig";
export { type PlayerConfig } from "./configs/playerconfig";
export { type SpellConfig } from "./configs/spellconfig";

// Models
export { Model } from "./models/model";
export { Entity } from "./models/entity";

// RNG
export { type IRNG, GameRNG, TestRNG, weightedRandomPick } from "./rng";

// PhaseMachine
export {
    PhaseMachine,
    type PhaseMachineStates,
    StartGame,
    GameEnd,
    SpellbookReady,
    SkipSpellbook,
    SpellsDone,
    NoSpellsCast,
    CastingReady,
    CastingDone,
    SpreadingDone,
    MovingReady,
    MovingDone,
    NextPlayer,
    SelectPiece,
    AdvanceToAttack,
    AdvanceToRangedAttack,
    PieceDeselected,
    RequestDismount,
    CompleteDismount,
    CancelDismount,
    SpellTargeting,
    SpellCastComplete,
} from "./phasemachine";

// Interfaces
export { type RemotePlayer } from "./interfaces/remoteplayer";
export { RemoteWizard } from "./interfaces/remotewizard";
export { type WizCode } from "./interfaces/wizcode";
export { type IUnitStats, type UnitProperties } from "./interfaces/unitproperties";
export {
    GameSetupPlayerType,
    type SpellbookData,
    type Box,
    type SetupPlayer,
    type SetupData,
    type GameSetupData,
    type GameSetupPlayer,
    type GameScenarioData,
    type GameScenarioPlayer,
    type GameScenarioPiece,
    type GameScenarioCheats,
    type GameScenarioWeather,
    type BoardUpdateEventData,
    type SpellbookOpenEventData,
    type SpellbookEventData,
    type UnitStats,
    type UnitConfig,
} from "./interfaces/ui";

// Logger
export { Logger, _resetLoggerForTesting, type Log } from "./logger";

// Player
export { Player, type PlayerAI } from "./player";

// Piece
export { Piece, PieceState } from "./piece";

// Wizard
export { Wizard, type WizCodeMax } from "./wizard";

// Spells
export { Spell, type SpellCastTarget } from "./spells/spell";
export { AttackSpell } from "./spells/attackspell";
export { SummonSpell } from "./spells/summonspell";
export { DisbelieveSpell } from "./spells/disbelievespell";
export { RaiseDeadSpell } from "./spells/raisedeadspell";
export { StatusEffectSpell } from "./spells/statuseffectspell";
export { SubversionSpell } from "./spells/subversionspell";
export { TurmoilSpell } from "./spells/turmoilspell";
export { createSpell } from "./spells/spellfactory";
export { chancePercent, chanceRounded, balanceIndicator, friendlyBalance } from "./spells/spellutils";

// Rules
export { Rules, _resetRulesForTesting } from "./rules";

// Board
export { Board } from "./board";
export type { SimplePoint, BoardDeps } from "./board";

// Alignment
export { Alignment } from "./alignment";

// Register the spell factory on Board to break the
// circular dependency (board → spellfactory →
// attackspell → board). Runs once when the engine
// package is first imported.
import { Board as _B } from "./board";
import { createSpell as _cs } from "./spells/spellfactory";
_B.registerSpellFactory(_cs);

// AI
export { ComputerWizard } from "./ai/computerwizard";

// Pathfinding
export { Node, Path, distance, getAngle, diagonalHeuristic, buildPath, isOpen, isClosed } from "./pathfinding";

// RangeGizmo
export { RangeGizmo } from "./rangegizmo";

// Protocol (message types for the authoritative engine / remote player
// boundary). Re-exports the full protocol surface so the client can
// participate in the same type system.
export * from "./protocol";
