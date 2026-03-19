<template>
    <div class="menu">
        <img src="../../assets/images/ui/logo.png" alt="Archaos" class="logo" />
        <div class="callout__inner" v-if="setup" :style="{ columns: setup.playerCount > 4 ? 2 : 1 }">
            <div class="callout__row">
                <label for="playercount">Number of players:</label>
                <select v-model="setup.playerCount" id="playercount">
                    <option v-for="n in 7" :key="n" :value="n + 1">{{ n + 1 }} Players</option>
                </select>
            </div>
            <div
                class="callout__row"
                v-for="(name, index) in setup.players.slice(0, setup.playerCount)"
                :key="index"
                style="margin-left: 1em"
            >
                <label :for="`player${index}`" style="width: 20ch"
                    >{{ setup.players[index].computerControlled ? 'Computer' : 'Human' }}
                    {{ index + 1 }}'s name:</label
                >
                <input
                    v-model="setup.players[index].name"
                    type="text"
                    :id="`player${index}`"
                    maxlength="20"
                    style="width: 23ch"
                />
                <div style="width: 3ch; display: flex; align-items: center; justify-content: flex-end">
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
                <label for="classicspells" class="checkbox-label">
                    <input
                        type="checkbox"
                        v-model="setup.classicSpells"
                        style="--accent-color: var(--color-cyan)"
                        id="classicspells"
                    />
                    <span class="c-cyan">Classic spells</span
                    ><span>(only allow spells from original)</span>
                </label>
            </div>
            <div class="callout__row">
                <button class="button button--green start-game" @click="startGame">
                    Start Game
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { loadingProgress } from '../game/loading-state';
import type { SetupData, GameSetupData, SetupPlayer } from '../gameobjects/interfaces/ui';

const emit = defineEmits<{
    start: [data: GameSetupData];
}>();

// Suspend (via <Suspense> in parent) until Phaser finishes loading assets.
if (loadingProgress.value < 1) {
    await new Promise<void>(resolve => {
        const stop: () => void = watch(loadingProgress, v => {
            if (v >= 1) {
                stop();
                resolve();
            }
        });
    });
}

const defaultPlayers: SetupPlayer[] = [
    { name: 'Gandalf' },
    { name: 'Glinda', computerControlled: true },
    { name: 'Merlin', computerControlled: true },
    { name: 'Morgana', computerControlled: true },
    { name: 'Rincewind', computerControlled: true },
    { name: 'Saruman', computerControlled: true },
    { name: 'Elminster', computerControlled: true },
    { name: 'Mordenkainen', computerControlled: true },
];

const setup = ref<SetupData | null>(null);

// Load setup from localStorage if available.
if (globalThis.localStorage) {
    const saved = globalThis.localStorage.getItem('setup');
    if (saved) {
        setup.value = JSON.parse(saved);
        // Expand legacy 4-player saves to the full 8-player list.
        if (setup.value.players?.length === 4) {
            const existing = setup.value.players;
            setup.value.players = defaultPlayers.map((p, i) => (i < existing.length ? existing[i] : p));
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
    };
}

while (setup.value.players.length < setup.value.playerCount) {
    setup.value.players.push(defaultPlayers[setup.value.players.length % defaultPlayers.length]);
}

watch(
    () => setup.value?.playerCount,
    newCount => {
        if (setup.value?.boardSize <= 9 && newCount > 4) {
            setup.value.boardSize = 13;
        }
    },
    { immediate: true },
);

function startGame(): void {
    globalThis.localStorage?.setItem('setup', JSON.stringify(setup.value));
    emit('start', {
        players: setup.value!.players.slice(0, Math.abs(setup.value!.playerCount) || 2),
        board: {
            width: Math.abs(setup.value!.boardSize) || 13,
            height: Math.abs(setup.value!.boardSize) || 13,
        },
        spellCount: Math.abs(setup.value!.spellCount) || 15,
        classicSpells: Boolean(setup.value!.classicSpells),
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
    gap: .5rem;
}
</style>
