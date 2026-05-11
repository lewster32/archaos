<template>
    <section
        v-if="unit && unit.textures && unit.textures.length"
        class="sprite-preview callout"
    >
        <h2>Sprites</h2>
        <div v-for="texture in unit.textures" :key="texture.image">
            <p>Texture: {{ texture.image }} ({{ texture.size.w }}x{{ texture.size.h }})</p>

            <div v-for="row in groupedFramesFor(texture)" :key="row.label">
                <p v-if="row.frames.length">{{ row.label }}:</p>
                <div class="sprite-preview__row">
                    <figure v-for="frame in row.frames" :key="frame.filename">
                        <canvas
                            :ref="(el) => registerCanvas(canvasKey(texture.image, frame.filename), el as HTMLCanvasElement | null)"
                            :width="FRAME_SIZE * SCALE"
                            :height="FRAME_SIZE * SCALE"
                            style="image-rendering: pixelated"
                        ></canvas>
                        <figcaption>{{ frame.filename }}</figcaption>
                    </figure>
                </div>
            </div>

            <div v-if="hasAnimation(unit)">
                <p>Animated:</p>
                <div class="sprite-preview__row">
                    <figure
                        v-for="dir in animDirectionsFor(texture, unit)"
                        :key="dir.dir"
                    >
                        <canvas
                            :ref="(el) => registerAnimCanvas(canvasKey(texture.image, `anim_${dir.dir}`), el as HTMLCanvasElement | null)"
                            :width="FRAME_SIZE * SCALE"
                            :height="FRAME_SIZE * SCALE"
                            style="image-rendering: pixelated"
                        ></canvas>
                        <figcaption>{{ dir.dir }}</figcaption>
                    </figure>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, watch } from "vue";
import type { EditableUnit, Frame, Texture } from "./data/types";

const SCALE = 4;
const FRAME_SIZE = 18;
const FRAME_RE = /^(.+?)_([lr])_(\d+|d)$/;

interface FrameRow {
    label: string;
    frames: Frame[];
}

interface AnimDirection {
    dir: "left" | "right";
    frames: Frame[];
}

const props = defineProps<{
    unit: EditableUnit | null;
}>();

function frameSortKey(frame: Frame): number {
    const match = FRAME_RE.exec(frame.filename);
    if (!match) return 999;
    return match[3] === "d" ? 100 : Number(match[3]);
}

function groupedFramesFor(texture: Texture): FrameRow[] {
    const left: Frame[] = [];
    const right: Frame[] = [];
    const other: Frame[] = [];
    for (const frame of texture.frames) {
        const match = FRAME_RE.exec(frame.filename);
        if (!match) {
            other.push(frame);
            continue;
        }
        (match[2] === "l" ? left : right).push(frame);
    }
    left.sort((a, b) => frameSortKey(a) - frameSortKey(b));
    right.sort((a, b) => frameSortKey(a) - frameSortKey(b));
    return [
        { label: "Left", frames: left },
        { label: "Right", frames: right },
        { label: "Other", frames: other },
    ];
}

function hasAnimation(unit: EditableUnit): boolean {
    return (
        Array.isArray(unit.animFrames)
        && unit.animFrames.length > 0
        && typeof unit.animSpeed === "number"
        && unit.animSpeed > 0
    );
}

function animDirectionsFor(
    texture: Texture,
    unit: EditableUnit
): AnimDirection[] {
    if (!hasAnimation(unit)) return [];
    const dirs: AnimDirection[] = [];
    for (const dir of ["left", "right"] as const) {
        const dirChar = dir === "left" ? "l" : "r";
        const frames = texture.frames
            .filter((f) => {
                const m = FRAME_RE.exec(f.filename);
                return m !== null && m[2] === dirChar && m[3] !== "d";
            })
            .sort((a, b) => frameSortKey(a) - frameSortKey(b));
        if (frames.length === 0) continue;
        dirs.push({ dir, frames });
    }
    return dirs;
}

function imageUrl(texture: Texture): string {
    return texture.imageUrl ?? `/images/units/enhanced/${texture.image}`;
}

function canvasKey(textureImage: string, suffix: string): string {
    return `${textureImage}::${suffix}`;
}

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): HTMLImageElement {
    let img = imageCache.get(url);
    if (img) return img;
    img = new Image();
    img.src = url;
    imageCache.set(url, img);
    return img;
}

const canvases = new Map<string, HTMLCanvasElement>();
const animCanvases = new Map<string, HTMLCanvasElement>();

function registerCanvas(key: string, el: HTMLCanvasElement | null): void {
    if (el) {
        canvases.set(key, el);
        void nextTick(drawAllStatic);
    } else {
        canvases.delete(key);
    }
}

function registerAnimCanvas(key: string, el: HTMLCanvasElement | null): void {
    if (el) {
        animCanvases.set(key, el);
    } else {
        animCanvases.delete(key);
    }
}

function drawFrame(
    canvas: HTMLCanvasElement,
    img: HTMLImageElement,
    frame: Frame
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    if (!img.complete) {
        img.addEventListener("load", () => drawFrame(canvas, img, frame), {
            once: true,
        });
        return;
    }
    const w = frame.frame.w;
    const h = frame.frame.h;
    let dx: number;
    let dy: number;
    if (frame.spriteSourceSize) {
        dx = frame.spriteSourceSize.x * SCALE;
        dy = frame.spriteSourceSize.y * SCALE;
    } else {
        dx = Math.floor((FRAME_SIZE - w) / 2) * SCALE;
        dy = Math.floor((FRAME_SIZE - h) / 2) * SCALE;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, frame.frame.x, frame.frame.y, w, h, dx, dy, w * SCALE, h * SCALE);
}

function drawAllStatic(): void {
    if (!props.unit?.textures) return;
    for (const texture of props.unit.textures) {
        const img = loadImage(imageUrl(texture));
        for (const frame of texture.frames) {
            const canvas = canvases.get(canvasKey(texture.image, frame.filename));
            if (canvas) drawFrame(canvas, img, frame);
        }
    }
}

let animTimer: ReturnType<typeof setInterval> | null = null;
let animTick = 0;

function stopAnim(): void {
    if (animTimer !== null) {
        clearInterval(animTimer);
        animTimer = null;
    }
    animTick = 0;
}

function drawAnimFrame(): void {
    const unit = props.unit;
    if (!unit || !unit.textures || !hasAnimation(unit)) return;
    const animFrames = unit.animFrames!;
    const frameIndex = animFrames[animTick % animFrames.length];
    for (const texture of unit.textures) {
        const img = loadImage(imageUrl(texture));
        for (const dir of animDirectionsFor(texture, unit)) {
            const frame = dir.frames[frameIndex % dir.frames.length];
            const canvas = animCanvases.get(
                canvasKey(texture.image, `anim_${dir.dir}`)
            );
            if (canvas) drawFrame(canvas, img, frame);
        }
    }
}

function startAnim(): void {
    stopAnim();
    const unit = props.unit;
    if (!unit || !hasAnimation(unit)) return;
    void nextTick(drawAnimFrame);
    // Phaser drives these animations at `frameRate = 9 - animSpeed` fps
    // (see game-scene.ts:153). animSpeed in JSON is effectively a delay
    // multiplier, so a higher value plays *slower*. Mirror that here.
    const fps = Math.max(1, 9 - unit.animSpeed!);
    animTimer = setInterval(() => {
        animTick++;
        drawAnimFrame();
    }, 1000 / fps);
}

watch(
    () => [props.unit?.id, props.unit?.animFrames, props.unit?.animSpeed],
    () => {
        void nextTick(() => {
            drawAllStatic();
            startAnim();
        });
    },
    { immediate: true, deep: true }
);

onBeforeUnmount(stopAnim);
</script>

<style lang="scss" scoped>
.sprite-preview {
    margin: 0 0 1.25rem;

    h2 {
        margin: 0 0 0.5rem;
        font-size: 1.15rem;
        color: var(--color-yellow);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.25rem;
    }

    > div > p,
    > div > div > p {
        margin: 0.5rem 0 0.25rem;
        font-size: 0.95rem;
        color: var(--color-cyan);
        letter-spacing: 0.5px;
    }

    &__row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin: 0.25rem 0 0.75rem;

        figure {
            margin: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.25rem;
        }

        canvas {
            background: var(--color-dark-grey);
            border: 2px solid #111;
        }

        figcaption {
            font-family: monospace;
            font-size: 0.75rem;
            color: var(--color-grey);
            text-shadow: none;
        }
    }
}
</style>
