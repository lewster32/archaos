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
                        <button class="button button--green" type="button" :disabled="!canSave" @click="onSave">Save JSON</button>
                        <button class="button button--red" type="button" :disabled="!selected._dirty" @click="onReset">Reset</button>
                    </div>
                </header>

                <nav class="units-editor__tabs">
                    <button
                        type="button"
                        :class="{ active: activeTab === 'stats' }"
                        @click="activeTab = 'stats'"
                    >Stats</button>
                    <button
                        type="button"
                        :class="{ active: activeTab === 'sprites' }"
                        @click="activeTab = 'sprites'"
                    >Sprites</button>
                </nav>

                <div v-if="activeTab === 'stats'" class="units-editor__split">
                    <div class="units-editor__preview">
                        <div v-if="spellForIcon" class="units-editor__spell-info">
                            <SpellInfo :spell="spellForIcon" :key="selected._originalId" />
                        </div>
                        <SpritePreview :unit="selected.unit" :frame-source="frameSource" />
                    </div>
                    <div class="units-editor__form">
                        <UnitEditorForm
                            :spell="selected"
                            :other-spells="otherSpells"
                            :key="`${selected._originalId}:${resetCount}`"
                        />
                    </div>
                </div>
                <section v-else-if="activeTab === 'sprites'" class="units-editor__sprites">
                    <p v-if="bufferLoading">Loading atlas...</p>
                    <p v-else-if="bufferLoadError" class="units-editor__sprites-error">
                        Could not load source atlas - sprite editing unavailable. {{ bufferLoadError }}
                    </p>
                    <p v-else-if="!selected.unit.textures || selected.unit.textures.length === 0">
                        (no atlas available)
                    </p>
                    <SpriteEditor
                        v-else-if="currentBuffers"
                        :spell="selected"
                        :buffers="currentBuffers"
                        :global-colours="globalColours"
                        :anim-frames="selected.unit.animFrames ?? []"
                        :anim-speed="selected.unit.animSpeed"
                        :active-frame="activeFrame"
                        :frame-version="frameVersion"
                        :locked="isPainting"
                        :tool="tool"
                        :colour="colour"
                        :can-undo="canUndo"
                        :can-redo="canRedo"
                        @select-frame="activeFrame = $event"
                        @append-anim-frame="onAppendAnimFrame"
                        @duplicate-anim-frame="onDuplicateAnimFrame"
                        @remove-anim-frame="onRemoveAnimFrame"
                        @add-death-frame="onAddDeathFrame"
                        @clear-death-frame="onClearDeathFrame"
                        @stroke-started="onStrokeStarted"
                        @stroke-committed="onStrokeCommitted"
                        @eyedrop="onEyedrop"
                        @tool-change="onToolChange"
                        @colour-change="onColourChange"
                        @mirror="onMirror"
                        @undo="onUndo"
                        @redo="onRedo"
                    />
                </section>
            </template>
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { SpellType, type Spell as EngineSpell } from "@archaos/engine";
import SpellInfo from "../../components/game/SpellInfo.vue";
import SpritePreview from "./SpritePreview.vue";
import UnitEditorForm from "./UnitEditorForm.vue";
import SpriteEditor from "./sprites/SpriteEditor.vue";
import { adaptClassic } from "./data/classicadapter";
import {
    addDeathFrame as addDeathFrameOp,
    appendAnimFrame as appendAnimFrameOp,
    clearDeathFrame as clearDeathFrameOp,
    duplicateAnimFrame as duplicateAnimFrameOp,
    mirrorDirection,
    removeAnimFrame as removeAnimFrameOp,
} from "./data/framebuffers";
import { loadFrameBuffers } from "./data/loadframes";
import { cloneImageData } from "./data/paintops";
import { scanColoursFromBuffers, setsEqual, unpackRgb } from "./data/coloursets";
import { buildEnhancedJson, downloadJson } from "./data/saveunit";
import {
    frameBufferKey,
    type EditableSpell,
    type FrameBuffers,
    type FrameKey,
    type Frame,
    type Rgba,
    type Texture,
} from "./data/types";
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

type EditorTab = "stats" | "sprites";
const activeTab = ref<EditorTab>("stats");

const spellFrameBuffers = new Map<string, FrameBuffers>();
const frameVersion = ref(0);
const isPainting = ref(false);
const activeFrame = ref<FrameKey>({
    direction: "l",
    slot: "anim",
    index: 0,
});
const tool = ref<"pencil" | "fill" | "eraser" | "eyedropper">("pencil");
const colour = ref<Rgba>([0, 0, 0, 255]);

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

const currentBuffers = computed<FrameBuffers | null>(() => {
    if (!selected.value) return null;
    // Reference frameVersion so the computed re-fires after the lazy
    // load resolves (which bumps the version once the map is set).
    void frameVersion.value;
    return spellFrameBuffers.get(selected.value._originalId) ?? null;
});

// Per-unit colour set cache. Each entry is the set of distinct opaque
// RGB values (packed as 24-bit integers) used by that unit's buffers.
// Populated once per unit at eager-load time and refreshed only when
// that unit's buffers change in a way that adds or removes a colour.
// The global-colours pane reads from the union of these sets so it
// never re-scans pixels on every stroke or pane switch.
const colourSetsByUnit = ref(new Map<string, Set<number>>());

const globalColours = computed<Rgba[]>(() => {
    const merged = new Set<number>();
    for (const cs of colourSetsByUnit.value.values()) {
        for (const c of cs) merged.add(c);
    }
    const out: Rgba[] = [];
    for (const packed of merged) {
        const [r, g, b] = unpackRgb(packed);
        out.push([r, g, b, 255] as Rgba);
    }
    return out;
});

function refreshColoursForUnit(originalId: string): void {
    const buffers = spellFrameBuffers.get(originalId);
    if (!buffers) return;
    const next = scanColoursFromBuffers(buffers);
    const prev = colourSetsByUnit.value.get(originalId);
    if (prev && setsEqual(prev, next)) return;
    // Wrap mutation in a fresh Map so Vue's reactivity sees a change.
    const map = new Map(colourSetsByUnit.value);
    map.set(originalId, next);
    colourSetsByUnit.value = map;
}

// Reset the active frame whenever the selected spell changes so the
// painting canvas does not land on a frame index that the new spell
// does not have (e.g. switching from a 4-frame unit at index 2 to a
// 2-frame unit). Direction and slot reset too for a consistent
// starting point per unit.
watch(selectedId, () => {
    activeFrame.value = { direction: "l", slot: "anim", index: 0 };
});

const bufferLoadError = ref<string | null>(null);
const bufferLoading = ref(false);

async function ensureBuffersLoaded(): Promise<void> {
    const s = selected.value;
    if (!s) return;
    const id = s._originalId;
    if (spellFrameBuffers.has(id)) return;
    if (!s.unit.textures || s.unit.textures.length === 0) return;
    bufferLoadError.value = null;
    bufferLoading.value = true;
    try {
        const map = await loadFrameBuffers(s);
        spellFrameBuffers.set(id, map);
        refreshColoursForUnit(id);
        frameVersion.value++;
    } catch (err) {
        bufferLoadError.value =
            err instanceof Error ? err.message : String(err);
    } finally {
        bufferLoading.value = false;
    }
}

// Eager-load every loaded spell's atlas on panel mount so the
// global-colours pane is complete from the start. Each load is
// independent; one decode failure does not block the rest. The lazy
// path stays as the source of error reporting for the currently
// selected unit.
async function eagerLoadAllColours(): Promise<void> {
    const all = [...spells.values()];
    await Promise.allSettled(
        all.map(async (s) => {
            const id = s._originalId;
            if (spellFrameBuffers.has(id)) return;
            if (!s.unit.textures || s.unit.textures.length === 0) return;
            try {
                const map = await loadFrameBuffers(s);
                spellFrameBuffers.set(id, map);
                refreshColoursForUnit(id);
                frameVersion.value++;
            } catch {
                // Skip silently; the lazy path surfaces errors when
                // the user opens the Sprites tab for this unit.
            }
        }),
    );
}

watch(
    () => [activeTab.value, selected.value?._originalId],
    () => {
        if (activeTab.value === "sprites") void ensureBuffersLoaded();
    },
    { immediate: true },
);

const frameSource = computed(() => {
    void frameVersion.value;
    const map = currentBuffers.value;
    if (!map) return undefined;
    return (filename: string): ImageData | null => {
        const m = filename.match(/_([lr])_(\d+|d)$/);
        if (!m) return null;
        const dir = m[1] as "l" | "r";
        const idx = m[2];
        const key =
            idx === "d"
                ? frameBufferKey(dir, "death", 0)
                : frameBufferKey(dir, "anim", parseInt(idx, 10));
        return map.get(key)?.data ?? null;
    };
});

const previousDrawingTool = ref<"pencil" | "fill" | "eraser">("pencil");

const canUndo = computed(() => {
    if (!currentBuffers.value) return false;
    const k = frameBufferKey(
        activeFrame.value.direction,
        activeFrame.value.slot,
        activeFrame.value.index,
    );
    return (currentBuffers.value.get(k)?.undoStack.length ?? 0) > 0;
});
const canRedo = computed(() => {
    if (!currentBuffers.value) return false;
    const k = frameBufferKey(
        activeFrame.value.direction,
        activeFrame.value.slot,
        activeFrame.value.index,
    );
    return (currentBuffers.value.get(k)?.redoStack.length ?? 0) > 0;
});

function onAppendAnimFrame(): void {
    const s = selected.value;
    if (!s || !currentBuffers.value) return;
    appendAnimFrameOp(currentBuffers.value, s.unit);
    s._dirty = true;
    refreshColoursForUnit(s._originalId);
    frameVersion.value++;
}

function onDuplicateAnimFrame(sourceIndex: number): void {
    const s = selected.value;
    if (!s || !currentBuffers.value) return;
    const newIndex = duplicateAnimFrameOp(
        currentBuffers.value,
        s.unit,
        sourceIndex,
    );
    if (newIndex < 0) return;
    s._dirty = true;
    refreshColoursForUnit(s._originalId);
    activeFrame.value = { direction: "l", slot: "anim", index: newIndex };
    frameVersion.value++;
}

function onRemoveAnimFrame(index: number): void {
    const s = selected.value;
    if (!s || !currentBuffers.value) return;
    removeAnimFrameOp(currentBuffers.value, s.unit, index);
    s._dirty = true;
    refreshColoursForUnit(s._originalId);
    // Recompute a safe active frame: same direction, anim slot,
    // clamped to whatever anim indices remain (renumber may have
    // shifted things, so the previous index might be invalid now).
    const remaining: number[] = [];
    for (const key of currentBuffers.value.keys()) {
        const m = key.match(/^l:anim:(\d+)$/);
        if (m) remaining.push(parseInt(m[1], 10));
    }
    remaining.sort((a, b) => a - b);
    if (remaining.length === 0) {
        activeFrame.value = { direction: "l", slot: "anim", index: 0 };
    } else {
        const fallback = remaining.includes(activeFrame.value.index)
            ? activeFrame.value.index
            : remaining[Math.min(remaining.length - 1, index)];
        activeFrame.value = {
            direction: activeFrame.value.direction,
            slot: "anim",
            index: fallback,
        };
    }
    frameVersion.value++;
}

function onAddDeathFrame(dir: "l" | "r"): void {
    const s = selected.value;
    if (!s || !currentBuffers.value) return;
    addDeathFrameOp(currentBuffers.value, s.unit, dir);
    s._dirty = true;
    refreshColoursForUnit(s._originalId);
    frameVersion.value++;
}

function onClearDeathFrame(dir: "l" | "r"): void {
    const s = selected.value;
    if (!s || !currentBuffers.value) return;
    clearDeathFrameOp(currentBuffers.value, s.unit, dir);
    s._dirty = true;
    refreshColoursForUnit(s._originalId);
    frameVersion.value++;
}

function onStrokeStarted(): void {
    isPainting.value = true;
}

function onStrokeCommitted(snapshot: ImageData): void {
    isPainting.value = false;
    const map = currentBuffers.value;
    if (!map) return;
    const k = frameBufferKey(
        activeFrame.value.direction,
        activeFrame.value.slot,
        activeFrame.value.index,
    );
    const buf = map.get(k);
    if (!buf) return;
    buf.undoStack.push(snapshot);
    if (buf.undoStack.length > 50) buf.undoStack.shift();
    buf.redoStack.length = 0;
    if (selected.value) {
        selected.value._dirty = true;
        refreshColoursForUnit(selected.value._originalId);
    }
    frameVersion.value++;
}

function onToolChange(
    t: "pencil" | "fill" | "eraser" | "eyedropper",
): void {
    if (t !== "eyedropper") previousDrawingTool.value = t;
    tool.value = t;
}

function onColourChange(rgba: Rgba): void {
    colour.value = rgba;
    // Picking a colour while the eraser is active almost always means
    // the user wants to paint with it - auto-switch to pencil so they
    // do not need a second click on the tool button.
    if (tool.value === "eraser") {
        tool.value = "pencil";
        previousDrawingTool.value = "pencil";
    }
}

function onMirror(payload: { from: "l" | "r"; to: "l" | "r" }): void {
    const s = selected.value;
    if (!s || !currentBuffers.value) return;
    mirrorDirection(
        currentBuffers.value,
        s.unit,
        payload.from,
        payload.to,
    );
    s._dirty = true;
    refreshColoursForUnit(s._originalId);
    frameVersion.value++;
}

function onUndo(): void {
    const map = currentBuffers.value;
    if (!map) return;
    const k = frameBufferKey(
        activeFrame.value.direction,
        activeFrame.value.slot,
        activeFrame.value.index,
    );
    const buf = map.get(k);
    if (!buf || buf.undoStack.length === 0) return;
    const prev = buf.undoStack.pop();
    if (!prev) return;
    buf.redoStack.push(cloneImageData(buf.data));
    buf.data = prev;
    if (selected.value) refreshColoursForUnit(selected.value._originalId);
    frameVersion.value++;
}

function onRedo(): void {
    const map = currentBuffers.value;
    if (!map) return;
    const k = frameBufferKey(
        activeFrame.value.direction,
        activeFrame.value.slot,
        activeFrame.value.index,
    );
    const buf = map.get(k);
    if (!buf || buf.redoStack.length === 0) return;
    const next = buf.redoStack.pop();
    if (!next) return;
    buf.undoStack.push(cloneImageData(buf.data));
    buf.data = next;
    if (selected.value) refreshColoursForUnit(selected.value._originalId);
    frameVersion.value++;
}

function onKeyDown(e: KeyboardEvent): void {
    if (isPainting.value) return;
    if (activeTab.value !== "sprites") return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
        return;
    }
    if ((e.code === "KeyZ" && e.shiftKey) || e.code === "KeyY") {
        e.preventDefault();
        onRedo();
    }
}

function onEyedrop(rgba: Rgba): void {
    // Sprites have no semi-transparent pixels: solid colour or full
    // transparency only. Eyedrop always sets the paint to fully opaque
    // RGB so picking from a transparent pixel does not give an invisible
    // paint colour - the user uses the eraser tool to write transparency.
    colour.value = [rgba[0], rgba[1], rgba[2], 255];
    if (tool.value === "eyedropper") tool.value = previousDrawingTool.value;
}

const canSave = computed(() => {
    const s = selected.value;
    if (!s) return false;
    return s._dirty && s.id !== "" && s.name.trim() !== "";
});

onMounted(() => {
    const params = new URLSearchParams(globalThis.location.search);
    const id = params.get("units");
    if (id && spells.has(id)) selectedId.value = id;
    globalThis.addEventListener("keydown", onKeyDown);
    void eagerLoadAllColours();
});

onBeforeUnmount(() => {
    globalThis.removeEventListener("keydown", onKeyDown);
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

    &__tabs {
        display: flex;
        gap: 0.25rem;
        margin: 0 0 1rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);

        button {
            all: unset;
            padding: 0.5rem 1rem;
            cursor: pointer;
            color: var(--fg-colour);
            text-shadow: var(--text-shadow);
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;

            &:hover {
                color: var(--color-cyan);
            }

            &.active {
                color: var(--color-yellow);
                border-bottom-color: var(--color-yellow);
            }
        }
    }

    &__sprites {
        color: var(--fg-colour);
    }

    &__sprites-error {
        color: var(--color-red, #d04848);
        margin: 0 0 0.5rem;
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
