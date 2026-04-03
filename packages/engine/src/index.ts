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
export { UnitDirection } from "./enums/unitdirection";
export {
    UnitRangedProjectileType,
} from "./enums/unitrangedprojectiletype";
export { UnitStatus } from "./enums/unitstatus";
export { UnitType } from "./enums/unittype";

// Configs
export {
    type PieceConfig,
    type WizardConfig,
} from "./configs/piececonfig";
export { type PlayerConfig } from "./configs/playerconfig";
export { type SpellConfig } from "./configs/spellconfig";

// Interfaces
export { type RemotePlayer } from "./interfaces/remoteplayer";
export { RemoteWizard } from "./interfaces/remotewizard";
export { type WizCode } from "./interfaces/wizcode";
export {
    type IUnitStats,
    type UnitProperties,
} from "./interfaces/unitproperties";
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
    type BoardUpdateEventData,
    type SpellbookOpenEventData,
    type SpellbookEventData,
    type UnitStats,
    type UnitConfig,
} from "./interfaces/ui";
