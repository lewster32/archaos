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
</template>

<script>
export default {
  components: { Minimap },
    methods: {
        spellSelect(spell) {
            if (this.spellbook?.onSelect) {
              /*
                if (spell) {
                    window.confirm(
                        `Are you sure you want to cast ${spell.name}?`
                    ) && this.spellbook.onSelect(spell);
                } else {
                    window.confirm(`Are you sure you want to skip casting?`) &&
                        this.spellbook.onSelect(null);
                }
                */
               this.spellbook.onSelect(spell);
            }
        },
    },
    data() {
        return {
            downloaded: false,
            gameInstance: null,
            containerId: "game-container",
            eventEmitter: null,
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
        });
    },
    destroyed() {
        this.gameInstance.destroy(false);
    },
};
</script>

<style lang="scss" scoped>
</style>