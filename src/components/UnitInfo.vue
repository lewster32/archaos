<template>
    <div
        class="unitinfo"
        :style="
            unit?.owner?.colour
                ? `--tint-colour: ${cssColour(unit?.owner.colour)}`
                : ''
        "
    >
        <button class="unitinfo__close button button--small" @click="close()">
            &times;
        </button>
        <div class="unitinfo__inner callout">
            <h2>
                {{ unit?.name }}<template v-if="unit?.dead">'s corpse</template>
            </h2>
            <UnitStats
                v-if="unit"
                :unit="unit?.unitConfig"
                :owner="unit.owner?.name"
                :isMount="Boolean(unit?.currentRider)"
            />
            <div class="callout__buttons" v-if="unit">
                <button
                    class="spellinfo__select button button--green button--small"
                    @click="highlightOwnedUnits(unit?.owner)"
                >
                    Highlight
                </button>
                <button
                    class="spellinfo__select button button--small"
                    @click="close()"
                >
                    Dismiss
                </button>
            </div>
        </div>
    </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import type { Ref } from "vue";
import type { Piece } from "../gameobjects/piece";
import UnitStats from "./UnitStats.vue";
import { cssColour } from "../utils";
import type { Player } from "@archaos/engine";

const props = defineProps<{
    unit: Piece | null;
}>();

const highlightOwnedUnits: (owner: Player) => void = (owner) => {
    document.dispatchEvent(
        new CustomEvent("highlight-owned-units", { detail: owner }),
    );
};

const emit = defineEmits<(e: "close") => void>();

/**
 * Whether to show the unit info view or not.
 */
const show: Ref<boolean> = computed(() => {
    return props.unit != null;
});

const close: () => void = () => {
    emit("close");
};
</script>
<style lang="scss" scoped>
.unitinfo {
    position: fixed;
    right: 2px;
    bottom: 2px;
    padding: 1em;
    z-index: 60;
    background-color: var(--color-background-light);
    border: 2px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    width: 415px;
    max-width: 90%;
    translate: 0 100%;
    opacity: 0;
    transition:
        translate 0.25s,
        opacity 0.25s;
    &--show {
        translate: 0 0;
        opacity: 1;
    }
    &__close {
        position: absolute;
        z-index: 100;
        right: 2em;
        top: 2em;
    }
    &__inner {
        display: flex;
        flex-direction: column;
        gap: 1em;
        min-height: 13rem;
    }
    .callout {
        outline: 2px solid var(--tint-colour, transparent);
        outline-offset: -2px;
    }
    h2 {
        font-size: 2rem;
    }
}
</style>
