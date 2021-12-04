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
        :class="{ 'container--nudge': spellbookOpen, 'container--disabled': !gameStarted }"
        ref="container"
    />
    <div class="placeholder" v-else>Loading...</div>
    <Spellbook :data="spellbook" @select="spellSelect" v-if="gameStarted" />
    <Log :logs="logs" />
    <Minimap :pieces="pieces" :board="board" v-if="gameStarted" />
    <div class="menu" v-if="!gameStarted">
        <img src="../../assets/images/ui/logo.png" alt="Archaos" class="logo" />
        <div class="callout__inner">
            <div class="callout__row">
                <label for="playercount">Number of players:</label>
                <select v-model="setup.playerCount" id="playercount">
                    <option value="2">2 Players</option>
                    <option value="3">3 Players</option>
                    <option value="4">4 Players</option>
                </select>
            </div>
            <div class="callout__row">
                <label for="boardsize">Board size:</label>
                <select v-model="setup.boardSize" id="boardsize">
                    <option value="9">Small Board</option>
                    <option value="13">Medium Board</option>
                    <option value="17">Large Board</option>
                </select>
            </div>
            <div class="callout__row">
                <label for="spellcount">Spell count:</label>
                <input type="number" v-model="setup.spellCount" min="5" max="25" id="spellcount" />
            </div>
            <div class="callout__row">
                <button class="button button--green start-game" @click="startGame()">Start Game</button>
            </div>
        </div>
    </div>
    <div class="big-buttons">
        <button
            :class="{ 'big-button--hide': !gameStarted || !canEndTurn }"
            @click="endTurn()"
            class="big-button big-button--skip"
            title="End Turn"
        />
        <button
            :class="{ 'big-button--hide': !gameStarted || !canCancel }"
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
        startGame() {
            this.eventEmitter.emit("start-game", {
                players: ["Gandalf", "Glinda", "Merlin", "Morgana"].slice(0, Math.abs(this.setup.playerCount) || 2),
                board: {
                    width: Math.abs(this.setup.boardSize) || 13,
                    height: Math.abs(this.setup.boardSize) || 13,
                },
                spellCount: Math.abs(this.setup.spellCount) || 15
            });
            this.gameStarted = true;
        }
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
            gameStarted: false,
            gameOver: false,
            pieces: [],
            setup: {
                playerCount: 2,
                boardSize: 13,
                spellCount: 15
            }
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

            this.eventEmitter.on("game-over", () => {
                this.gameStarted = false;
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
    z-index: 2;
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
    transition: margin-right 1s ease-in-out, filter 0.5s;
    &--nudge {
        margin-right: 350px;
    }
    &--disabled {
        filter: brightness(0.25);
        pointer-events: none;
    }
}

.menu {
    position: fixed;
    text-align: center;
}

.logo {
    width: 156 * 2px;
    height: 87 * 2px;
    image-rendering: pixelated;
}
</style>