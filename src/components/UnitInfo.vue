<template>
    <div class="unitinfo" v-if="show" :style="unit?.owner?.colour ? `--tint-colour: ${hexColour(unit.owner.colour)}` : ''">
        <button class="unitinfo__close button button--small" @click="close()">
            &times;
        </button>
        <div class="unitinfo__inner callout">
            <h2>{{ unit?.name }}<template v-if="unit.dead">'s corpse</template></h2>
            <p v-if="unit.type !== UnitType.Wizard && unit?.owner">
                {{ unit.currentRider ? 'Mounted' : 'Owned' }} by <span :style="`color: color-mix(in oklab, var(--tint-colour), white 20%)`">{{ unit?.owner.name }}</span>
            </p>
            <UnitStats v-if="unit" :unit="unit.unitConfig" />
            <div class="callout__buttons">
                <button class="spellinfo__select button button--green" @click="highlightOwnedUnits(unit!.owner!)">
                    Highlight
                </button>
                <button class="spellinfo__select button" @click="close()">
                    Dismiss
                </button>
            </div>
        </div>
    </div>
</template>
<script setup lang="ts">
import { computed, onMounted } from "vue";
import type { Ref } from "vue";
import type { Piece } from '../gameobjects/piece';
import UnitStats from "./UnitStats.vue";
import { UnitType } from "../gameobjects/enums/unittype";
import { hexColour } from "../utils";
import type { Player } from "../gameobjects/player";

const props = defineProps<{
    unit: Piece | null;
}>();

onMounted(() => {
    console.log("UnitInfo mounted with unit:", props.unit);
});

const highlightOwnedUnits: (owner: Player) => void = (owner) => {
    document.dispatchEvent(new CustomEvent("highlight-owned-units", { detail: owner }));
}

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
    top: 6.5rem;
    left: 0;
    padding: 1em;
    z-index: 20;
    background-color: var(--color-background-light);
    border: 2px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    width: 300px;
    max-width: 90%;
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