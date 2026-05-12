<template>
    <div class="swatch-strip">
        <button
            v-for="(swatch, i) in swatches"
            :key="`${swatch[0]}-${swatch[1]}-${swatch[2]}-${swatch[3]}-${i}`"
            type="button"
            class="swatch-strip__chip"
            :style="{ background: rgbaCss(swatch) }"
            :title="rgbaCss(swatch)"
            :disabled="locked"
            @click="$emit('pick', swatch)"
        ></button>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { FrameBuffers, Rgba } from "../data/types";

const props = defineProps<{
    /**
     * Per-unit buffer sets the strip should scan for distinct colours.
     * Ignored when `colours` is provided; pass an empty array for the
     * colours-driven mode.
     */
    bufferSets: FrameBuffers[];
    /**
     * Pre-collected colour list. When supplied, the strip skips the
     * buffer scan and just sorts + caps this list. Used by the
     * global-colours pane which maintains its own per-unit cache.
     */
    colours?: Rgba[];
    frameVersion: number;
    locked: boolean;
    maxSwatches?: number;
}>();

defineEmits<{ (e: "pick", rgba: Rgba): void }>();

const DEFAULT_MAX_SWATCHES = 32;
const GRAYSCALE_SATURATION_THRESHOLD = 0.08;

function rgbToHsl(
    r: number,
    g: number,
    b: number,
): { h: number; s: number; l: number } {
    const rN = r / 255;
    const gN = g / 255;
    const bN = b / 255;
    const max = Math.max(rN, gN, bN);
    const min = Math.min(rN, gN, bN);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === rN) h = ((gN - bN) / d + (gN < bN ? 6 : 0)) / 6;
    else if (max === gN) h = ((bN - rN) / d + 2) / 6;
    else h = ((rN - gN) / d + 4) / 6;
    return { h, s, l };
}

// Grayscale (low saturation) sorts before chromatic colours; both
// sort ascending by lightness within their group, with saturation
// breaking ties on equal hue+lightness.
function swatchSortKey(c: Rgba): [number, number, number] {
    const { h, s, l } = rgbToHsl(c[0], c[1], c[2]);
    if (s < GRAYSCALE_SATURATION_THRESHOLD) return [-1, l, 0];
    return [h, l, s];
}

const swatches = computed<Rgba[]>(() => {
    void props.frameVersion;
    // Alpha is always 255 in this codebase (eraser handles transparent
    // pixels), so dedup by RGB only.
    const seen = new Set<number>();
    const out: Rgba[] = [];

    if (props.colours) {
        for (const c of props.colours) {
            const key = (c[0] << 16) | (c[1] << 8) | c[2];
            if (seen.has(key)) continue;
            seen.add(key);
            out.push([c[0], c[1], c[2], 255] as Rgba);
        }
    } else {
        for (const buffers of props.bufferSets) {
            for (const buf of buffers.values()) {
                const arr = buf.data.data;
                for (let i = 0; i < arr.length; i += 4) {
                    if (arr[i + 3] === 0) continue;
                    const key =
                        (arr[i] << 16) | (arr[i + 1] << 8) | arr[i + 2];
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push([arr[i], arr[i + 1], arr[i + 2], 255] as Rgba);
                }
            }
        }
    }

    out.sort((a, b) => {
        const [ah, al, asat] = swatchSortKey(a);
        const [bh, bl, bsat] = swatchSortKey(b);
        if (ah !== bh) return ah - bh;
        if (al !== bl) return al - bl;
        return asat - bsat;
    });
    return out.slice(0, props.maxSwatches ?? DEFAULT_MAX_SWATCHES);
});

function rgbaCss(c: Rgba): string {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
</script>

<style lang="scss" scoped>
.swatch-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 2px 0;

    &__chip {
        all: unset;
        width: 18px;
        height: 18px;
        padding: 0;
        border: 2px solid #111;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.05);
        cursor: pointer;
        transition: transform 80ms ease;

        &:hover {
            transform: scale(1.15);
            box-shadow: 0 0 0 1px var(--color-yellow);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
    }
}
</style>
