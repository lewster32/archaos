<script setup>
import Spellbook from "./Spellbook.vue";
</script>

<template>
    <div :id="containerId" v-if="downloaded" />
    <div class="placeholder" v-else>Loading...</div>
    <Spellbook :data="spellbook.data" @select="spellSelect" />
</template>

<script>
export default {
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
        };
    },
    async mounted() {
        const game = await import("../game/game");

        this.downloaded = true;
        this.$nextTick(() => {
            this.gameInstance = game.launch(this.containerId);
            this.eventEmitter = this.gameInstance.events;

            this.eventEmitter.on("spellbook-open", (event) => {
                this.spellbook.data = event.data;
                this.spellbook.onSelect = event.callback;
            });

            this.eventEmitter.on("spellbook-close", () => {
                this.spellbook.data = null;
                this.spellbook.onSelect = null;
            });
        });
    },
    destroyed() {
        this.gameInstance.destroy(false);
    },
};
</script>

<style lang="scss" scoped>
.placeholder {
    font-size: 1rem;
    font-family: "Courier New", Courier, monospace;
}
</style>