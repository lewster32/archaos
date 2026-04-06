<template>
    <dialog v-if="setup.playerCount > 0" class="callout" ref="dialog">
        <div class="callout__row">
            <label
                for="playercount"
                title="The number of players in the game."
                >Number of players:</label
            >
            <select v-model="setup.playerCount" id="playercount">
                <option v-for="n in 7" :key="n" :value="n + 1">
                    {{ n + 1 }} Players
                </option>
            </select>
        </div>
        <div
            class="callout__row"
            v-for="(name, index) in setup.players.slice(0, setup.playerCount)"
            :key="index"
            :class="{
                'is-computer': setup.players[index].computerControlled,
            }"
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
                style="width: 23ch"
            />
            <button
                class="button button--small"
                @click="configurePlayer(setup.players[index])"
                title="Configure player options"
                >
                <i class="icon icon--settings"></i>
            </button>
        </div>
        <div
            class="callout__row callout__row--difficulty difficulty"
            :class="{ 'difficulty--disabled': !hasComputerPlayers }"
        >
            <label
                for="difficulty"
                title="The difficulty of computer-controlled players. Higher produces more challenging and aggressive opponents."
                >Difficulty:</label
            >
            <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                v-model="setup.difficulty"
                class="difficulty__input"
                :disabled="!hasComputerPlayers"
            />
            <span class="difficulty__value">{{
                Math.round(setup.difficulty * 10)
            }}</span>
        </div>
        <div class="callout__buttons">
            <button class="button button--green" @click="dialog?.close()">
                Done
            </button>
        </div>
    </dialog>
    <PlayerConfigDialog
        ref="playerConfigDialog"
        :player="currentlyConfiguringPlayer"
    />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { SetupData, SetupPlayer } from "@archaos/engine";
import PlayerConfigDialog from "./PlayerConfigDialog.vue";

const props = defineProps<{
    setup: SetupData;
}>();

const dialog = ref<HTMLDialogElement | null>(null);

const playerConfigDialog = ref<InstanceType<typeof PlayerConfigDialog> | null>(null);

/**
 * Check any of the active players are computer-controlled.
 */
const hasComputerPlayers = computed(
    () =>
        props.setup.players
            .slice(0, props.setup.playerCount)
            .some((p) => p.computerControlled) || false,
);

defineExpose({
    showModal: () => dialog.value?.showModal(),
    close: () => dialog.value?.close(),
});

const currentlyConfiguringPlayer = ref<SetupPlayer | null>(null);

const configurePlayer = (player: SetupPlayer) => {
    currentlyConfiguringPlayer.value = player;
    (
        playerConfigDialog.value as InstanceType<
            typeof PlayerConfigDialog
        >
    )?.showModal()
};

</script>

<style lang="scss" scoped>
.callout__row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1em;
    label {
        flex: 0 1 20ch;
    }
    &--difficulty {
        margin-block: 1em;
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
