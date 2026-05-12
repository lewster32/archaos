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
            <PaintCanvas
                :active-buffer="activeBufferRef"
                :tool="tool"
                :colour="colour"
                :frame-version="frameVersion"
                :locked="locked"
                @stroke-started="$emit('strokeStarted')"
                @stroke-committed="$emit('strokeCommitted', $event)"
                @eyedrop="$emit('eyedrop', $event)"
            />
        </section>
        <section class="sprite-editor__tools">
            <p>Tool panel comes in Task 9.</p>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FrameStrip from "./FrameStrip.vue";
import PaintCanvas from "./PaintCanvas.vue";
import {
    frameBufferKey,
    type Direction,
    type FrameBuffer,
    type FrameBuffers,
    type FrameKey,
    type Rgba,
} from "../data/types";

const props = defineProps<{
    buffers: FrameBuffers;
    animFrames: number[];
    activeFrame: FrameKey;
    frameVersion: number;
    locked: boolean;
    tool: "pencil" | "fill" | "eraser" | "eyedropper";
    colour: Rgba;
}>();

defineEmits<{
    (e: "selectFrame", key: FrameKey): void;
    (e: "appendAnimFrame"): void;
    (e: "addDeathFrame", direction: Direction): void;
    (e: "clearDeathFrame", direction: Direction): void;
    (e: "strokeStarted"): void;
    (e: "strokeCommitted", undoSnapshot: ImageData): void;
    (e: "eyedrop", rgba: Rgba): void;
}>();

const activeBufferRef = computed<FrameBuffer | null>(() => {
    const k = frameBufferKey(
        props.activeFrame.direction,
        props.activeFrame.slot,
        props.activeFrame.index,
    );
    return props.buffers.get(k) ?? null;
});
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
