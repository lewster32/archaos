<template>
    <dialog v-if="tutorials.length > 0" class="callout callout--min-width" ref="dialog">
        <h2 class="callout__title">Tutorials</h2>
        <div class="callout__row" v-for="(tut, index) in tutorials" :key="index">
            <button class="button tutorial-button" @click="emit('select', tut.id)">
                <span class="tutorial-button__name">
                    <span class="tutorial-button__index">{{ index + 1 }}.</span>
                    {{ tut.name }}
                </span>
                <i
                    v-if="tut.done"
                    title="You have completed this tutorial"
                    class="tutorial-button__icon icon icon--tick"
                ></i>
                <i
                    v-else
                    title="You have not completed this tutorial yet"
                    class="tutorial-button__icon icon icon--right"
                ></i>
            </button>
        </div>
        <div class="callout__row">
            <button class="button button--red" @click="dialog?.close()">Cancel</button>
        </div>
    </dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";

interface TutorialEntry {
    id: string;
    name: string;
    done: boolean;
}

defineProps<{
    tutorials: TutorialEntry[];
}>();

const emit = defineEmits<{
    select: [tutorialId: string];
}>();

const dialog = ref<HTMLDialogElement | null>(null);

defineExpose({
    showModal: () => dialog.value?.showModal(),
    close: () => dialog.value?.close(),
});
</script>

<style lang="scss" scoped>
.callout__row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1em;
}

.tutorial-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    &__index {
        color: var(--color-grey);
    }
}
</style>
