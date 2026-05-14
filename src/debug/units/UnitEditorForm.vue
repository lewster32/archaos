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

            <fieldset class="unit-editor-form__types">
                <legend>Border types (icon)</legend>
                <p class="unit-editor-form__hint">
                    Up to three slots colour the spell-icon border. Leave trailing slots empty for a 1- or 2-colour
                    border.
                </p>
                <div class="unit-editor-form__row">
                    <label v-for="slot in [0, 1, 2]" :key="slot">
                        <span>Slot {{ slot + 1 }}</span>
                        <select
                            :value="typeAt(slot)"
                            @change="setTypeAt(slot, ($event.target as HTMLSelectElement).value)"
                        >
                            <option value="">(none)</option>
                            <option v-for="t in TYPE_OPTIONS" :key="t" :value="t">{{ t }}</option>
                        </select>
                    </label>
                </div>
            </fieldset>
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
                        <option v-for="opt in projectileOptions" :key="opt" :value="opt">
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
            <StatusMultiSelect :model-value="spell.unit.status" @update:model-value="setStatus" />
        </section>
    </form>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { UnitRangedProjectileType } from "@archaos/engine";
import NumberInput from "./widgets/NumberInput.vue";
import StatusMultiSelect from "./widgets/StatusMultiSelect.vue";
import { slugify } from "./data/slugify";
import type { EditableSpell } from "./data/types";

const STAT_KEYS = ["mov", "com", "rcm", "rng", "def", "mnv", "res"] as const;
type StatKey = (typeof STAT_KEYS)[number];

// Keys matching the --spell-<name> CSS custom properties in SpellImage.vue
// that drive the icon border gradient.
const TYPE_OPTIONS = [
    "attack",
    "balance",
    "buff",
    "flying",
    "ground",
    "mount",
    "persists",
    "ranged",
    "special",
    "spreads",
    "static",
    "turmoil",
    "undead",
] as const;

const props = defineProps<{
    spell: EditableSpell;
    otherSpells: EditableSpell[];
}>();

const projectileOptions = Object.values(UnitRangedProjectileType);

const idCollision = computed(() => {
    if (!props.spell.id) return false;
    return props.otherSpells.some((s) => s !== props.spell && s.id === props.spell.id);
});

/**
 * Keep the spell + unit ids in lockstep with `spell.name` via slugify.
 * Watcher fires on every name edit so the id label updates as you type.
 * When the unit name was tracking the spell name (matches the old value
 * or is blank), keep it in lockstep too so editing a single field does
 * not silently desync the display name shown in-game.
 */
watch(
    () => props.spell.name,
    (name, oldName) => {
        const id = slugify(name);
        // Sync only when the unit name was tracking the spell name
        // exactly. A blank override means "use the spell name at
        // runtime" - leaving it blank already keeps the two in
        // lockstep, so don't materialise an explicit override.
        if (props.spell.unit.name === oldName) {
            props.spell.unit.name = name;
        }
        props.spell.id = id;
        props.spell.unit.id = id;
        props.spell._dirty = true;
    },
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

function typeAt(slot: number): string {
    return props.spell.types?.[slot] ?? "";
}

function setTypeAt(slot: number, value: string): void {
    const current = [...(props.spell.types ?? [])];
    if (value === "") {
        // Clear this slot and any trailing slots so the array stays
        // dense (a gap at slot 1 with slot 2 filled would mis-render
        // the 3-colour border).
        current.length = slot;
    } else {
        while (current.length < slot) current.push("");
        current[slot] = value;
    }
    // Drop empty trailing entries so length matches the visible
    // border-colour count.
    while (current.length > 0 && current[current.length - 1] === "") {
        current.pop();
    }
    props.spell.types = current;
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
