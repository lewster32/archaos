<template>
    <div class="tool-panel">
        <section class="callout tool-panel__group">
            <h2>Tools</h2>
            <div class="tool-panel__tools">
                <button
                    v-for="t in toolList"
                    :key="t.id"
                    type="button"
                    class="button button--small"
                    :class="{ 'button--yellow': tool === t.id }"
                    :disabled="locked"
                    :title="t.label"
                    @click="emit('toolChange', t.id)"
                >{{ t.short }}</button>
            </div>
        </section>

        <section class="callout tool-panel__group">
            <h2>Colour</h2>
            <label class="tool-panel__field">
                <span>RGB</span>
                <input
                    type="color"
                    :value="rgbHex"
                    :disabled="locked"
                    @input="onColourInput"
                />
            </label>
            <label class="tool-panel__field tool-panel__alpha">
                <span>Alpha</span>
                <input
                    type="range"
                    min="0"
                    max="255"
                    :value="colour[3]"
                    :disabled="locked"
                    @input="onAlphaInput"
                />
                <span class="tool-panel__alpha-value">{{ colour[3] }}</span>
            </label>
            <SwatchStrip
                :buffers="buffers"
                :frame-version="frameVersion"
                :locked="locked"
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
                >L -&gt; R</button>
                <button
                    type="button"
                    class="button button--small button--cyan"
                    :disabled="locked"
                    @click="emit('mirror', { from: 'r', to: 'l' })"
                >R -&gt; L</button>
            </div>
        </section>

        <section class="callout tool-panel__group">
            <h2>History</h2>
            <div class="tool-panel__row">
                <button
                    type="button"
                    class="button button--small"
                    :disabled="locked || !canUndo"
                    @click="emit('undo')"
                >Undo</button>
                <button
                    type="button"
                    class="button button--small"
                    :disabled="locked || !canRedo"
                    @click="emit('redo')"
                >Redo</button>
            </div>
        </section>

        <section class="callout tool-panel__group">
            <h2>Save</h2>
            <button
                type="button"
                class="button button--green"
                disabled
                title="Save format coming in Phase 2B (.summon archive)."
            >Save sprite atlas</button>
            <p class="tool-panel__banner">
                Phase 2B. Edits are session-only until the .summon format ships.
            </p>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SwatchStrip from "./SwatchStrip.vue";
import type { Direction, FrameBuffers, Rgba } from "../data/types";

const props = defineProps<{
    tool: "pencil" | "fill" | "eraser" | "eyedropper";
    colour: Rgba;
    buffers: FrameBuffers;
    frameVersion: number;
    canUndo: boolean;
    canRedo: boolean;
    locked: boolean;
}>();

const emit = defineEmits<{
    (e: "toolChange", tool: "pencil" | "fill" | "eraser" | "eyedropper"): void;
    (e: "colourChange", rgba: Rgba): void;
    (e: "mirror", payload: { from: Direction; to: Direction }): void;
    (e: "undo"): void;
    (e: "redo"): void;
}>();

const toolList = [
    { id: "pencil" as const, short: "P", label: "Pencil" },
    { id: "fill" as const, short: "F", label: "Fill" },
    { id: "eraser" as const, short: "E", label: "Eraser" },
    { id: "eyedropper" as const, short: "Eye", label: "Eyedropper" },
];

function toHexByte(n: number): string {
    return n.toString(16).padStart(2, "0");
}

const rgbHex = computed(
    () =>
        `#${toHexByte(props.colour[0])}${toHexByte(props.colour[1])}${toHexByte(props.colour[2])}`,
);

function onColourInput(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    const r = parseInt(v.slice(1, 3), 16);
    const g = parseInt(v.slice(3, 5), 16);
    const b = parseInt(v.slice(5, 7), 16);
    emit("colourChange", [r, g, b, props.colour[3]] as Rgba);
}

function onAlphaInput(e: Event): void {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    emit(
        "colourChange",
        [props.colour[0], props.colour[1], props.colour[2], v] as Rgba,
    );
}
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

    &__alpha {
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;

        input[type="range"] {
            flex: 1 1 auto;
        }
    }

    &__alpha-value {
        min-width: 2.5rem;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }

    &__banner {
        margin: 0;
        font-size: 0.75rem;
        opacity: 0.7;
    }

    input[type="color"] {
        width: 100%;
        height: 2rem;
        padding: 2px;
        cursor: pointer;
    }
}
</style>
