<script setup lang="ts">
import UnitStats from "./UnitStats.vue";
UnitStats;
</script>

<template>
    <div class="spellinfo" v-if="show">
        <button class="spellinfo__close button button--small" @click="close()">
            &times;
        </button>
        <div class="spellinfo__inner callout">
            <img class="spellinfo__image" :src="getImageUrl(spell)" />
            <div class="spellinfo__stats spell-stats">
                <p class="spell-stats__item">
                    <span class="spell-stats__label">Name:</span>
                    <span class="spell-stats__value">{{ spell.name }}</span>
                </p>
                <p class="spell-stats__item">
                    <span class="spell-stats__label">Type:</span>
                    <span class="spell-stats__value">{{
                        spellType(spell)
                    }}</span>
                </p>
                <p class="spell-stats__item">
                    <span class="spell-stats__label">Chance:</span>
                    <span
                        :style="`color: var(--spell-chance-colour-${chanceRounded(
                            spell.chance
                        )})`"
                        class="spell-stats__Value"
                        :title="`This has a ${chancePercent(
                            spell.chance
                        )}% chance of casting.`"
                        >{{ chancePercent(spell.chance) }}%</span
                    >
                </p>
                <p v-if="spell.damage" class="spell-stats__item">
                    <span class="spell-stats__label">Damage:</span>
                    <span class="spell-stats__value">{{ spell.damage }}</span>
                </p>
                <p v-if="spell.range > 1.5" class="spell-stats__item">
                    <span class="spell-stats__label">Range:</span>
                    <span class="spell-stats__value">{{ spell.range }}</span>
                </p>
                <p class="spell-stats__item">
                    <span class="spell-stats__label">Balance:</span>
                    <span
                        class="spell-stats__value"
                        :class="{
                            'balance-lawful': spell.balance > 0,
                            'balance-chaotic': spell.balance < 0,
                        }"
                        :title="`${friendlyBalance(spell.balance)}`"
                        >{{ balance(spell) }}</span
                    >
                </p>
                <p v-if="spell.castTimes > 1" class="spell-stats__item">
                    <span class="spell-stats__label">Quantity:</span>
                    <span class="spell-stats__value">{{
                        spell.castTimes
                    }}</span>
                </p>
                <div v-if="spell.description">
                    <p class="spellinfo__description" v-html="spell.description"></p>
                </div>
                <div v-if="spell.unitProperties">
                    <UnitStats :unit="spell.unitProperties" />
                </div>
                <div class="callout__buttons">
                    <button class="spellinfo__select button button--green button--important" @click="select()">
                        Select
                    </button>
                    <button class="spellinfo__select button" @click="close()">
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { PropType } from "@vue/runtime-core";
import { Spell } from "../gameobjects/spells/spell";
import { SpellType } from "../gameobjects/enums/spelltype";
export default {
    props: {
        spell: Object as any,
    },
    data() {
        return {};
    },
    computed: {
        show(): boolean {
            return this.spell != null;
        },
    },
    watch: {},
    methods: {
        getImageUrl(spell: Spell) {
            return `/images/spells/classicspells/${spell.spellId}.png`;
        },
        chancePercent(chance: number) {
            return Math.round(chance * 100);
        },
        chanceRounded(chance: number) {
            return Math.floor(chance * 10) * 10;
        },
        close() {
            this.$emit("close");
        },
        spellType(spell: Spell) {
            return SpellType[spell.type];
        },
        balance(spell: Spell) {
            if (spell.balance > 0) {
                return `Law ${spell.balance} (${new Array(spell.balance)
                    .fill("^")
                    .join("")})`;
            } else if (spell.balance < 0) {
                return `Chaos ${Math.abs(spell.balance)} (${new Array(
                    Math.abs(spell.balance)
                )
                    .fill("*")
                    .join("")})`;
            }
            return "Neutral";
        },
        select() {
            this.$emit("select");
        },
        friendlyBalance(balance: number) {
            let amount: string = ["slightly", "moderately", "highly", "greatly"][Math.min(Math.abs(balance) - 1, 3)];

            if (balance > 0) {
                return `Casting shifts world balance ${amount} towards law. Becomes easier to cast if world is lawful.`;
            } else if (balance < 0) {
                return `Casting shifts world balance ${amount} towards chaos. Becomes easier to cast if world is chaotic.`;
            }
            return "Casting does not affect world balance. Balance of world has no effect on spell's casting chance.";
        },
    },
    async mounted() {},
    destroyed() {},
};
</script>

<style lang="scss" scoped>

:host {
    position: relative;
    z-index: 51;
}

.spellinfo {
    position: fixed;
    left: 0;
    top: 0;
    padding: 1em;
    &__image {
        width: 96px;
        height: 96px;
        image-rendering: pixelated;
        margin-right: 1em;
        background-color: var(--color-black);
    }
    &__stats {
        flex: 1 1 auto;
    }
    &__inner {
        min-width: 360px;
        max-width: 480px;
        display: flex;
        justify-content: center;
        align-items: flex-start;
    }
    &__select {
        margin-top: .5em;
    }
    &__close {
        position: absolute;
        z-index: 100;
        right: 2em;
        top: 2em;
    }
    &__description {
        margin: .5em 0;
        line-height: 1.4;
    }
}

.spell-stats {
    display: flex;
    flex-direction: column;
    &__item {
        display: flex;
        margin-bottom: 0.25em;
    }
    &__label {
        color: var(--color-cyan);
        flex: 0 0 10ch;
    }
    &__value {
        flex: 1 1 auto;
    }
}

</style>
