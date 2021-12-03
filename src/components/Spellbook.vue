<script setup lang="ts">
import SpellInfo from "./SpellInfo.vue";
SpellInfo;
</script>

<template>
    <div class="modal" v-if="illusionPrompt">
        <div class="callout">
            <p class="callout__title">Cast {{ currentSpell.name }} as illusion?</p>
            <div class="callout__buttons">
                <button class="spellinfo__select button button--green button--important" @click="selectIllusion(true)">
                    Yes
                </button>
                <button class="spellinfo__select button button--red button--important" @click="selectIllusion(false)">
                    No
                </button>
                <button class="spellinfo__select button" @click="closeIllusion()">
                    Cancel
                </button>
            </div>
        </div>
    </div>
    <div class="spellbook" v-if="show">
        <button v-if="minimised" class="spellbook__toggle spellbook__toggle--closed button button--green" @click="toggle()" title="Open spellbook">
            <img class="spellbook-icon" src="../../assets/images/ui/spellbook.png" alt="Spellbook" />
        </button>
        <button v-if="!minimised" class="spellbook__toggle button button--small" @click="toggle()">
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
                        <img class="spell__image" :src="getImageUrl(spell)" />
                        <span class="spell__name">{{ spell.name }}</span>
                        <span :title="`${friendlyBalance(spell.balance)}`" class="spell__balance" :class="{
                            'balance-lawful': spell.balance > 0,
                            'balance-chaotic': spell.balance < 0,
                        }"
                        >{{ balance(spell) }}</span>
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
        <SpellInfo v-if="!illusionPrompt" :spell="currentSpell" @close="closeInfo()" @select="select(currentSpell)" />
    </div>
</template>

<script lang="ts">
import { Spell } from "../gameobjects/spells/spell";
import { SpellType } from '../gameobjects/enums/spelltype';
import { SummonSpell } from '../gameobjects/spells/summonspell';

export default {
    $refs: {
        scroll: HTMLDivElement,
    },
    props: {
        data: Object as any,
    },
    data() {
        return {
            currentSpell: null as any,
            illusionPrompt: false as boolean
        };
    },
    computed: {
        show(): boolean {
            return this.data.show;
        },
        minimised(): boolean {
            return this.data.minimised;
        }
    },
    watch: {
        data(oldData, newData) {
            if (oldData?.spells != newData?.spells) {
                this.data.minimised = true;
                this.$nextTick(() => {
                    if (this.$refs.scroll) {
                        (this.$refs.scroll as HTMLDivElement).scrollTop = 0;
                    }
                });
            }
        },
    },
    methods: {
        selectIllusion(illusion: boolean) {
            this.illusionPrompt = false;
            this.currentSpell.illusion = !!illusion;
            this.$emit("select", this.currentSpell);
            this.closeInfo();
        },
        closeIllusion() {
            this.illusionPrompt = false;
            this.closeInfo();
        },
        select(spell: Spell) {
            this.data.minimised = true;
            if (!spell) {
                this.$emit("select", null);
                this.closeInfo();
                return;            
            }
            this.currentSpell = spell;
            if (spell.type === SpellType.Summon && (spell as SummonSpell).allowIllusion) {
                this.illusionPrompt = true;
            }
            else {
                this.$emit("select", spell);
                this.closeInfo();
            }
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
            return this.data.spells.sort((a: Spell, b: Spell) => {
                if (b.chance != a.chance) {
                    return b.chance - a.chance;
                }
                return a.name.localeCompare(b.name);
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
            this.data.minimised = !this.data.minimised;
            if (this.currentSpell) {
                this.closeInfo();
            }
        },
        balance(spell: Spell) {
            if (spell.balance > 0) {
                return '^';
            } else if (spell.balance < 0) {
                return `*`;
            }
            return "-";
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
.spellbook {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 3;
    padding: 1em;
    display: flex;
    justify-content: right;
    &__toggle {
        z-index: 2;
    }
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
        // padding-right: .5em;
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
    &__balance {
        flex: 0 1 auto;
    }
    &__select {

    }
    &__info {

    }
}

.spellbook-icon {
    display: block;
    width: 38px;
    height: 38px;
    image-rendering: pixelated;
}
</style>
