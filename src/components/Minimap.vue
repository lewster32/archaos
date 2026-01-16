<template>
    <div class="minimap" v-if="show && board?.width && board?.height">
        <button class="minimap__close button button--small" @click="close()">
            &times;
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
</template>
<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { ref, computed } from "vue";
import { UnitStatus } from "../../src/gameobjects/enums/unitstatus";
import { Piece } from "../gameobjects/piece";
import { Display } from "phaser";

const props = defineProps<{
    pieces: Piece[];
    board: { width: number; height: number } | null;
}>();

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
 * Converts a numeric colour to a hex string.
 * 
 * @param colourNum  The numeric colour.
 * @returns The hex colour string.
 */
const hexColour = (colourNum: number) => {
    const colour: Display.Color =
        Display.Color.ValueToColor(colourNum);
    return `${colour.rgba}`;
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
    z-index: 1;
}

.minimap {
    pointer-events: none;
    position: fixed;
    left: 0;
    top: 0;
    padding: 1.5em;
    &__inner {
        padding: 0;
        transform: rotate(45deg);
    }
    &__close {
        display: none;
        position: absolute;
        z-index: 100;
        right: 0em;
        top: 0em;
    }
}

.map {
    position: relative;
    width: calc(var(--board-width) * var(--map-scale));
    height: calc(var(--board-height) * var(--map-scale));
    transition: all 0.25s;
    &__piece {
        position: absolute;
        z-index: 1;
        background-color: var(--piece-color);
        left: calc(var(--piece-x) * var(--map-scale));
        top: calc(var(--piece-y) * var(--map-scale));
        width: calc(1px * var(--map-scale));
        height: calc(1px * var(--map-scale));
        transition: all 0.25s;
        transform: scale(0.75);
        &--wizard {
            z-index: 2;
            transform: scale(1);
            &::after {
                content: '';
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                width: 33%;
                height: 33%;
                background: var(--color-yellow);
            }
        }
    }
}
</style>
