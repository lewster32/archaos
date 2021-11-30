<script setup lang="ts">
import { UnitStatus } from "../../src/gameobjects/enums/unitstatus";
UnitStatus;
</script>

<template>
    <div class="minimap" v-if="show && board?.width && board?.height">
        <button class="minimap__close button button--small" @click="close()">
            &times;
        </button>
        <div class="minimap__inner callout">
            <div class="minimap__map map" :style="{
                    '--board-width': board.width + 'px',
                    '--board-height': board.height + 'px',
                    '--map-scale': scale
                }">
                <div class="map__piece" :class="{'map__piece--wizard': piece.hasStatus(UnitStatus.Wizard)}" v-for="piece in pieces" :key="piece.id" :style="{
                    '--piece-x': piece.position.x + 'px',
                    '--piece-y': piece.position.y + 'px',
                    '--piece-color': hexColour(piece.owner.colour)
                }"></div>
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
            scale: 4
        };
    },
    computed: {},
    watch: {},
    methods: {
        close() {
            this.show = false
        },
        hexColour(colourNum: number) {
            const colour: Phaser.Display.Color = Phaser.Display.Color.ValueToColor(colourNum)
            return `${colour.rgba}`;
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
    transition: all .25s;
    &__piece {
        position: absolute;
        z-index: 1;
        background-color: var(--piece-color);
        left: calc(var(--piece-x) * var(--map-scale));
        top: calc(var(--piece-y) * var(--map-scale));
        width: calc(1px * var(--map-scale));
        height: calc(1px * var(--map-scale));
        transition: all .25s;
        transform: scale(.75);
        &--wizard {
            z-index: 2;
            transform: scale(1);
        }
    }
}

</style>
