import { mirrorHorizontal } from "./paintops";
import {
    frameBufferKey,
    type EditableUnit,
    type Frame,
    type FrameBuffers,
} from "./types";

const FRAME_SIZE = 18;

/**
 * Phase 2B invariant: a unit either has both l:death:0 and r:death:0,
 * or neither. If exactly one is present, materialise the missing side
 * as a horizontal mirror of the present side. Idempotent.
 */
export function autoMirrorMissingDeath(
    buffers: FrameBuffers,
    _unit: EditableUnit,
): void {
    const lKey = frameBufferKey("l", "death", 0);
    const rKey = frameBufferKey("r", "death", 0);
    const lHas = buffers.has(lKey);
    const rHas = buffers.has(rKey);
    if (lHas && !rHas) {
        const src = buffers.get(lKey);
        if (!src) return;
        buffers.set(rKey, {
            data: mirrorHorizontal(src.data),
            undoStack: [],
            redoStack: [],
        });
    } else if (!lHas && rHas) {
        const src = buffers.get(rKey);
        if (!src) return;
        buffers.set(lKey, {
            data: mirrorHorizontal(src.data),
            undoStack: [],
            redoStack: [],
        });
    }
}

export interface PackedAtlas {
    atlasPngBytes: Uint8Array;
    framesMetadata: Frame[];
}

interface Cell {
    filename: string;
    col: number;
    row: number;
    data: ImageData;
}

/**
 * Pack the unit's FrameBuffers into a naive 18x18 grid PNG.
 *   Row 0 = L_anim sorted ascending, then L_death (if any).
 *   Row 1 = R_anim sorted ascending, then R_death (if any).
 * Atlas width = max(L_count, R_count) cells * 18; height = 36.
 */
export async function packBuffersToAtlas(
    buffers: FrameBuffers,
    unit: EditableUnit,
): Promise<PackedAtlas> {
    const lAnim: number[] = [];
    const rAnim: number[] = [];
    for (const key of buffers.keys()) {
        const m = key.match(/^([lr]):anim:(\d+)$/);
        if (!m) continue;
        const idx = parseInt(m[2], 10);
        if (m[1] === "l") lAnim.push(idx);
        else rAnim.push(idx);
    }
    lAnim.sort((a, b) => a - b);
    rAnim.sort((a, b) => a - b);

    const lDeath = buffers.has(frameBufferKey("l", "death", 0));
    const rDeath = buffers.has(frameBufferKey("r", "death", 0));
    const hasDeath = lDeath || rDeath;
    const animCount = Math.max(lAnim.length, rAnim.length);
    const colsPerRow = animCount + (hasDeath ? 1 : 0);
    const atlasW = colsPerRow * FRAME_SIZE;
    const atlasH = 2 * FRAME_SIZE;

    const cells: Cell[] = [];
    for (let c = 0; c < lAnim.length; c++) {
        const idx = lAnim[c];
        const buf = buffers.get(frameBufferKey("l", "anim", idx));
        if (buf) cells.push({ filename: `${unit.id}_l_${idx}`, col: c, row: 0, data: buf.data });
    }
    if (lDeath) {
        const buf = buffers.get(frameBufferKey("l", "death", 0));
        if (buf) cells.push({ filename: `${unit.id}_l_d`, col: animCount, row: 0, data: buf.data });
    }
    for (let c = 0; c < rAnim.length; c++) {
        const idx = rAnim[c];
        const buf = buffers.get(frameBufferKey("r", "anim", idx));
        if (buf) cells.push({ filename: `${unit.id}_r_${idx}`, col: c, row: 1, data: buf.data });
    }
    if (rDeath) {
        const buf = buffers.get(frameBufferKey("r", "death", 0));
        if (buf) cells.push({ filename: `${unit.id}_r_d`, col: animCount, row: 1, data: buf.data });
    }

    const canvas = document.createElement("canvas");
    canvas.width = atlasW;
    canvas.height = atlasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not obtain 2D context for atlas pack");

    const framesMetadata: Frame[] = [];
    for (const cell of cells) {
        ctx.putImageData(cell.data, cell.col * FRAME_SIZE, cell.row * FRAME_SIZE);
        framesMetadata.push({
            filename: cell.filename,
            frame: { x: cell.col * FRAME_SIZE, y: cell.row * FRAME_SIZE, w: FRAME_SIZE, h: FRAME_SIZE },
            sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE },
            spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
            trimmed: false,
            rotated: false,
        });
    }

    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Failed to encode atlas PNG");
    const buffer = new Uint8Array(await blob.arrayBuffer());
    return { atlasPngBytes: buffer, framesMetadata };
}
