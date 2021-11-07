<template>
    <div class="unit-stats">
        <div class="unit-stats__properties unit-properties">
            <div
                v-if="!canFly"
                class="unit-properties__item unit-properties__item--mov"
                :class="itemNumClass(unit.properties?.mov)"
                title="Movement range"
            >
                <span>{{ unit.properties?.mov }}</span>
            </div>
            <div
                v-if="canFly"
                class="unit-properties__item unit-properties__item--fly"
                :class="itemNumClass(unit.properties?.mov)"
                title="Flying range"
            >
                <span>{{ unit.properties?.mov }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--com"
                :class="itemNumClass(unit.properties?.com)"
                title="Combat strength"
            >
                <span>{{ unit.properties?.com }}</span>
            </div>
            <div
                v-if="unit.properties?.rcm"
                class="unit-properties__item unit-properties__item--rcm"
                :class="itemNumClass(unit.properties?.rcm)"
                title="Ranged combat strength"
            >
                <span>{{ unit.properties?.rcm }}</span>
            </div>
            <div
                v-if="unit.properties?.rng"
                class="unit-properties__item unit-properties__item--rng"
                :class="itemNumClass(unit.properties?.rng)"
                title="Ranged combat range"
            >
                <span>{{ unit.properties?.rng }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--def"
                :class="itemNumClass(unit.properties?.def)"
                title="Defense strength"
            >
                <span>{{ unit.properties?.def }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--mnv"
                :class="itemNumClass(unit.properties?.mnv)"
                title="Maneuverability"
            >
                <span>{{ unit.properties?.mnv }}</span>
            </div>
            <div
                class="unit-properties__item unit-properties__item--res"
                :class="itemNumClass(unit.properties?.res)"
                title="Magic resistance"
            >
                <span>{{ unit.properties?.res }}</span>
            </div>
        </div>
        <div class="unit-stats__status unit-statuses">
            <span class="unit-statuses__item" v-if="canFly" style="color: var(--color-yellow)">Flying</span>
            <span class="unit-statuses__item" v-if="isUndead" style="color: var(--color-light-blue)">Undead</span>
            <span class="unit-statuses__item" v-if="isMount" style="color: var(--color-brown)">Mountable</span>
            <span class="unit-statuses__item" v-if="canSpread" style="color: var(--color-green)">Spreads</span>
            <span class="unit-statuses__item" v-if="isInvulnerable" style="color: var(--color-cyan)">Invulnerable</span>
            <span class="unit-statuses__item" v-if="isTree" style="color: var(--color-green)">Tree</span>
            <span class="unit-statuses__item" v-if="expires" style="color: var(--color-yellow)">Expires</span>
            <span class="unit-statuses__item" v-if="expiresGiveSpell" style="color: var(--color-cyan)">Gives spell</span>
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