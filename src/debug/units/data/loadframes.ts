import classicAtlasUrl from "@assets/spritesheets/classicunits.png";
import {
    frameBufferKey,
    type Direction,
    type EditableSpell,
    type FrameBuffer,
    type FrameBuffers,
    type FrameSlot,
} from "./types";

/**
 * Parses an atlas frame filename `<id>_<l|r>_<index|d>` into a
 * (direction, slot, index) triple. Returns `null` when the filename
 * does not match the convention.
 */
function parseFrameFilename(
    filename: string,
): { direction: Direction; slot: FrameSlot; index: number } | null {
    const m = filename.match(/_([lr])_(\d+|d)$/);
    if (!m) return null;
    const direction = m[1] as Direction;
    const idx = m[2];
    if (idx === "d") return { direction, slot: "death", index: 0 };
    return { direction, slot: "anim", index: parseInt(idx, 10) };
}

/**
 * Resolves the source PNG URL for an editable spell's first texture.
 * - Classic spells reuse the shared atlas import.
 * - Enhanced spells live under `public/images/units/enhanced/` and are
 *   served at `${BASE_URL}images/units/enhanced/<image>`.
 */
function resolveTextureUrl(spell: EditableSpell): string {
    const texture = spell.unit.textures[0];
    if (!texture) return "";
    if (texture.imageUrl) return texture.imageUrl;
    if (spell._origin === "classic") return classicAtlasUrl;
    const base = import.meta.env.BASE_URL ?? "/";
    const sep = base.endsWith("/") ? "" : "/";
    return `${base}${sep}images/units/enhanced/${texture.image}`;
}

/**
 * Decodes the unit's atlas PNG and slices it into per-frame
 * `FrameBuffer`s. Frames whose filename does not match the
 * `<id>_<l|r>_<index|d>` convention are silently skipped.
 *
 * Resolves to a fresh `FrameBuffers` map; rejects if the PNG fails to
 * load or decode.
 */
export async function loadFrameBuffers(
    spell: EditableSpell,
): Promise<FrameBuffers> {
    const buffers: FrameBuffers = new Map<string, FrameBuffer>();
    const texture = spell.unit.textures[0];
    if (!texture || texture.frames.length === 0) return buffers;

    const url = resolveTextureUrl(spell);
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not obtain 2D context for atlas decode");
    ctx.drawImage(img as unknown as CanvasImageSource, 0, 0);

    for (const frame of texture.frames) {
        const parsed = parseFrameFilename(frame.filename);
        if (!parsed) continue;
        const data = ctx.getImageData(
            frame.frame.x,
            frame.frame.y,
            frame.frame.w,
            frame.frame.h,
        );
        buffers.set(
            frameBufferKey(parsed.direction, parsed.slot, parsed.index),
            {
                data,
                undoStack: [],
                redoStack: [],
            },
        );
    }

    return buffers;
}
