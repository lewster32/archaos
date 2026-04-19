/**
 * Unique identifier for a player. Assigned by the server at session start.
 */
export type PlayerId = number;

/**
 * Unique identifier for a piece instance. Matches Model.id from the engine.
 */
export type PieceId = number;

/**
 * Unique identifier for a spell instance. Matches Model.id from the engine.
 * Distinct from {@link SpellTypeId} — a spellbook may hold several instances
 * of the same type.
 */
export type SpellId = number;

/**
 * Reference to a spell's canonical type in the spell data
 * (classicspells.json or the enhanced spell definitions). Used by the client
 * to resolve name, graphics, chance, balance, etc.
 */
export type SpellTypeId = string;

/**
 * Client-generated unique identifier for a command, echoed back on the
 * resulting broadcast event or command-rejected private event.
 */
export type CommandId = string;

/**
 * Monotonically increasing sequence number assigned by the authoritative
 * engine to each broadcast event and snapshot.
 */
export type Sequence = number;

/**
 * Reference to a broadcast event's Sequence, carried by private events that
 * accompany that broadcast.
 */
export type SequenceRef = number;

/**
 * Per-player session token issued at session start. Carried on every command
 * for defence-in-depth authorisation.
 */
export type Token = string;

/**
 * A 2D board coordinate.
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * JSON primitive value — anything that round-trips through
 * JSON.parse(JSON.stringify(value)).
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Any JSON-serialisable value.
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * A JSON object: string keys, JsonValue values.
 */
export interface JsonObject {
    [key: string]: JsonValue;
}

/**
 * A JSON array of JsonValue.
 */
export type JsonArray = JsonValue[];
