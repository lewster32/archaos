<template>
    <div class="slider-controls">
        <button
            class="button button--small slider-controls__subtract"
            @click="emit('update:modelValue', Math.max(modelValue - 1, min))"
        >
            <i class="icon icon--left"></i>
        </button>
        <input
            type="range"
            :min="min"
            :max="max"
            :value="modelValue"
            class="slider-controls__input"
            @input="emit('update:modelValue', +($event.target as HTMLInputElement).value)"
        />
        <button
            class="button button--small slider-controls__add"
            @click="emit('update:modelValue', Math.min(modelValue + 1, max))"
        >
            <i class="icon icon--right"></i>
        </button>
    </div>
</template>
<script setup lang="ts">
defineProps<{
    modelValue: number;
    min: number;
    max: number;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: number];
}>();
</script>
<style lang="scss" scoped>
.slider-controls {
    display: flex;
    align-items: center;
    gap: 0.25em;
    &__input {
        flex: 1 1 auto;
    }
}
</style>
