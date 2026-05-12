<template>
    <aside class="frame-strip">
        <section
            v-for="dir in directions"
            :key="dir"
            class="frame-strip__direction"
            :class="{ active: activeFrame.direction === dir }"
        >
            <h3>{{ dir.toUpperCase() }}</h3>
            <div class="frame-strip__row">
                <button
                    v-for="idx in animIndicesFor(dir)"
                    :key="`${dir}-${idx}`"
                    type="button"
                    class="frame-strip__thumb"
                    :class="{ active: isActive(dir, 'anim', idx) }"
                    :disabled="locked"
                    @click="select(dir, 'anim', idx)"
                >
                    <canvas
                        :ref="(el) => registerThumb(dir, 'anim', idx, el as HTMLCanvasElement | null)"
                        :width="THUMB"
                        :height="THUMB"
                        style="image-rendering: pixelated"
                    ></canvas>
                    <figcaption>{{ idx }}</figcaption>
                </button>
                <button
                    type="button"
                    class="frame-strip__add"
                    :disabled="locked"
                    @click="emit('appendAnimFrame')"
                >+ frame</button>
            </div>
            <div class="frame-strip__row">
                <button
                    v-if="hasDeath(dir)"
                    type="button"
                    class="frame-strip__thumb frame-strip__death"
                    :class="{ active: isActive(dir, 'death', 0) }"
                    :disabled="locked"
                    @click="select(dir, 'death', 0)"
                >
                    <canvas
                        :ref="(el) => registerThumb(dir, 'death', 0, el as HTMLCanvasElement | null)"
                        :width="THUMB"
                        :height="THUMB"
                        style="image-rendering: pixelated"
                    ></canvas>
                    <figcaption>d</figcaption>
                </button>
                <button
                    v-else
                    type="button"
                    class="frame-strip__add"
                    :disabled="locked"
                    @click="emit('addDeathFrame', dir)"
                >+ death</button>
                <button
                    v-if="hasDeath(dir)"
                    type="button"
                    class="frame-strip__clear"
                    :disabled="locked"
                    @click="emit('clearDeathFrame', dir)"
                >clear d</button>
            </div>
        </section>
    </aside>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from "vue";
import {
    frameBufferKey,
    type Direction,
    type FrameBuffers,
    type FrameKey,
    type FrameSlot,
} from "../data/types";

const props = defineProps<{
    buffers: FrameBuffers;
    animFrames: number[];
    activeFrame: FrameKey;
    frameVersion: number;
    locked: boolean;
}>();

const emit = defineEmits<{
    (e: "selectFrame", key: FrameKey): void;
    (e: "appendAnimFrame"): void;
    (e: "addDeathFrame", direction: Direction): void;
    (e: "clearDeathFrame", direction: Direction): void;
}>();

const THUMB = 18 * 4;
const directions: Direction[] = ["l", "r"];

const thumbs = new Map<string, HTMLCanvasElement>();
const tempCanvas = document.createElement("canvas");
tempCanvas.width = 18;
tempCanvas.height = 18;

function registerThumb(
    dir: Direction,
    slot: FrameSlot,
    index: number,
    el: HTMLCanvasElement | null,
): void {
    const k = frameBufferKey(dir, slot, index);
    if (el) thumbs.set(k, el);
    else thumbs.delete(k);
}

function animIndicesFor(dir: Direction): number[] {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const idx of props.animFrames ?? []) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        if (props.buffers.has(frameBufferKey(dir, "anim", idx))) out.push(idx);
    }
    for (const key of props.buffers.keys()) {
        const m = key.match(/^([lr]):anim:(\d+)$/);
        if (!m || m[1] !== dir) continue;
        const idx = parseInt(m[2], 10);
        if (!seen.has(idx)) {
            seen.add(idx);
            out.push(idx);
        }
    }
    out.sort((a, b) => a - b);
    return out;
}

function hasDeath(dir: Direction): boolean {
    return props.buffers.has(frameBufferKey(dir, "death", 0));
}

function isActive(dir: Direction, slot: FrameSlot, index: number): boolean {
    return (
        props.activeFrame.direction === dir &&
        props.activeFrame.slot === slot &&
        (slot === "death" || props.activeFrame.index === index)
    );
}

function select(direction: Direction, slot: FrameSlot, index: number): void {
    emit("selectFrame", { direction, slot, index });
}

async function repaintAll(): Promise<void> {
    await nextTick();
    for (const [k, el] of thumbs.entries()) {
        const buf = props.buffers.get(k);
        if (!buf) continue;
        const ctx = el.getContext("2d");
        if (!ctx) continue;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, el.width, el.height);
        const tctx = tempCanvas.getContext("2d");
        if (!tctx) continue;
        tctx.putImageData(buf.data, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0, el.width, el.height);
    }
}

watch(
    () => [props.frameVersion, props.buffers.size, props.animFrames],
    () => {
        void repaintAll();
    },
    { immediate: true, deep: true },
);

onBeforeUnmount(() => thumbs.clear());
</script>

<style scoped>
.frame-strip {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px;
    min-width: 200px;
}
.frame-strip__direction {
    border: 1px solid currentColor;
    padding: 6px;
}
.frame-strip__direction.active {
    border-color: #f5c54a;
}
.frame-strip__row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}
.frame-strip__thumb {
    padding: 2px;
    background: transparent;
    border: 1px solid currentColor;
    cursor: pointer;
}
.frame-strip__thumb.active {
    border-color: #f5c54a;
    box-shadow: 0 0 0 1px #f5c54a inset;
}
.frame-strip__thumb figcaption {
    font-size: 10px;
    text-align: center;
}
.frame-strip__add,
.frame-strip__clear {
    padding: 4px 8px;
    background: transparent;
    border: 1px dashed currentColor;
    cursor: pointer;
}
</style>
