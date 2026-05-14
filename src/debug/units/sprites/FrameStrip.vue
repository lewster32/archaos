<template>
    <section class="callout frame-strip">
        <h2>Frames</h2>
        <section
            v-for="dir in directions"
            :key="dir"
            class="frame-strip__direction"
            :class="{ active: activeFrame.direction === dir }"
        >
            <h3 class="frame-strip__label">{{ dir.toLowerCase() === "l" ? "Left" : "Right" }}</h3>
            <div class="frame-strip__row">
                <div v-for="idx in animIndicesFor(dir)" :key="`${dir}-${idx}`" class="frame-strip__cell">
                    <button
                        type="button"
                        class="button button--small frame-strip__thumb"
                        :class="{ 'button--yellow': isActive(dir, 'anim', idx) }"
                        :disabled="locked"
                        @click="select(dir, 'anim', idx)"
                    >
                        <canvas
                            :ref="(el) => registerThumb(dir, 'anim', idx, el as HTMLCanvasElement | null)"
                            :width="THUMB"
                            :height="THUMB"
                            class="frame-strip__canvas"
                        ></canvas>
                        <span class="frame-strip__caption">{{ idx }}</span>
                    </button>
                    <div class="frame-strip__actions">
                        <button
                            type="button"
                            class="button button--small button--cyan frame-strip__action"
                            :disabled="locked"
                            title="Duplicate this frame pair"
                            @click="emit('duplicateAnimFrame', idx)"
                        >
                            +
                        </button>
                        <button
                            type="button"
                            class="button button--small button--red frame-strip__action"
                            :disabled="locked"
                            title="Delete this frame pair"
                            @click="emit('removeAnimFrame', idx)"
                        >
                            x
                        </button>
                    </div>
                </div>
                <button
                    v-if="animIndicesFor(dir).length === 0"
                    type="button"
                    class="button button--small button--cyan"
                    :disabled="locked"
                    @click="emit('appendAnimFrame')"
                >
                    + first frame
                </button>
            </div>
            <div class="frame-strip__row">
                <div v-if="hasDeath(dir)" class="frame-strip__cell">
                    <button
                        type="button"
                        class="button button--small frame-strip__thumb"
                        :class="{ 'button--yellow': isActive(dir, 'death', 0) }"
                        :disabled="locked"
                        @click="select(dir, 'death', 0)"
                    >
                        <canvas
                            :ref="(el) => registerThumb(dir, 'death', 0, el as HTMLCanvasElement | null)"
                            :width="THUMB"
                            :height="THUMB"
                            class="frame-strip__canvas"
                        ></canvas>
                        <span class="frame-strip__caption">d</span>
                    </button>
                    <div class="frame-strip__actions">
                        <button
                            type="button"
                            class="button button--small button--red frame-strip__action"
                            :disabled="locked"
                            title="Delete the death frame"
                            @click="emit('clearDeathFrame', dir)"
                        >
                            x
                        </button>
                    </div>
                </div>
                <button
                    v-else
                    type="button"
                    class="button button--small button--cyan"
                    :disabled="locked"
                    @click="emit('addDeathFrame', dir)"
                >
                    + corpse
                </button>
            </div>
        </section>
    </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from "vue";
import { frameBufferKey, type Direction, type FrameBuffers, type FrameKey, type FrameSlot } from "../data/types";

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
    (e: "duplicateAnimFrame", sourceIndex: number): void;
    (e: "removeAnimFrame", index: number): void;
    (e: "addDeathFrame", direction: Direction): void;
    (e: "clearDeathFrame", direction: Direction): void;
}>();

const THUMB = 18 * 4;
const directions: Direction[] = ["l", "r"];

const thumbs = new Map<string, HTMLCanvasElement>();
const tempCanvas = document.createElement("canvas");
tempCanvas.width = 18;
tempCanvas.height = 18;

function registerThumb(dir: Direction, slot: FrameSlot, index: number, el: HTMLCanvasElement | null): void {
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

<style lang="scss" scoped>
.frame-strip {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    h2 {
        margin: 0 0 0.5rem;
        font-size: 1.15rem;
        color: var(--color-yellow);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.25rem;
    }

    &__direction {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    &__label {
        margin: 0;
        font-size: 0.85rem;
        font-weight: normal;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--color-cyan);
    }

    &__direction.active &__label {
        color: var(--color-yellow);
    }

    &__row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: flex-start;
    }

    &__cell {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        align-items: stretch;
    }

    &__thumb {
        padding: 4px;
        line-height: 0;
        flex-direction: column;
        gap: 2px;
    }

    &__actions {
        display: flex;
        gap: 0.15rem;
        justify-content: stretch;
    }

    &__action {
        flex: 1 1 0;
        padding: 0 0.3em;
        font-size: 0.85rem;
        line-height: 1.1;
        min-width: 0;
    }

    &__canvas {
        image-rendering: pixelated;
        background: var(--color-dark-grey, #111);
        display: block;
    }

    &__caption {
        font-size: 0.75rem;
        line-height: 1;
    }
}
</style>
