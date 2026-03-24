<template>
    <div class="menu">
        <img src="../../assets/images/ui/logo.png" alt="Archaos" class="logo" />
        <div
            v-if="setup"
        >
            <div class="callout__row">
                <button
                    class="button button--yellow"
                    @click="($refs.tutorialDialog as HTMLDialogElement)?.showModal()"
                    >Play a tutorial</button>
            </div>
            <div class="callout__row">
                <button
                    class="button"
                    @click="($refs.playerConfigDialog as HTMLDialogElement)?.showModal()"
                    >Configure players <i class="icon icon--settings"></i></button>
            </div>
            <dialog
                v-if="setup.playerCount > 0"
                class="callout"
                ref="playerConfigDialog">
                <div class="callout__row">
                    <label for="playercount"
                        title="The number of players in the game.">Number of players:</label>
                    <select v-model="setup.playerCount" id="playercount">
                        <option v-for="n in 7" :key="n" :value="n + 1">
                            {{ n + 1 }} Players
                        </option>
                    </select>
                </div>
                <div
                    class="callout__row"
                    v-for="(name, index) in setup.players.slice(
                        0,
                        setup.playerCount,
                    )"
                    :key="index"
                    :class="{ 'is-computer': setup.players[index].computerControlled }"
                >
                    <label :for="`player${index}`" style="width: 20ch"
                        >{{
                            setup.players[index].computerControlled
                                ? "Computer"
                                : "Human"
                        }}
                        {{ index + 1 }}'s name:</label
                    >
                    <input
                        v-model="setup.players[index].name"
                        type="text"
                        :id="`player${index}`"
                        maxlength="20"
                        style="width: 23ch;"
                    />
                    <label
                        class="human-computer-toggle"
                        :for="`aicheckbox${index}`"
                        title="Computer controlled?"
                    >
                        <input
                            type="checkbox"
                            v-model="setup.players[index].computerControlled"
                            class="human-computer-toggle__input"
                            :id="`aicheckbox${index}`"
                        />
                    </label>
                </div>
                <div class="callout__row callout__row--difficulty difficulty" :class="{ 'difficulty--disabled': !hasComputerPlayers }">
                    <label for="difficulty"
                    title="The difficulty of computer-controlled players. Higher produces more challenging and aggressive opponents.">Difficulty:</label>
                    <input type="range" min="0.1" max="1" step="0.1" v-model="setup.difficulty" class="difficulty__input"
                    :disabled="!hasComputerPlayers"/>
                    <span class="difficulty__value">{{ Math.round(setup.difficulty * 10) }}</span>
                </div>
                <div class="callout__row">
                    <button
                        class="button button--green"
                        @click="($refs.playerConfigDialog as HTMLDialogElement)?.close()"
                    >
                        Done
                    </button>
                </div>
            </dialog>
            <dialog
                v-if="tutorials.length > 0"
                class="callout callout--min-width"
                ref="tutorialDialog">
                <h2 class="callout__title">
                    Tutorials
                </h2>
                <div
                    class="callout__row"
                    v-for="(tut, index) in tutorials"
                    :key="index"
                >
                    <button
                        class="button tutorial-button"
                        @click="
                            emit('startTutorial', tut.id);
                            ($refs.tutorialDialog as HTMLDialogElement)?.close();
                        "
                    >
                        <span class="tutorial-button__name">
                            <span class="tutorial-button__index">{{ index + 1 }}.</span>
                            {{ tut.name }}
                        </span>
                        <i v-if="tut.done" title="You have completed this tutorial" class="tutorial-button__icon icon icon--tick"></i>
                        <i v-else title="You have not completed this tutorial yet" class="tutorial-button__icon icon icon--right"></i>
                    </button>
                </div>
                <div class="callout__row">
                    <button
                        class="button button--red"
                        @click="($refs.tutorialDialog as HTMLDialogElement)?.close()"
                    >
                        Cancel
                    </button>
                </div>
            </dialog>
            <div class="callout__row">
                <label for="boardsize"
                title="The size of the play area. If there are more than 4 players, the small board is disabled to prevent overcrowding.">Board size:</label>
                <select v-model="setup.boardSize" id="boardsize">
                    <option value="9" :disabled="setup.playerCount > 4">
                        Small Board
                    </option>
                    <option value="13">Medium Board</option>
                    <option value="17">Large Board</option>
                    <option value="21">Huge Board</option>
                </select>
            </div>
            <div class="callout__row">
                <label for="spellcount"
                    title="The number of spells each player starts with.">Spell count:</label>
                <select v-model="setup.spellCount" id="spellcount">
                    <option value="10">10</option>
                    <option value="15">15</option>
                    <option value="20">20</option>
                    <option value="25">25</option>
                    <option value="30">30</option>
                </select>
            </div>
            <div class="callout__row">
                <label for="classicspells" class="checkbox-label">
                    <input
                        type="checkbox"
                        v-model="setup.classicSpells"
                        style="--accent-color: var(--color-green)"
                        id="classicspells"
                    />
                    <span class="c-green" title="only use spells from original">Classic spells</span>
                </label>
            </div>
            <div class="callout__row">
                <label for="mute" class="checkbox-label">
                    <input
                        type="checkbox"
                        id="mute"
                        v-model="setup.muteAudio"
                    />
                    <span>Mute audio</span>
                </label>
            </div>
            <div class="callout__row">
                <button
                    class="button button--green button--important start-game"
                    @click="startGame"
                >
                    Start Game
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive } from "vue";
import type {
    SetupData,
    GameSetupData,
    SetupPlayer,
} from "../gameobjects/interfaces/ui";
import { getTutorials } from "../gameobjects/tutorials/tutorialregistry";

const emit = defineEmits<{
    start: [data: GameSetupData];
    startTutorial: [tutorialId: string];
}>();

const defaultPlayers: SetupPlayer[] = [
    { name: "Gandalf" },
    { name: "Glinda", computerControlled: true },
    { name: "Merlin", computerControlled: true },
    { name: "Morgana", computerControlled: true },
    { name: "Rincewind", computerControlled: true },
    { name: "Saruman", computerControlled: true },
    { name: "Elminster", computerControlled: true },
    { name: "Mordenkainen", computerControlled: true },
];

const setup = ref<SetupData | null>(null);

const tutorials = reactive(getTutorials());

// Load setup from localStorage if available.
if (globalThis.localStorage) {
    const saved = globalThis.localStorage.getItem("setup");
    if (saved) {
        setup.value = JSON.parse(saved);
        // Expand legacy 4-player saves to the full 8-player list.
        if (setup.value.players?.length === 4) {
            const existing = setup.value.players;
            setup.value.players = defaultPlayers.map((p, i) =>
                i < existing.length ? existing[i] : p,
            );
        }
        if (!setup.value.difficulty) {
            setup.value.difficulty = 0.5;
        }
    }
}

if (!setup.value) {
    setup.value = {
        playerCount: 2,
        boardSize: 13,
        spellCount: 15,
        players: defaultPlayers,
        classicSpells: false,
        difficulty: 0.5,
        muteAudio: false,
    };
}

while (setup.value.players.length < setup.value.playerCount) {
    setup.value.players.push(
        defaultPlayers[setup.value.players.length % defaultPlayers.length],
    );
}

watch(
    () => setup.value?.playerCount,
    (newCount) => {
        if (setup.value?.boardSize <= 9 && newCount > 4) {
            setup.value.boardSize = 13;
        }
    },
    { immediate: true },
);

/**
 * Check any of the active players are computer-controlled.
 */
const hasComputerPlayers = computed(
    () => setup.value?.players.slice(0, setup.value.playerCount).some(p => p.computerControlled) || false
);

function startGame(): void {
    globalThis.localStorage?.setItem("setup", JSON.stringify(setup.value));
    emit("start", {
        players: setup.value!.players.slice(
            0,
            Math.abs(setup.value!.playerCount) || 2,
        ),
        board: {
            width: Math.abs(setup.value!.boardSize) || 13,
            height: Math.abs(setup.value!.boardSize) || 13,
        },
        spellCount: Math.abs(setup.value!.spellCount) || 15,
        classicSpells: Boolean(setup.value!.classicSpells),
        difficulty: setup.value!.difficulty || 0.5,
        muteAudio: Boolean(setup.value!.muteAudio),
    });
}
</script>

<style lang="scss" scoped>
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

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.human-computer-toggle {
    width: 2.5em;
    max-width: 2.5em;
    height: 1.5em;
    padding-block: .25em;
    display: flex;
    aspect-ratio: auto;
    margin: 0;
    background-color: var(--color-black);
    position: relative;
    image-rendering: pixelated;
    border-style: solid;
    border-width: 6px;
    border-image-width: 6px;
    border-image-slice: 3;
    border-image-repeat: repeat;
    border-image-source: url("../../assets/images/ui/check-unchecked.png");
    cursor: pointer;
    &::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 50%;
        height: 100%;
        background-color: var(--color-yellow);
        image-rendering: pixelated;
        transition: translate 0.2s ease;
    }
    &__input[type="checkbox"] {
        display: none;
    }
    &:has(.human-computer-toggle__input:checked) {
        &::before {
            translate: 100%;
            background-color: var(--color-cyan);
        }
    }
}

.callout__row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1em;
    &--difficulty {
        margin-block: 1em;
    }
}

.tutorial-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    &__index {
        color: var(--color-grey);
    }
}

.is-computer {
    input[type="text"] {
        color: var(--color-cyan);
    }
}

.difficulty {
    display: flex;
    align-items: center;
    gap: 1em;
    &__input[type="range"] {
        
    }
    &__value {
        color: var(--color-cyan);
        text-shadow: var(--text-shadow);
        max-width: 2.5em;
    }
    &--disabled {
        color: var(--color-grey);
        .difficulty__value {
            color: var(--color-grey);
        }
    }
}

@media (max-width: 484px) {
    .callout__row {
        row-gap: 0;
        label {
            width: 100% !important;
        }
    }
}

</style>
