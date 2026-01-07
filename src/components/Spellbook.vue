<template>
    <div class="modal" v-if="illusionPrompt">
        <div class="callout">
            <p class="callout__title">
                Cast {{ currentSpell.name }} as illusion?
            </p>
            <div class="callout__buttons">
                <button
                    class="
                        spellinfo__select
                        button button--green button--important
                    "
                    @click="selectIllusion(true)"
                >
                    Yes
                </button>
                <button
                    class="
                        spellinfo__select
                        button button--red button--important
                    "
                    @click="selectIllusion(false)"
                >
                    No
                </button>
                <button
                    class="spellinfo__select button"
                    @click="closeIllusion()"
                >
                    Cancel
                </button>
            </div>
        </div>
    </div>
    <div class="spellbook" v-if="show">
        <button
            v-if="minimised"
            class="
                spellbook__toggle spellbook__toggle--closed
                button button--green
            "
            @click="toggle()"
            title="Open spellbook"
        >
            <img
                class="spellbook-icon"
                src="../../assets/images/ui/spellbook.png"
                alt="Spellbook"
            />
        </button>
        <button
            v-if="!minimised"
            class="spellbook__toggle button button--small"
            @click="toggle()"
        >
            &gt;
        </button>
        <div
            class="spellbook__inner callout"
            :class="{ 'spellbook__inner--minimised': minimised }"
        >
            <h1 class="spellbook__title">{{ data.caster }}'s spells</h1>
            <div class="spellbook__scroll" ref="scroll">
                <ul class="spellbook__list spell-list">
                    <li
                        class="spell-list__item spell"
                        v-for="spell in spellsByChance()"
                        :key="spell.id"
                    >
                        <img class="spell__image" :src="getImageUrl(spell)" :alt="spell.name"/>
                        <span class="spell__name">{{ spell.name }}</span>
                        <span
                            :title="`${friendlyBalance(spell.balance)}`"
                            class="spell__balance"
                            :class="{
                                'balance-lawful': spell.balance > 0,
                                'balance-chaotic': spell.balance < 0,
                            }"
                            >{{ balance(spell) }}</span
                        >
                        <span
                            :style="`color: var(--spell-chance-colour-${chanceRounded(
                                spell.chance
                            )})`"
                            class="spell__chance"
                            :title="`This has a ${chancePercent(
                                spell.chance
                            )}% chance of casting.`"
                            >{{ chancePercent(spell.chance) }}%</span
                        >
                        <button class="spell__info button" @click="info(spell)">
                            i
                        </button>
                        <button
                            class="
                                spell__select
                                button button--green button--important
                            "
                            @click="select(spell)"
                        >
                            Select
                        </button>
                    </li>
                </ul>
            </div>
            <button
                class="spellbook__skip button button--red"
                @click="select(null)"
            >
                Skip selection
            </button>
        </div>
        <SpellInfo
            v-if="!illusionPrompt && currentSpell"
            :spell="currentSpell"
            @close="closeInfo()"
            @select="select(currentSpell)"
        />
    </div>
</template>
<script setup lang="ts">
import SpellInfo from "./SpellInfo.vue";
import { ref, computed, watch, nextTick } from "vue";
import { SpellType } from "../gameobjects/enums/spelltype";
import { balance, chancePercent, chanceRounded, friendlyBalance } from "../gameobjects/spells/spellutils";
import type { Spell } from "../gameobjects/spells/spell";
import type { SummonSpell } from "../gameobjects/spells/summonspell";
import type { SpellbookData } from "../gameobjects/interfaces/ui";
import type { Ref } from "vue";

const props = defineProps<{
    data: SpellbookData;
}>();

const emit = defineEmits<(e: "select", spell: Spell | null) => void>();

/**
 * The scroll element for the spell list.
 */
const scroll: Ref<HTMLElement | null> = ref(null);

/**
 * Whether the illusion prompt is being shown.
 */
const illusionPrompt: Ref<boolean> = ref(false);

/**
 * The currently selected spell for viewing info or selection.
 */
const currentSpell: Ref<Spell | null> = ref(null);

/**
 * Whether to show the spellbook or not.
 */
const show: Ref<boolean> = computed(() => {
    return props.data.show;
});

/**
 * Whether the spellbook is minimised or not.
 */
const minimised: Ref<boolean> = computed(() => {
    return props.data.minimised;
});

/**
 * Watches for changes to the spells list to reset scroll and minimised state.
 * This is to ensure that when the spellbook is handed to a new player, it
 * starts minimised (for privacy in local multiplayer) and scrolled to the top.
 */
watch(
    () => props.data.spells,
    (newSpells, oldSpells) => {
        if (newSpells !== oldSpells) {
            props.data.minimised = true;
            nextTick(() => {
                const scrollElement = (scroll.value as HTMLDivElement);
                if (scrollElement) {
                    scrollElement.scrollTop = 0;
                }
            });
        }
    }
);

/**
 * Selects whether to cast the summon spell as an illusion or not. This sets
 * the illusion flag on the summon spell before emitting the selection event.
 * 
 * @param illusion Whether to cast as an illusion or not.
 */
const selectIllusion: (illusion: boolean) => void = (illusion: boolean) => {
    illusionPrompt.value = false;
    if (currentSpell.value?.type === SpellType.Summon) {
        (currentSpell.value as SummonSpell).illusion = Boolean(illusion);
        emit("select", currentSpell.value);
    }
    closeInfo();
};

/**
 * Closes the illusion prompt without selecting a spell.
 */
const closeIllusion: () => void = () => {
    illusionPrompt.value = false;
    closeInfo();
};

/**
 * Selects a spell from the spellbook.
 * 
 * @param spell The spell to select, or null to skip selection.
 */
const select: (spell: Spell | null) => void = (spell: Spell | null) => {
    props.data.minimised = true;
    if (!spell) {
        emit("select", null);
        closeInfo();
        return;
    }
    currentSpell.value = spell;
    // If the spell is a summon that allows illusions, show the prompt.
    if (
        spell.type === SpellType.Summon &&
        (spell as SummonSpell).allowIllusion
    ) {
        illusionPrompt.value = true;
    } else {
        emit("select", spell);
        closeInfo();
    }
};

/**
 * Shows the spell info for a spell.
 * 
 * @param spell The spell to show info for.
 */
const info: (spell: Spell) => void = (spell: Spell) => {
    currentSpell.value = spell;
    props.data.minimised = true;
};

/**
 * Closes the spell info view.
 */
const closeInfo: () => void = () => {
    currentSpell.value = null;
    props.data.minimised = false;
};

/**
 * Gets the spells sorted by casting chance (highest first), then by name.
 */
const spellsByChance: () => Spell[] = () => {
    return props.data.spells.sort((a: Spell, b: Spell) => {
        if (b.chance != a.chance) {
            return b.chance - a.chance;
        }
        return a.name.localeCompare(b.name);
    });
};

/**
 * Gets the image URL for a spell.
 * 
 * @param spell The spell to get the image URL for.
 * @returns The image URL.
 */
const getImageUrl: (spell: Spell) => string = (spell: Spell) => {
    return `/images/spells/classicspells/${spell.spellId}.png`;
};

/**
 * Toggles the minimised state of the spellbook.
 */
const toggle: () => void = () => {
    props.data.minimised = !props.data.minimised;
    if (currentSpell.value) {
        closeInfo();
    }
};
</script>

<style lang="scss" scoped>
.spellbook {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 3;
    padding: 1em;
    display: flex;
    justify-content: right;
    &__inner {
        display: flex;
        flex-direction: column;
        transition: max-width 0.25s, opacity 0.25s, padding 0.25s;
        max-width: 500px;
        &--minimised {
            max-width: 0;
            opacity: 0;
            padding-left: 0;
            padding-right: 0;
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
        &::-webkit-scrollbar {
            width: 0.5em;
        }
        &::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.25);
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
    &__toggle {
        position: absolute;
        left: 2px;
        top: 2em;
        z-index: 50;
        &--closed {
            top: 1.5em;
            left: -2em;
        }
        &::after {
            display: none;
        }
    }
}

.spell {
    @media screen and (max-width: 600px) {
        &__balance {
            display: none;
        }
        [title]::after {
            display: none;
        }
    }
    display: flex;
    align-items: center;

    image-rendering: pixelated;
    border-style: solid;
    border-width: 6px;
    border-image-width: 6px;
    border-image-slice: 3 fill;
    border-image-repeat: repeat;
    border-image-source: url("../../assets/images/ui/callout-disabled.png");

    &:hover {
        border-image-source: url("../../assets/images/ui/callout-selected.png");
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
    &__balance {
        flex: 0 1 auto;
    }
}

.spellbook-icon {
    display: block;
    width: 38px;
    height: 38px;
    image-rendering: pixelated;
}
</style>
