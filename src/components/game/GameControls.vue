<template>
    <div class="big-buttons">
        <button
            :class="{ 'big-button--hide': !gameStarted || !canEndTurn }"
            @click="$emit('end-turn')"
            class="big-button big-button--skip"
            title="End Turn"
        />
        <button
            :class="{ 'big-button--hide': !gameStarted || !canCancel }"
            @click="$emit('cancel')"
            class="big-button big-button--cancel"
            title="Cancel"
        />
        <button
            :class="{ 'big-button--hide': !gameStarted || !canDismount }"
            @click="$emit('dismount')"
            class="big-button big-button--dismount"
            title="Dismount"
        />
    </div>
</template>

<script setup lang="ts">
defineProps<{
    gameStarted: boolean;
    canEndTurn: boolean;
    canCancel: boolean;
    canDismount: boolean;
}>();

defineEmits<{
    "end-turn": [];
    cancel: [];
    dismount: [];
}>();
</script>

<style lang="scss" scoped>
.big-buttons {
    position: fixed;
    top: 0;
    left: 6em;
    padding: 1em;
    z-index: 20;
}

.big-button {
    border: 0;
    background: transparent;
    &::after {
        display: none;
    }
    width: 80px;
    height: 80px;
    background-repeat: no-repeat;
    background-position: 50% 50%;
    background-size: contain;
    image-rendering: pixelated;
    cursor: pointer;
    transition:
        transform 0.2s 0.2s ease-in-out,
        opacity 0.2s 0.2s;
    transform: translateY(0);
    opacity: 1;
    position: relative;
    &--hide {
        transform: translateY(-100%);
        opacity: 0;
    }
    &:hover {
        top: 2px;
        filter: brightness(0.8);
    }
    &--cancel {
        background-image: url("@assets/images/ui/cancel.png");
    }
    &--skip {
        background-image: url("@assets/images/ui/end-turn.png");
    }
    &--dismount {
        background-image: url("@assets/images/ui/dismount.png");
    }
}
</style>
