<template>
    <div class="spellinfo" v-if="show">
        <button class="spellinfo__close button button--small" @click="close()">
            &times;
        </button>
        <div class="spellinfo__inner callout">
            <img class="spellinfo__image" :src="getImageUrl(spell)" :alt="spell.name" />
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
                <p v-if="spell.type == SpellType.Attack && (spell as AttackSpell).damage" class="spell-stats__item">
                    <span class="spell-stats__label">Damage:</span>
                    <span class="spell-stats__value">{{ (spell as AttackSpell).damage }}</span>
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
                <div v-if="spell.type === SpellType.Summon && (spell as SummonSpell).unitProperties">
                    <UnitStats :unit="(spell as SummonSpell).unitProperties" />
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

<script setup lang="ts">
import UnitStats from "./UnitStats.vue";
import { SpellType } from "../gameobjects/enums/spelltype";
import { computed } from "vue";
import { balance, chancePercent, chanceRounded, friendlyBalance } from "../gameobjects/spells/spellutils";
import type { Spell } from "../gameobjects/spells/spell";
import type { AttackSpell } from "../gameobjects/spells/attackspell";
import type { SummonSpell } from "../gameobjects/spells/summonspell";
import type { Ref } from "vue";

const props = defineProps<{
    spell: Spell;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "select"): void;
}>();

/**
 * Whether to show the spell info view or not.
 */
const show: Ref<boolean> = computed(() => {
    return props.spell != null;
});

/**
 * Gets the image URL for a spell.
 * 
 * @param spell The spell to get the image URL for.
 */
const getImageUrl: (spell: Spell) => string = (spell: Spell) => {
    return `/images/spells/classicspells/${spell.spellId}.png`;
};

/**
 * Closes the spell info view.
 */
const close: () => void = () => {
    emit("close");
};

/**
 * Gets the friendly name of a spell's type.
 * 
 * @param spell The spell to get the type name for.
 * @returns The friendly type name.
 */
const spellType: (spell: Spell) => string = (spell: Spell) => {
    return Object.keys(SpellType)
        .find((key => SpellType[key as keyof typeof SpellType] === spell.type)) ?? "Unknown";
};

/**
 * Emits the select event, indicating the user wants to select this spell.
 */
const select: () => void = () => {
    emit("select");
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
