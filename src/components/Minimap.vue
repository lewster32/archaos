<template>
    <div class="minimap" v-if="show && board?.width && board?.height">
        <button class="minimap__close button button--small" @click="close()">
            &times;
        </button>
        <button class="minimap__info button button--small" @click="toggleInfo()">
            <span style="font-weight:bold" :class="{'c-magenta' : balance < 0, 'c-cyan' : balance > 0}">
                {{ `${balance < 0 ? '*' : (balance > 0 ? '^' : '-')}`}}
            </span>
            {{ balance ? `(+${Math.round(Math.abs(balance) * 100)}%)` : '' }}
            <span :class="{'c-magenta' : balanceShift < 0, 'c-cyan' : balanceShift > 0}">
                {{ balanceShift ? ` ${balanceShift < 0 ? '↓' : (balanceShift > 0 ? '↑' : '')}` : '' }}
            </span>
        </button>
        <div class="minimap__inner callout">
            <div class="minimap__map map" :style="boardStyles">
                <div
                    class="map__piece"
                    :class="{
                        'map__piece--wizard': piece.hasStatus(
                            UnitStatus.Wizard
                        ),
                    }"
                    v-for="piece in pieces"
                    :key="piece.id"
                    :style="getPieceStyles(piece)"
                ></div>
            </div>
        </div>
    </div>
    <dialog class="minimap-info callout" ref="infoDialog">
        <button class="minimap-info__close button button--small" @click="infoDialog.close()">
            &times;
        </button>
        <div class="minimap-info__balance balance-info">
            Balance:
            <span class="balance-info__value" :class="{'c-magenta' : balance < 0, 'c-cyan' : balance > 0}">
                <span class="balance-info__name">
                    {{ `${balance < 0 ? '* chaotic' : (balance > 0 ? '^ lawful' : 'neutral')}`}}
                </span>
                <span class="balance-info__amount">
                    {{ balance ? `(+${Math.round(Math.abs(balance) * 100)}%)` : '' }}
                    <span class="balance-info__shift" :class="{'c-magenta' : balanceShift < 0, 'c-cyan' : balanceShift > 0}">
                        {{ balanceShift ? ` ${balanceShift < 0 ? '↓' : (balanceShift > 0 ? '↑' : '')}` : '' }}
                    </span>
                </span>
            </span>
        </div>
    </dialog>
</template>
<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { ref, computed } from "vue";
import { UnitStatus } from "../../src/gameobjects/enums/unitstatus";
import { Piece } from "../gameobjects/piece";
import { hexColour } from "../utils";

const props = defineProps<{
    pieces: Piece[];
    board: { width: number; height: number } | null;
    balance?: number;
    balanceShift?: number;
}>();

const infoDialog = ref<HTMLDialogElement | null>(null);

/**
 * Whether to show the minimap or not.
 */
const show = ref(true);


/**
 * The scale of the minimap based on the board size.
 */
const scale = computed(() => {
    return (15 / (props.board?.width ?? 1)) * 3.75;
});

/**
 * The styles for the board element.
 */
const boardStyles = computed<CSSProperties>(() => {
    return {
        "--board-width": (props.board?.width ?? 0) + "px",
        "--board-height": (props.board?.height ?? 0) + "px",
        "--map-scale": scale.value.toString(),
    };
});

/**
 * Closes the minimap.
 */
const close = () => {
    show.value = false;
};

/**
 * Shows the minimap info.
 */
const toggleInfo = () => {
    infoDialog.value?.showModal();
};
/**
 * Gets the styles for a piece on the minimap.
 * 
 * @param piece The piece to get the styles for.
 * @returns The CSS styles for the piece.
 */
const getPieceStyles = (piece: Piece): CSSProperties => {
    return {
        "--piece-x": piece.position.x + "px",
        "--piece-y": piece.position.y + "px",
        "--piece-color": `color-mix(in oklab, ${hexColour(piece.owner?.colour ?? 0x444444)}, white 10%)`,
    };
};
</script>
<style lang="scss" scoped>
:host {
    position: relative;
    z-index: 5;
}

.minimap {
    position: fixed;
    left: 0;
    top: 0;
    padding: 1.5em;
    &__inner {
        padding: 0;
        transform: rotate(45deg);
        pointer-events: none;
    }
    &__close {
        display: none;
        position: absolute;
        z-index: 100;
        right: 0em;
        top: 0em;
    }
    &__balance {
        position: absolute;
        top: calc(100% + 2rem);
        left: 1rem;
        white-space: nowrap;
        z-index: 10;
        pointer-events: auto;
        font-size: 1rem;
    }
    &__info {
        position: absolute;
        z-index: 100;
        left: 1em;
        top: 100%;
        text-align: center;
        text-wrap: nowrap;
    }
}

.map {
    position: relative;
    width: calc(var(--board-width) * var(--map-scale));
    height: calc(var(--board-height) * var(--map-scale));
    transition: all 0.25s;
    &__piece {
        position: absolute;
        z-index: 10;
        background-color: var(--piece-color);
        left: calc(var(--piece-x) * var(--map-scale));
        top: calc(var(--piece-y) * var(--map-scale));
        width: calc(1px * var(--map-scale));
        height: calc(1px * var(--map-scale));
        transition: all 0.25s;
        transform: scale(0.75);
        &--wizard {
            z-index: 20;
            transform: scale(1);
            &::after {
                content: '';
                position: absolute;
                inset: 0;
                border: 1px dashed var(--color-white);
                animation: wizard-pulse 1s infinite steps(2);
            }
            @keyframes wizard-pulse {
                0% {
                    opacity: 1
                }
                50% {
                    opacity: 0
                }
                100% {
                    opacity: 1
                }
            }
        }
    }
}

.minimap-info {
    padding-right: 3rem;
    &__close {
        position: absolute;
        z-index: 100;
        right: 0.5rem;
        top: 0.5rem;
    }
}

.balance-info {
    display: flex;
    gap: .5rem;
    align-items: center;
    text-shadow: var(--text-shadow);
    &__name {
        font-size: 2rem;
    }
    &__value {
        display: flex;
        gap: .25rem;
        align-items: start;
    }
}
</style>
