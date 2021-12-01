<script setup lang="ts">
import { UnitStatus } from "../../src/gameobjects/enums/unitstatus";
import { Piece } from "../gameobjects/piece";
UnitStatus;

import type { CSSProperties } from 'vue'

declare module 'vue' {
  interface CSSProperties {
    // limited to custom properties:
    [k: `--${string}`]: string
  }
}

</script>

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

<script lang="ts">
export default {
    props: {
        pieces: Array as any,
        board: Object as any,
    },
    data() {
        return {
            show: true,
            scale: 4,
        };
    },
    computed: {
        boardStyles(): CSSProperties {
            return {
                "--board-width": this.board.width + "px",
                "--board-height": this.board.height + "px",
                "--map-scale": this.scale,
            };
        },
    },
    watch: {},
    methods: {
        close() {
            this.show = false;
        },
        hexColour(colourNum: number) {
            const colour: Phaser.Display.Color =
                Phaser.Display.Color.ValueToColor(colourNum);
            return `${colour.rgba}`;
        },
        getPieceStyles(piece: Piece): CSSProperties {
            return {
                "--piece-x": piece.position.x + "px",
                "--piece-y": piece.position.y + "px",
                "--piece-color": this.hexColour(piece.owner?.colour ?? 0x444444),
            };
        },
    },
    async mounted() {},
    destroyed() {},
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
        }
    }
}
</style>
