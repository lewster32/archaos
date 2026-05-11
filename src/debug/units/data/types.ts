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
 * - `_origin` tracks whether this came from `assets/data/enhanced/` or
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
