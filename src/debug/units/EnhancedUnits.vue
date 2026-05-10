<template>
    <div class="enhanced-units">
        <aside class="unit-list callout">
            <a href="debug.html" class="button button--small unit-list__back">&larr; Debug menu</a>
            <h1>Enhanced Units</h1>
            <ul>
                <li v-for="spell in sortedSpells" :key="spell.id">
                    <button
                        type="button"
                        :aria-selected="spell.id === selectedId"
                        @click="selectedId = spell.id"
                    >
                        {{ spell.name }}
                    </button>
                </li>
            </ul>
        </aside>

        <main class="unit-detail">
            <p v-if="!selected">Select a unit.</p>
            <template v-else>
                <h1>{{ selected.name }}</h1>

                <div v-if="spellForIcon" class="spell-info-inline">
                    <SpellInfo :spell="spellForIcon" :key="selected.id" />
                </div>

                <section class="callout">
                    <h2>Properties</h2>
                    <dl>
                        <template v-for="(v, k) in propertiesEntries" :key="k">
                            <dt>{{ k }}</dt>
                            <dd>{{ v }}</dd>
                        </template>
                    </dl>
                </section>

                <section class="callout">
                    <h2>Stats</h2>
                    <dl>
                        <template v-for="(v, k) in statsEntries" :key="k">
                            <dt>{{ k }}</dt>
                            <dd>{{ v }}</dd>
                        </template>
                    </dl>
                </section>

                <section class="callout">
                    <h2>Status</h2>
                    <ul v-if="selected.unit.status && selected.unit.status.length">
                        <li v-for="s in selected.unit.status" :key="s">{{ s }}</li>
                    </ul>
                    <p v-else>(none)</p>
                </section>

                <section class="callout">
                    <h2>Animation</h2>
                    <dl>
                        <template v-for="(v, k) in animationEntries" :key="k">
                            <dt>{{ k }}</dt>
                            <dd>{{ v }}</dd>
                        </template>
                    </dl>
                </section>

                <section v-if="selected.unit.textures && selected.unit.textures.length" class="callout">
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
                                        :width="FRAME_SIZE * SCALE"
                                        :height="FRAME_SIZE * SCALE"
                                        style="image-rendering: pixelated"
                                    ></canvas>
                                    <figcaption>{{ frame.filename }}</figcaption>
                                </figure>
                            </div>
                        </div>

                        <div v-if="hasAnimation(selected.unit)">
                            <p>Animated:</p>
                            <div class="sprite-row">
                                <figure
                                    v-for="dir in animDirectionsFor(texture, selected.unit)"
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
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import { SpellType, type Spell as EngineSpell } from "@archaos/engine";
import SpellInfo from "../../components/game/SpellInfo.vue";

interface Frame {
    filename: string;
    frame: { x: number; y: number; w: number; h: number };
    spriteSourceSize?: { x: number; y: number; w: number; h: number };
    sourceSize?: { w: number; h: number };
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
    chance: number;
    balance: number;
    description?: string;
    group?: string;
    types?: string[];
    unit: Unit;
}

interface FrameRow {
    label: string;
    frames: Frame[];
}

interface AnimDirection {
    dir: "left" | "right";
    frames: Frame[];
}

const SCALE = 4;
// Enhanced unit atlases are authored at a fixed 18x18 cell. Locking the
// canvas to this size prevents per-frame layout reflows when an animation
// cycles through frames whose intrinsic dimensions differ.
const FRAME_SIZE = 18;
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

// Duck-typed engine Spell for SpellInfo / SpellImage. We synthesise just the
// fields those components read rather than going through SpellFactory (which
// would need a Board for alignment-adjusted chance, the Piece registry for
// unitProperties, etc.). Setting `chance` and `properties.chance` to the same
// value yields a delta of 0 so the alignment-delta hint stays hidden.
const spellForIcon = computed<EngineSpell | null>(() => {
    const s = selected.value;
    if (!s) return null;
    return {
        type: SpellType.Summon,
        name: s.name,
        spellId: s.id,
        unitId: s.unit.id,
        spellFrame: 0,
        chance: s.chance,
        balance: s.balance,
        description: s.description,
        properties: {
            chance: s.chance,
            types: s.types ?? [],
            group: s.group ?? "enhanced",
        },
        unitProperties: s.unit,
    } as unknown as EngineSpell;
});

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

function hasAnimation(unit: Unit): boolean {
    return Array.isArray(unit.animFrames)
        && unit.animFrames.length > 0
        && typeof unit.animSpeed === "number"
        && unit.animSpeed > 0;
}

function animDirectionsFor(texture: Texture, unit: Unit): AnimDirection[] {
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

function imageUrl(textureImage: string): string {
    return `/images/units/enhanced/${textureImage}`;
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
        void nextTick(() => drawAllStatic());
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

function drawFrame(canvas: HTMLCanvasElement, img: HTMLImageElement, frame: Frame): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    if (!img.complete) {
        img.addEventListener("load", () => drawFrame(canvas, img, frame), { once: true });
        return;
    }
    const w = frame.frame.w;
    const h = frame.frame.h;
    // Honour the trim offset from `spriteSourceSize` so trimmed frames
    // (e.g. the obelisk's flat corpse) land at the right position within
    // the 18x18 cell instead of being centred. Fall back to centring for
    // any frame that doesn't carry trim metadata.
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
    ctx.drawImage(
        img,
        frame.frame.x, frame.frame.y, w, h,
        dx, dy, w * SCALE, h * SCALE
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
    const unit = selected.value?.unit;
    if (!unit || !unit.textures || !hasAnimation(unit)) return;
    const animFrames = unit.animFrames!;
    const frameIndex = animFrames[animTick % animFrames.length];
    for (const texture of unit.textures) {
        const img = loadImage(imageUrl(texture.image));
        for (const dir of animDirectionsFor(texture, unit)) {
            const frame = dir.frames[frameIndex % dir.frames.length];
            const canvas = animCanvases.get(canvasKey(texture.image, `anim_${dir.dir}`));
            if (canvas) drawFrame(canvas, img, frame);
        }
    }
}

function startAnim(): void {
    stopAnim();
    const unit = selected.value?.unit;
    if (!unit || !hasAnimation(unit)) return;
    void nextTick(() => drawAnimFrame());
    // Phaser drives these animations at `frameRate = 9 - animSpeed` fps
    // (see game-scene.ts:153). animSpeed in JSON is effectively a delay
    // multiplier, so a higher value plays *slower*. Mirror that here.
    const fps = Math.max(1, 9 - unit.animSpeed!);
    animTimer = setInterval(() => {
        animTick++;
        drawAnimFrame();
    }, 1000 / fps);
}

watch(selected, () => {
    void nextTick(() => {
        drawAllStatic();
        startAnim();
    });
}, { immediate: true });

onBeforeUnmount(() => {
    stopAnim();
});
</script>

<style lang="scss" scoped>
.enhanced-units {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    min-height: 100vh;
    color: var(--fg-colour);
    text-shadow: var(--text-shadow);
}

.unit-list {
    flex: 0 0 14rem;
    padding: 1rem 0;

    &__back {
        display: block;
        margin: 0 1rem 0.75rem;
        text-decoration: none;
    }

    h1 {
        margin: 0 0 0.75rem;
        padding: 0.25rem 1rem;
        font-size: 1.5rem;
        color: var(--color-yellow);
    }

    ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    li + li {
        margin-top: 0.125rem;
    }

    li {
        display: flex;
    }

    button {
        all: unset;
        flex: 1 1 auto;
        display: block;
        padding: .75em 1em;
        cursor: pointer;
        color: var(--fg-colour);
        text-shadow: var(--text-shadow);

        &:hover {
            background: rgba(255, 255, 255, 0.08);
            color: var(--color-cyan);
        }

        &[aria-selected="true"] {
            background: var(--color-yellow);
            color: var(--color-black);
            text-shadow: none;
        }
    }
}

.unit-detail {
    flex: 1 1 auto;
    padding: 1.25rem 1.5rem;
    overflow-x: hidden;

    > h1 {
        margin: 0 0 1rem;
        font-size: 2rem;
        color: var(--color-cyan);
    }

    > p {
        color: var(--color-grey);
    }

    section {
        // .callout supplies the outer chrome (border-image, background,
        // padding, shadow). Just space sections vertically here.
        margin: 0 0 1.25rem;

        h2 {
            margin: 0 0 0.5rem;
            font-size: 1.15rem;
            color: var(--color-yellow);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 0.25rem;
        }

        dl {
            display: grid;
            grid-template-columns: max-content 1fr;
            column-gap: 1rem;
            row-gap: 0.25rem;
            margin: 0;
        }

        dt {
            color: var(--color-grey);
            font-weight: normal;
        }

        dd {
            margin: 0;
            color: var(--color-white);
        }

        ul {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-wrap: wrap;
            gap: 0.4rem;

            li {
                padding: 0.15em 0.5em;
                background: var(--color-dark-grey);
                border: 2px solid #111;
                border-radius: 3px;
                font-family: monospace;
                font-size: 0.9em;
            }
        }
    }
}

.spell-info-inline {
    display: block;
    margin: 0 0 1.25rem;

    // SpellInfo is built as a `position: fixed` floating callout in the
    // game UI. Reset that so the panel sits inline at the top of the
    // detail pane instead.
    :deep(.spellinfo) {
        position: static;
        right: auto;
        top: auto;
        max-width: none;
        z-index: auto;
    }

    // Hide affordances that only make sense inside the live spellbook flow.
    :deep(.spellinfo__close),
    :deep(.callout__buttons) {
        display: none;
    }
}

.unit-detail section > div > p,
.unit-detail section > div > div > p {
    margin: 0.5rem 0 0.25rem;
    font-size: 0.95rem;
    color: var(--color-cyan);
    letter-spacing: 0.5px;
}

.sprite-row {
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
        background: var(--color-black);
        border: 2px solid #111;
    }

    figcaption {
        font-family: monospace;
        font-size: 0.75rem;
        color: var(--color-grey);
        text-shadow: none;
    }
}
</style>
