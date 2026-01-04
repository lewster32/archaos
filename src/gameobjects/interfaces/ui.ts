/**
 * Interfaces for communication back and forth between the Phaser game logic and
 * the Vue UI components. This may be broken out further in future if needed.
 */

import type { Spell } from "../../gameobjects/spells/spell"
import type { Piece } from "../piece";

/**
 * Spellbook UI component data.
 */
export interface SpellbookData {
    show: boolean;
    minimised: boolean;
    caster: string | null;
    spells: Spell[] | null;
    onSelect: ((spell: Spell) => void) | null;
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
}

/**
 * Game setup information captured from the menu.
 */
export interface SetupData {
    playerCount: number;
    boardSize: number;
    spellCount: number;
    players: SetupPlayer[];
}

/**
 * Game setup data sent from the UI to the game logic.
 */
export interface GameSetupData {
    players: string[];
    board: Box;
    spellCount: number;
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
    phase?: string,
    currentPlayerIndex?: number,
}

/**
 * Game scenario player data.
 */
export interface GameScenarioPlayer {
    id: number;
    name: string;
    position: { x: number; y: number };
    wizCode?: string; // A random code will be generated if empty.
    pieces?: GameScenarioPiece[];
    spells?: string[]; // A simple list of spell names for now.
    computerControlled?: boolean;
}

/**
 * Game scenario piece data.
 */
export interface GameScenarioPiece {
    type: string; // The piece's name, e.g. 'Golden Dragon'
    position: { x: number; y: number };
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
}

/**
 * Spellbook open events.
 */
export interface SpellbookOpenEventData {
    data: SpellbookEventData;
    callback:  (spell: Spell) => Promise<void>;
}

/**
 * Spellbook event data.
 */
export interface SpellbookEventData {
    caster: string;
    spells: Spell[];
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
    defense: number;
    maneuverability: number;
    magicResistance: number;
    attackType: string;
    rangedType: string;
    status: string[];
}

/**
 * Unit configuration for display in the UI.
 */
export interface UnitConfig {
    attackType: string;
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
}