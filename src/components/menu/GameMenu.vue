<template>
    <div class="menu">
        <img src="@assets/images/ui/logo.png" alt="Archaos" class="logo" />
        <div v-if="setup">
            <div class="callout__row">
                <button
                    class="button button--yellow"
                    @click="
                        (
                            $refs.tutorialDialog as InstanceType<
                                typeof TutorialDialog
                            >
                        )?.showModal()
                    "
                >
                    Play a tutorial
                </button>
            </div>
            <div class="callout__row">
                <button
                    class="button"
                    @click="
                        (
                            $refs.playersConfigDialog as InstanceType<
                                typeof PlayersConfigDialog
                            >
                        )?.showModal()
                    "
                >
                    Configure players <i class="icon icon--settings"></i>
                </button>
            </div>
            <PlayersConfigDialog
                v-if="setup"
                ref="playersConfigDialog"
                :setup="setup"
            />
            <TutorialDialog
                ref="tutorialDialog"
                :tutorials="tutorials"
                @select="startTutorial"
            />
            <div class="callout__row callout__row--balanced">
                <label
                    for="boardsize"
                    title="The size of the play area. If there are more than 4 players, the small board is disabled to prevent overcrowding."
                    >Board size:</label
                >
                <select v-model="setup.boardSize" id="boardsize">
                    <option value="9" :disabled="setup.playerCount > 4">
                        Small Board
                    </option>
                    <option value="13">Medium Board</option>
                    <option value="17">Large Board</option>
                    <option value="21">Huge Board</option>
                </select>
            </div>
            <div class="callout__row callout__row--balanced">
                <label
                    for="spellcount"
                    title="The number of spells each player starts with."
                    >Spell count:</label
                >
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
                    <span class="c-green" title="only use spells from original"
                        >Classic spells</span
                    >
                </label>
                <label for="classicBalance" class="checkbox-label">
                    <input
                        type="checkbox"
                        v-model="setup.classicBalance"
                        style="--accent-color: var(--color-green)"
                        id="classicBalance"
                    />
                    <span class="c-green" title="use the original 'buggy' balance, which only positively affects the chance of aligned spells"
                        >Classic balance</span
                    >
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
import { ref, watch, reactive } from "vue";
import type { SetupData, GameSetupData, SetupPlayer } from "@archaos/engine";
import { getTutorials } from "../../gameobjects/tutorials/tutorialregistry";
import * as storage from "../../gameobjects/storage";
import PlayersConfigDialog from "./PlayersConfigDialog.vue";
import TutorialDialog from "./TutorialDialog.vue";

const emit = defineEmits<{
    start: [data: GameSetupData];
    startTutorial: [tutorialId: string, data: { muteAudio: boolean }];
}>();

const defaultPlayers: SetupPlayer[] = [
    { name: "Gandalf", computerControlled: false, wizCode: "001b09002a" },
    { name: "Elminster", computerControlled: true, wizCode: "0500110207" },
    { name: "Merlin", computerControlled: true, wizCode: "0207070216"},
    { name: "Morgana", computerControlled: true, wizCode: "0a1a0a0023" },
    { name: "Rincewind", computerControlled: true, wizCode: "0c00090005" },
    { name: "Mordenkainen", computerControlled: true, wizCode: "05131d0200" },
    { name: "Glinda", computerControlled: true, wizCode: "061d100100" },
    { name: "Saruman", computerControlled: true, wizCode: "0806060000" },
];

const setup = ref<SetupData | null>(null);

const tutorials = reactive(getTutorials());

// Load setup from localStorage if consent was given.
const saved = storage.getItem("setup");
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

if (!setup.value) {
    setup.value = {
        playerCount: 2,
        boardSize: 13,
        spellCount: 15,
        players: defaultPlayers,
        classicSpells: false,
        classicBalance: false,
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

function startGame(): void {
    storage.setItem("setup", JSON.stringify(setup.value));
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
        classicBalance: Boolean(setup.value!.classicBalance),
        difficulty: setup.value!.difficulty || 0.5,
        muteAudio: Boolean(setup.value!.muteAudio),
    });
}

function startTutorial(tutorialId: string): void {
    storage.setItem("setup", JSON.stringify(setup.value));
    emit("startTutorial", tutorialId, {
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
    padding-block: 0.25em;
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
    border-image-source: url("@assets/images/ui/check-unchecked.png");
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
    &--balanced {
        > * {
            flex: 1 0 45%;
        }
    }
}

.callout .callout__row {
    label {
        flex: 0 1 20ch;
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
