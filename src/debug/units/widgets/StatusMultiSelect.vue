<!-- src/debug/units/widgets/StatusMultiSelect.vue -->
<template>
    <div class="status-multi-select">
        <ul class="status-multi-select__chips" v-if="modelValue.length">
            <li v-for="value in modelValue" :key="value">
                <span>{{ value }}</span>
                <button type="button" @click="remove(value)" aria-label="Remove status">
                    &times;
                </button>
            </li>
        </ul>
        <select v-if="availableToAdd.length" @change="onAdd($event)">
            <option value="">Add status...</option>
            <option v-for="opt in availableToAdd" :key="opt" :value="opt">
                {{ opt }}
            </option>
        </select>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { UnitStatus } from "@archaos/engine";

const props = withDefaults(
    defineProps<{
        modelValue: string[];
        available?: string[];
    }>(),
    {
        available: () => Object.values(UnitStatus),
    }
);

const emit = defineEmits<{
    "update:modelValue": [value: string[]];
}>();

/**
 * Statuses not yet picked. Unknown values currently in `modelValue` are
 * kept as chips but excluded from the picker - the user can remove them
 * but not re-add them.
 */
const availableToAdd = computed(() =>
    props.available.filter((s) => !props.modelValue.includes(s))
);

function onAdd(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    if (value === "") return;
    emit("update:modelValue", [...props.modelValue, value]);
    target.value = "";
}

function remove(value: string): void {
    emit("update:modelValue", props.modelValue.filter((v) => v !== value));
}
</script>

<style lang="scss" scoped>
.status-multi-select {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    &__chips {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;

        li {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.15em 0.4em;
            background: var(--color-dark-grey);
            border: 2px solid #111;
            border-radius: 3px;
            font-family: monospace;
            font-size: 0.85em;
        }

        button {
            all: unset;
            cursor: pointer;
            color: var(--color-grey);
            line-height: 1;

            &:hover {
                color: var(--color-yellow);
            }
        }
    }

    select {
        align-self: flex-start;
        font-family: inherit;
        font-size: 0.9rem;
        padding: 0.25rem 0.4rem;
        background: var(--color-dark-grey);
        color: var(--color-white);
        border: 2px solid #111;
        border-radius: 3px;
    }
}
</style>
