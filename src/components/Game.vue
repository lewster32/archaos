<template>
    <div
        class="container"
        :id="containerId"
        v-if="downloaded"
        :class="{
            'container--nudge': spellbookOpen,
            'container--disabled': !gameStarted,
        }"
        ref="container"
    />
    <div class="placeholder" v-else>Loading...</div>
    <Spellbook :data="spellbook" @select="spellSelect" v-if="gameStarted" />
    <Log :logs="logs" />
    <Minimap :pieces="pieces" :board="board" v-if="gameStarted" />
    <div class="menu" v-if="!gameStarted">
        <img src="../../assets/images/ui/logo.png" alt="Archaos" class="logo" />
        <div class="callout__inner" v-if="setup">
            <div class="callout__row">
                <label for="playercount">Number of players:</label>
                <select v-model="setup.playerCount" id="playercount">
                    <option value="2">2 Players</option>
                    <option value="3">3 Players</option>
                    <option value="4">4 Players</option>
                </select>
            </div>
            <div
                class="callout__row"
                v-for="(name, index) in setup.players.slice(
                    0,
                    setup.playerCount
                )"
                :key="name.name"
                style="margin-left: 1em"
            >
                <label :for="`player${index}`"
                    >Player {{ index + 1 }}'s name:</label
                >
                <input
                    v-model="setup.players[index].name"
                    type="text"
                    :id="`player${index}`"
                    maxlength="20"
                />
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
                <input
                    type="number"
                    v-model="setup.spellCount"
                    min="5"
                    max="25"
                    id="spellcount"
                />
            </div>
            <div class="callout__row">
                <button
                    class="button button--green start-game"
                    @click="startGame()"
                >
                    Start Game
                </button>
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

<script setup lang="ts">
// Components
import Spellbook from "./Spellbook.vue";
import Log from "./Log.vue";
import Minimap from "./Minimap.vue";

// Phaser game launcher
import { launch } from "../game/game";

// Vue and types
import type { Ref } from "vue";
import type { Game, Events } from "phaser";
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";
import type { Spell } from "../gameobjects/spells/spell";
import type {
    SpellbookData,
    LogEntry,
    Box,
    SetupData,
} from "../gameobjects/interfaces/ui";

/**
 * Game component - contains the Phaser game instance and UI components.
 */
const container: Ref<HTMLDivElement | null> = ref(null);

/**
 * Whether the game assets have been downloaded and are ready to display.
 */
const downloaded: Ref<boolean> = ref(false);

/**
 * The Phaser game instance.
 */
const gameInstance: Ref<Game | null> = ref(null);

/**
 * The ID of the container element for the Phaser game.
 */
const containerId: Ref<string> = ref("game-container");

/**
 * The event emitter for game events.
 */
const eventEmitter: Ref<Events.EventEmitter | null> = ref(null);

/**
 * Whether the cancel action is currently available.
 */
const canCancel: Ref<boolean> = ref(false);

/**
 * Whether the end turn action is currently available.
 */
const canEndTurn: Ref<boolean> = ref(false);

/**
 * The spellbook UI data.
 */
const spellbook: Ref<SpellbookData> = ref({
    show: false,
    minimised: true,
    caster: null,
    spells: null,
    onSelect: null,
});

/**
 * The game log entries.
 */
const logs: Ref<LogEntry[]> = ref([]);

/**
 * The game board dimensions.
 */
const board: Ref<Box> = ref({ width: 0, height: 0 });

/**
 * Whether the game has started (true) or is in setup/menu mode (false).
 */
const gameStarted: Ref<boolean> = ref(false);

/**
 * Whether the game is over.
 */
const gameOver: Ref<boolean> = ref(false);

/**
 * The pieces on the game board. Used for the minimap.
 */
const pieces: Ref<any[]> = ref([]);

/**
 * The game setup data.
 */
const setup: Ref<SetupData | null> = ref(null);

/**
 * Handler for selecting a spell from the spellbook.
 * 
 * @param spell The spell that was selected.
 */
const spellSelect: (spell: Spell) => void = (spell: Spell) => {
    spellbook.value?.onSelect?.(spell);
};

/**
 * Handler for the cancel button.
 */
const cancel: () => void = () => {
    eventEmitter.value?.emit("cancel");
};

/**
 * Handler for the end turn button.
 */
const endTurn: () => void = () => {
    eventEmitter.value?.emit("end-turn");
};

/**
 * Starts the game with the current setup data.
 */
const startGame: () => void = () => {
    // Save setup to local storage for next time
    window.localStorage?.setItem("setup", JSON.stringify(setup.value));

    // Emit start game event with the setup data
    eventEmitter.value?.emit("start-game", {
        players: setup.value!.players
            .slice(0, Math.abs(setup.value!.playerCount) || 2)
            .map((player) => player.name),
        board: {
            width: Math.abs(setup.value!.boardSize) || 13,
            height: Math.abs(setup.value!.boardSize) || 13,
        },
        spellCount: Math.abs(setup.value!.spellCount) || 15,
    });

    // Mark the game as started
    gameStarted.value = true;
};

/**
 * Whether the spellbook is currently open (visible and not minimised).
 */
const spellbookOpen = computed(() => {
    return spellbook.value.show && !spellbook.value.minimised;
});

/**
 * Lifecycle hook - on component mount, initialise the game.
 */
onMounted(async () => {
    // Load setup from local storage if available
    if (window.localStorage) {
        const setupData = window.localStorage.getItem("setup");
        if (setupData) {
            setup.value = JSON.parse(setupData);
        }
    }

    // If there's no setup data, use defaults
    if (!setup.value) {
        setup.value = {
            playerCount: 2,
            boardSize: 13,
            spellCount: 15,
            players: [
                {
                    name: "Gandalf",
                },
                {
                    name: "Glinda",
                },
                {
                    name: "Merlin",
                },
                {
                    name: "Morgana",
                },
            ],
        };
    }

    // Mark as downloaded
    downloaded.value = true;

    // Wait for render before proceeding
    await nextTick();

    // Launch the game
    container.value?.addEventListener("transitionend", () => {
        setTimeout(() => {
            gameInstance.value!.scale.updateBounds();
        }, 10);
    });

    gameInstance.value = launch(containerId.value);
    eventEmitter.value = gameInstance.value.events;

    // Listen for logs
    eventEmitter.value.on("log", (log: any) => {
        logs.value.push({
            message: log.message,
            id: logs.value.length,
            timestamp: new Date(),
            colour: log.colour,
        });
    });

    // Listen for spellbook open/close events
    eventEmitter.value.on("spellbook-open", (event: any) => {
        spellbook.value.show = true;
        spellbook.value.spells = event.data.spells;
        spellbook.value.caster = event.data.caster;
        spellbook.value.onSelect = event.callback;
    });

    eventEmitter.value.on("spellbook-close", () => {
        spellbook.value.show = false;
        spellbook.value.spells = null;
        spellbook.value.caster = null;
        spellbook.value.onSelect = null;
    });

    // Listen for board updates
    eventEmitter.value.on("board-update", (data: any) => {
        pieces.value = data.pieces;
        board.value = data.board;
    });

    // Listen for action availability updates
    eventEmitter.value.on("cancel-available", (state: boolean) => {
        canCancel.value = state;
    });

    eventEmitter.value.on("end-turn-available", (state: boolean) => {
        canEndTurn.value = state;
    });

    // GAME OVER YEAHHHH
    eventEmitter.value.on("game-over", () => {
        gameStarted.value = false;
    });
});

onUnmounted(() => {
    // Clean up event listeners
    eventEmitter.value?.removeAllListeners();

    // Destroy the Phaser game instance, leaving the canvas in place
    gameInstance.value?.destroy(false);
});

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

@media (max-height: 580px) {
    .menu {
        display: flex;
        gap: 1em;
        align-items: center;
    }
}

.logo {
    width: 156 * 2px;
    height: 87 * 2px;
    image-rendering: pixelated;
}
</style>