<template>
    <dialog v-if="player" class="callout" ref="dialog">
        <h2 class="callout__title">{{ player.name }}</h2>
        <div class="callout__row callout__row--center">
            <label class="text-center"
            :class="{'c-yellow': !player.computerControlled, 'c-grey': player.computerControlled}"
            @click="player.computerControlled = false"
            >
                Human
            </label>
            <label class="human-computer-toggle" for="aicheckbox">
                <input
                    type="checkbox"
                    class="human-computer-toggle__input"
                    v-model="player.computerControlled"
                    id="aicheckbox"
                />
            </label>
            <label class="text-center"
            :class="{'c-cyan': player.computerControlled, 'c-grey': !player.computerControlled}"
            @click="player.computerControlled = true"
            >
                Computer
            </label>
        </div>
        <div class="callout__row">
            <WizCodeEditor v-model="player.wizCode" />
        </div>
        <div class="callout__buttons">
            <button
                class="button button--green"
                @click="dialog?.close()"
            >
                OK
            </button>
        </div>
    </dialog>
</template>
<script setup lang="ts">
import { ref } from "vue";
import type { Ref } from "vue";
import type { SetupPlayer } from "@archaos/engine";
import WizCodeEditor from "./WizCodeEditor.vue";
const dialog: Ref<HTMLDialogElement | null> = ref<HTMLDialogElement | null>(null);

const props = defineProps<{
    player: SetupPlayer | null;
}>();

defineExpose({
    showModal: () => dialog.value?.showModal(),
    close: () => dialog.value?.close(),
});

</script>
<style lang="scss" scoped>
.callout {
    min-width: min(400px, calc(100vw - 2em));
    &__row {
        &--center {
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1em;
            & > * {
                flex: 1 0 33%;
            }
        }
    }
}
.human-computer-toggle {
    width: 2.5em;
    max-width: 2.5em;
    height: 1.5em;
    padding-block: 0.25em;
    display: flex;
    aspect-ratio: auto;
    margin: 0;
    background-color: var(--color-black);
    position: relative;
    image-rendering: pixelated;
    border-style: solid;
    border-width: 6px;
    border-image-width: 6px;
    border-image-slice: 3;
    border-image-repeat: repeat;
    border-image-source: url("@assets/images/ui/check-unchecked.png");
    cursor: pointer;
    &::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 50%;
        height: 100%;
        background-color: var(--color-yellow);
        image-rendering: pixelated;
        transition: translate 0.2s ease;
    }
    &__input[type="checkbox"] {
        display: none;
    }
    &:has(.human-computer-toggle__input:checked) {
        &::before {
            translate: 100%;
            background-color: var(--color-cyan);
        }
    }
}
</style>