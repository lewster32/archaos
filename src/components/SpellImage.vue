<template>
    <div class="spell-icon spell__image" :class="spellClasses" :style="spellStyles">
        <img class="spell-icon__image" v-if="spell"
            :src="spellImage"
            :alt="spell.name"/>
    </div>
</template>
<script setup lang="ts">
import { Spell } from '../gameobjects/spells/spell';
import { onMounted, computed, ref } from 'vue';
import type { Ref } from 'vue';
import { SpellType } from '../gameobjects/enums/spelltype';
import { UnitStatus } from '../gameobjects/enums/unitstatus';
import { UnitConfig } from '../gameobjects/interfaces/ui';

const props = defineProps<{
    spell: Spell | null;
}>();

/**
 * A data structure representing the colours used in a spell icon border that
 * get shared between the class and style computations.
 */
interface SpellIconData {
    /**
     * The border number (1, 2 or 3 colors).
     */
    number: number;

    /**
     * The top colour (also used if only one colour).
     */
    top?: string;

    /**
     * The middle colour (if applicable).
     */
    middle?: string;

    /**
     * The bottom colour (if applicable).
     */
    bottom?: string;
}

const spellIconData: Ref<SpellIconData> = ref({
    number: 1,
    top: 'ground',
});

/**
 * Get the base image URL for the spell. This contains the icon inside the
 * border.
 */
const spellImage = computed(() => {
    return getImageUrl(props.spell);
});

/**
 * Get the CSS classes for the spell image container. Determines whether this
 * is a 1, 2 or 3 coloured border.
 */
const spellClasses = computed(() => {
    return [`spell-icon--${spellIconData.value?.number ?? 1}`];
});

/**
 * Get the CSS styles for the spell image container. Determines the colours
 * used in the border based on a priority system for the spell types.
 */
const spellStyles = computed(() => {
    if (props.spell) {
        return {
            '--spell-grad-top': `var(--spell-${spellIconData.value?.top})`,
            '--spell-grad-middle': `var(--spell-${spellIconData.value?.middle})`,
            '--spell-grad-bottom': `var(--spell-${spellIconData.value?.bottom})`,
        };
    }
    return {};
});

const determineMainSpellColour: (spell: Spell) => string = (spell: Spell) => {
    if (!spell) {
        return 'unknown';
    }
    if (spell.type === SpellType.Disbelieve) {
        return 'persists';
    }
    if (spell.type === SpellType.Attack) {
        return 'attack';
    }
    if (spell.type === SpellType.Buff) {
        return 'buff';
    }
    if (spell.type === SpellType.Summon) {
        const unitProperties: UnitConfig = (spell as any).unitProperties;
        if (unitProperties) {
            if (unitProperties.status?.includes(UnitStatus.Flying)) {
                return 'flying';
            }
            else if (unitProperties.status?.includes(UnitStatus.Undead)) {
                return 'undead';
            }
            else if (unitProperties.status?.includes(UnitStatus.Mount)) {
                return 'mount';
            }
            else if (unitProperties.status.includes(UnitStatus.Spreads)) {
                return 'spreads';
            }
            else if (unitProperties.properties.mov === 0) {
                return 'static';
            }
            else {
                return 'ground';
            }
        }
    }
    return 'unknown';
}

onMounted(() => {
    if (!props.spell) {
        return;
    }
    const types: string[] = props.spell.properties.types || [];
    switch (types.length) {
        case 0:
            spellIconData.value = {
                number: 1,
                top: determineMainSpellColour(props.spell),
            };
            break;
        case 1:
            spellIconData.value = {
                number: 1,
                top: types[0],
            };
            break;
        case 2:
            spellIconData.value = {
                number: 2,
                top: types[0],
                bottom: types[1],
            };
            break;
        default:
            spellIconData.value = {
                number: 3,
                top: types[0],
                middle: types[1],
                bottom: types[2],
            };
            break;
    }
});

/**
 * Gets the image URL for a spell.
 * 
 * @param spell The spell to get the image URL for.
 * @returns The image URL.
 */
const getImageUrl: (spell: Spell) => string = (spell: Spell) => {
    return `/images/spells/${spell.properties.group || "classicspells"}/${spell.spellId}.png`;
};

</script>
<style scoped lang="scss">
.spell-icon {
    display: inline-block;

    &__image {
        width: 100%;
        height: 100%;
        image-rendering: pixelated;
    }
    
    --colour-red: #f00;
    --colour-blue: #210eb4;
    --colour-grey: #7d7d7d;
    --colour-dark-grey: #222;
    --colour-brown: #422108;
    --colour-yellow: #ff0;
    --colour-green: #08ad00;
    --colour-orange: #ff6d00;
    --colour-light-blue: #009cef;
    --colour-magenta: #b200b2;
    --colour-teal: #1d464e;
    --colour-cyan: #0ff;
    --colour-white: #fff;
    --colour-aquamarine: #13825b;

    --spell-flying: var(--colour-yellow);
    --spell-ground: var(--colour-green);
    --spell-static: var(--colour-grey);
    --spell-undead: var(--colour-light-blue);
    --spell-special: var(--colour-magenta);
    --spell-mount: var(--colour-brown);
    --spell-buff: var(--colour-blue);
    --spell-ranged: var(--colour-orange);
    --spell-spreads: var(--colour-teal);
    --spell-balance: var(--colour-cyan);
    --spell-attack: var(--colour-red);
    --spell-turmoil: var(--colour-aquamarine);
    --spell-persists: var(--colour-white);
    --spell-unknown: var(--colour-dark-grey);

    --size: 24;

    width: calc(var(--size) * 1px);
    height: calc(var(--size) * 1px);
    aspect-ratio: 1;
    border: 3px solid black;
    zoom: var(--zoom, 2);
    position: relative;
    --spell-grad-pixel-step: calc(100% / var(--size));

    &--2 {
        &::before {
            border-image: linear-gradient(to bottom,
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 7),
                    var(--spell-grad-bottom) calc(var(--spell-grad-pixel-step) * 7) calc(var(--spell-grad-pixel-step) * 8),
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 8) calc(var(--spell-grad-pixel-step) * 9),
                    var(--spell-grad-bottom) calc(var(--spell-grad-pixel-step) * 9) calc(var(--spell-grad-pixel-step) * 10),
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 10) calc(var(--spell-grad-pixel-step) * 11),
                    var(--spell-grad-bottom) calc(var(--spell-grad-pixel-step) * 11) calc(var(--spell-grad-pixel-step) * 12),
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 12) calc(var(--spell-grad-pixel-step) * 13),
                    var(--spell-grad-bottom) calc(var(--spell-grad-pixel-step) * 13) calc(var(--spell-grad-pixel-step) * 14),
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 14) calc(var(--spell-grad-pixel-step) * 15),
                    var(--spell-grad-bottom) calc(var(--spell-grad-pixel-step) * 15)) 1;
        }
    }

    &--3 {
        &::before {
            border-image: linear-gradient(to bottom,
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 3),
                    var(--spell-grad-middle) calc(var(--spell-grad-pixel-step) * 3) calc(var(--spell-grad-pixel-step) * 4),
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 4) calc(var(--spell-grad-pixel-step) * 5),
                    var(--spell-grad-middle) calc(var(--spell-grad-pixel-step) * 5) calc(var(--spell-grad-pixel-step) * 6),
                    var(--spell-grad-top) calc(var(--spell-grad-pixel-step) * 6) calc(var(--spell-grad-pixel-step) * 7),
                    var(--spell-grad-middle) calc(var(--spell-grad-pixel-step) * 7) calc(var(--spell-grad-pixel-step) * 17),
                    var(--spell-grad-bottom) calc(var(--spell-grad-pixel-step) * 17) calc(var(--spell-grad-pixel-step) * 18),
                    var(--spell-grad-middle) calc(var(--spell-grad-pixel-step) * 18) calc(var(--spell-grad-pixel-step) * 19),
                    var(--spell-grad-bottom) calc(var(--spell-grad-pixel-step) * 19) calc(var(--spell-grad-pixel-step) * 20),
                    var(--spell-grad-middle) calc(var(--spell-grad-pixel-step) * 20) calc(var(--spell-grad-pixel-step) * 21),
                    var(--spell-grad-bottom) calc(var(--spell-grad-pixel-step) * 21)) 1;
        }
    }

    &::before {
        position: absolute;
        inset: -2px;
        content: "";
        border-width: 1px;
        border-style: solid;
        border-color: var(--spell-grad-top,
                var(--spell-grad-middle, var(--spell-grad-bottom, var(--spell-unknown))));
        z-index: 10;    
    }
}
</style>