import classicAtlasUrl from "@assets/spritesheets/classicunits.png";
import {
    frameBufferKey,
    type Direction,
    type EditableSpell,
    type FrameBuffer,
    type FrameBuffers,
    type FrameSlot,
} from "./types";

const FRAME_SIZE = 18;

/**
 * Parses an atlas frame filename `<id>_<l|r>_<index|d>` into a
 * (direction, slot, index) triple. Returns `null` when the filename
 * does not match the convention.
 */
function parseFrameFilename(filename: string): { direction: Direction; slot: FrameSlot; index: number } | null {
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
 * - Enhanced spells always carry a blob URL on `texture.imageUrl`,
 *   set by the .amod loader (or the editor's classic adapter).
 */
function resolveTextureUrl(spell: EditableSpell): string {
    const texture = spell.unit.textures[0];
    if (!texture) return "";
    if (texture.imageUrl) return texture.imageUrl;
    if (spell._origin === "classic") return classicAtlasUrl;
    return "";
}

/**
 * Decodes the unit's atlas PNG and slices it into per-frame
 * `FrameBuffer`s. Frames whose filename does not match the
 * `<id>_<l|r>_<index|d>` convention are silently skipped.
 *
 * Resolves to a fresh `FrameBuffers` map; rejects if the PNG fails to
 * load or decode.
 */
export async function loadFrameBuffers(spell: EditableSpell): Promise<FrameBuffers> {
    const buffers: FrameBuffers = new Map<string, FrameBuffer>();
    const texture = spell.unit.textures[0];
    if (!texture || texture.frames.length === 0) return buffers;

    const url = resolveTextureUrl(spell);
    const img = new Image();
    img.src = url;
    await img.decode();

    const atlas = document.createElement("canvas");
    atlas.width = img.naturalWidth;
    atlas.height = img.naturalHeight;
    const atlasCtx = atlas.getContext("2d");
    if (!atlasCtx) {
        throw new Error("Could not obtain 2D context for atlas decode");
    }
    atlasCtx.drawImage(img as unknown as CanvasImageSource, 0, 0);

    // Buffers are canonical 18x18 ImageData regardless of whether the
    // source frame was trimmed. Compose each frame onto a scratch 18x18
    // canvas, placing the (possibly trimmed) atlas region at the
    // spriteSourceSize offset so the editor always sees the full sprite
    // rather than a crop.
    const compose = document.createElement("canvas");
    compose.width = FRAME_SIZE;
    compose.height = FRAME_SIZE;
    const composeCtx = compose.getContext("2d");
    if (!composeCtx) {
        throw new Error("Could not obtain 2D context for frame compose");
    }

    for (const frame of texture.frames) {
        const parsed = parseFrameFilename(frame.filename);
        if (!parsed) continue;
        const dx = frame.spriteSourceSize?.x ?? 0;
        const dy = frame.spriteSourceSize?.y ?? 0;
        composeCtx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
        composeCtx.drawImage(
            atlas,
            frame.frame.x,
            frame.frame.y,
            frame.frame.w,
            frame.frame.h,
            dx,
            dy,
            frame.frame.w,
            frame.frame.h,
        );
        const data = composeCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE);
        buffers.set(frameBufferKey(parsed.direction, parsed.slot, parsed.index), {
            data,
            undoStack: [],
            redoStack: [],
        });
    }

    return buffers;
}
