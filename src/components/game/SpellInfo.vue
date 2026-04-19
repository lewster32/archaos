<template>
    <div class="callout spellinfo" v-if="show">
        <button class="spellinfo__close button button--small" @click="close()">&times;</button>
        <div class="spellinfo__inner">
            <div class="spellinfo__top">
                <SpellImage class="spellinfo__image" :spell="spell" style="--zoom: 3" />
                <div class="spellinfo__stats">
                    <p class="spell-stats__item">
                        <span class="spell-stats__label">Name:</span>
                        <span class="spell-stats__value">{{ spell.name }}</span>
                    </p>
                    <p class="spell-stats__item">
                        <span class="spell-stats__label">Type:</span>
                        <span class="spell-stats__value">{{ spellType(spell) }}</span>
                    </p>
                    <p class="spell-stats__item">
                        <span class="spell-stats__label">Chance:</span>
                        <span
                            :style="`color: var(--spell-chance-colour-${chanceRounded(spell.chance)})`"
                            class="spell-stats__value"
                            :title="chanceTitle"
                            >{{ chancePercent(spell.chance) }}%
                            <span
                                v-if="chanceDelta !== 0"
                                class="spell-stats__delta"
                                :class="{
                                    'c-green': chanceDelta > 0,
                                    'c-red': chanceDelta < 0,
                                }"
                                >({{ chanceDelta > 0 ? "+" : "" }}{{ chanceDelta }}%)</span
                            >
                        </span>
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
                            >{{ balanceIndicator(spell.balance) }}</span
                        >
                    </p>
                    <p v-if="spell.castTimes > 1" class="spell-stats__item">
                        <span class="spell-stats__label">Quantity:</span>
                        <span class="spell-stats__value">{{ spell.castTimes }}</span>
                    </p>
                </div>
            </div>
            <div class="spellinfo__stats spell-stats">
                <div v-if="spell.description">
                    <p class="spellinfo__description" v-html="spell.description"></p>
                </div>
                <div v-if="spellHasStats">
                    <UnitStats :unit="(spell as SummonSpell).unitProperties" />
                </div>
                <div class="callout__buttons">
                    <button class="spellinfo__select button button--green button--important" @click="select()">
                        Select
                    </button>
                    <button class="spellinfo__select button" @click="close()">Dismiss</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import UnitStats from "./UnitStats.vue";
import SpellImage from "./SpellImage.vue";
import { SpellType } from "@archaos/engine";
import { balanceIndicator, chancePercent, chanceRounded, friendlyBalance } from "@archaos/engine";
import type { Spell, AttackSpell, SummonSpell } from "@archaos/engine";
import { computed } from "vue";
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
 * The signed effect of the current universe alignment on the spell's casting
 * chance, expressed as an integer percentage (-100..+100). Zero when the
 * alignment has no effect on this spell.
 */
const chanceDelta: Ref<number> = computed(() => {
    return chancePercent(props.spell.chance) - chancePercent(props.spell.properties.chance);
});

/**
 * Tooltip text describing both the base and alignment-adjusted chance.
 */
const chanceTitle: Ref<string> = computed(() => {
    const base: number = chancePercent(props.spell.properties.chance);
    const delta: number = chanceDelta.value;
    if (delta === 0) {
        return `This has a ${base}% chance of casting.`;
    }
    const sign: string = delta > 0 ? "+" : "";
    return `Base chance ${base}%, ${sign}${delta}% from universe alignment (effective ${base + delta}%).`;
});

const spellHasStats: Ref<boolean> = computed(() => {
    return (
        props.spell.type === SpellType.Summon &&
        (props.spell as SummonSpell).unitProperties != null &&
        // Any of the stats are non-zero
        Object.values((props.spell as SummonSpell).unitProperties?.properties).some((value) => value > 0)
    );
});

/**
 * Gets the image URL for a spell.
 *
 * @param spell The spell to get the image URL for.
 */
const getImageUrl: (spell: Spell) => string = (spell: Spell) => {
    return `${import.meta.env.BASE_URL}images/spells/${spell.properties.group || "classicspells"}/${spell.spellId}.png`;
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
    return Object.keys(SpellType).find((key) => SpellType[key as keyof typeof SpellType] === spell.type) ?? "Unknown";
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
    right: 1rem;
    top: 1rem;
    max-width: calc(100vw - 2rem);
    z-index: 100;

    &__top {
        display: flex;
        flex: 1 0 auto;
        gap: 1rem;
        align-items: start;
        max-width: calc(100% - 2.5rem);
    }

    &__image {
        background-color: var(--color-black);
    }
    &__stats {
        flex: 1 0 auto;
    }
    &__inner {
        min-width: 280px;
        max-width: 380px;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    &__select {
        margin-top: 0.5em;
    }
    &__close {
        position: absolute;
        z-index: 100;
        right: 0.5em;
        top: 0.5em;
    }
    &__description {
        margin: 0.5em 0;
    }
}

.spell-stats {
    display: flex;
    flex-direction: column;
    &__item {
        display: flex;
        margin-bottom: 0.25em;
        line-height: 1;
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
