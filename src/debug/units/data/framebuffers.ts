import { cloneImageData, mirrorHorizontal } from "./paintops";
import {
    frameBufferKey,
    type Direction,
    type EditableUnit,
    type FrameBuffer,
    type FrameBuffers,
} from "./types";

const FRAME_SIZE = 18;
const UNDO_LIMIT = 50;

function makeEmptyBuffer(): FrameBuffer {
    return {
        data: new ImageData(FRAME_SIZE, FRAME_SIZE),
        undoStack: [],
        redoStack: [],
    };
}

function makePlaceholderFrameMeta(
    unitId: string,
    direction: Direction,
    idxOrDeath: number | "d",
) {
    const tail = idxOrDeath === "d" ? "d" : String(idxOrDeath);
    return {
        filename: `${unitId}_${direction}_${tail}`,
        frame: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
        sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE },
        spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
        trimmed: false,
        rotated: false,
    };
}

/**
 * Appends a fresh transparent animation frame to both L and R, updates
 * `unit.animFrames` to reference the new index, and appends matching
 * placeholder metadata entries to `unit.textures[0].frames[]`. The
 * placeholder `frame.x/y = 0` is harmless because Phase 2A routes
 * pixel reads through the buffer map, and Phase 2B's save flow
 * recomputes `frame.x/y` during atlas packing.
 */
export function appendAnimFrame(
    buffers: FrameBuffers,
    unit: EditableUnit,
): number {
    const animFrames = unit.animFrames ?? [];
    const existingIndices: number[] = [];
    for (const key of buffers.keys()) {
        const m = key.match(/^[lr]:anim:(\d+)$/);
        if (m) existingIndices.push(parseInt(m[1], 10));
    }
    const fromBuffers = existingIndices.length
        ? Math.max(...existingIndices) + 1
        : 0;
    const fromAnim = animFrames.length
        ? Math.max(...animFrames, animFrames.length - 1) + 1
        : 0;
    const nextIndex = Math.max(fromBuffers, fromAnim);

    buffers.set(frameBufferKey("l", "anim", nextIndex), makeEmptyBuffer());
    buffers.set(frameBufferKey("r", "anim", nextIndex), makeEmptyBuffer());
    unit.animFrames = [...animFrames, nextIndex];
    const tex = unit.textures[0];
    if (tex) {
        tex.frames.push(makePlaceholderFrameMeta(unit.id, "l", nextIndex));
        tex.frames.push(makePlaceholderFrameMeta(unit.id, "r", nextIndex));
    }
    return nextIndex;
}

/**
 * Drops both L and R anim buffers and their metadata entries for the
 * given index, renumbering every higher index down by 1 so frame
 * indices stay contiguous. `unit.animFrames` is updated in lockstep:
 * all references to the removed index are stripped, and references
 * to higher indices are shifted down by 1 to track the renumber.
 *
 * No-op if the index is not present in the buffer map.
 */
export function removeAnimFrame(
    buffers: FrameBuffers,
    unit: EditableUnit,
    index: number,
): void {
    const lKey = frameBufferKey("l", "anim", index);
    const rKey = frameBufferKey("r", "anim", index);
    if (!buffers.has(lKey) && !buffers.has(rKey)) return;

    // Gather every higher index that needs to shift down.
    const higherIndices = new Set<number>();
    for (const key of buffers.keys()) {
        const m = key.match(/^[lr]:anim:(\d+)$/);
        if (!m) continue;
        const idx = parseInt(m[1], 10);
        if (idx > index) higherIndices.add(idx);
    }
    const sorted = [...higherIndices].toSorted((a, b) => a - b);

    // Delete the target buffers and metadata.
    buffers.delete(lKey);
    buffers.delete(rKey);
    const tex = unit.textures[0];
    if (tex) {
        tex.frames = tex.frames.filter(
            (f) =>
                f.filename !== `${unit.id}_l_${index}` &&
                f.filename !== `${unit.id}_r_${index}`,
        );
    }

    // Shift higher buffers + metadata down by 1.
    for (const oldIdx of sorted) {
        const newIdx = oldIdx - 1;
        for (const direction of ["l", "r"] as const) {
            const oldKey = frameBufferKey(direction, "anim", oldIdx);
            const buf = buffers.get(oldKey);
            if (!buf) continue;
            buffers.delete(oldKey);
            buffers.set(frameBufferKey(direction, "anim", newIdx), buf);
            if (tex) {
                const oldName = `${unit.id}_${direction}_${oldIdx}`;
                const newName = `${unit.id}_${direction}_${newIdx}`;
                for (const f of tex.frames) {
                    if (f.filename === oldName) f.filename = newName;
                }
            }
        }
    }

    // Update animFrames: drop the deleted index, shift higher down.
    if (unit.animFrames) {
        const next = unit.animFrames
            .filter((i) => i !== index)
            .map((i) => (i > index ? i - 1 : i));
        unit.animFrames = next.length > 0 ? next : undefined;
    }
}

/**
 * Duplicates an existing animation-frame pair. The new pair is
 * appended at the next available index (one past the current max) and
 * filled with horizontally-mirror-free clones of the source L and R
 * buffers. `animFrames` gains the new index at the end so the
 * duplicated frame plays in the cycle by default; matching placeholder
 * metadata is appended to `textures[0].frames[]`.
 *
 * Returns the new index, or -1 if either source buffer is missing.
 */
export function duplicateAnimFrame(
    buffers: FrameBuffers,
    unit: EditableUnit,
    sourceIndex: number,
): number {
    const lSrc = buffers.get(frameBufferKey("l", "anim", sourceIndex));
    const rSrc = buffers.get(frameBufferKey("r", "anim", sourceIndex));
    if (!lSrc || !rSrc) return -1;

    let nextIndex = 0;
    for (const key of buffers.keys()) {
        const m = key.match(/^[lr]:anim:(\d+)$/);
        if (!m) continue;
        const idx = parseInt(m[1], 10);
        if (idx + 1 > nextIndex) nextIndex = idx + 1;
    }

    buffers.set(frameBufferKey("l", "anim", nextIndex), {
        data: cloneImageData(lSrc.data),
        undoStack: [],
        redoStack: [],
    });
    buffers.set(frameBufferKey("r", "anim", nextIndex), {
        data: cloneImageData(rSrc.data),
        undoStack: [],
        redoStack: [],
    });

    unit.animFrames = [...(unit.animFrames ?? []), nextIndex];
    const tex = unit.textures[0];
    if (tex) {
        tex.frames.push(makePlaceholderFrameMeta(unit.id, "l", nextIndex));
        tex.frames.push(makePlaceholderFrameMeta(unit.id, "r", nextIndex));
    }
    return nextIndex;
}

/**
 * Creates an empty death buffer + metadata entry for one direction.
 * No-op if the direction already has a death frame.
 */
export function addDeathFrame(
    buffers: FrameBuffers,
    unit: EditableUnit,
    direction: Direction,
): void {
    const key = frameBufferKey(direction, "death", 0);
    if (buffers.has(key)) return;
    buffers.set(key, makeEmptyBuffer());
    const tex = unit.textures[0];
    if (
        tex &&
        !tex.frames.some((f) => f.filename === `${unit.id}_${direction}_d`)
    ) {
        tex.frames.push(makePlaceholderFrameMeta(unit.id, direction, "d"));
    }
}

/**
 * Drops the death buffer and metadata entry for one direction. No-op
 * if the direction has no death frame.
 */
export function clearDeathFrame(
    buffers: FrameBuffers,
    unit: EditableUnit,
    direction: Direction,
): void {
    buffers.delete(frameBufferKey(direction, "death", 0));
    const tex = unit.textures[0];
    if (tex) {
        tex.frames = tex.frames.filter(
            (f) => f.filename !== `${unit.id}_${direction}_d`,
        );
    }
}

function pushUndo(buf: FrameBuffer): void {
    buf.undoStack.push(cloneImageData(buf.data));
    if (buf.undoStack.length > UNDO_LIMIT) buf.undoStack.shift();
    buf.redoStack.length = 0;
}

/**
 * Non-destructive mirror: copies every source buffer to its
 * destination counterpart as a horizontal flip. Death is only mirrored
 * when the source has it; the destination's death (if any) is left
 * alone when source has none. Each overwritten destination buffer
 * pushes its pre-mirror contents onto the destination's `undoStack`
 * so the user can step back through individual frames.
 */
export function mirrorDirection(
    buffers: FrameBuffers,
    unit: EditableUnit,
    from: Direction,
    to: Direction,
): void {
    const animIndices = new Set<number>();
    for (const key of buffers.keys()) {
        const m = key.match(/^([lr]):anim:(\d+)$/);
        if (m && m[1] === from) animIndices.add(parseInt(m[2], 10));
    }
    for (const idx of animIndices) {
        const src = buffers.get(frameBufferKey(from, "anim", idx));
        if (!src) continue;
        const dstKey = frameBufferKey(to, "anim", idx);
        let dst = buffers.get(dstKey);
        if (!dst) {
            dst = makeEmptyBuffer();
            buffers.set(dstKey, dst);
            const tex = unit.textures[0];
            if (
                tex &&
                !tex.frames.some(
                    (f) => f.filename === `${unit.id}_${to}_${idx}`,
                )
            ) {
                tex.frames.push(
                    makePlaceholderFrameMeta(unit.id, to, idx),
                );
            }
        }
        pushUndo(dst);
        dst.data = mirrorHorizontal(src.data);
    }

    const srcDeath = buffers.get(frameBufferKey(from, "death", 0));
    if (srcDeath) {
        let dstDeath = buffers.get(frameBufferKey(to, "death", 0));
        if (!dstDeath) {
            addDeathFrame(buffers, unit, to);
            dstDeath = buffers.get(frameBufferKey(to, "death", 0));
        }
        if (dstDeath) {
            pushUndo(dstDeath);
            dstDeath.data = mirrorHorizontal(srcDeath.data);
        }
    }
}
