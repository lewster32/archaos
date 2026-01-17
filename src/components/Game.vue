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
    <Spellbook
        :data="spellbook"
        @select="spellSelect"
        v-if="gameStarted && spellbook" />
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
                    <option value="5">5 Players</option>
                    <option value="6">6 Players</option>
                    <option value="7">7 Players</option>
                    <option value="8">8 Players</option>
                </select>
            </div>
            <div
                class="callout__row"
                v-for="(name, index) in setup.players.slice(
                    0,
                    setup.playerCount
                )"
                :key="index"
                style="margin-left: 1em"
            >
                <label :for="`player${index}`" style="width:20ch"
                    >{{ setup.players[index].computerControlled ? 'Computer' : 'Human' }} {{ index + 1 }}'s name:</label
                >
                <input
                    v-model="setup.players[index].name"
                    type="text"
                    :id="`player${index}`"
                    maxlength="20"
                    style="width:23ch"
                />
                <div style="width:3ch;display:flex;align-items:center;justify-content:flex-end;">
                    <input
                        type="checkbox"
                        v-model="setup.players[index].computerControlled"
                        title="Computer controlled?"
                        :id="`aicheckbox${index}`"
                    />
                </div>
            </div>
            <div class="callout__row">
                <label for="boardsize">Board size:</label>
                <select v-model="setup.boardSize" id="boardsize">
                    <option value="9" :disabled="setup.playerCount > 4">Small Board</option>
                    <option value="13">Medium Board</option>
                    <option value="17">Large Board</option>
                </select>
            </div>
            <div class="callout__row">
                <label for="spellcount">Spell count:</label>
                <select v-model="setup.spellCount" id="spellcount">
                    <option value="10">10</option>
                    <option value="15">15</option>
                    <option value="20">20</option>
                    <option value="25">25</option>
                </select>
            </div>
            <div class="callout__row">
                <button
                    class="button button--green start-game"
                    @click="startGame(true)"
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
    <UnitInfo
        v-if="currentUnit"
        :unit="currentUnit"
        @close="closeUnitInfo()"
    />
</template>

<script setup lang="ts">
// Components
import Spellbook from "./Spellbook.vue";
import Log from "./Log.vue";
import Minimap from "./Minimap.vue";

// Phaser game launcher
import { launch } from "../game/game";

// Vue and types
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import type { Ref } from "vue";
import type { Game, Events } from "phaser";
import type { Spell } from "../gameobjects/spells/spell";
import type {
    SpellbookData,
    Box,
    SetupData,
    BoardUpdateEventData,
    SpellbookOpenEventData,
    GameSetupData,
    GameScenarioData,
    SetupPlayer,
} from "../gameobjects/interfaces/ui";
import type { Log as LogEntry } from "../gameobjects/services/logger";
import { EventType } from "../gameobjects/enums/eventtype";
import { Piece } from "../gameobjects/piece";
import { Wizard } from "../gameobjects/wizard";
import { hexColour } from "../utils";
import UnitInfo from "./UnitInfo.vue";

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
    closeUnitInfo();
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
const startGame: (save: boolean) => void = (save: boolean) => {
    // Save setup to local storage for next time
    if (save) {
        globalThis.localStorage?.setItem("setup", JSON.stringify(setup.value));
    }

    // Emit start game event with the setup data
    eventEmitter.value?.emit("start-game", {
        players: setup.value!.players
            .slice(0, Math.abs(setup.value.playerCount) || 2),
        board: {
            width: Math.abs(setup.value.boardSize) || 13,
            height: Math.abs(setup.value.boardSize) || 13,
        },
        spellCount: Math.abs(setup.value.spellCount) || 15,
    } as GameSetupData);

    // Mark the game as started
    gameStarted.value = true;
};

/**
 * Whether the spellbook is currently open (visible and not minimised).
 */
const spellbookOpen = computed(() => {
    return spellbook.value.show && !spellbook.value.minimised;
});

const defaultPlayers: SetupPlayer[] = [
    {
        name: "Gandalf",
    },
    {
        name: "Glinda",
        computerControlled: true,
    },
    {
        name: "Merlin",
        computerControlled: true,
    },
    {
        name: "Morgana",
        computerControlled: true,
    },
    {
        name: "Rincewind",
        computerControlled: true,
    },
    {
        name: "Saruman",
        computerControlled: true,
    },
    {
        name: "Elminster",
        computerControlled: true,
    },
    {
        name: "Mordenkainen",
        computerControlled: true,
    },
];

/**
 * The currently selected unit for displaying info.
 */
const currentUnit: Ref<Piece | null> = ref(null);

/**
 * Closes the unit info display.
 */
const closeUnitInfo: () => void = () => {
    currentUnit.value = null;
};

watch(
    () => setup.value?.playerCount,
    (newCount, oldCount) => {
        if (setup.value?.boardSize <= 9 && newCount > 4) {
            setup.value.boardSize = 13;
        }
    }, { immediate: true });

/**
 * Lifecycle hook - on component mount, initialise the game.
 */
onMounted(async () => {
    // Load setup from local storage if available
    if (globalThis.localStorage) {
        const setupData = globalThis.localStorage.getItem("setup");
        if (setupData) {
            setup.value = JSON.parse(setupData);
            if (setup.value.players?.length === 4) {
                // Old setup format with 4 players only - expand to default players
                const existingPlayers = setup.value.players;
                setup.value.players = [];
                for (let i = 0; i < defaultPlayers.length; i++) {
                    if (i < existingPlayers.length) {
                        setup.value.players.push(existingPlayers[i]);
                    } else {
                        setup.value.players.push(defaultPlayers[i]);
                    }
                }
            }
        }
    }

    // If there's no setup data, use defaults
    if (!setup.value) {
        setup.value = {
            playerCount: 2,
            boardSize: 13,
            spellCount: 15,
            players: defaultPlayers,
        };
    }

    // If there are not enough players, add more defaults
    while (setup.value.players.length < setup.value.playerCount) {
        setup.value.players.push(
            defaultPlayers[setup.value.players.length % defaultPlayers.length]
        );
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
    eventEmitter.value.on("log", (log: LogEntry) => {
        logs.value.push({
            message: log.message,
            id: logs.value.length,
            timestamp: new Date(),
            colour: log.colour,
        });
    });

    // Listen for spellbook open/close events
    eventEmitter.value.on("spellbook-open", (event: SpellbookOpenEventData) => {
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
    eventEmitter.value.on("board-update", (data: BoardUpdateEventData) => {
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
    eventEmitter.value.on("game-over", (): void => {
        gameOver.value = true;
        gameStarted.value = false;
    });

    // Check for query params to auto-start a game scenario
    const urlParams = new URLSearchParams(globalThis.location.search);
    const scenario = urlParams.get("scenario");

    if (scenario) {
        console.log(`Auto-starting scenario: ${scenario}`);
        const scenarioResponse: Response = await fetch(
            `/assets/scenarios/${scenario.toLowerCase().trim()}.json`
        );
        if (scenarioResponse.ok) {
            const scenarioData: GameScenarioData = await scenarioResponse.json();
            gameStarted.value = true;
            setTimeout(() => {
                eventEmitter.value?.emit("start-scenario", scenarioData);
                // Mark the game as started
            }, 500);
        } else {
            console.error(
                `Failed to load scenario data for scenario: ${scenario}`
            );
        }
    }

    globalThis.addEventListener(EventType.PieceInfo, (e: CustomEvent) => {
        const piece:Piece = e.detail as Piece;
        currentUnit.value = piece;
        if (!piece?.owner) {
            return;
        }
        logs.value.push({
            message: 'Clicked on ' + ((piece instanceof Wizard) ? `${piece.owner.name}` : `${piece.owner.name}'s ${piece.name}`) + ` at position ${piece.position.x}, ${piece.position.y}`,
            id: logs.value.length,
            timestamp: new Date(),
            colour: hexColour(piece.owner.colour)
        });
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
    z-index: 20;
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
    margin-inline: 1em;
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

input[type="checkbox"] {
    width: 2rem;
    height: 2rem;
    accent-color: var(--color-yellow);
    cursor: pointer;
}

#game-container {
    filter: drop-shadow(-2.5rem 5rem rgb(0 0 0 / 0.75));
}

</style>