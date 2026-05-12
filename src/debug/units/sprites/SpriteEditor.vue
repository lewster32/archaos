<template>
    <div class="sprite-editor">
        <FrameStrip
            :buffers="buffers"
            :anim-frames="animFrames"
            :active-frame="activeFrame"
            :frame-version="frameVersion"
            :locked="locked"
            @select-frame="$emit('selectFrame', $event)"
            @append-anim-frame="$emit('appendAnimFrame')"
            @add-death-frame="$emit('addDeathFrame', $event)"
            @clear-death-frame="$emit('clearDeathFrame', $event)"
        />
        <section class="sprite-editor__canvas">
            <p>Paint canvas comes in Task 8.</p>
        </section>
        <section class="sprite-editor__tools">
            <p>Tool panel comes in Task 9.</p>
        </section>
    </div>
</template>

<script setup lang="ts">
import FrameStrip from "./FrameStrip.vue";
import type { Direction, FrameBuffers, FrameKey } from "../data/types";

defineProps<{
    buffers: FrameBuffers;
    animFrames: number[];
    activeFrame: FrameKey;
    frameVersion: number;
    locked: boolean;
}>();

defineEmits<{
    (e: "selectFrame", key: FrameKey): void;
    (e: "appendAnimFrame"): void;
    (e: "addDeathFrame", direction: Direction): void;
    (e: "clearDeathFrame", direction: Direction): void;
}>();
</script>

<style scoped>
.sprite-editor {
    display: grid;
    grid-template-columns: minmax(200px, 1fr) 3fr minmax(220px, 1fr);
    gap: 12px;
    min-height: 600px;
}
.sprite-editor__canvas,
.sprite-editor__tools {
    border: 1px dashed currentColor;
    padding: 8px;
}
</style>
