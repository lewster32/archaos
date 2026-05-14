<!-- src/debug/units/widgets/NumberInput.vue -->
<template>
    <label class="number-input">
        <span v-if="label" class="number-input__label">{{ label }}</span>
        <input type="number" :min="min" :max="max" :step="step" :value="modelValue ?? ''" @input="onInput($event)" />
    </label>
</template>

<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        modelValue: number | undefined;
        label?: string;
        min?: number;
        max?: number;
        step?: number;
    }>(),
    { step: 1 },
);

const emit = defineEmits<{
    "update:modelValue": [value: number | undefined];
}>();

/**
 * Emit a `number` (not a string) so v-model bindings on the parent get
 * the right type. An empty input emits `undefined` so the optional
 * fields on `EditableUnit` can be cleared.
 */
function onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const raw = target.value;
    if (raw === "") {
        emit("update:modelValue", undefined);
        return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    let clamped = num;
    if (props.min !== undefined && clamped < props.min) clamped = props.min;
    if (props.max !== undefined && clamped > props.max) clamped = props.max;
    emit("update:modelValue", clamped);
}
</script>

<style lang="scss" scoped>
.number-input {
    display: inline-flex;
    flex-direction: column;
    gap: 0.15rem;

    &__label {
        font-size: 0.8rem;
        color: var(--color-grey);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    input {
        font-family: inherit;
        font-size: 1.5rem;
        padding: 0.25rem 0.4rem;
        background: var(--color-dark-grey);
        color: var(--color-white);
        border: 2px solid #111;
        border-radius: 3px;
        width: 5rem;
        height: 2.5rem;
    }
}
</style>
