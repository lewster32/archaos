<template>
    <aside class="tool-panel">
        <section class="tool-panel__group">
            <h4>Tools</h4>
            <div class="tool-panel__tools">
                <button
                    v-for="t in toolList"
                    :key="t.id"
                    type="button"
                    :class="{ active: tool === t.id }"
                    :disabled="locked"
                    @click="emit('toolChange', t.id)"
                >{{ t.label }}</button>
            </div>
        </section>
        <section class="tool-panel__group">
            <h4>Colour</h4>
            <input
                type="color"
                :value="rgbHex"
                :disabled="locked"
                @input="onColourInput"
            />
            <label class="tool-panel__alpha">
                <span>Alpha</span>
                <input
                    type="range"
                    min="0"
                    max="255"
                    :value="colour[3]"
                    :disabled="locked"
                    @input="onAlphaInput"
                />
                <span>{{ colour[3] }}</span>
            </label>
            <SwatchStrip
                :buffers="buffers"
                :frame-version="frameVersion"
                :locked="locked"
                @pick="emit('colourChange', $event)"
            />
        </section>
        <section class="tool-panel__group">
            <h4>Mirror</h4>
            <button
                type="button"
                :disabled="locked"
                @click="emit('mirror', { from: 'l', to: 'r' })"
            >Copy L -&gt; R</button>
            <button
                type="button"
                :disabled="locked"
                @click="emit('mirror', { from: 'r', to: 'l' })"
            >Copy R -&gt; L</button>
        </section>
        <section class="tool-panel__group">
            <h4>History</h4>
            <button
                type="button"
                :disabled="locked || !canUndo"
                @click="emit('undo')"
            >Undo</button>
            <button
                type="button"
                :disabled="locked || !canRedo"
                @click="emit('redo')"
            >Redo</button>
        </section>
        <section class="tool-panel__group">
            <h4>Save</h4>
            <button
                type="button"
                disabled
                title="Save format coming in Phase 2B (.summon archive)."
            >Save sprite atlas (Phase 2B)</button>
            <p class="tool-panel__banner">
                Edits are session-only until Phase 2B ships the .summon format.
            </p>
        </section>
    </aside>
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
    { id: "pencil" as const, label: "P" },
    { id: "fill" as const, label: "F" },
    { id: "eraser" as const, label: "E" },
    { id: "eyedropper" as const, label: "Eye" },
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

<style scoped>
.tool-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px;
    min-width: 220px;
}
.tool-panel__group {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.tool-panel__tools {
    display: flex;
    gap: 4px;
}
.tool-panel__tools button.active {
    background: rgba(255, 255, 255, 0.1);
    font-weight: bold;
}
.tool-panel__alpha {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 4px;
    align-items: center;
}
.tool-panel__banner {
    font-size: 11px;
    opacity: 0.7;
}
</style>
