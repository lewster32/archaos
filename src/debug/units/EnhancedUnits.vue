<template>
    <div class="enhanced-units">
        <aside class="unit-list">
            <h1>Enhanced Units</h1>
            <ul>
                <li v-for="spell in sortedSpells" :key="spell.id">
                    <button
                        type="button"
                        :aria-selected="spell.id === selectedId"
                        @click="selectedId = spell.id"
                    >
                        {{ spell.name }}<span v-if="spell.id === selectedId"> [sel]</span>
                    </button>
                </li>
            </ul>
        </aside>

        <main class="unit-detail">
            <p v-if="!selected">Select a unit.</p>
            <template v-else>
                <h1>{{ selected.name }}</h1>

                <section>
                    <h2>Properties</h2>
                    <dl>
                        <template v-for="(v, k) in propertiesEntries" :key="k">
                            <dt>{{ k }}</dt>
                            <dd>{{ v }}</dd>
                        </template>
                    </dl>
                </section>

                <section>
                    <h2>Stats</h2>
                    <dl>
                        <template v-for="(v, k) in statsEntries" :key="k">
                            <dt>{{ k }}</dt>
                            <dd>{{ v }}</dd>
                        </template>
                    </dl>
                </section>

                <section>
                    <h2>Status</h2>
                    <ul v-if="selected.unit.status && selected.unit.status.length">
                        <li v-for="s in selected.unit.status" :key="s">{{ s }}</li>
                    </ul>
                    <p v-else>(none)</p>
                </section>

                <section>
                    <h2>Animation</h2>
                    <dl>
                        <template v-for="(v, k) in animationEntries" :key="k">
                            <dt>{{ k }}</dt>
                            <dd>{{ v }}</dd>
                        </template>
                    </dl>
                </section>

                <section v-if="selected.unit.textures && selected.unit.textures.length">
                    <h2>Sprites</h2>
                    <div v-for="texture in selected.unit.textures" :key="texture.image">
                        <p>Texture: {{ texture.image }} ({{ texture.size.w }}x{{ texture.size.h }})</p>

                        <div v-for="row in groupedFramesFor(texture)" :key="row.label">
                            <p v-if="row.frames.length">{{ row.label }}:</p>
                            <div class="sprite-row">
                                <figure
                                    v-for="frame in row.frames"
                                    :key="frame.filename"
                                >
                                    <canvas
                                        :ref="(el) => registerCanvas(canvasKey(texture.image, frame.filename), el as HTMLCanvasElement | null)"
                                        :width="frame.frame.w * SCALE"
                                        :height="frame.frame.h * SCALE"
                                        style="image-rendering: pixelated"
                                    ></canvas>
                                    <figcaption>{{ frame.filename }}</figcaption>
                                </figure>
                            </div>
                        </div>
                    </div>
                </section>
            </template>
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";

interface Frame {
    filename: string;
    frame: { x: number; y: number; w: number; h: number };
}

interface Texture {
    image: string;
    size: { w: number; h: number };
    frames: Frame[];
}

interface Unit {
    id: string;
    name?: string;
    attackType?: string;
    rangedType?: string;
    projectileType?: string;
    indefiniteArticle?: string;
    properties?: Record<string, number>;
    status?: string[];
    animFrames?: number[];
    animSpeed?: number;
    shadowScale?: number;
    textures?: Texture[];
}

interface Spell {
    id: string;
    name: string;
    unit: Unit;
}

interface FrameRow {
    label: string;
    frames: Frame[];
}

const SCALE = 4;
const FRAME_RE = /^(.+?)_([lr])_(\d+|d)$/;

const enhanced = import.meta.glob(
    "../../../assets/data/enhanced/*.json",
    { eager: true }
) as Record<string, { spell: Spell }>;

const spells: Spell[] = Object.values(enhanced).map((m) => m.spell);

const sortedSpells = computed(() =>
    [...spells].sort((a, b) => a.name.localeCompare(b.name))
);

const selectedId = ref<string | null>(null);

const selected = computed<Spell | null>(
    () => spells.find((s) => s.id === selectedId.value) ?? null
);

const PROPERTY_KEYS: ReadonlyArray<keyof Unit> = [
    "id",
    "name",
    "attackType",
    "rangedType",
    "projectileType",
    "indefiniteArticle",
];

const STAT_KEYS: ReadonlyArray<string> = [
    "mov",
    "com",
    "rcm",
    "rng",
    "def",
    "mnv",
    "res",
];

const propertiesEntries = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (!selected.value) return out;
    const unit = selected.value.unit;
    for (const key of PROPERTY_KEYS) {
        const value = unit[key];
        if (value !== undefined && value !== null) {
            out[key as string] = String(value);
        }
    }
    return out;
});

const statsEntries = computed<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    if (!selected.value?.unit.properties) return out;
    const props = selected.value.unit.properties;
    for (const key of STAT_KEYS) {
        if (props[key] !== undefined) {
            out[key] = props[key];
        }
    }
    return out;
});

const animationEntries = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (!selected.value) return out;
    const unit = selected.value.unit;
    if (unit.animFrames !== undefined) {
        out["animFrames"] = unit.animFrames.join(", ");
    }
    if (unit.animSpeed !== undefined) {
        out["animSpeed"] = String(unit.animSpeed);
    }
    if (unit.shadowScale !== undefined) {
        out["shadowScale"] = String(unit.shadowScale);
    }
    return out;
});

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

function imageUrl(textureImage: string): string {
    return `/images/units/enhanced/${textureImage}`;
}

function canvasKey(textureImage: string, filename: string): string {
    return `${textureImage}::${filename}`;
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

function registerCanvas(key: string, el: HTMLCanvasElement | null): void {
    if (el) {
        canvases.set(key, el);
        void nextTick(() => drawAllStatic());
    } else {
        canvases.delete(key);
    }
}

function drawFrame(canvas: HTMLCanvasElement, img: HTMLImageElement, frame: Frame): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = frame.frame.w;
    const h = frame.frame.h;
    canvas.width = w * SCALE;
    canvas.height = h * SCALE;
    ctx.imageSmoothingEnabled = false;
    if (!img.complete) {
        img.addEventListener("load", () => drawFrame(canvas, img, frame), { once: true });
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
        img,
        frame.frame.x, frame.frame.y, w, h,
        0, 0, w * SCALE, h * SCALE
    );
}

function drawAllStatic(): void {
    if (!selected.value?.unit.textures) return;
    for (const texture of selected.value.unit.textures) {
        const img = loadImage(imageUrl(texture.image));
        for (const frame of texture.frames) {
            const canvas = canvases.get(canvasKey(texture.image, frame.filename));
            if (canvas) drawFrame(canvas, img, frame);
        }
    }
}

watch(selected, () => {
    void nextTick(() => drawAllStatic());
}, { immediate: true });
</script>
