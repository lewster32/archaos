<template>
    <div class="unit-stats">
        <div class="unit-stats__properties unit-properties">
            <div
                v-if="!hasStatus('flying')"
                class="unit-properties__item unit-properties__item--mov"
                :class="itemNumClass(unit.properties?.mov)"
                :title="'Movement range: ' + unit.properties?.mov"
            >
                <span>{{ clampedNum(unit.properties?.mov) }}</span>
            </div>
            <div
                v-else
                class="unit-properties__item unit-properties__item--fly"
                :class="itemNumClass(unit.properties?.mov)"
                :title="'Flying range: ' + unit.properties?.mov"
            >
                <span>{{ clampedNum(unit.properties?.mov) }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--com"
                :class="itemNumClass(unit.properties?.com)"
                :title="'Combat rating: ' + unit.properties?.com"
            >
                <span>{{ clampedNum(unit.properties?.com) }}</span>
            </div>
            <div
                v-if="unit.properties?.rcm"
                class="unit-properties__item unit-properties__item--rcm"
                :class="itemNumClass(unit.properties?.rcm)"
                :title="'Ranged combat rating: ' + unit.properties?.rcm"
            >
                <span>{{ clampedNum(unit.properties?.rcm) }}</span>
            </div>
            <div
                v-if="unit.properties?.rng"
                class="unit-properties__item unit-properties__item--rng"
                :class="itemNumClass(unit.properties?.rng)"
                :title="'Ranged combat range: ' + unit.properties?.rng"
            >
                <span>{{ clampedNum(unit.properties?.rng) }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--def"
                :class="itemNumClass(unit.properties?.def)"
                :title="'Defense rating: ' + unit.properties?.def"
            >
                <span>{{ clampedNum(unit.properties?.def) }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--mnv"
                :class="itemNumClass(unit.properties?.mnv)"
                :title="'Maneuverability: ' + unit.properties?.mnv"
            >
                <span>{{ clampedNum(unit.properties?.mnv) }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--res"
                :class="itemNumClass(unit.properties?.res)"
                :title="'Magic resistance: ' + unit.properties?.res"
            >
                <span>{{ clampedNum(unit.properties?.res) }}</span>
            </div>
        </div>
        <div class="unit-stats__status unit-statuses">
            <span v-if="owner && !isWizard" class="unit-statuses__item">
                Owned by
                <span
                    :style="`color: color-mix(in oklab, var(--tint-colour), white 20%)`"
                    >{{ owner }}</span
                >
            </span>
            <span
                class="unit-statuses__item c-white"
                v-if="isWizard"
                title="The spell casting unit of each player"
                >Wizard</span
            >
            <span
                class="unit-statuses__item c-grey"
                v-if="isDead"
                title="R.I.P."
                >Dead</span
            >
            <span
                class="unit-statuses__item c-yellow"
                v-if="hasStatus('flying')"
                title="Can fly over obstacles and units"
                >Flying</span
            >
            <span
                class="unit-statuses__item c-light-blue"
                v-if="hasStatus('undead')"
                title="Cannot be harmed by normal means"
                >Undead</span
            >
            <span
                class="unit-statuses__item c-brown"
                v-if="hasAnyStatus(['mount', 'mountAny'])"
                title="Can be mounted by a wizard"
                >Mountable</span
            >
            <span
                class="unit-statuses__item c-magenta"
                v-if="hasStatus('spread')"
                title="Has a chance to multiply and harm units it spreads over"
                >Spreads</span
            >
            <span
                class="unit-statuses__item c-cyan"
                v-if="hasStatus('invuln')"
                title="Cannot be attacked by any means"
                >Invulnerable</span
            >
            <span
                class="unit-statuses__item c-light-blue"
                v-if="hasStatus('sanctity')"
                title="Immune to magical attacks"
                >Sanctity</span
            >
            <span
                class="unit-statuses__item c-green"
                v-if="hasStatus('tree')"
                title="Cannot move"
                >Tree</span
            >
            <span
                class="unit-statuses__item c-yellow"
                v-if="hasStatus('expires')"
                title="Has a chance to permanently disappear"
                >Expires</span
            >
            <span
                class="unit-statuses__item c-cyan"
                v-if="hasStatus('expiresGiveSpell')"
                title="Gifts a new spell to the mounted wizard on expiry"
                >Gives spell</span
            >
        </div>
    </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { UnitConfig } from "../gameobjects/interfaces/ui";

const props = defineProps<{
    unit: UnitConfig | null;
    owner?: string;
    isMount?: boolean;
}>();

/**
 * Check if the current unit has a specific status.
 *
 * @param status The status to check for.
 */
type Status =
    | "flying"
    | "undead"
    | "mount"
    | "mountAny"
    | "spread"
    | "invuln"
    | "sanctity"
    | "tree"
    | "expires"
    | "expiresGiveSpell";

/**
 * Check the unit has the given status.
 *
 * @param status The status to check for.
 */
const hasStatus = (status: Status): boolean => {
    return props.unit?.status?.includes(status) ?? false;
};

/**
 * Check if the unit has any of the given statuses.
 *
 * @param statuses The statuses to check for.
 */
const hasAnyStatus = (statuses: Status[]): boolean => {
    return statuses.some((status: Status) => hasStatus(status));
};

/**
 * Check if the unit has all of the given statuses.
 *
 * @param statuses The statuses to check for.
 */
const hasAllStatuses = (statuses: Status[]): boolean => {
    return statuses.every((status: Status) => hasStatus(status));
};

/**
 * Whether the unit is a wizard.
 */
const isWizard = computed(() => {
    return props.unit?.wizard;
});

/**
 * Whether the unit is dead.
 */
const isDead = computed(() => {
    return props.unit?.dead;
});

/**
 * Get the numeral class for the given number.
 *
 * @param num The number to get the class for.
 */
const itemNumClass = (num: number) => {
    // Only return classes for numbers 1-10
    if (!num || num < 1) {
        return "";
    }
    if (num > 10) {
        num = 10;
    }
    return `unit-properties__item--num-${num}`;
};

const clampedNum = (num: number | undefined) => {
    if (!num || num < 1) {
        return "-";
    }
    if (num > 10) {
        return "!";
    }
    return num.toString();
};
</script>
<style lang="scss" scoped>
.unit-stats {
    display: flex;
    flex-direction: column;
    gap: 1em;
    margin-block: 0.25em;
}

.unit-statuses {
    &:empty {
        display: none;
    }
    &__item + &__item {
        &::before {
            color: var(--color-white);
            content: ", ";
        }
    }
}

@keyframes flip-numbers {
    0% {
        --stat-icon: none;
        --stat-number-opacity: 1;
    }
    50% {
        --stat-icon: var(--stat-icon);
        --stat-number-opacity: 0;
    }
}

.unit-properties {
    display: flex;
    justify-content: space-around;
    align-items: center;
    gap: 0.25em;
    &__item {
        width: 36px;
        height: 36px;
        line-height: 38px;
        text-align: center;
        background-image:
            var(--stat-num, none), var(--stat-icon, none),
            url("../../assets/images/ui/stat-bg.png");
        background-size: 36px;
        user-select: none;
        &[title] {
            position: relative;
            &::after {
                position: absolute;
                top: 0;
                right: -0.5em;
                height: 1em;
                line-height: 1em;
            }
        }
        span {
            visibility: hidden;
        }
        &:hover {
            --stat-icon: none;
            span {
                visibility: visible;
            }
        }
        &--mov {
            --stat-icon: url("../../assets/images/ui/stat-move.png");
        }
        &--fly {
            --stat-icon: url("../../assets/images/ui/stat-fly.png");
        }
        &--com {
            --stat-icon: url("../../assets/images/ui/stat-combat.png");
        }
        &--rcm {
            --stat-icon: url("../../assets/images/ui/stat-ranged-combat.png");
        }
        &--rng {
            --stat-icon: url("../../assets/images/ui/stat-ranged-combat-range.png");
        }
        &--def {
            --stat-icon: url("../../assets/images/ui/stat-defense.png");
        }
        &--mnv {
            --stat-icon: url("../../assets/images/ui/stat-manoeuvre.png");
        }
        &--res {
            --stat-icon: url("../../assets/images/ui/stat-magic-resist.png");
        }

        @for $_i from 1 through 10 {
            &--num-#{$_i} {
                --stat-num: url("../../assets/images/ui/stat-num-#{$_i}.png");
            }
        }
    }
}
</style>
