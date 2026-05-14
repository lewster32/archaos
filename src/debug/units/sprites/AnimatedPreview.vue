<template>
    <div class="animated-preview">
        <div v-if="hasAnimation" class="animated-preview__row">
            <figure>
                <canvas ref="lCanvas" :width="size" :height="size" class="animated-preview__canvas"></canvas>
                <figcaption>Left</figcaption>
            </figure>
            <figure>
                <canvas ref="rCanvas" :width="size" :height="size" class="animated-preview__canvas"></canvas>
                <figcaption>Right</figcaption>
            </figure>
        </div>
        <p v-else class="animated-preview__empty">No animation frames configured.</p>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { frameBufferKey, type Direction, type FrameBuffers } from "../data/types";

const props = defineProps<{
    buffers: FrameBuffers;
    animFrames: number[] | undefined;
    animSpeed: number | undefined;
    frameVersion: number;
}>();

const SCALE = 4;
const FRAME_SIZE = 18;
const size = FRAME_SIZE * SCALE;

const lCanvas = ref<HTMLCanvasElement | null>(null);
const rCanvas = ref<HTMLCanvasElement | null>(null);

const hasAnimation = computed(() => {
    const af = props.animFrames;
    return Array.isArray(af) && af.length > 0;
});

const tempCanvas = document.createElement("canvas");
tempCanvas.width = FRAME_SIZE;
tempCanvas.height = FRAME_SIZE;

let tick = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function drawDirection(canvas: HTMLCanvasElement | null, dir: Direction): void {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    const af = props.animFrames;
    if (!af || af.length === 0) return;
    const idx = af[tick % af.length];
    const buf = props.buffers.get(frameBufferKey(dir, "anim", idx));
    if (!buf) return;
    const tctx = tempCanvas.getContext("2d");
    if (!tctx) return;
    tctx.putImageData(buf.data, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, size, size);
}

function drawAll(): void {
    drawDirection(lCanvas.value, "l");
    drawDirection(rCanvas.value, "r");
}

function stopAnim(): void {
    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }
}

function startAnim(): void {
    stopAnim();
    tick = 0;
    if (!hasAnimation.value) return;
    void nextTick(drawAll);
    // Phaser drives unit animations at `frameRate = 9 - animSpeed` fps
    // (see game-scene.ts); mirror that here so the preview matches what
    // the game will play.
    const fps = Math.max(1, 9 - (props.animSpeed ?? 5));
    timer = setInterval(() => {
        tick++;
        drawAll();
    }, 1000 / fps);
}

watch(
    () => [props.animFrames, props.animSpeed, props.frameVersion, props.buffers.size],
    () => {
        startAnim();
    },
    { immediate: true, deep: true },
);

onBeforeUnmount(stopAnim);
</script>

<style lang="scss" scoped>
.animated-preview {
    &__row {
        display: flex;
        gap: 0.5rem;
    }

    figure {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: center;
    }

    &__canvas {
        image-rendering: pixelated;
        background: var(--color-dark-grey, #111);
        border: 2px solid #111;
    }

    figcaption {
        font-size: 0.75rem;
        color: var(--color-cyan);
        letter-spacing: 0.5px;
    }

    &__empty {
        margin: 0;
        font-size: 0.75rem;
        opacity: 0.7;
    }
}
</style>
