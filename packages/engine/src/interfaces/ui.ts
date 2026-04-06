/**
 * Interfaces for communication back and forth between the Phaser game logic and
 * the Vue UI components. This may be broken out further in future if needed.
 */

import type { Spell } from "../spells/spell";
import type { Piece } from "../piece";
import { UnitProperties } from "./unitproperties";

/**
 * Spellbook UI component data.
 */
export interface SpellbookData {
    show: boolean;
    minimised: boolean;
    caster: string | null;
    spells: Spell[] | null;
    onSelect: ((spell: Spell) => void) | null;
    preventSkip?: boolean;
}

/**
 * Generic rectangle with no position.
 */
export interface Box {
    width: number;
    height: number;
}

/**
 * Player setup information.
 */
export interface SetupPlayer {
    name: string;
    computerControlled?: boolean;
    difficulty?: number;
    wizCode?: string;
}

/**
 * Game setup information captured from the menu.
 */
export interface SetupData {
    playerCount: number;
    boardSize: number;
    spellCount: number;
    players: SetupPlayer[];
    classicSpells: boolean;
    classicBalance: boolean;
    difficulty: number;
    muteAudio: boolean;
    tutorial?: string;
}

/**
 * Game setup data sent from the UI to the game logic.
 */
export interface GameSetupData {
    players: SetupPlayer[];
    board: Box;
    spellCount: number;
    classicSpells: boolean;
    classicBalance: boolean;
    difficulty?: number;
    muteAudio?: boolean;
}

export enum GameSetupPlayerType {
    Local,
    Computer,
    Remote,
}

export interface GameSetupPlayer {
    name: string;
    type: GameSetupPlayerType;
    difficulty?: number;
    wizCode?: string;
}

/**
 * Game scenario data for starting a predefined scenario.
 */
export interface GameScenarioData {
    name: string;
    description?: string;
    board: Box;
    players: GameScenarioPlayer[];
    cheats?: GameScenarioCheats;
    phase?: string;
    currentPlayerIndex?: number;
    corpses?: GameScenarioPiece[];
    muteAudio?: boolean;
}

/**
 * Game scenario player data.
 */
export interface GameScenarioPlayer {
    id: number;
    name: string;
    position: { x: number; y: number };
    wizardProperties?: Partial<UnitProperties>;
    wizCode?: string; // A random code will be generated if empty.
    pieces?: GameScenarioPiece[];
    spells?: string[]; // A simple list of spell names for now.
    computerControlled?: boolean;
    statuses?: string[];
    difficulty?: number;

    /**
     * Per-player attack outcome override. When set, all attacks by this
     * player's units will be forced to hit (true) or miss (false), bypassing
     * normal dice rolls. Null or undefined uses normal rolls.
     */
    forceHit?: boolean | null;

    /**
     * Per-player spell cast outcome override. When set, all spells cast by
     * this player will be forced to succeed (true) or fail (false), bypassing
     * normal chance rolls. Null or undefined uses normal rolls.
     */
    forceCast?: boolean | null;
}

/**
 * Game scenario piece data.
 */
export interface GameScenarioPiece {
    type: string; // The piece's name, e.g. 'Golden Dragon'
    position: { x: number; y: number };
    statuses?: string[];

    /**
     * Optional overrides for the unit's base properties. Any values provided
     * here will replace the defaults loaded from the unit's JSON config. Useful
     * for tutorials and scenarios that need custom unit stats (e.g. an orc
     * with combat set to 0).
     */
    propertyOverrides?: {
        mov?: number;
        com?: number;
        rcm?: number;
        rng?: number;
        def?: number;
        mnv?: number;
        res?: number;
    };
}

/**
 * Game scenario cheats data.
 */
export interface GameScenarioCheats {
    /**
     * Force all attacks to hit (true), miss (false), or normal (null).
     */
    forceHit?: boolean | null;

    /**
     * Force all spells to cast successfully (true), fail (false), or normal
     * (null).
     */
    forceCast?: boolean | null;

    /**
     * Use short animation delays for actions (true), normal delays (false or
     * null). Useful during testing and debugging.
     */
    shortDelay?: boolean | null;
}

/**
 * Board update events.
 */
export interface BoardUpdateEventData {
    pieces: Piece[];
    board: Box;
    balance: number;
    balanceShift: number;
}

/**
 * Spellbook open events.
 */
export interface SpellbookOpenEventData {
    data: SpellbookEventData;
    callback: (spell: Spell) => Promise<void>;
}

/**
 * Spellbook event data.
 */
export interface SpellbookEventData {
    caster: string;
    spells: Spell[];
    /**
     * If true, the spellbook will immediately show on opening.
     */
    soloMode: boolean;
    /**
     * If true, the player must select a spell before proceeding.
     */
    preventSkip?: boolean;
}

/**
 * Unit statistics for display in the UI.
 */
export interface UnitStats {
    id: string;
    name: string;
    movement: number;
    combat: number;
    rangedCombat: number;
    range: number;
    defence: number;
    manoeuvrability: number;
    magicResistance: number;
    attackType: string;
    rangedType: string;
    projectileType: string;
    status: string[];
    group?: string;
}

/**
 * Unit configuration for display in the UI.
 */
export interface UnitConfig {
    attackType: string;
    rangedType: string;
    projectileType: string;
    properties: {
        mov: number;
        com: number;
        rcm: number;
        rng: number;
        def: number;
        mnv: number;
        res: number;
    };
    status: string[];
    name: string;
    dead: boolean;
    wizard: boolean;
    textures?: any[];
    group?: string;
    id?: string;
}
