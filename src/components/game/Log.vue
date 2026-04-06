<template>
    <div
        class="game-log"
        :class="{ 'game-log--minimised': isMinimised }"
        v-if="props.logs?.length > 0"
    >
        <button class="game-log__toggle button button--small" @click="toggle()">
            {{ minimised ? "+" : "-" }}
        </button>
        <ul class="game-log__scroll">
            <li class="game-log__item" v-for="log in logsSorted" :key="log.id">
                <span v-if="showTimestamps" class="game-log__timestamp"
                    >{{ formatDate(log.timestamp) }}:
                </span>
                <span
                    class="game-log__message"
                    :style="getColour(log)"
                    v-html="log.message"
                ></span>
            </li>
        </ul>
    </div>
</template>
<script setup lang="ts">
import { Colour } from "@archaos/engine";
import { Log } from "../../gameobjects/services/logger";
import { ref, computed } from "vue";

const props = defineProps<{
    logs: Log[];
}>();

/**
 * Whether to show timestamps next to each log entry.
 */
const showTimestamps = ref(false);

/**
 * Whether the log is manually minimised by the user or not.
 */
const minimised = ref(true);

/**
 * Whether the log is minimised (either manually or because there are no logs).
 */
const isMinimised = computed(() => {
    return minimised.value || !props.logs || !props.logs.length;
});

/**
 * Toggles the minimised state of the log.
 */
const toggle = () => {
    minimised.value = !minimised.value;
};

/**
 * The logs sorted in descending order by timestamp, limited to the most recent
 * 25 entries.
 */
const logsSorted = computed(() => {
    return props.logs
        .slice()
        .toSorted((a: Log, b: Log) => {
            return b.timestamp.getTime() - a.timestamp.getTime();
        })
        .slice(0, 25);
});

/**
 * Formats a date to show only the time portion.
 *
 * @param date  The date to format.
 * @returns The formatted time string.
 */
const formatDate = (date: Date) => {
    return date.toLocaleString().split(" ")[1];
};

/**
 * Gets the colour style for a log entry.
 *
 * @param log The log entry.
 * @returns The colour style object (a CSS custom property).
 */
const getColour = (log: Log) => {
    if (log?.colour) {
        if (Colour[log.colour]) {
            return {
                color: `var(--color-${Colour[log.colour].toLowerCase()})`,
            };
        } else {
            return {
                color: `color-mix(in oklab, ${log.colour.toString()}, white 20%)`,
            };
        }
    }
    return { color: `var(--color-white)` };
};

defineExpose({ showTimestamps });
</script>
<style lang="scss" scoped>
.game-log {
    position: fixed;
    left: 0;
    bottom: 0;
    width: 60%;
    min-width: min(400px, calc(100vw - 2em));
    margin: 0 1em;
    height: 17.5vh;
    line-height: 1.5;
    min-height: 33.33333%;
    transition:
        min-height 0.25s,
        height 0.25s;
    z-index: 10;
    &--minimised {
        height: auto;
        min-height: 0;
        .game-log__item:not(:first-child) {
            display: none;
        }
        .game-log__scroll {
            padding-bottom: 0;
        }
    }
    &__scroll {
        height: 100%;
        overflow-y: scroll;
        margin-bottom: 1em;
        padding-right: 0.5em;
        padding-bottom: 1em;
        &::-webkit-scrollbar {
            width: 0.5em;
        }
        &::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.25);
        }
        &::-webkit-scrollbar-thumb {
            background: #666;
            &:hover {
                background: #fff;
            }
        }
    }
    &__message {
        transition: font-size 0.25s;
    }
    &__toggle {
        position: absolute;
        left: -0.5em;
        top: -2em;
    }
    &__item {
        text-wrap: balance;
        + .game-log__item {
            margin-top: 0.5em;
        }
        @media (min-width: 600px) {
            &:first-child {
                .game-log__message {
                    font-size: 2rem;
                }
            }
        }
    }
    &__timestamp {
        color: var(--color-cyan);
    }
}
</style>
