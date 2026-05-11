<!-- src/debug/units/UnitsEditor.vue -->
<template>
    <div class="units-editor">
        <aside class="units-editor__list callout">
            <a href="debug.html" class="button units-editor__back">
                <i class="icon icon--left"></i>
                Debug menu
            </a>
            <h1>Units</h1>
            <div class="units-editor__scroll">
                <template v-for="group in spellGroups" :key="group.label">
                    <h2 class="units-editor__group">{{ group.label }}</h2>
                    <ul>
                        <li v-for="spell in group.spells" :key="spell._originalId">
                            <button
                                type="button"
                                :aria-selected="spell._originalId === selectedId"
                                @click="selectedId = spell._originalId"
                            >
                                {{ spell.name }}<span v-if="spell._dirty"> *</span>
                            </button>
                        </li>
                    </ul>
                </template>
            </div>
        </aside>

        <main class="units-editor__detail">
            <p v-if="!selected">Select a unit.</p>
            <template v-else>
                <header class="units-editor__header">
                    <h1>{{ selected.name || "(unnamed)" }}</h1>
                    <div class="units-editor__actions">
                        <button class="button button--green" type="button" :disabled="!canSave" @click="onSave">Save</button>
                        <button class="button button--red" type="button" :disabled="!selected._dirty" @click="onReset">Reset</button>
                    </div>
                </header>

                <div class="units-editor__split">
                    <div class="units-editor__preview">
                        <div v-if="spellForIcon" class="units-editor__spell-info">
                            <SpellInfo :spell="spellForIcon" :key="selected._originalId" />
                        </div>
                        <SpritePreview :unit="selected.unit" />
                    </div>
                    <div class="units-editor__form">
                        <UnitEditorForm
                            :spell="selected"
                            :other-spells="otherSpells"
                            :key="`${selected._originalId}:${resetCount}`"
                        />
                    </div>
                </div>
            </template>
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { SpellType, type Spell as EngineSpell } from "@archaos/engine";
import SpellInfo from "../../components/game/SpellInfo.vue";
import SpritePreview from "./SpritePreview.vue";
import UnitEditorForm from "./UnitEditorForm.vue";
import { adaptClassic } from "./data/classicadapter";
import { buildEnhancedJson, downloadJson } from "./data/saveunit";
import type { EditableSpell, Frame, Texture } from "./data/types";
import classicSpellsData from "../../../assets/data/classicspells.json";
import classicUnitsData from "../../../assets/data/classicunits.json";
import classicAtlasMeta from "../../../assets/spritesheets/classicunits.json";
import classicAtlasUrl from "../../../assets/spritesheets/classicunits.png";

interface SpellGroup {
    label: string;
    spells: EditableSpell[];
}

function sortByName(a: EditableSpell, b: EditableSpell): number {
    return a.name.localeCompare(b.name);
}

interface SourceUnit {
    id?: string;
    name?: string;
    indefiniteArticle?: "a" | "an";
    attackType?: string;
    rangedType?: string;
    projectileType?: string;
    properties: {
        mov: number;
        com: number;
        rcm: number;
        rng: number;
        def: number;
        mnv: number;
        res: number;
    };
    status?: string[];
    animFrames?: number[];
    animSpeed?: number;
    shadowScale?: number;
    textures: Texture[];
}

interface SourceSpell {
    id: string;
    name: string;
    chance: number;
    balance: number;
    description?: string;
    group?: string;
    types?: string[];
    spellFrame?: number;
    unit: SourceUnit;
}

const enhancedJsonModules = import.meta.glob("../../../assets/data/enhanced/*.json", { eager: true }) as Record<
    string,
    { spell: SourceSpell }
>;

/**
 * Deep clone an arbitrary JSON-shaped value. Used to avoid mutating
 * the static JSON imports shared with the rest of the app.
 */
function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Wrap a source enhanced spell into the editor's EditableSpell shape.
 * Sets `_origin` and `_originalId` so the panel can track the entry
 * across renames.
 */
function adaptEnhanced(raw: SourceSpell): EditableSpell {
    const cloned = deepClone(raw);
    const unit = cloned.unit;
    return {
        id: cloned.id,
        name: cloned.name,
        chance: cloned.chance,
        balance: cloned.balance,
        description: cloned.description,
        group: "enhanced",
        types: cloned.types,
        spellFrame: cloned.spellFrame,
        unit: {
            id: unit.id ?? cloned.id,
            name: unit.name ?? cloned.name,
            indefiniteArticle: unit.indefiniteArticle,
            attackType: unit.attackType,
            rangedType: unit.rangedType,
            projectileType: unit.projectileType,
            properties: { ...unit.properties },
            status: unit.status ? [...unit.status] : [],
            animFrames: unit.animFrames ? [...unit.animFrames] : undefined,
            animSpeed: unit.animSpeed,
            shadowScale: unit.shadowScale,
            // Shallow-clone each texture so the editor never mutates the
            // imported JSON. The spread is intentional copy-on-write.
            // oxlint-disable-next-line no-map-spread
            textures: (unit.textures ?? []).map((tex) => ({
                ...tex,
                imageUrl: tex.imageUrl ?? `/images/units/enhanced/${tex.image}`,
            })),
        },
        _origin: "enhanced",
        _originalId: cloned.id,
        _dirty: false,
    };
}

function loadAll(): EditableSpell[] {
    const enhanced: EditableSpell[] = Object.values(enhancedJsonModules).map((m) => adaptEnhanced(m.spell));
    const classic = adaptClassic(
        classicSpellsData as never,
        classicUnitsData as never,
        classicAtlasMeta.textures[0].frames as Frame[],
        classicAtlasMeta.textures[0].size,
        classicAtlasUrl,
    );
    return [...enhanced, ...classic];
}

const spells = reactive(new Map<string, EditableSpell>());
const sortedOriginalIds = ref<string[]>([]);

function repopulate(): void {
    spells.clear();
    const all = loadAll();
    for (const s of all) spells.set(s._originalId, s);
    sortedOriginalIds.value = all.map((s) => s._originalId);
}

repopulate();

const allSpells = computed<EditableSpell[]>(() =>
    sortedOriginalIds.value.map((id) => spells.get(id)).filter((s): s is EditableSpell => s !== undefined),
);

const spellGroups = computed<SpellGroup[]>(() => {
    const enhanced = allSpells.value.filter((s) => s._origin === "enhanced");
    const classic = allSpells.value.filter((s) => s._origin === "classic");
    return [
        { label: "Enhanced", spells: enhanced.toSorted(sortByName) },
        { label: "Classic", spells: classic.toSorted(sortByName) },
    ].filter((g) => g.spells.length > 0);
});

const selectedId = ref<string | null>(null);
const resetCount = ref(0);

const selected = computed<EditableSpell | null>(() => {
    const id = selectedId.value;
    if (!id) return null;
    return spells.get(id) ?? null;
});

const otherSpells = computed<EditableSpell[]>(() =>
    selected.value ? allSpells.value.filter((s) => s !== selected.value) : allSpells.value,
);

const canSave = computed(() => {
    const s = selected.value;
    if (!s) return false;
    return s._dirty && s.id !== "" && s.name.trim() !== "";
});

onMounted(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const id = params.get("units");
    if (id && spells.has(id)) selectedId.value = id;
});

watch(selectedId, (id) => {
    const url = new URL(globalThis.location.href);
    url.searchParams.set("units", id ?? "");
    globalThis.history.replaceState(null, "", url);
});

const spellForIcon = computed<EngineSpell | null>(() => {
    const s = selected.value;
    if (!s) return null;
    return {
        type: SpellType.Summon,
        name: s.name,
        spellId: s.id,
        unitId: s.unit.id,
        spellFrame: s.spellFrame ?? 0,
        chance: s.chance,
        balance: s.balance,
        description: s.description,
        properties: {
            chance: s.chance,
            types: s.types ?? [],
            group: s.group,
        },
        unitProperties: s.unit,
    } as unknown as EngineSpell;
});

function onSave(): void {
    const s = selected.value;
    if (!s || !canSave.value) return;
    const json = buildEnhancedJson(s);
    downloadJson(`${s.id}.json`, json);
    s._dirty = false;
}

function onReset(): void {
    const s = selected.value;
    if (!s) return;
    const original = findOriginal(s._originalId);
    if (!original) return;
    spells.set(s._originalId, original);
    resetCount.value++;
}

function findOriginal(originalId: string): EditableSpell | undefined {
    const all = loadAll();
    return all.find((s) => s._originalId === originalId);
}
</script>

<style lang="scss" scoped>
.units-editor {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    height: 100vh;
    color: var(--fg-colour);
    text-shadow: var(--text-shadow);

    &__list {
        flex: 0 0 14rem;
        padding: 1rem 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    &__back {
        flex: 0 0 auto;
        display: block;
        margin: 0 1rem 0.75rem;
        text-decoration: none;
    }

    &__list h1 {
        flex: 0 0 auto;
        margin: 0 0 0.75rem;
        padding: 0.25rem 1rem;
        font-size: 1.5rem;
        color: var(--color-yellow);
    }

    &__scroll {
        flex: 1 1 auto;
        overflow-y: auto;
        min-height: 0;
    }

    &__group {
        margin: 0.75rem 0 0.25rem;
        padding: 0.15rem 1rem;
        font-size: 0.85rem;
        font-weight: normal;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--color-cyan);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    li + li {
        margin-top: 0.125rem;
    }

    li {
        display: flex;
    }

    &__list button {
        all: unset;
        flex: 1 1 auto;
        display: block;
        padding: 0.75em 1em;
        cursor: pointer;
        color: var(--fg-colour);
        text-shadow: var(--text-shadow);

        &:hover {
            background: rgba(255, 255, 255, 0.08);
            color: var(--color-cyan);
        }

        &[aria-selected="true"] {
            background: var(--color-yellow);
            color: var(--color-black);
            text-shadow: none;
        }
    }

    &__detail {
        flex: 1 1 auto;
        padding: 1.25rem 1.5rem;
        overflow-y: auto;
        overflow-x: hidden;
        min-height: 0;
    }

    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin: 0 0 1rem;

        h1 {
            margin: 0;
            font-size: 2rem;
            color: var(--color-cyan);
        }
    }

    &__actions {
        display: flex;
        gap: 0.5rem;
    }

    &__split {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 1.5rem;
        align-items: start;
    }

    &__preview {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        position: sticky;
        top: 0;
    }

    &__form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    &__spell-info {
        display: block;
        margin: 0 0 1.25rem;

        :deep(.spellinfo) {
            position: static;
            right: auto;
            top: auto;
            max-width: none;
            z-index: auto;
        }

        :deep(.spellinfo__close),
        :deep(.callout__buttons) {
            display: none;
        }
    }
}
</style>
