<template>
    <section class="callout animation-editor">
        <h2>Sequence</h2>
        <AnimFramesEditor
            :model-value="spell.unit.animFrames ?? []"
            :unit="spell.unit"
            @update:model-value="setAnimFrames"
        />
        <div class="animation-editor__row">
            <NumberInput
                label="animSpeed"
                :model-value="spell.unit.animSpeed"
                :min="1"
                :max="9"
                :step="1"
                @update:model-value="setAnimSpeed"
            />
            <NumberInput
                label="shadowScale"
                :model-value="spell.unit.shadowScale"
                :min="0"
                :max="4"
                :step="1"
                @update:model-value="setShadowScale"
            />
        </div>
    </section>
</template>

<script setup lang="ts">
import AnimFramesEditor from "../widgets/AnimFramesEditor.vue";
import NumberInput from "../widgets/NumberInput.vue";
import type { EditableSpell } from "../data/types";

const props = defineProps<{
    spell: EditableSpell;
}>();

function markDirty(): void {
    props.spell._dirty = true;
}

function setAnimFrames(next: number[]): void {
    props.spell.unit.animFrames = next.length ? next : undefined;
    markDirty();
}

function setAnimSpeed(value: number | undefined): void {
    props.spell.unit.animSpeed = value;
    markDirty();
}

function setShadowScale(value: number | undefined): void {
    props.spell.unit.shadowScale = value;
    markDirty();
}
</script>

<style lang="scss" scoped>
.animation-editor {
    h2 {
        margin: 0 0 0.5rem;
        font-size: 1.15rem;
        color: var(--color-yellow);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.25rem;
    }

    &__row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;

        > * {
            flex: 1 1 auto;
        }
    }
}
</style>
