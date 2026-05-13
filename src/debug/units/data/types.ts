/**
 * Shape of a single sprite frame in an atlas (matches the
 * TexturePacker JSON the game uses today).
 */
export interface Frame {
    filename: string;
    frame: { x: number; y: number; w: number; h: number };
    spriteSourceSize?: { x: number; y: number; w: number; h: number };
    sourceSize?: { w: number; h: number };
    rotated?: boolean;
    trimmed?: boolean;
}

/**
 * A texture (atlas + frames) attached to a unit.
 */
export interface Texture {
    image: string;
    format?: string;
    size: { w: number; h: number };
    scale?: number;
    frames: Frame[];
    /**
     * Optional resolved URL of the atlas PNG. Used by the preview to
     * avoid duplicating URL derivation logic. Not serialised on save.
     */
    imageUrl?: string;
}

/**
 * Editable unit data, kept reactive while the form is open. Wraps the
 * data the JSON schema models plus the textures used for preview.
 */
export interface EditableUnit {
    id: string;
    name: string;
    indefiniteArticle?: "a" | "an";
    attackType?: string;
    rangedType?: string;
    projectileType?: string;
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
    animFrames?: number[];
    animSpeed?: number;
    shadowScale?: number;
    textures: Texture[];
}

/**
 * Editable spell data, kept reactive while the form is open.
 *
 * Fields prefixed with `_` are editor-only and never serialised:
 * - `_origin` tracks whether this came from an `.amod` archive or
 *   from the classic JSON pair; the saved file shape is identical
 *   either way.
 * - `_originalId` is the load-time id (classic key or enhanced spell.id)
 *   used as the sidebar's v-for key so renaming does not reorder the
 *   sidebar mid-edit.
 * - `_dirty` is true after any input edit, false after Save/Reset.
 */
export interface EditableSpell {
    id: string;
    name: string;
    chance: number;
    balance: number;
    description?: string;
    group: "enhanced";
    types?: string[];
    spellFrame?: number;
    unit: EditableUnit;
    _origin: "enhanced" | "classic";
    _originalId: string;
    _dirty: boolean;
}

/**
 * Direction a unit's sprite faces. Atlas filenames follow the
 * `<unitId>_<direction>_<index|d>` convention.
 */
export type Direction = "l" | "r";

/**
 * Sprite frame role within a direction: animation frames are indexed
 * (0, 1, 2, ...) and play in the walk cycle; death is a single
 * special-purpose frame.
 */
export type FrameSlot = "anim" | "death";

/**
 * Identifies a single sprite frame within a unit's atlas.
 */
export interface FrameKey {
    direction: Direction;
    slot: FrameSlot;
    /** Animation frame index. Ignored when `slot === "death"`. */
    index: number;
}

/**
 * One pixel-paintable sprite frame plus its per-frame undo / redo
 * history. `data` is mutated in place by the painting tools.
 */
export interface FrameBuffer {
    /** 18x18 RGBA buffer. Source of truth for this frame's pixels. */
    data: ImageData;
    /** Pre-stroke snapshots, most-recent last. Bounded to 50 entries. */
    undoStack: ImageData[];
    /** Snapshots popped from undo, repopulated on redo. */
    redoStack: ImageData[];
}

/**
 * Map of every loaded frame buffer for a single spell, keyed by
 * `${direction}:${slot}:${index}`. Death-slot index is always 0.
 */
export type FrameBuffers = Map<string, FrameBuffer>;

/**
 * 8-bit-per-channel RGBA tuple used by the painting tool primitives.
 */
export type Rgba = readonly [r: number, g: number, b: number, a: number];

/**
 * Builds the canonical key string used in `FrameBuffers` map lookups.
 */
export function frameBufferKey(
    direction: Direction,
    slot: FrameSlot,
    index: number
): string {
    return slot === "death"
        ? `${direction}:death:0`
        : `${direction}:anim:${index}`;
}
