<template>
    <div
        class="container"
        :id="containerId"
        :class="{
            'container--nudge': spellbookOpen,
            'container--disabled': !gameStarted,
        }"
        ref="container"
    />
    <LoadingScreen v-if="loadingProgress < 1" />
    <GameMenu
        v-else-if="!gameStarted"
        @start="onGameStart"
        @start-tutorial="onGameStartTutorial"
    />
    <Spellbook
        :data="spellbook"
        @select="spellSelect"
        v-if="gameStarted && spellbook"
    />
    <Log :logs="logs" />
    <Minimap
        :pieces="pieces"
        :board="board"
        :balance="balance"
        :balanceShift="balanceShift"
        :classicBalance="classicBalance"
        v-if="gameStarted"
    />
    <GameControls
        :gameStarted="gameStarted"
        :canEndTurn="canEndTurn"
        :canCancel="canCancel"
        :canDismount="canDismount"
        @end-turn="endTurn"
        @cancel="cancel"
        @dismount="dismount"
    />
    <UnitInfo
        :class="{ 'unitinfo--show': currentUnit != null }"
        :unit="currentUnit"
        @close="closeUnitInfo()"
    />
    <TutorialMessage />
    <ConsentBanner
        v-if="showConsentBanner"
        @accept="onConsentAccept"
        @decline="onConsentDecline"
    />
</template>

<script setup lang="ts">
// Components
import { EventType } from "@archaos/engine";
import type {
    SpellbookData,
    Box,
    BoardUpdateEventData,
    SpellbookOpenEventData,
    GameSetupData,
    GameScenarioData,
} from "@archaos/engine";
import Spellbook from "./Spellbook.vue";
import Log from "./Log.vue";
import Minimap from "./Minimap.vue";
import GameMenu from "./GameMenu.vue";
import GameControls from "./GameControls.vue";
import LoadingScreen from "./LoadingScreen.vue";
import UnitInfo from "./UnitInfo.vue";
import TutorialMessage from "./TutorialMessage.vue";
import ConsentBanner from "./ConsentBanner.vue";

// Phaser game launcher
import { launch } from "../game/game";
import { loadingProgress } from "../game/loading-state";

// Vue and types
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";
import type { Ref } from "vue";
import type { Game, Events } from "phaser";
import type { Spell } from "@archaos/engine";
import { getTutorial } from "../gameobjects/tutorials/tutorialregistry";
import { Logger } from "../gameobjects/services/logger";
import type { Log as LogEntry } from "../gameobjects/services/logger";
import { Piece } from "../gameobjects/piece";
import * as storage from "../gameobjects/storage";

const container: Ref<HTMLDivElement | null> = ref(null);
const gameInstance: Ref<Game | null> = ref(null);
const containerId: Ref<string> = ref("game-container");
const eventEmitter: Ref<Events.EventEmitter | null> = ref(null);

const canCancel: Ref<boolean> = ref(false);
const canEndTurn: Ref<boolean> = ref(false);
const canDismount: Ref<boolean> = ref(false);

const spellbook: Ref<SpellbookData> = ref({
    show: false,
    minimised: true,
    caster: null,
    spells: null,
    onSelect: null,
    preventSkip: false,
});

const logs: Ref<LogEntry[]> = ref([]);
const board: Ref<Box> = ref({ width: 0, height: 0 });
const balance: Ref<number> = ref(0);
const classicBalance: Ref<boolean> = ref(false);
const balanceShift: Ref<number> = ref(0);
const gameStarted: Ref<boolean> = ref(false);
const gameOver: Ref<boolean> = ref(false);
const pieces: Ref<any[]> = ref([]);
const currentUnit: Ref<Piece | null> = ref(null);

// ─── Storage consent ─────────────────────────────────────────────────────────

storage.loadConsent();
const showConsentBanner = ref(!storage.hasAnswered());

const onConsentAccept = () => {
    storage.acceptConsent();
    // If localStorage already has saved data, reload so components pick it up
    // (they read storage at initialisation time, before consent was granted).
    if (
        globalThis.localStorage?.getItem("setup") ||
        globalThis.localStorage?.getItem("tutorialProgress")
    ) {
        globalThis.location.reload();
        return;
    }
    showConsentBanner.value = false;
};

const onConsentDecline = () => {
    storage.declineConsent();
    showConsentBanner.value = false;
};

const spellSelect = (spell: Spell) => {
    closeUnitInfo();
    spellbook.value?.onSelect?.(spell);
};

const cancel = () => {
    eventEmitter.value?.emit(EventType.Cancel);
};

const endTurn = () => {
    eventEmitter.value?.emit(EventType.EndTurn);
    if (spellbookOpen.value) {
        eventEmitter.value?.emit(EventType.SpellbookClose);
    }
};

const dismount = () => {
    eventEmitter.value?.emit(EventType.Dismount);
};

const onGameStart = (data: GameSetupData) => {
    eventEmitter.value?.emit("start-game", data);
    gameStarted.value = true;
    classicBalance.value = data.classicBalance ?? false;
};

const onGameStartTutorial = (
    tutorialId: string,
    data: { muteAudio: boolean },
) => {
    const tutorial = getTutorial(tutorialId);
    tutorial.config.muteAudio = data.muteAudio;
    if (tutorial) {
        eventEmitter.value?.emit("start-tutorial", tutorial);
        gameStarted.value = true;
    } else {
        console.error(`Unknown tutorial ID: ${tutorialId}`);
    }
};

const spellbookOpen = computed(() => {
    return spellbook.value.show && !spellbook.value.minimised;
});

const closeUnitInfo = () => {
    currentUnit.value = null;
};

onMounted(async () => {
    await nextTick();

    container.value?.addEventListener("transitionend", () => {
        setTimeout(() => {
            gameInstance.value!.scale.updateBounds();
        }, 10);
    });

    gameInstance.value = launch(containerId.value);
    eventEmitter.value = gameInstance.value.events;

    // Listen for logs via Logger's own stable emitter (survives HMR game restarts)
    Logger.getEventEmitter().on("log", (log: LogEntry) => {
        logs.value.push({
            message: log.message,
            id: logs.value.length,
            timestamp: new Date(),
            colour: log.colour,
        });
    });

    eventEmitter.value.on(
        EventType.SpellbookOpen,
        (event: SpellbookOpenEventData) => {
            spellbook.value.show = true;
            spellbook.value.spells = event.data.spells;
            spellbook.value.caster = event.data.caster;
            spellbook.value.onSelect = event.callback;
            if (event.data.soloMode) {
                nextTick(() => {
                    spellbook.value.minimised = false;
                });
            }
            spellbook.value.preventSkip = event.data.preventSkip ?? false;
        },
    );

    eventEmitter.value.on(EventType.SpellbookClose, () => {
        spellbook.value.show = false;
        spellbook.value.spells = null;
        spellbook.value.caster = null;
        spellbook.value.onSelect = null;
    });

    eventEmitter.value.on(
        EventType.BoardUpdate,
        (data: BoardUpdateEventData) => {
            pieces.value = data.pieces;
            board.value = data.board;
            balance.value = data.balance;
            balanceShift.value = data.balanceShift;
        },
    );

    eventEmitter.value.on(EventType.CancelAvailable, (state: boolean) => {
        canCancel.value = state;
    });

    eventEmitter.value.on(EventType.EndTurnAvailable, (state: boolean) => {
        canEndTurn.value = state;
    });

    eventEmitter.value.on(EventType.DismountAvailable, (state: boolean) => {
        canDismount.value = state;
    });

    eventEmitter.value.on(EventType.GameOver, (): void => {
        gameOver.value = true;
        gameStarted.value = false;
    });

    // Check for query params to auto-start a game scenario
    const urlParams = new URLSearchParams(globalThis.location.search);
    const scenario = urlParams.get("scenario");

    if (scenario) {
        console.log(`Auto-starting scenario: ${scenario}`);
        const scenarioResponse: Response = await fetch(
            `${import.meta.env.BASE_URL}scenarios/${scenario.toLowerCase().trim()}.json`,
        );
        if (scenarioResponse.ok) {
            const scenarioData: GameScenarioData =
                await scenarioResponse.json();
            gameStarted.value = true;
            setTimeout(() => {
                eventEmitter.value?.emit("start-scenario", scenarioData);
            }, 500);
        } else {
            console.error(
                `Failed to load scenario data for scenario: ${scenario}`,
            );
        }
    }

    const tutorialId = urlParams.get("tutorial");
    if (!scenario && tutorialId) {
        const tutorial = getTutorial(tutorialId.toLowerCase().trim());
        if (tutorial) {
            console.log(`Auto-starting tutorial: ${tutorialId}`);
            gameStarted.value = true;
            setTimeout(() => {
                eventEmitter.value?.emit("start-tutorial", tutorial);
            }, 500);
        } else {
            console.error(`Unknown tutorial: ${tutorialId}`);
        }
    }

    globalThis.addEventListener(EventType.PieceInfo, (e: CustomEvent) => {
        currentUnit.value = e.detail as Piece;
    });
});

onUnmounted(() => {
    eventEmitter.value?.removeAllListeners();
    Logger.getEventEmitter().removeAllListeners("log");
    gameInstance.value?.destroy(false);
});
</script>

<style lang="scss" scoped>
.container {
    transition:
        margin-right 0.33s ease-in-out,
        filter 0.5s;
    &--nudge {
        margin-right: 350px;
    }
    &--disabled {
        filter: brightness(0.1) drop-shadow(-2.5rem 5rem rgb(0 0 0 / 0.75)) !important;
        pointer-events: none;
    }
}

#game-container {
    filter: drop-shadow(-2.5rem 5rem rgb(0 0 0 / 0.75));
}

@media (min-width: 1920px) {
    #game-container {
        scale: 1.5;
    }
}
</style>
