<script setup>
import Spellbook from "./Spellbook.vue";
import Log from "./Log.vue";
import Minimap from "./Minimap.vue";
</script>

<template>
    <div
        class="container"
        :id="containerId"
        v-if="downloaded"
        :class="{ 'container--nudge': spellbookOpen }"
        ref="container"
    />
    <div class="placeholder" v-else>Loading...</div>
    <Spellbook :data="spellbook" @select="spellSelect" />
    <Log :logs="logs" />
    <Minimap :pieces="pieces" :board="board" />
    <div class="big-buttons">
        <button
            :class="{ 'big-button--hide': !canEndTurn }"
            @click="endTurn()"
            class="big-button big-button--skip"
            title="End Turn"
        />
        <button
            :class="{ 'big-button--hide': !canCancel }"
            @click="cancel()"
            class="big-button big-button--cancel"
            title="Cancel"
        />
    </div>
</template>

<script>
export default {
    components: { Minimap, Spellbook, Log },
    $refs: {
        container: HTMLDivElement,
    },
    methods: {
        spellSelect(spell) {
            if (this.spellbook?.onSelect) {
                this.spellbook.onSelect(spell);
            }
        },
        cancel() {
            this.eventEmitter.emit("cancel");
        },
        endTurn() {
            this.eventEmitter.emit("end-turn");
        },
        updateBounds() {
            setTimeout(() => {
                this.gameInstance.scale.updateBounds();
            }, 250);
        },
    },
    computed: {
        spellbookOpen() {
            return this.spellbook.show && !this.spellbook.minimised;
        },
    },
    data() {
        return {
            downloaded: false,
            gameInstance: null,
            containerId: "game-container",
            eventEmitter: null,
            canCancel: false,
            canEndTurn: false,
            spellbook: {
                show: false,
                minimised: true,
                caster: "",
                spells: [],
            },
            logs: [],
            board: {
                width: 0,
                height: 0,
            },
            pieces: [],
        };
    },
    async mounted() {
        const game = await import("../game/game");

        this.downloaded = true;
        this.$nextTick(() => {
            this.$refs.container?.addEventListener("transitionend", () => {
                setTimeout(() => {
                    this.gameInstance.scale.updateBounds();
                }, 10);
            });

            this.gameInstance = game.launch(this.containerId);
            this.eventEmitter = this.gameInstance.events;

            this.eventEmitter.on("log", (log) => {
                this.logs.push({
                    message: log.message,
                    id: this.logs.length,
                    timestamp: new Date(),
                    colour: log.colour,
                });
            });

            this.eventEmitter.on("spellbook-open", (event) => {
                this.spellbook.show = true;
                this.spellbook.spells = event.data.spells;
                this.spellbook.caster = event.data.caster;
                this.spellbook.onSelect = event.callback;
            });

            this.eventEmitter.on("spellbook-close", () => {
                this.spellbook.show = false;
                this.spellbook.spells = null;
                this.spellbook.caster = null;
                this.spellbook.onSelect = null;
            });

            this.eventEmitter.on("board-update", (data) => {
                this.pieces = data.pieces;
                this.board = data.board;
            });

            this.eventEmitter.on("cancel-available", (state) => {
                this.canCancel = state;
            });

            this.eventEmitter.on("end-turn-available", (state) => {
                this.canEndTurn = state;
            });
        });
    },
    destroyed() {
        this.gameInstance.destroy(false);
    },
};
</script>

<style lang="scss" scoped>
.big-buttons {
    position: fixed;
    top: 0;
    left: 6em;
    padding: 1em;
    z-index: 100;
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
    transition: transform 0.2s 0.2s ease-in-out, opacity 0.2s 0.2s;
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
        background-image: url("../../assets/images/ui/cancel.png");
    }
    &--skip {
        background-image: url("../../assets/images/ui/end-turn.png");
    }
}

.container {
    transition: margin-right 1s ease-in-out;
    &--nudge {
        margin-right: 350px;
    }
}
</style>