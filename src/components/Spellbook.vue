<script setup lang="ts">
import SpellInfo from "./SpellInfo.vue";
SpellInfo;
</script>

<template>
    <div class="spellbook" v-if="show">
        <button class="spellbook__toggle window-button" @click="toggle()">
            {{ minimised ? "&lt;" : "&gt;" }}
        </button>
        <div
            class="spellbook__inner"
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
                        <button class="spell__info" @click="info(spell)">
                            i
                        </button>
                        <button class="spell__select" @click="select(spell)">
                            Select
                        </button>
                    </li>
                </ul>
            </div>
            <button class="spellbook__skip" @click="select(null)">
                Skip selection
            </button>
        </div>
        <SpellInfo :spell="currentSpell" @close="closeInfo()" @select="select(currentSpell)" />
    </div>
</template>

<script lang="ts">
import { Spell } from "../gameobjects/spell";
import { PropType } from '@vue/runtime-core';

export default {
    $refs: {
        scroll: HTMLDivElement,
    },
    props: {
        data: Object as PropType<any>,
    },
    data() {
        return {
            minimised: true as boolean,
            currentSpell: null as Spell | null,
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
    display: flex;
    justify-content: right;
    &__toggle {
        z-index: 2;
    }
    &__inner {
        padding: 1em;
        background: rgba(0, 0, 0, 0.25);
        backdrop-filter: blur(5px);
        width: 360px;
        display: flex;
        flex-direction: column;
        transition: width 0.25s;
        > * {
            transition: opacity 0.25s;
        }
        &--minimised {
            width: .5em;
            > * {
                opacity: 0;
            }
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
        flex: 1 1 auto;
        overflow-y: scroll;
        margin-bottom: 0.5em;
        &::-webkit-scrollbar {
            width: 0.5em;
        }
        &::-webkit-scrollbar-track {
            background: transparent;
        }
        &::-webkit-scrollbar-thumb {
            border-radius: 1em;
            background: #777;
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
        background-color: #800;
        color: #fff;
    }
}
.spell {
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.5);
    padding: 0.5em;
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
        background: var(--color-white);
    }
    &__info {
        border-radius: 9999px;
        background: var(--color-cyan);
    }
}
</style>
