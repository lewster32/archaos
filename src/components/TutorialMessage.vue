<template>
    <div class="modal" v-if="message" :style="{ zIndex: messageZIndex }">
        <div class="callout tutorial-message" :class="messagePositionClass">
            <p class="callout__title">{{ message.title }}</p>
            <div class="tutorial-message__body" v-html="message.text"></div>
            <div class="callout__buttons">
                <button class="button button--green" @click="dismiss">
                    {{ buttonLabel }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { Logger } from "../gameobjects/services/logger";
import { EventType } from "@archaos/engine";
import type { TutorialMessageEvent } from "../gameobjects/tutorials/tutorial";

const message = ref<TutorialMessageEvent | null>(null);

const buttonLabel = computed(() => {
    switch (message.value?.type) {
        case "intro":
            return "Begin";
        case "outro":
            return "Finish";
        default:
            return "OK";
    }
});

const messagePositionClass = computed(() => {
    switch (message.value?.position) {
        case "top":
            return "tutorial-message--top";
        case "bottom":
            return "tutorial-message--bottom";
        case "left":
            return "tutorial-message--left";
        case "right":
            return "tutorial-message--right";
        default:
            return "";
    }
});

const Z_INDEX_DEFAULT = 1000;

const messageZIndex = computed(() => {
    if (!message.value) {
        return null;
    }
    return message.value.zIndex ?? Z_INDEX_DEFAULT;
});

const dismiss = () => {
    message.value?.resolve();
    message.value = null;
};

const onTutorialMessage = (event: TutorialMessageEvent) => {
    message.value = event;
};

const emitter = Logger.getEventEmitter();

onMounted(() => {
    emitter.on(EventType.TutorialMessage, onTutorialMessage);
});

onUnmounted(() => {
    emitter.off(EventType.TutorialMessage, onTutorialMessage);
});
</script>

<style lang="scss" scoped>
.tutorial-message {
    width: min(90vw, 400px);
    max-height: calc(100vh - 2em);
    overflow: auto;
    text-shadow: var(--text-shadow);
    background: #111;

    &__body {
        margin: 0.75em 0;
        line-height: 1.5;
        text-wrap: pretty;
        > * {
            line-height: 1.5;
        }
        > * + * {
            margin-top: 1rem;
        }
    }
    &--bottom {
        top: auto;
        bottom: 1em;
        transform: translate(-50%, 0);
    }

    &--top {
        top: 1em;
        transform: translate(-50%, 0);
    }

    &--left {
        left: 1em;
        transform: translate(0, -50%);
    }

    &--right {
        left: auto;
        right: 1em;
        transform: translate(0, -50%);
    }
}
</style>
