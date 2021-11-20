<template>
    <div class="unit-stats">
        <div class="unit-stats__properties unit-properties">
            <div
                v-if="!canFly"
                class="unit-properties__item unit-properties__item--mov"
                :class="itemNumClass(unit.properties?.mov)"
                :title="'Movement range: ' + unit.properties?.mov"
            >
                <span>{{ unit.properties?.mov }}</span>
            </div>
            <div
                v-if="canFly"
                class="unit-properties__item unit-properties__item--fly"
                :class="itemNumClass(unit.properties?.mov)"
                :title="'Flying range: ' + unit.properties?.mov"
            >
                <span>{{ unit.properties?.mov }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--com"
                :class="itemNumClass(unit.properties?.com)"
                :title="'Combat rating: ' + unit.properties?.com"
            >
                <span>{{ unit.properties?.com }}</span>
            </div>
            <div
                v-if="unit.properties?.rcm"
                class="unit-properties__item unit-properties__item--rcm"
                :class="itemNumClass(unit.properties?.rcm)"
                :title="'Ranged combat rating: ' + unit.properties?.rcm"
            >
                <span>{{ unit.properties?.rcm }}</span>
            </div>
            <div
                v-if="unit.properties?.rng"
                class="unit-properties__item unit-properties__item--rng"
                :class="itemNumClass(unit.properties?.rng)"
                :title="'Ranged combat range: ' + unit.properties?.rng"
            >
                <span>{{ unit.properties?.rng }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--def"
                :class="itemNumClass(unit.properties?.def)"
                :title="'Defense rating: ' + unit.properties?.def"
            >
                <span>{{ unit.properties?.def }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--mnv"
                :class="itemNumClass(unit.properties?.mnv)"
                :title="'Maneuverability: ' + unit.properties?.mnv"
            >
                <span>{{ unit.properties?.mnv }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--res"
                :class="itemNumClass(unit.properties?.res)"
                :title="'Magic resistance: ' + unit.properties?.res"
            >
                <span>{{ unit.properties?.res }}</span>
            </div>
        </div>
        <div class="unit-stats__status unit-statuses">
            <span class="unit-statuses__item c-yellow" v-if="canFly">Flying</span>
            <span class="unit-statuses__item c-light-blue" v-if="isUndead">Undead</span>
            <span class="unit-statuses__item c-brown" v-if="isMount">Mountable</span>
            <span class="unit-statuses__item c-green" v-if="canSpread">Spreads</span>
            <span class="unit-statuses__item c-cyan" v-if="isInvulnerable">Invulnerable</span>
            <span class="unit-statuses__item c-green" v-if="isTree">Tree</span>
            <span class="unit-statuses__item c-yellow" v-if="expires">Expires</span>
            <span class="unit-statuses__item c-cyan" v-if="expiresGiveSpell">Gives spell</span>
        </div>
    </div>
</template>
<script lang="ts">
export default {
    props: {
        unit: Object as any,
    },
    data() {
        return {};
    },
    computed: {
        canFly() {
            return this.unit?.status?.indexOf("flying") > -1;
        },
        isUndead() {
            return this.unit?.status?.indexOf("undead") > -1;
        },
        isMount() {
            return this.unit?.status?.indexOf("mount") > -1 || this.unit?.status?.indexOf("mountAny") > -1;
        },
        canSpread() {
            return this.unit?.status?.indexOf("spread") > -1;
        },
        isInvulnerable() {
            return this.unit?.status?.indexOf("invuln") > -1;
        },
        isTree() {
            return this.unit?.status?.indexOf("tree") > -1;
        },
        expires() {
            return this.unit?.status?.indexOf("expires") > -1;
        },
        expiresGiveSpell() {
            return this.unit?.status?.indexOf("expiresGiveSpell") > -1;
        }
    },
    watch: {},
    methods: {
        itemNumClass(num: number) {
            return `unit-properties__item--num-${num}`;
        },
    },
    async mounted() {},
    destroyed() {},
};
</script>
<style lang="scss" scoped>
.unit-statuses {
    &__item + &__item {
        &::before {
            color: var(--color-white);
            content: ", ";
        }
    }
}

.unit-properties {
    display: flex;
    justify-content: space-around;
    align-items: center;
    margin: .5em 0;
    &__item {
        width: 36px;
        height: 36px;
        line-height: 38px;
        text-align: center;
        background-image: var(--stat-num, none), var(--stat-icon, none),
            url("../../assets/images/ui/stat-bg.png");
        background-size: 36px;
        user-select: none;
        span {
            opacity: var(--stat-number-opacity, 1);
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

        animation: flip-numbers 3s infinite steps(1);

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
    }
}
</style>