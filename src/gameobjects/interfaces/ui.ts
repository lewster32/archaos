import type { Spell } from "../../gameobjects/spells/spell"

/**
 * Data structure for the spellbook UI component.
 */
export interface SpellbookData {
    show: boolean;
    minimised: boolean;
    caster: string | null;
    spells: Spell[] | null;
    onSelect: ((spell: Spell) => void) | null;
}

/**
 * Data structure for a log entry in the game log.
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
 * Data structure for game setup information.
 */
export interface SetupData {
    playerCount: number;
    boardSize: number;
    spellCount: number;
    players: SetupPlayer[];
}