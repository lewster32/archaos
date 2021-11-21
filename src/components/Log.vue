<template>
    <div class="game-log" :class="{'game-log--minimised': minimised || !logs || !logs.length}">
        <button class="game-log__toggle button button--small" @click="toggle()">
            {{ minimised ? "+" : "-" }}
        </button>
        <ul class="game-log__scroll">
            <li class="game-log__item" v-for="log in logsSorted" :key="log.id">
                <span v-if="showTimestamps" class="game-log__timestamp">{{ formatDate(log.timestamp) }}: </span>
                <span class="game-log__message" :style="getColour(log)" v-html="log.message"></span>
            </li>
        </ul>
    </div>
</template>
<script lang="ts">
import { Colour } from '../gameobjects/enums/colour';
import { Log } from '../gameobjects/services/logger';
export default {
    props: {
        logs: {
            type: Array,
            required: true
        }
    },
    data() {
        return {
            minimised: true,
            showTimestamps: false
        };
    },
    computed: {
        logsSorted() {
            return this.logs.sort((a: Log, b: Log) => {
                return b.id - a.id;
            }).slice(0, 25);
        }
    },
    watch: {},
    methods: {
        formatDate(date: Date) {
            return date.toLocaleString().split(" ")[1];
        },
        toggle() {
            this.minimised = !this.minimised;
        },
        getColour(log: Log) {
            if (log.colour) {
                return { color: `var(--color-${Colour[log.colour].toLowerCase()})` };
            }
            return { color: `var(--color-white)` };
        }
    },
    async mounted() {},
    destroyed() {},
};
</script>
<style lang="scss" scoped>
    .game-log {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        margin: 1em;
        height: 17.5vh;
        min-height: 33.33333%;
        transition: min-height 0.25s, height 0.25s;
        &--minimised {
            min-height: 2.5em;
            height: 2.5em;
            .game-log__item:not(:first-child) {
                display: none;
            }
        }
        &__scroll {      
            height: 100%;
            overflow-y: scroll;
            margin-bottom: 1em;
            padding-right: .5em;
            &::-webkit-scrollbar {
                width: 0.5em;
            }
            &::-webkit-scrollbar-track {
                background: rgba(0,0,0,.25);
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
            left: -.5em;
            top: -2em;
        }
        &__item {
            line-height: 1.25;
            + .game-log__item {
                margin-top: .5em;
            }
            &:first-child {
                .game-log__message {
                    font-size: 2rem;
                }
            }
        }
        &__timestamp {
            color: var(--color-cyan);
        }
    }
</style>