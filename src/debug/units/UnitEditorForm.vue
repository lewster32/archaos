<!-- src/debug/units/UnitEditorForm.vue -->
<template>
    <form class="unit-editor-form" @submit.prevent>
        <section class="callout">
            <h2>Spell</h2>

            <label class="unit-editor-form__field">
                <span>Name</span>
                <input type="text" v-model="spell.name" @input="markDirty" />
            </label>

            <p class="unit-editor-form__id">
                id: <code>{{ spell.id || "(empty)" }}</code>
                <span v-if="idCollision" class="unit-editor-form__warning">
                    - id already used by another loaded spell
                </span>
            </p>

            <div class="unit-editor-form__row">
                <NumberInput
                    label="Chance"
                    :model-value="spell.chance"
                    :min="0.1"
                    :max="1"
                    :step="0.1"
                    @update:model-value="set('chance', $event)"
                />
                <NumberInput
                    label="Balance"
                    :model-value="spell.balance"
                    :step="1"
                    :min="-4"
                    :max="4"
                    @update:model-value="set('balance', $event)"
                />
            </div>

            <label class="unit-editor-form__field">
                <span>Description</span>
                <textarea v-model="spell.description" @input="markDirty"></textarea>
            </label>
        </section>

        <section class="callout">
            <h2>Unit</h2>

            <label class="unit-editor-form__field">
                <span>Name (override; blank = use spell name)</span>
                <input type="text" v-model="spell.unit.name" @input="markDirty" />
            </label>

            <div class="unit-editor-form__row">
                <label>
                    <span>Article</span>
                    <select v-model="spell.unit.indefiniteArticle" @change="markDirty">
                        <option :value="undefined">(none)</option>
                        <option value="a">a</option>
                        <option value="an">an</option>
                    </select>
                </label>
                <label>
                    <span>Attack verb</span>
                    <input type="text" v-model="spell.unit.attackType" @input="markDirty" />
                </label>
                <label>
                    <span>Ranged verb</span>
                    <input type="text" v-model="spell.unit.rangedType" @input="markDirty" />
                </label>
                <label>
                    <span>Projectile</span>
                    <select v-model="spell.unit.projectileType" @change="markDirty">
                        <option :value="undefined">(none)</option>
                        <option
                            v-for="opt in projectileOptions"
                            :key="opt"
                            :value="opt"
                        >
                            {{ opt }}
                        </option>
                    </select>
                </label>
            </div>
        </section>

        <section class="callout">
            <h2>Stats</h2>
            <div class="unit-editor-form__stats">
                <NumberInput
                    v-for="key in STAT_KEYS"
                    :key="key"
                    :label="key"
                    :model-value="spell.unit.properties[key]"
                    :min="0"
                    :max="9"
                    :step="1"
                    @update:model-value="setStat(key, $event)"
                />
            </div>
        </section>

        <section class="callout">
            <h2>Status</h2>
            <StatusMultiSelect
                :model-value="spell.unit.status"
                @update:model-value="setStatus"
            />
        </section>

        <section class="callout">
            <h2>Animation</h2>
            <AnimFramesEditor
                :model-value="spell.unit.animFrames ?? []"
                :unit="spell.unit"
                @update:model-value="setAnimFrames"
            />
            <div class="unit-editor-form__row">
                <NumberInput
                    label="animSpeed"
                    :model-value="spell.unit.animSpeed"
                    :min="1"
                    :max="9"
                    :step="1"
                    @update:model-value="setAnimSpeed"
                />
                <NumberInput
                    label="shadowScale"
                    :model-value="spell.unit.shadowScale"
                    :min="0"
                    :step="0.1"
                    @update:model-value="setShadowScale"
                />
            </div>
        </section>
    </form>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { UnitRangedProjectileType } from "@archaos/engine";
import NumberInput from "./widgets/NumberInput.vue";
import StatusMultiSelect from "./widgets/StatusMultiSelect.vue";
import AnimFramesEditor from "./widgets/AnimFramesEditor.vue";
import { slugify } from "./data/slugify";
import type { EditableSpell, EditableUnit } from "./data/types";

const STAT_KEYS = ["mov", "com", "rcm", "rng", "def", "mnv", "res"] as const;
type StatKey = (typeof STAT_KEYS)[number];

const props = defineProps<{
    spell: EditableSpell;
    otherSpells: EditableSpell[];
}>();

const projectileOptions = Object.values(UnitRangedProjectileType);

const idCollision = computed(() => {
    if (!props.spell.id) return false;
    return props.otherSpells.some(
        (s) => s !== props.spell && s.id === props.spell.id
    );
});

/**
 * Keep the spell + unit ids in lockstep with `spell.name` via slugify.
 * Watcher fires on every name edit so the id label updates as you type.
 */
watch(
    () => props.spell.name,
    (name) => {
        const id = slugify(name);
        props.spell.id = id;
        props.spell.unit.id = id;
        props.spell._dirty = true;
    }
);

function markDirty(): void {
    props.spell._dirty = true;
}

function set<K extends "chance" | "balance">(key: K, value: number | undefined): void {
    if (value === undefined) return;
    props.spell[key] = value;
    markDirty();
}

function setStat(key: StatKey, value: number | undefined): void {
    if (value === undefined) return;
    props.spell.unit.properties[key] = value;
    markDirty();
}

function setStatus(next: string[]): void {
    props.spell.unit.status = next;
    markDirty();
}

function setAnimFrames(next: number[]): void {
    props.spell.unit.animFrames = next.length ? next : undefined;
    markDirty();
}

function setAnimSpeed(value: number | undefined): void {
    props.spell.unit.animSpeed = value;
    markDirty();
}

function setShadowScale(value: number | undefined): void {
    props.spell.unit.shadowScale = value;
    markDirty();
}
</script>

<style lang="scss" scoped>
.unit-editor-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    section {
        margin: 0;
    }

    h2 {
        margin: 0 0 0.5rem;
        font-size: 1.15rem;
        color: var(--color-yellow);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.25rem;
    }

    &__field {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        margin: 0 0 0.5rem;

        > span {
            font-size: 0.8rem;
            color: var(--color-grey);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        input,
        textarea {
            font-family: inherit;
            font-size: 0.95rem;
            padding: 0.25rem 0.4rem;
            background: var(--color-dark-grey);
            color: var(--color-white);
            border: 2px solid #111;
            border-radius: 3px;
            width: 100%;
        }

        textarea {
            min-height: 4rem;
            resize: vertical;
        }
    }

    &__row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin: 0 0 0.5rem;

        > label {
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
            font-size: 0.8rem;

            > span {
                color: var(--color-grey);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            select,
            input {
                font-family: inherit;
                font-size: 0.95rem;
                padding: 0.25rem 0.4rem;
                background: var(--color-dark-grey);
                color: var(--color-white);
                border: 2px solid #111;
                border-radius: 3px;
            }
        }
    }

    &__stats {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    &__id {
        margin: 0 0 0.75rem;
        font-size: 0.9rem;
        color: var(--color-grey);

        code {
            font-family: monospace;
            color: var(--color-cyan);
        }
    }

    &__warning {
        color: var(--color-yellow);
    }
}
</style>
