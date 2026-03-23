<template>
    <div class="modal" v-if="message">
        <div class="callout tutorial-message">
            <p class="callout__title">{{ message.title }}</p>
            <div class="tutorial-message__body" v-html="message.text"></div>
            <div class="callout__buttons">
                <button
                    class="button button--green"
                    @click="dismiss"
                >
                    {{ buttonLabel }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { Logger } from "../gameobjects/services/logger";
import { EventType } from "../gameobjects/enums/eventtype";
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
    width: min(90vw, 600px);

    &__body {
        margin: 0.75em 0;
        line-height: 1.5;
        text-align: center;
        text-wrap: balance;
    }
}

.modal .callout {
    top: auto;
    bottom: 1em;
    transform: translate(-50%, 0);
}
</style>
