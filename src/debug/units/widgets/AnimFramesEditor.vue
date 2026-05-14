<!-- src/debug/units/widgets/AnimFramesEditor.vue -->
<template>
    <div class="anim-frames-editor">
        <p v-if="availableIndices.length === 0" class="anim-frames-editor__empty">(no frames available)</p>
        <ol v-else class="anim-frames-editor__rows">
            <li v-for="(frameIndex, slot) in modelValue" :key="slot">
                <canvas
                    :ref="(el) => registerCanvas(slot, el as HTMLCanvasElement | null)"
                    :width="FRAME_SIZE * SCALE"
                    :height="FRAME_SIZE * SCALE"
                    style="image-rendering: pixelated"
                ></canvas>
                <select :value="frameIndex" @change="onChangeIndex(slot, $event)">
                    <option v-for="i in availableIndices" :key="i" :value="i">
                        {{ i }}
                    </option>
                </select>
                <button class="button button--small" type="button" @click="moveUp(slot)" :disabled="slot === 0">
                    <i class="icon icon--up"></i>
                </button>
                <button
                    class="button button--small"
                    type="button"
                    @click="moveDown(slot)"
                    :disabled="slot === modelValue.length - 1"
                >
                    <i class="icon icon--down"></i>
                </button>
                <button class="button button--small button--red" type="button" @click="remove(slot)">&times;</button>
            </li>
        </ol>
        <button
            v-if="availableIndices.length"
            type="button"
            @click="addSlot"
            class="button button--cyan button--small anim-frames-editor__add"
        >
            <i class="icon icon--add"></i> Add frame
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, watch } from "vue";
import { frameBufferKey, type EditableUnit, type Frame, type FrameBuffers } from "../data/types";

const FRAME_RE = /^(.+?)_l_(\d+|d)$/;
const FRAME_SIZE = 18;
const SCALE = 2;

const props = defineProps<{
    modelValue: number[];
    unit: EditableUnit;
    buffers?: FrameBuffers;
    frameVersion?: number;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: number[]];
}>();

/**
 * The set of left-direction walk frame indices available for this unit.
 * Excludes `_l_d` (corpse frame). Sorted ascending.
 */
const indexedFrames = computed<{ index: number; frame: Frame }[]>(() => {
    const texture = props.unit.textures[0];
    if (!texture) return [];
    const out: { index: number; frame: Frame }[] = [];
    for (const frame of texture.frames) {
        const match = FRAME_RE.exec(frame.filename);
        if (!match) continue;
        const suffix = match[2];
        if (suffix === "d") continue;
        const index = Number(suffix);
        if (Number.isNaN(index)) continue;
        out.push({ index, frame });
    }
    out.sort((a, b) => a.index - b.index);
    return out;
});

const availableIndices = computed(() => indexedFrames.value.map((f) => f.index));

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): HTMLImageElement {
    const cached = imageCache.get(url);
    if (cached) return cached;
    const img = new Image();
    img.src = url;
    imageCache.set(url, img);
    return img;
}

const canvases = new Map<number, HTMLCanvasElement>();
const tempCanvas = document.createElement("canvas");
tempCanvas.width = FRAME_SIZE;
tempCanvas.height = FRAME_SIZE;

function registerCanvas(slot: number, el: HTMLCanvasElement | null): void {
    if (el) {
        canvases.set(slot, el);
        void nextTick(redraw);
    } else {
        canvases.delete(slot);
    }
}

function redraw(): void {
    const texture = props.unit.textures[0];
    if (!texture) return;
    const url = texture.imageUrl ?? "";
    const img = url ? loadImage(url) : null;
    const draw = (): void => {
        for (const [slot, canvas] of canvases) {
            const frameIndex = props.modelValue[slot];
            const entry = indexedFrames.value.find((e) => e.index === frameIndex);
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!entry) continue;
            // Prefer live painted pixels from the buffers map when
            // available so the sequence preview reflects in-progress
            // edits rather than the frozen source atlas.
            const buf = props.buffers?.get(`l:anim:${frameIndex}`);
            if (buf) {
                const tctx = tempCanvas.getContext("2d");
                if (!tctx) continue;
                tctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
                tctx.putImageData(buf.data, 0, 0);
                ctx.drawImage(tempCanvas, 0, 0, FRAME_SIZE * SCALE, FRAME_SIZE * SCALE);
                continue;
            }
            if (!img) continue;
            const f = entry.frame.frame;
            const dx = entry.frame.spriteSourceSize
                ? entry.frame.spriteSourceSize.x * SCALE
                : Math.floor((FRAME_SIZE - f.w) / 2) * SCALE;
            const dy = entry.frame.spriteSourceSize
                ? entry.frame.spriteSourceSize.y * SCALE
                : Math.floor((FRAME_SIZE - f.h) / 2) * SCALE;
            ctx.drawImage(img, f.x, f.y, f.w, f.h, dx, dy, f.w * SCALE, f.h * SCALE);
        }
    };
    if (!img || img.complete) {
        draw();
    } else {
        img.addEventListener("load", draw, { once: true });
    }
}

watch(
    () => [props.modelValue, props.unit.textures.length, props.frameVersion],
    () => {
        void nextTick(redraw);
    },
);

onBeforeUnmount(() => {
    canvases.clear();
});

function onChangeIndex(slot: number, event: Event): void {
    const target = event.target as HTMLSelectElement;
    const value = Number(target.value);
    const next = props.modelValue.slice();
    next[slot] = value;
    emit("update:modelValue", next);
}

function moveUp(slot: number): void {
    if (slot === 0) return;
    const next = props.modelValue.slice();
    const tmp = next[slot - 1];
    next[slot - 1] = next[slot];
    next[slot] = tmp;
    emit("update:modelValue", next);
}

function moveDown(slot: number): void {
    if (slot === props.modelValue.length - 1) return;
    const next = props.modelValue.slice();
    const tmp = next[slot + 1];
    next[slot + 1] = next[slot];
    next[slot] = tmp;
    emit("update:modelValue", next);
}

function remove(slot: number): void {
    const next = props.modelValue.slice();
    next.splice(slot, 1);
    emit("update:modelValue", next);
}

function addSlot(): void {
    const defaultIndex =
        props.modelValue.length > 0 ? props.modelValue[props.modelValue.length - 1] : (availableIndices.value[0] ?? 0);
    emit("update:modelValue", [...props.modelValue, defaultIndex]);
}
</script>

<style lang="scss" scoped>
.anim-frames-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    &__rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    canvas {
        background: var(--color-dark-grey);
        border: 2px solid #111;
    }

    select {
        font-family: inherit;
        font-size: 0.85rem;
        padding: 0.2rem 0.4rem;
        background: var(--color-dark-grey);
        color: var(--color-white);
        border: 2px solid #111;
        border-radius: 3px;
        cursor: pointer;
    }

    button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    &__add {
        align-self: flex-start;
    }

    &__empty {
        margin: 0;
        color: var(--color-grey);
        font-style: italic;
    }
}
</style>
