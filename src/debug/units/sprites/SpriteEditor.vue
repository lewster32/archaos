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
            <AnimationEditor
                :spell="spell"
                :buffers="buffers"
                :frame-version="frameVersion"
            />
        </div>
        <div class="sprite-editor__column">
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
            >
                <template #overlay>
                    <div class="sprite-editor__floating-tools">
                        <button
                            v-for="t in toolList"
                            :key="t.id"
                            type="button"
                            class="button button--small"
                            :class="{ 'button--yellow': tool === t.id }"
                            :disabled="locked"
                            :title="t.label"
                            @click="$emit('toolChange', t.id)"
                        ><i class="icon" :class="`icon--${t.short}`"></i></button>
                    </div>
                    <AnimatedPreview
                        class="sprite-editor__floating-anim"
                        :buffers="buffers"
                        :anim-frames="animFrames"
                        :anim-speed="animSpeed"
                        :frame-version="frameVersion"
                    />
                    <div class="sprite-editor__floating-nudge">
                        <button
                            type="button"
                            class="button button--small sprite-editor__floating-nudge-btn sprite-editor__floating-nudge-btn--up"
                            :disabled="locked"
                            title="Nudge up"
                            @click="$emit('nudge', { dx: 0, dy: -1 })"
                        ><i class="icon icon--up"></i></button>
                        <button
                            type="button"
                            class="button button--small sprite-editor__floating-nudge-btn sprite-editor__floating-nudge-btn--left"
                            :disabled="locked"
                            title="Nudge left"
                            @click="$emit('nudge', { dx: -1, dy: 0 })"
                        ><i class="icon icon--left"></i></button>
                        <button
                            type="button"
                            class="button button--small sprite-editor__floating-nudge-btn sprite-editor__floating-nudge-btn--right"
                            :disabled="locked"
                            title="Nudge right"
                            @click="$emit('nudge', { dx: 1, dy: 0 })"
                        ><i class="icon icon--right"></i></button>
                        <button
                            type="button"
                            class="button button--small sprite-editor__floating-nudge-btn sprite-editor__floating-nudge-btn--down"
                            :disabled="locked"
                            title="Nudge down"
                            @click="$emit('nudge', { dx: 0, dy: 1 })"
                        ><i class="icon icon--down"></i></button>
                    </div>
                </template>
            </PaintCanvas>
        </div>
        <ToolPanel
            :colour="colour"
            :buffers="buffers"
            :global-colours="globalColours"
            :frame-version="frameVersion"
            :can-undo="canUndo"
            :can-redo="canRedo"
            :locked="locked"
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
    (e: "nudge", payload: { dx: number; dy: number }): void;
    (e: "undo"): void;
    (e: "redo"): void;
}>();

const toolList = [
    {
        id: "pencil" as const,
        short: "edit",
        label: "Pencil (P, hold Shift for eraser)",
    },
    { id: "fill" as const, short: "fill", label: "Fill (F)" },
    {
        id: "eraser" as const,
        short: "erase",
        label: "Eraser (E, hold Shift for pencil)",
    },
    {
        id: "eyedropper" as const,
        short: "pick",
        label: "Picker (I or hold Ctrl)",
    },
];

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

    &__floating-tools {
        position: absolute;
        top: 0.5rem;
        left: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        z-index: 2;
    }

    &__floating-anim {
        position: absolute;
        bottom: 0.5rem;
        right: 0.5rem;
        z-index: 2;
    }

    &__floating-nudge {
        position: absolute;
        bottom: 0.5rem;
        left: 0.5rem;
        display: grid;
        grid-template-columns: repeat(3, auto);
        grid-template-rows: repeat(3, auto);
        gap: 0.25rem;
        z-index: 2;
    }

    &__floating-nudge-btn {
        &--up { grid-column: 2; grid-row: 1; }
        &--left { grid-column: 1; grid-row: 2; }
        &--right { grid-column: 3; grid-row: 2; }
        &--down { grid-column: 2; grid-row: 3; }
    }
}
</style>
