<script setup>
import Spellbook from "./Spellbook.vue";
import Log from "./Log.vue";
import Minimap from './Minimap.vue';
</script>

<template>
    <div :id="containerId" v-if="downloaded" />
    <div class="placeholder" v-else>Loading...</div>
    <Spellbook :data="spellbook.data" @select="spellSelect" />
    <Log :logs="logs" />
    <Minimap :pieces="pieces" :board="board" />
    <div class="big-buttons">
        <button :class="{'big-button--hide': !canCancel}" @click="cancel()" class="big-button big-button--cancel" title="Cancel" />
        <button :class="{'big-button--hide': !canEndTurn}" @click="endTurn()" class="big-button big-button--skip" title="End Turn" />
    </div>
</template>

<script>
export default {
  components: { Minimap },
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
        }
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
                caster: "",
                spells: [],
            },
            logs: [],
            board: {
                width: 0,
                height: 0
            },
            pieces: []
        };
    },
    async mounted() {
        const game = await import("../game/game");

        this.downloaded = true;
        this.$nextTick(() => {
            this.gameInstance = game.launch(this.containerId);
            this.eventEmitter = this.gameInstance.events;

            this.eventEmitter.on("log", (log) => {
                this.logs.push({
                    message: log.message,
                    id: this.logs.length,
                    timestamp: new Date(),
                    colour: log.colour
                });
            });

            this.eventEmitter.on("spellbook-open", (event) => {
                this.spellbook.data = event.data;
                this.spellbook.onSelect = event.callback;
            });

            this.eventEmitter.on("spellbook-close", () => {
                this.spellbook.data = null;
                this.spellbook.onSelect = null;
            });

            this.eventEmitter.on("board-update", (data) => {
                this.pieces = data.pieces;
                this.board = data.board;
            });

            this.eventEmitter.on("cancel-available", (data) => {
                this.canCancel = data;
            });

            this.eventEmitter.on("end-turn-available", (data) => {
                this.canEndTurn = data;
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
    top: 50%;
    transform: translateY(-50%);
    left: 0;
    padding: 1em;
    z-index: 100;
}

.big-button {
    display: block;
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
    transform: translateX(0);
    opacity: 1;
    &--hide {
        transform: translateX(-100%);
        opacity: 0;
    }
    &:hover {
        transform: translateY(2px);
        filter: brightness(0.8);
    }
    &--cancel {
        background-image: url('../../assets/images/ui/cancel.png');
    }
    &--skip {
        background-image: url('../../assets/images/ui/end-turn.png');
    }
}
</style>