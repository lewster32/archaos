<template>
    <section class="callout paint-canvas">
        <header class="paint-canvas__header">
            <h2>Canvas - {{ frameLabel }}</h2>
            <div class="paint-canvas__zoombar">
                <button
                    type="button"
                    class="button button--small"
                    :disabled="locked"
                    @click="fitView"
                >Fit</button>
                <button
                    type="button"
                    class="button button--small"
                    :disabled="locked"
                    @click="zoomBy(-1)"
                >-</button>
                <span class="paint-canvas__zoomlabel">{{ zoom }}x</span>
                <button
                    type="button"
                    class="button button--small"
                    :disabled="locked"
                    @click="zoomBy(1)"
                >+</button>
            </div>
        </header>
        <div
            ref="hostEl"
            class="paint-canvas__host"
            @wheel.prevent="onWheel"
        >
            <slot name="overlay" />
            <canvas
                ref="canvasEl"
                class="paint-canvas__canvas"
                :style="{
                    width: pxWidth + 'px',
                    height: pxHeight + 'px',
                    transform: transformCss,
                    cursor: cursorStyle,
                }"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"    
                @pointercancel="onPointerUp"
                @pointerleave="onPointerLeave"
            ></canvas>
            <div
                class="paint-canvas__guides"
                :style="{
                    width: pxWidth + 'px',
                    height: pxHeight + 'px',
                    transform: transformCss,
                }"
                aria-hidden="true"
            >
                <div class="paint-canvas__ground"></div>
                <div
                    v-if="showHoverOutline"
                    class="paint-canvas__crosshair paint-canvas__crosshair--h"
                    :style="{
                        top:
                            ((hoverFloatY ?? 0) * 100) / FRAME_SIZE + '%',
                    }"
                ></div>
                <div
                    v-if="showHoverOutline"
                    class="paint-canvas__crosshair paint-canvas__crosshair--v"
                    :style="{
                        left:
                            ((hoverFloatX ?? 0) * 100) / FRAME_SIZE + '%',
                    }"
                ></div>
                <div
                    v-if="showHoverOutline"
                    class="paint-canvas__hover"
                    :class="{
                        'paint-canvas__hover--erase':
                            effectiveTool === 'eraser',
                        'paint-canvas__hover--pick':
                            effectiveTool === 'eyedropper',
                    }"
                    :style="{
                        top: ((hoverY ?? 0) * 100) / FRAME_SIZE + '%',
                        left: ((hoverX ?? 0) * 100) / FRAME_SIZE + '%',
                        width: 100 / FRAME_SIZE + '%',
                        height: 100 / FRAME_SIZE + '%',
                    }"
                ></div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
    bresenhamLine,
    cloneImageData,
    drawPixel,
    floodFill,
    readPixel,
} from "../data/paintops";
import type { FrameBuffer, FrameKey, Rgba } from "../data/types";

const props = defineProps<{
    activeBuffer: FrameBuffer | null;
    activeFrame: FrameKey;
    tool: "pencil" | "fill" | "eraser" | "eyedropper";
    colour: Rgba;
    frameVersion: number;
    locked: boolean;
}>();

const emit = defineEmits<{
    (e: "strokeStarted"): void;
    (e: "strokeCommitted", undoSnapshot: ImageData): void;
    (e: "eyedrop", rgba: Rgba): void;
}>();

const FRAME_SIZE = 18;
const ZOOM_STEPS = [1, 2, 4, 8, 16, 32, 64] as const;

const canvasEl = ref<HTMLCanvasElement | null>(null);
const hostEl = ref<HTMLDivElement | null>(null);
const zoom = ref<number>(16);
const panX = ref(0);
const panY = ref(0);

const pxWidth = computed(() => FRAME_SIZE * zoom.value);
const pxHeight = computed(() => FRAME_SIZE * zoom.value);

const frameLabel = computed(() => {
    const side = props.activeFrame.direction === "l" ? "Left" : "Right";
    if (props.activeFrame.slot === "death") return `${side} Dead`;
    return `${side} ${props.activeFrame.index}`;
});
// `left: 50%; top: 50%` anchors the top-left corner at the host
// centre; the leading -50%/-50% pulls the canvas back so its centre
// lands on the host centre, then pan offsets push it from there.
const transformCss = computed(
    () => `translate(-50%, -50%) translate(${panX.value}px, ${panY.value}px)`,
);

const TRANSPARENT: Rgba = [0, 0, 0, 0] as const;

let preStrokeSnapshot: ImageData | null = null;
let lastX = -1;
let lastY = -1;
let panOriginX = 0;
let panOriginY = 0;

// Reactive so the template can swap the canvas cursor between
// crosshair / grab / grabbing as the user holds space or drags to pan.
const panning = ref(false);
const spaceHeld = ref(false);
const shiftHeld = ref(false);
const ctrlHeld = ref(false);

// Holding ctrl temporarily activates the eyedropper. Holding shift
// swaps pencil <-> eraser. Ctrl wins when both are held.
const effectiveTool = computed<typeof props.tool>(() => {
    if (ctrlHeld.value) return "eyedropper";
    if (!shiftHeld.value) return props.tool;
    if (props.tool === "pencil") return "eraser";
    if (props.tool === "eraser") return "pencil";
    return props.tool;
});

// Current hover position in sprite coordinates (0..17 as integers).
// null when the cursor is outside the painting canvas. Drives the
// 1-pixel cell outline so the user can see which pixel their next
// stroke will touch.
const hoverX = ref<number | null>(null);
const hoverY = ref<number | null>(null);

// Sub-cell hover position in sprite coordinates (0..18 as floats).
// Used by the alignment crosshair so the lines track the pointer
// continuously rather than snapping to cell centres.
const hoverFloatX = ref<number | null>(null);
const hoverFloatY = ref<number | null>(null);

const cursorStyle = computed(() => {
    if (panning.value) return "grabbing";
    if (spaceHeld.value) return "grab";
    // Hide the native cursor once we have a hover position - the
    // crosshair lines and hover outline carry the alignment cue, so
    // the OS arrow / crosshair would just be visual noise on top.
    // Fall back to crosshair when the cursor sits outside the
    // 18x18 sprite area (e.g. on the checkerboard margin) so the
    // user does not "lose" the pointer.
    if (
        props.activeBuffer !== null &&
        !props.locked &&
        hoverX.value !== null &&
        hoverY.value !== null
    ) {
        return "none";
    }
    return "crosshair";
});

const showHoverOutline = computed(
    () =>
        hoverX.value !== null &&
        hoverY.value !== null &&
        !panning.value &&
        !spaceHeld.value &&
        props.activeBuffer !== null &&
        !props.locked,
);

function zoomBy(delta: number): void {
    const i = ZOOM_STEPS.indexOf(
        zoom.value as (typeof ZOOM_STEPS)[number],
    );
    const idx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + delta));
    zoom.value = ZOOM_STEPS[idx];
    void redraw();
}

function fitView(): void {
    const host = hostEl.value;
    if (!host) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    const want = Math.min(w, h) / FRAME_SIZE;
    // Snap DOWN to the largest discrete step that fits without
    // overflowing the host - rounding to nearest would land on the
    // same step as 1:1 for some pane sizes.
    let best: number = ZOOM_STEPS[0];
    for (const candidate of ZOOM_STEPS) {
        if (candidate <= want && candidate > best) best = candidate;
    }
    zoom.value = best;
    panX.value = 0;
    panY.value = 0;
    void redraw();
}

function clientToSprite(
    clientX: number,
    clientY: number,
): { x: number; y: number } | null {
    const canvas = canvasEl.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const sx = Math.floor(localX / zoom.value);
    const sy = Math.floor(localY / zoom.value);
    if (sx < 0 || sy < 0 || sx >= FRAME_SIZE || sy >= FRAME_SIZE) return null;
    return { x: sx, y: sy };
}

function onPointerDown(e: PointerEvent): void {
    if (!props.activeBuffer || props.locked) return;
    if (e.button === 1 || (spaceHeld.value && e.button === 0)) {
        panning.value = true;
        panOriginX = e.clientX - panX.value;
        panOriginY = e.clientY - panY.value;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
    }
    if (e.button !== 0) return;

    const p = clientToSprite(e.clientX, e.clientY);
    if (!p) return;

    if (effectiveTool.value === "eyedropper") {
        const rgba = readPixel(props.activeBuffer.data, p.x, p.y);
        emit("eyedrop", rgba);
        return;
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    preStrokeSnapshot = cloneImageData(props.activeBuffer.data);
    emit("strokeStarted");

    if (effectiveTool.value === "fill") {
        floodFill(props.activeBuffer.data, p.x, p.y, props.colour);
        void redraw();
        return;
    }

    const rgba = effectiveTool.value === "eraser" ? TRANSPARENT : props.colour;
    drawPixel(props.activeBuffer.data, p.x, p.y, rgba);
    lastX = p.x;
    lastY = p.y;
    void redraw();
}

function onPointerMove(e: PointerEvent): void {
    if (panning.value) {
        panX.value = e.clientX - panOriginX;
        panY.value = e.clientY - panOriginY;
        return;
    }

    // Hover tracking runs on every move regardless of stroke state so
    // the outline follows the cursor even outside a paint gesture.
    // Capture both the integer cell (for the outline) and the
    // sub-cell float position (for the crosshair).
    const canvas = canvasEl.value;
    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const fx = (e.clientX - rect.left) / zoom.value;
        const fy = (e.clientY - rect.top) / zoom.value;
        if (fx >= 0 && fy >= 0 && fx < FRAME_SIZE && fy < FRAME_SIZE) {
            hoverFloatX.value = fx;
            hoverFloatY.value = fy;
            hoverX.value = Math.floor(fx);
            hoverY.value = Math.floor(fy);
        } else {
            hoverFloatX.value = null;
            hoverFloatY.value = null;
            hoverX.value = null;
            hoverY.value = null;
        }
    }
    const p =
        hoverX.value !== null && hoverY.value !== null
            ? { x: hoverX.value, y: hoverY.value }
            : null;

    if (!preStrokeSnapshot || !props.activeBuffer) return;
    if (effectiveTool.value !== "pencil" && effectiveTool.value !== "eraser")
        return;
    if (!p) return;
    const rgba = effectiveTool.value === "eraser" ? TRANSPARENT : props.colour;
    if (lastX >= 0 && lastY >= 0) {
        bresenhamLine(
            props.activeBuffer.data,
            lastX,
            lastY,
            p.x,
            p.y,
            rgba,
        );
    } else {
        drawPixel(props.activeBuffer.data, p.x, p.y, rgba);
    }
    lastX = p.x;
    lastY = p.y;
    void redraw();
}

function onPointerLeave(): void {
    hoverX.value = null;
    hoverY.value = null;
    hoverFloatX.value = null;
    hoverFloatY.value = null;
}

function onPointerUp(e: PointerEvent): void {
    if (panning.value) {
        panning.value = false;
        return;
    }
    if (!preStrokeSnapshot) return;
    emit("strokeCommitted", preStrokeSnapshot);
    preStrokeSnapshot = null;
    lastX = -1;
    lastY = -1;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
}

function onWheel(e: WheelEvent): void {
    if (props.locked) return;
    const dir = e.deltaY > 0 ? -1 : 1;
    zoomBy(dir);
}

function onKeyDown(e: KeyboardEvent): void {
    if (e.code === "Space") spaceHeld.value = true;
    if (e.key === "Shift") shiftHeld.value = true;
    if (e.key === "Control" || e.key === "Meta") ctrlHeld.value = true;
}
function onKeyUp(e: KeyboardEvent): void {
    if (e.code === "Space") spaceHeld.value = false;
    if (e.key === "Shift") shiftHeld.value = false;
    if (e.key === "Control" || e.key === "Meta") ctrlHeld.value = false;
}

async function redraw(): Promise<void> {
    await nextTick();
    const canvas = canvasEl.value;
    if (!canvas) return;
    canvas.width = FRAME_SIZE;
    canvas.height = FRAME_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (props.activeBuffer) ctx.putImageData(props.activeBuffer.data, 0, 0);
}

watch(
    () => [props.frameVersion, props.activeBuffer],
    () => {
        void redraw();
    },
    { immediate: true },
);

onMounted(() => {
    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("keyup", onKeyUp);
    void nextTick(() => fitView());
});

onBeforeUnmount(() => {
    globalThis.removeEventListener("keydown", onKeyDown);
    globalThis.removeEventListener("keyup", onKeyUp);
});
</script>

<style lang="scss" scoped>
.paint-canvas {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    h2 {
        margin: 0;
        font-size: 1.15rem;
        color: var(--color-yellow);
    }

    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.25rem;
    }

    &__zoombar {
        display: flex;
        gap: 0.25rem;
        align-items: center;
    }

    &__zoomlabel {
        padding: 0 0.5rem;
        min-width: 3rem;
        text-align: center;
        color: var(--color-cyan);
        letter-spacing: 0.5px;
    }

    &__host {
        flex: 1;
        position: relative;
        overflow: hidden;
        min-height: 660px;
        background-color: #2a2a2a;
        background-image:
            linear-gradient(
                45deg,
                #333 25%,
                transparent 25%,
                transparent 75%,
                #333 75%,
                #333
            ),
            linear-gradient(
                45deg,
                #333 25%,
                transparent 25%,
                transparent 75%,
                #333 75%,
                #333
            );
        background-size: 16px 16px;
        background-position:
            0 0,
            8px 8px;
        border: 2px solid #111;
    }

    &__canvas {
        position: absolute;
        left: 50%;
        top: 50%;
        transform-origin: top left;
        touch-action: none;
        image-rendering: pixelated;
    }

    &__guides {
        position: absolute;
        left: 50%;
        top: 50%;
        transform-origin: top left;
        pointer-events: none;
        outline: 1px solid rgba(245, 197, 74, 0.6);
    }

    &__ground {
        position: absolute;
        left: 0;
        right: 0;
        /* Row 16 from the top = 2 sprite-pixels above the bottom edge,
           the corpse-alignment baseline. */
        top: calc(16 / 18 * 100%);
        height: 1px;
        background: rgba(245, 197, 74, 0.6);
    }

    &__hover {
        position: absolute;
        /* Twin box-shadows give a 1px white-over-black ring that is
           legible on any sprite background without changing the cell's
           outer size. */
        box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.95),
            0 0 0 1px rgba(0, 0, 0, 0.85);

        &--erase {
            box-shadow:
                inset 0 0 0 1px rgba(255, 80, 80, 0.95),
                0 0 0 1px rgba(0, 0, 0, 0.85);
        }

        &--pick {
            box-shadow:
                inset 0 0 0 1px rgba(245, 197, 74, 0.95),
                0 0 0 1px rgba(0, 0, 0, 0.85);
        }
    }

    &__crosshair {
        position: absolute;
        background: rgba(245, 197, 74, 0.25);
        pointer-events: none;

        &--h {
            left: 0;
            right: 0;
            height: 1px;
        }

        &--v {
            top: 0;
            bottom: 0;
            width: 1px;
        }
    }
}
</style>
