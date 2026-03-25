<template>
    <div class="consent-banner callout">
        <p class="consent-banner__text">
            Archaos can save your preferences (player setup, tutorial progress) in your browser. If you'd prefer it didn't do that, you can decline below.
        </p>
        <div class="callout__buttons consent-banner__buttons">
            <button class="button button--green" @click="$emit('accept')">
                Allow
            </button>
            <button class="button button--red" @click="$emit('decline')">
                Decline
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
defineEmits<{
    accept: [];
    decline: [];
}>();
</script>

<style lang="scss" scoped>
.consent-banner {
    position: fixed;
    bottom: 1em;
    left: 50%;
    translate: -50% 0;
    z-index: 1000;
    width: calc(100% - 2em);
    display: flex;
    gap: 1em;
    align-items: center;

    &__text {
        line-height: 1.4;
        max-width: 96ch;
    }
    &__buttons {
        margin-inline-start: auto;
    }
}
</style>
