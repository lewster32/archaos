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
 * Game setup information.
 */
export interface SetupData {
    playerCount: number;
    boardSize: number;
    spellCount: number;
    players: SetupPlayer[];
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