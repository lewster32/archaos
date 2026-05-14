<template>
    <div class="tool-panel">
        <section class="callout tool-panel__group">
            <h2>Colour</h2>
            <ColourPicker :model-value="colour" :disabled="locked" @update:model-value="emit('colourChange', $event)" />
            <button
                type="button"
                class="tool-panel__transparent"
                :class="{ 'tool-panel__transparent--active': colour[3] === 0 }"
                :disabled="locked"
                title="Transparent - pick then use Fill to clear a region"
                @click="emit('colourChange', [0, 0, 0, 0])"
            >
                Transparent
            </button>
            <SwatchStrip
                :buffer-sets="[buffers]"
                :frame-version="frameVersion"
                :locked="locked"
                @pick="emit('colourChange', $event)"
            />
        </section>

        <section class="callout tool-panel__group">
            <h2>Global colours</h2>
            <SwatchStrip
                :buffer-sets="[]"
                :colours="globalColours"
                :frame-version="frameVersion"
                :locked="locked"
                :max-swatches="96"
                @pick="emit('colourChange', $event)"
            />
        </section>

        <section class="callout tool-panel__group">
            <h2>Mirror</h2>
            <div class="tool-panel__row">
                <button
                    type="button"
                    class="button button--small button--cyan"
                    :disabled="locked"
                    @click="emit('mirror', { from: 'l', to: 'r' })"
                >
                    L -&gt; R
                </button>
                <button
                    type="button"
                    class="button button--small button--cyan"
                    :disabled="locked"
                    @click="emit('mirror', { from: 'r', to: 'l' })"
                >
                    R -&gt; L
                </button>
            </div>
        </section>

        <section class="callout tool-panel__group">
            <h2>Outline</h2>
            <div class="tool-panel__row">
                <button
                    type="button"
                    class="button button--small"
                    :disabled="locked"
                    title="Add a 1-pixel black outline around opaque pixels in the active frame"
                    @click="emit('outline')"
                >
                    Add black outline
                </button>
            </div>
        </section>

        <section class="callout tool-panel__group">
            <h2>History</h2>
            <div class="tool-panel__row">
                <button type="button" class="button button--small" :disabled="locked || !canUndo" @click="emit('undo')">
                    Undo
                </button>
                <button type="button" class="button button--small" :disabled="locked || !canRedo" @click="emit('redo')">
                    Redo
                </button>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import ColourPicker from "./ColourPicker.vue";
import SwatchStrip from "./SwatchStrip.vue";
import type { Direction, FrameBuffers, Rgba } from "../data/types";

defineProps<{
    colour: Rgba;
    buffers: FrameBuffers;
    globalColours: Rgba[];
    frameVersion: number;
    canUndo: boolean;
    canRedo: boolean;
    locked: boolean;
}>();

const emit = defineEmits<{
    (e: "colourChange", rgba: Rgba): void;
    (e: "mirror", payload: { from: Direction; to: Direction }): void;
    (e: "outline"): void;
    (e: "undo"): void;
    (e: "redo"): void;
}>();
</script>

<style lang="scss" scoped>
.tool-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    &__group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        h2 {
            margin: 0 0 0.25rem;
            font-size: 1.15rem;
            color: var(--color-yellow);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 0.25rem;
        }
    }

    &__tools {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
    }

    &__row {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;

        > * {
            flex: 1 1 auto;
        }
    }

    &__field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;

        > span {
            font-size: 0.85rem;
            color: var(--color-cyan);
            letter-spacing: 0.5px;
        }
    }

    input[type="color"] {
        width: 100%;
        height: 2rem;
        padding: 2px;
        cursor: pointer;
    }

    &__transparent {
        all: unset;
        display: block;
        text-align: center;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        font-size: 0.85rem;
        letter-spacing: 0.5px;
        color: #fff;
        text-shadow:
            -1px -1px 0 #000,
            1px -1px 0 #000,
            -1px 1px 0 #000,
            1px 1px 0 #000;
        border: 2px solid #111;
        background-color: #2a2a2a;
        background-image:
            linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%, #555),
            linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%, #555);
        background-size: 12px 12px;
        background-position:
            0 0,
            6px 6px;

        &:hover:not(:disabled) {
            box-shadow: 0 0 0 1px var(--color-yellow);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }

        &--active {
            box-shadow: 0 0 0 2px var(--color-yellow);
        }
    }
}
</style>
