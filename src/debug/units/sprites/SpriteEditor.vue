<template>
    <div class="sprite-editor">
        <div class="sprite-editor__column">
            <FrameStrip
                :buffers="buffers"
                :anim-frames="animFrames"
                :active-frame="activeFrame"
                :frame-version="frameVersion"
                :locked="locked"
                @select-frame="$emit('selectFrame', $event)"
                @append-anim-frame="$emit('appendAnimFrame')"
                @duplicate-anim-frame="$emit('duplicateAnimFrame', $event)"
                @remove-anim-frame="$emit('removeAnimFrame', $event)"
                @add-death-frame="$emit('addDeathFrame', $event)"
                @clear-death-frame="$emit('clearDeathFrame', $event)"
            />
            <AnimatedPreview
                :buffers="buffers"
                :anim-frames="animFrames"
                :anim-speed="animSpeed"
                :frame-version="frameVersion"
            />
            <AnimationEditor :spell="spell" />
        </div>
        <PaintCanvas
            :active-buffer="activeBufferRef"
            :active-frame="activeFrame"
            :tool="tool"
            :colour="colour"
            :frame-version="frameVersion"
            :locked="locked"
            @stroke-started="$emit('strokeStarted')"
            @stroke-committed="$emit('strokeCommitted', $event)"
            @eyedrop="$emit('eyedrop', $event)"
        />
        <ToolPanel
            :tool="tool"
            :colour="colour"
            :buffers="buffers"
            :global-colours="globalColours"
            :frame-version="frameVersion"
            :can-undo="canUndo"
            :can-redo="canRedo"
            :locked="locked"
            @tool-change="$emit('toolChange', $event)"
            @colour-change="$emit('colourChange', $event)"
            @mirror="$emit('mirror', $event)"
            @undo="$emit('undo')"
            @redo="$emit('redo')"
        />
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AnimatedPreview from "./AnimatedPreview.vue";
import AnimationEditor from "./AnimationEditor.vue";
import FrameStrip from "./FrameStrip.vue";
import PaintCanvas from "./PaintCanvas.vue";
import ToolPanel from "./ToolPanel.vue";
import {
    frameBufferKey,
    type Direction,
    type EditableSpell,
    type FrameBuffer,
    type FrameBuffers,
    type FrameKey,
    type Rgba,
} from "../data/types";

const props = defineProps<{
    spell: EditableSpell;
    buffers: FrameBuffers;
    globalColours: Rgba[];
    animFrames: number[];
    animSpeed: number | undefined;
    activeFrame: FrameKey;
    frameVersion: number;
    locked: boolean;
    tool: "pencil" | "fill" | "eraser" | "eyedropper";
    colour: Rgba;
    canUndo: boolean;
    canRedo: boolean;
}>();

defineEmits<{
    (e: "selectFrame", key: FrameKey): void;
    (e: "appendAnimFrame"): void;
    (e: "duplicateAnimFrame", sourceIndex: number): void;
    (e: "removeAnimFrame", index: number): void;
    (e: "addDeathFrame", direction: Direction): void;
    (e: "clearDeathFrame", direction: Direction): void;
    (e: "strokeStarted"): void;
    (e: "strokeCommitted", undoSnapshot: ImageData): void;
    (e: "eyedrop", rgba: Rgba): void;
    (e: "toolChange", tool: "pencil" | "fill" | "eraser" | "eyedropper"): void;
    (e: "colourChange", rgba: Rgba): void;
    (e: "mirror", payload: { from: Direction; to: Direction }): void;
    (e: "undo"): void;
    (e: "redo"): void;
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

<style lang="scss" scoped>
.sprite-editor {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(0, 3fr) minmax(240px, 1fr);
    gap: 1rem;
    min-height: 600px;
    align-items: start;

    &__column {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-height: 0;
    }
}
</style>
