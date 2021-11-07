<script setup lang="ts">
import SpellInfo from "./SpellInfo.vue";
SpellInfo;
</script>

<template>
    <div class="spellbook" v-if="show">
        <button class="spellbook__toggle button button--small" @click="toggle()" :class="{'button--yellow': minimised}">
            {{ minimised ? "&lt;" : "&gt;" }}
        </button>
        <div
            class="spellbook__inner callout"
            :class="{ 'spellbook__inner--minimised': minimised }"
        >
            <h1 class="spellbook__title">{{ data?.caster }}'s spells</h1>
            <div class="spellbook__scroll" ref="scroll">
                <ul class="spellbook__list spell-list">
                    <li
                        class="spell-list__item spell"
                        v-for="spell in spellsByChance()"
                        :key="spell.id"
                    >
                        <img class="spell__image" :src="getImageUrl(spell)" />
                        <span class="spell__name">{{ spell.name }}</span>
                        <span
                            :style="`color: var(--spell-chance-colour-${chanceRounded(
                                spell.chance
                            )})`"
                            class="spell__chance"
                            :title="`This has a ${chancePercent(
                                spell.chance
                            )}% chance of successfully casting`"
                            >{{ chancePercent(spell.chance) }}%</span
                        >
                        <button class="spell__info button" @click="info(spell)">
                            i
                        </button>
                        <button class="spell__select button button--green button--important" @click="select(spell)">
                            Select
                        </button>
                    </li>
                </ul>
            </div>
            <button class="spellbook__skip button button--red" @click="select(null)">
                Skip selection
            </button>
        </div>
        <SpellInfo :spell="currentSpell" @close="closeInfo()" @select="select(currentSpell)" />
    </div>
</template>

<script lang="ts">
import { Spell } from "../gameobjects/spell";

export default {
    $refs: {
        scroll: HTMLDivElement,
    },
    props: {
        data: Object as any,
    },
    data() {
        return {
            minimised: true as boolean,
            currentSpell: null as any,
        };
    },
    computed: {
        show(): boolean {
            return this.data != null;
        },
    },
    watch: {
        data(oldData, newData) {
            if (oldData != newData) {
                this.minimised = false;
                this.$nextTick(() => {
                    if (this.$refs.scroll) {
                        (this.$refs.scroll as HTMLDivElement).scrollTop = 0;
                    }
                });
            }
        },
    },
    methods: {
        select(spell: Spell) {
            this.$emit("select", spell);
            this.closeInfo();
        },
        info(spell: Spell) {
            this.currentSpell = spell;
            this.minimised = true;
        },
        closeInfo() {
            this.currentSpell = null;
            this.minimised = false;
        },
        spellsByChance() {
            return (this.data as any)?.spells.sort((a: Spell, b: Spell) => {
                return b.chance - a.chance;
            });
        },
        getImageUrl(spell: Spell) {
            return `/images/spells/classicspells/${spell.spellId}.png`;
        },
        chancePercent(chance: number) {
            return Math.round(chance * 100);
        },
        chanceRounded(chance: number) {
            return Math.floor(chance * 10) * 10;
        },
        toggle() {
            this.minimised = !this.minimised;
            if (this.currentSpell) {
                this.closeInfo();
            }
        },
    },
    async mounted() {},
    destroyed() {},
};
</script>

<style lang="scss" scoped>
.spellbook {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 1;
    padding: 1em;
    display: flex;
    justify-content: right;
    &__toggle {
        z-index: 2;
    }
    &__inner {
        width: 360px;
        display: flex;
        flex-direction: column;
        transition: width 0.25s, opacity 0.25s;
        &--minimised {
            width: 0;
            opacity: 0;
        }
    }
    &__title {
        font-size: 2rem;
        margin-bottom: 0.5em;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        flex: 0 0 1em;
    }
    &__scroll {
        border-top: 2px solid var(--color-black);
        border-bottom: 2px solid var(--color-black);
        

        flex: 1 1 auto;
        overflow-y: scroll;
        margin-bottom: 1em;
        padding-right: .5em;
        &::-webkit-scrollbar {
            width: 0.5em;
        }
        &::-webkit-scrollbar-track {
            background: rgba(0,0,0,.25);
        }
        &::-webkit-scrollbar-thumb {
            background: #666;
            &:hover {
                background: #fff;
            }
        }
    }
    &__list {
        display: flex;
        flex-direction: column;
    }
    &__skip {

    }
    &__toggle {
        position: absolute;
        left: 2px;
        top: 2em;
        z-index: 50;
    }
}
.spell {
    display: flex;
    align-items: center;

    image-rendering: pixelated;
    border-style: solid;
    border-width: 6px;
    border-image-width: 6px;
    border-image-slice: 3 fill;
    border-image-repeat: repeat;
    border-image-source: url('../../assets/images/ui/callout-disabled.png');

    &:hover {
        border-image-source: url('../../assets/images/ui/callout-selected.png');
    }


    + .spell {
        margin-top: 0.5em;
    }
    > * + * {
        margin-left: 0.5em;
    }
    &__image {
        width: 48px;
        height: 48px;
        image-rendering: pixelated;
    }
    &__name {
        flex: 1 1 auto;
    }
    &__select {

    }
    &__info {

    }
}
</style>
