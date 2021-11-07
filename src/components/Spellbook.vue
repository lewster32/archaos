<template>
    <div class="spellbook" v-if="show">
        <button class="spellbook__toggle" @click="toggle()">{{ minimised ? '&lt;' : '&gt;' }}</button>
        <div class="spellbook__inner" :class="{'spellbook__inner--minimised': minimised}">
            <h1 class="spellbook__title">{{ data.caster }}'s spells</h1>
            <div class="spellbook__scroll" ref="scroll">
                <ul class="spellbook__list spell-list">
                    <li class="spell-list__item spell" v-for="spell in spellsByChance()" :key="spell.id">
                        <img class="spell__image" :src="getImageUrl(spell)" />
                        <span class="spell__name">{{ spell.name }}</span>
                        <span class="spell__chance" :title="`This has a ${chancePercent(spell.chance)}% chance of successfully casting`">{{ chancePercent(spell.chance) }}%</span>
                        <button class="spell__select" @click="select(spell)">Select</button>
                    </li>
                </ul>
            </div>
            <button class="spellbook__skip" @click="select(null)">Skip selection</button>
        </div>
    </div>
</template>

<script>

export default {
    props: {
        data: { type: Object },
        method: { type: Function }    
    },
    data() {
        return {
            spellImages: new Map(),
            minimised: false
        };
    },
    computed: {
        show() {
            return this.data;
        }
    },
    watch: {
        data(oldData, newData) {
            if (oldData != newData) {
                this.minimised = false;
                this.$nextTick(() => {
                    this.$refs.scroll.scrollTop = 0;
                });
            }
        }
    },
    methods: {
        select(spell) {
            this.$emit("select-spell", spell);
        },
        spellsByChance() {
            return this.data.spells.sort((a, b) => {
                return b.chance - a.chance;
            });
        },
        getImageUrl(spell) {
            return `assets/images/spells/classicspells/${spell.spellId}.png`;
        },
        chancePercent(chance) {
            return chance * 100;
        },
        toggle() {
            this.minimised = !this.minimised;
        }
    },
    async mounted() {

    },
    destroyed() {

    }
}
</script>

<style lang="scss" scoped>
    button {
        border: none;
        border-radius: 3px;
        padding: .5em;
        cursor: pointer;
        font-size: inherit;
    }
    .spellbook {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        z-index: 1;
        display: flex;
        justify-content: right;
        &__toggle {
            background: rgba(255,255,255,.2);
            color: #fff;
            position: absolute;
            z-index: 1;
            margin: 1em .5em;
            width: 2em;
            font-weight: 700;
        }
        &__inner {
            padding: 1em;
            width: 360px;
            display: flex;
            flex-direction: column;
            background: rgba(0,0,0,.25);
            backdrop-filter: blur(5px);
            transition: width .25s;
            > * {
                transition: opacity .25s;
            }
            &--minimised {
                width: 1em;
                > * {
                    opacity: 0;
                }
            }
        }
        &__title {
            font-size: 2em;
            margin-bottom: .5em;
            text-align: center;
        }
        &__scroll {
            flex: 1 1 auto;
            overflow-y: scroll;
            margin-bottom: .5em;
        }
        &__list {
            display: flex;
            flex-direction: column;
        }
        &__skip {
            background-color: #f00;
            color: #fff;
        }
    }
    .spell {
        display: flex;
        align-items: center;
        background: rgba(0,0,0,.5);
        padding: .5em;
        + .spell {
            margin-top: .5em;
        }
        > * + * {
            margin-left: .5em;
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
    }
</style>
