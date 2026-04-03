<template>
    <div
        class="spell-icon spell__image"
        :class="spellClasses"
        :style="spellStyles"
    >
        <canvas
            v-if="spell && usesAtlasIcon"
            ref="canvasRef"
            class="spell-icon__image"
            width="18"
            height="18"
        />
        <img
            v-else-if="spell"
            class="spell-icon__image"
            :src="spellImage"
            :alt="spell.name"
        />
    </div>
</template>
<script lang="ts">
/**
 * Module-level frame indices, image loader, and trim-bounds cache — shared
 * across all SpellImage instances. Built once from the same atlas data Phaser
 * uses so there is no duplication of asset loading logic.
 */
import { SpellType, UnitStatus, UnitConfig } from "@archaos/engine";
import classicunitsAtlas from "../../assets/spritesheets/classicunits.png";
import classicunitsData from "../../assets/spritesheets/classicunits.json";

type FrameRect = { x: number; y: number; w: number; h: number };

const _classicFrames = new Map<string, FrameRect>(
    classicunitsData.textures[0].frames.map((f) => [
        f.filename,
        f.frame as FrameRect,
    ]),
);

// Enhanced spells carry their atlas frame data inline in the spell JSON.
// Build a map from unit ID → { imageUrl, frames } using the same glob as
// game-scene.ts so both share the same eagerly-loaded module instances.
type EnhancedAtlasInfo = { imageUrl: string; frames: Map<string, FrameRect> };
const _enhancedFrames = new Map<string, EnhancedAtlasInfo>();

const _enhancedFiles: Record<string, any> = import.meta.glob(
    "../../assets/data/enhanced/*.json",
    { eager: true },
);

for (const data of Object.values(_enhancedFiles)) {
    const unit = data.spell?.unit;
    if (!unit?.textures?.length) continue;
    const texture = unit.textures[0];
    _enhancedFrames.set(unit.id, {
        imageUrl: `${import.meta.env.BASE_URL}images/units/enhanced/${texture.image}`,
        frames: new Map<string, FrameRect>(
            texture.frames.map((f: any) => [f.filename, f.frame as FrameRect]),
        ),
    });
}

// Generic per-URL image loader with a shared promise cache so each atlas PNG
// is fetched at most once regardless of how many SpellImage instances exist.
const _imageCache = new Map<string, Promise<HTMLImageElement>>();

function _loadImage(url: string): Promise<HTMLImageElement> {
    let p = _imageCache.get(url);
    if (!p) {
        p = new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.addEventListener("load", () => resolve(img));
            img.addEventListener("error", reject);
            img.src = url;
        });
        _imageCache.set(url, p);
    }
    return p;
}

// Vertical trim cache: maps frame name → first/last opaque row offsets.
// Results are computed once per unique frame via a shared scan canvas.
type TrimBounds = {
    top: number;
    visibleHeight: number;
    left: number;
    visibleWidth: number;
};
const _trimCache = new Map<string, TrimBounds>();
let _scanCanvas: HTMLCanvasElement | null = null;

/**
 * Returns the trim bounds for a frame: the first and last non-transparent rows
 * and columns, expressed as { top, visibleHeight, left, visibleWidth }. Results
 * are cached by frame name so the pixel scan only runs once per unique frame.
 */
function _getTrimBounds(
    img: HTMLImageElement,
    frame: FrameRect,
    frameName: string,
): TrimBounds {
    const cached = _trimCache.get(frameName);
    if (cached) return cached;

    if (!_scanCanvas) {
        _scanCanvas = document.createElement("canvas");
        _scanCanvas.width = 18;
        _scanCanvas.height = 18;
    }
    const ctx = _scanCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, frame.w, frame.h);
    ctx.drawImage(
        img,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        0,
        0,
        frame.w,
        frame.h,
    );
    const { data } = ctx.getImageData(0, 0, frame.w, frame.h);

    const isRowOpaque = (row: number) => {
        for (let x = 0; x < frame.w; x++) {
            if (data[(row * frame.w + x) * 4 + 3] !== 0) return true;
        }
        return false;
    };

    const isColOpaque = (col: number) => {
        for (let y = 0; y < frame.h; y++) {
            if (data[(y * frame.w + col) * 4 + 3] !== 0) return true;
        }
        return false;
    };

    let top = 0;
    while (top < frame.h && !isRowOpaque(top)) top++;
    let bottom = frame.h - 1;
    while (bottom > top && !isRowOpaque(bottom)) bottom--;

    let left = 0;
    while (left < frame.w && !isColOpaque(left)) left++;
    let right = frame.w - 1;
    while (right > left && !isColOpaque(right)) right--;

    const result: TrimBounds = {
        top,
        visibleHeight: bottom - top + 1,
        left,
        visibleWidth: right - left + 1,
    };
    _trimCache.set(frameName, result);
    return result;
}
</script>
<script setup lang="ts">
import { Spell } from "@archaos/engine";
import { onMounted, computed, ref, watch } from "vue";
import type { Ref } from "vue";
const props = defineProps<{
    spell: Spell | null;
}>();

/**
 * A data structure representing the colours used in a spell icon border that
 * get shared between the class and style computations.
 */
interface SpellIconData {
    /**
     * The border number (1, 2 or 3 colors).
     */
    number: number;

    /**
     * The top colour (also used if only one colour).
     */
    top?: string;

    /**
     * The middle colour (if applicable).
     */
    middle?: string;

    /**
     * The bottom colour (if applicable).
     */
    bottom?: string;
}

const spellIconData: Ref<SpellIconData> = ref({
    number: 1,
    top: "ground",
});

/**
 * True when atlas frame data is available for the spell, covering both classic
 * and enhanced summon spells. Drives the v-if that shows the canvas instead of
 * the fallback static image.
 */
const usesAtlasIcon = computed(() => {
    if (props.spell?.type !== SpellType.Summon) return false;
    const unitId: string | undefined = (props.spell as any).unitId;
    if (!unitId) return false;
    const spellFrame: number = (props.spell as any).spellFrame ?? 0;
    const frameName = `${unitId}_r_${spellFrame}`;
    return _classicFrames.has(frameName) || _enhancedFrames.has(unitId);
});

const canvasRef = ref<HTMLCanvasElement | null>(null);

/**
 * Redraws the canvas whenever the spell or the canvas element changes.
 * Watching canvasRef handles the v-if mount/unmount cycle.
 */
watch(
    [() => props.spell, canvasRef],
    async ([spell, canvas]) => {
        if (!canvas || !spell || !usesAtlasIcon.value) return;
        const unitId: string = (spell as any).unitId;
        const spellFrame: number = (spell as any).spellFrame ?? 0;
        const frameName = `${unitId}_r_${spellFrame}`;

        let frame: FrameRect | undefined;
        let imgPromise: Promise<HTMLImageElement>;

        const classicFrame = _classicFrames.get(frameName);
        if (classicFrame) {
            frame = classicFrame;
            imgPromise = _loadImage(classicunitsAtlas);
        } else {
            const enhanced = _enhancedFrames.get(unitId);
            if (!enhanced) return;
            frame = enhanced.frames.get(frameName);
            if (!frame) return;
            imgPromise = _loadImage(enhanced.imageUrl);
        }

        const img = await imgPromise;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const { top, visibleHeight, left, visibleWidth } = _getTrimBounds(
            img,
            frame,
            frameName,
        );
        const destX = Math.round((canvas.width - visibleWidth) / 2);
        const destY = Math.round((canvas.height - visibleHeight) / 2);
        ctx.drawImage(
            img,
            frame.x + left,
            frame.y + top,
            visibleWidth,
            visibleHeight,
            destX,
            destY,
            visibleWidth,
            visibleHeight,
        );
    },
    { immediate: true },
);

/**
 * Get the base image URL for the spell. Used for non-summon spells where no
 * atlas frame is available.
 */
const spellImage = computed(() => {
    return getImageUrl(props.spell);
});

/**
 * Get the CSS classes for the spell image container. Determines whether this
 * is a 1, 2 or 3 coloured border.
 */
const spellClasses = computed(() => {
    return [`spell-icon--${spellIconData.value?.number ?? 1}`];
});

/**
 * Get the CSS styles for the spell image container. Determines the colours
 * used in the border based on a priority system for the spell types.
 */
const spellStyles = computed(() => {
    if (props.spell) {
        return {
            "--spell-grad-top": `var(--spell-${spellIconData.value?.top})`,
            "--spell-grad-middle": `var(--spell-${spellIconData.value?.middle})`,
            "--spell-grad-bottom": `var(--spell-${spellIconData.value?.bottom})`,
        };
    }
    return {};
});

const determineMainSpellColour: (spell: Spell) => string = (spell: Spell) => {
    if (!spell) {
        return "unknown";
    }
    if (spell.type === SpellType.Disbelieve) {
        return "persists";
    }
    if (spell.type === SpellType.Attack) {
        return "attack";
    }
    if (spell.type === SpellType.Buff) {
        return "buff";
    }
    if (spell.type === SpellType.Summon) {
        const unitProperties: UnitConfig = (spell as any).unitProperties;
        if (unitProperties) {
            if (unitProperties.status?.includes(UnitStatus.Flying)) {
                return "flying";
            } else if (unitProperties.status?.includes(UnitStatus.Undead)) {
                return "undead";
            } else if (unitProperties.status?.includes(UnitStatus.Mount)) {
                return "mount";
            } else if (unitProperties.status.includes(UnitStatus.Spreads)) {
                return "spreads";
            } else if (unitProperties.properties.mov === 0) {
                return "static";
            } else {
                return "ground";
            }
        }
    }
    return "unknown";
};

onMounted(() => {
    if (!props.spell) {
        return;
    }
    const types: string[] = props.spell.properties.types || [];
    switch (types.length) {
        case 0:
            spellIconData.value = {
                number: 1,
                top: determineMainSpellColour(props.spell),
            };
            break;
        case 1:
            spellIconData.value = {
                number: 1,
                top: types[0],
            };
            break;
        case 2:
            spellIconData.value = {
                number: 2,
                top: types[0],
                bottom: types[1],
            };
            break;
        default:
            spellIconData.value = {
                number: 3,
                top: types[0],
                middle: types[1],
                bottom: types[2],
            };
            break;
    }
});

/**
 * Gets the image URL for a spell. Used when no atlas frame is available
 * (attack spells, buff spells, and any summon spell without a registered unit).
 *
 * @param spell The spell to get the image URL for.
 * @returns The image URL.
 */
const getImageUrl: (spell: Spell) => string = (spell: Spell) => {
    return `${import.meta.env.BASE_URL}images/spells/${spell.properties.group || "classicspells"}/${spell.spellId}.png`;
};
</script>
<style scoped lang="scss">
.spell-icon {
    display: inline-block;

    &__image {
        width: 100%;
        height: 100%;
        image-rendering: pixelated;
    }

    --colour-red: #f00;
    --colour-blue: #210eb4;
    --colour-grey: #7d7d7d;
    --colour-dark-grey: #222;
    --colour-brown: #422108;
    --colour-yellow: #ff0;
    --colour-green: #08ad00;
    --colour-orange: #ff6d00;
    --colour-light-blue: #009cef;
    --colour-magenta: #b200b2;
    --colour-teal: #1d464e;
    --colour-cyan: #0ff;
    --colour-white: #fff;
    --colour-aquamarine: #13825b;

    --spell-flying: var(--colour-yellow);
    --spell-ground: var(--colour-green);
    --spell-static: var(--colour-grey);
    --spell-undead: var(--colour-light-blue);
    --spell-special: var(--colour-magenta);
    --spell-mount: var(--colour-brown);
    --spell-buff: var(--colour-blue);
    --spell-ranged: var(--colour-orange);
    --spell-spreads: var(--colour-teal);
    --spell-balance: var(--colour-cyan);
    --spell-attack: var(--colour-red);
    --spell-turmoil: var(--colour-aquamarine);
    --spell-persists: var(--colour-white);
    --spell-unknown: var(--colour-dark-grey);

    --size: 24;

    width: calc(var(--size) * 1px);
    height: calc(var(--size) * 1px);
    aspect-ratio: 1;
    border: 3px solid black;
    zoom: var(--zoom, 2);
    position: relative;
    --spell-grad-pixel-step: calc(100% / var(--size));

    &--2 {
        &::before {
            border-image: linear-gradient(
                    to bottom,
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 7),
                    var(--spell-grad-bottom)
                        calc(var(--spell-grad-pixel-step) * 7)
                        calc(var(--spell-grad-pixel-step) * 8),
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 8)
                        calc(var(--spell-grad-pixel-step) * 9),
                    var(--spell-grad-bottom)
                        calc(var(--spell-grad-pixel-step) * 9)
                        calc(var(--spell-grad-pixel-step) * 10),
                    var(--spell-grad-top)
                        calc(var(--spell-grad-pixel-step) * 10)
                        calc(var(--spell-grad-pixel-step) * 11),
                    var(--spell-grad-bottom)
                        calc(var(--spell-grad-pixel-step) * 11)
                        calc(var(--spell-grad-pixel-step) * 12),
                    var(--spell-grad-top)
                        calc(var(--spell-grad-pixel-step) * 12)
                        calc(var(--spell-grad-pixel-step) * 13),
                    var(--spell-grad-bottom)
                        calc(var(--spell-grad-pixel-step) * 13)
                        calc(var(--spell-grad-pixel-step) * 14),
                    var(--spell-grad-top)
                        calc(var(--spell-grad-pixel-step) * 14)
                        calc(var(--spell-grad-pixel-step) * 15),
                    var(--spell-grad-bottom)
                        calc(var(--spell-grad-pixel-step) * 15)
                )
                1;
        }
    }

    &--3 {
        &::before {
            border-image: linear-gradient(
                    to bottom,
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 3),
                    var(--spell-grad-middle)
                        calc(var(--spell-grad-pixel-step) * 3)
                        calc(var(--spell-grad-pixel-step) * 4),
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 4)
                        calc(var(--spell-grad-pixel-step) * 5),
                    var(--spell-grad-middle)
                        calc(var(--spell-grad-pixel-step) * 5)
                        calc(var(--spell-grad-pixel-step) * 6),
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 6)
                        calc(var(--spell-grad-pixel-step) * 7),
                    var(--spell-grad-middle)
                        calc(var(--spell-grad-pixel-step) * 7)
                        calc(var(--spell-grad-pixel-step) * 17),
                    var(--spell-grad-bottom)
                        calc(var(--spell-grad-pixel-step) * 17)
                        calc(var(--spell-grad-pixel-step) * 18),
                    var(--spell-grad-middle)
                        calc(var(--spell-grad-pixel-step) * 18)
                        calc(var(--spell-grad-pixel-step) * 19),
                    var(--spell-grad-bottom)
                        calc(var(--spell-grad-pixel-step) * 19)
                        calc(var(--spell-grad-pixel-step) * 20),
                    var(--spell-grad-middle)
                        calc(var(--spell-grad-pixel-step) * 20)
                        calc(var(--spell-grad-pixel-step) * 21),
                    var(--spell-grad-bottom)
                        calc(var(--spell-grad-pixel-step) * 21)
                )
                1;
        }
    }

    &::before {
        position: absolute;
        inset: -2px;
        content: "";
        border-width: 1px;
        border-style: solid;
        border-color: var(
            --spell-grad-top,
            var(
                --spell-grad-middle,
                var(--spell-grad-bottom, var(--spell-unknown))
            )
        );
        z-index: 10;
    }
}
</style>
