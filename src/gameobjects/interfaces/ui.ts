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
 * Log entries.
 */
export interface LogEntry {
    message: string;
    id: number;
    timestamp: Date;
    colour?: string;
}

/**
 * Generic rectangle with no position.
 */
export interface Box {
    width: number;
    height: number;
}

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
    callback: (spell: Spell) => void;
}

/**
 * Spellbook event data.
 */
export interface SpellbookEventData {
    caster: string;
    spells: Spell[];
}