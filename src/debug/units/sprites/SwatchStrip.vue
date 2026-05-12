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
    buffers: FrameBuffers;
    frameVersion: number;
    locked: boolean;
}>();

defineEmits<{ (e: "pick", rgba: Rgba): void }>();

const MAX_SWATCHES = 32;

const swatches = computed<Rgba[]>(() => {
    void props.frameVersion;
    const seen = new Set<string>();
    const out: Rgba[] = [];
    for (const buf of props.buffers.values()) {
        const arr = buf.data.data;
        for (let i = 0; i < arr.length; i += 4) {
            const a = arr[i + 3];
            if (a === 0) continue;
            const key = `${arr[i]},${arr[i + 1]},${arr[i + 2]},${a}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push([arr[i], arr[i + 1], arr[i + 2], a] as Rgba);
            if (out.length >= MAX_SWATCHES) return out;
        }
    }
    return out;
});

function rgbaCss(c: Rgba): string {
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] / 255})`;
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
