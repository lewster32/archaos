<template>
    <div class="enhanced-units">
        <aside class="unit-list">
            <h1>Enhanced Units</h1>
            <ul>
                <li v-for="spell in sortedSpells" :key="spell.id">
                    <button
                        type="button"
                        :aria-selected="spell.id === selectedId"
                        @click="selectedId = spell.id"
                    >
                        {{ spell.name }}<span v-if="spell.id === selectedId"> [sel]</span>
                    </button>
                </li>
            </ul>
        </aside>

        <main class="unit-detail">
            <p v-if="!selected">Select a unit.</p>
            <template v-else>
                <h1>{{ selected.name }}</h1>

                <section>
                    <h2>Properties</h2>
                    <dl>
                        <template v-for="(v, k) in propertiesEntries" :key="k">
                            <dt>{{ k }}</dt>
                            <dd>{{ v }}</dd>
                        </template>
                    </dl>
                </section>

                <section>
                    <h2>Stats</h2>
                    <dl>
                        <template v-for="(v, k) in statsEntries" :key="k">
                            <dt>{{ k }}</dt>
                            <dd>{{ v }}</dd>
                        </template>
                    </dl>
                </section>

                <section>
                    <h2>Status</h2>
                    <ul v-if="selected.unit.status && selected.unit.status.length">
                        <li v-for="s in selected.unit.status" :key="s">{{ s }}</li>
                    </ul>
                    <p v-else>(none)</p>
                </section>

                <section>
                    <h2>Animation</h2>
                    <dl>
                        <template v-for="(v, k) in animationEntries" :key="k">
                            <dt>{{ k }}</dt>
                            <dd>{{ v }}</dd>
                        </template>
                    </dl>
                </section>
            </template>
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

interface Frame {
    filename: string;
    frame: { x: number; y: number; w: number; h: number };
}

interface Texture {
    image: string;
    size: { w: number; h: number };
    frames: Frame[];
}

interface Unit {
    id: string;
    name?: string;
    attackType?: string;
    rangedType?: string;
    projectileType?: string;
    indefiniteArticle?: string;
    properties?: Record<string, number>;
    status?: string[];
    animFrames?: number[];
    animSpeed?: number;
    shadowScale?: number;
    textures?: Texture[];
}

interface Spell {
    id: string;
    name: string;
    unit: Unit;
}

const enhanced = import.meta.glob(
    "../../../assets/data/enhanced/*.json",
    { eager: true }
) as Record<string, { spell: Spell }>;

const spells: Spell[] = Object.values(enhanced).map((m) => m.spell);

const sortedSpells = computed(() =>
    [...spells].sort((a, b) => a.name.localeCompare(b.name))
);

const selectedId = ref<string | null>(null);

const selected = computed<Spell | null>(
    () => spells.find((s) => s.id === selectedId.value) ?? null
);

const PROPERTY_KEYS: ReadonlyArray<keyof Unit> = [
    "id",
    "name",
    "attackType",
    "rangedType",
    "projectileType",
    "indefiniteArticle",
];

const STAT_KEYS: ReadonlyArray<string> = [
    "mov",
    "com",
    "rcm",
    "rng",
    "def",
    "mnv",
    "res",
];

const propertiesEntries = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (!selected.value) return out;
    const unit = selected.value.unit;
    for (const key of PROPERTY_KEYS) {
        const value = unit[key];
        if (value !== undefined && value !== null) {
            out[key as string] = String(value);
        }
    }
    return out;
});

const statsEntries = computed<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    if (!selected.value?.unit.properties) return out;
    const props = selected.value.unit.properties;
    for (const key of STAT_KEYS) {
        if (props[key] !== undefined) {
            out[key] = props[key];
        }
    }
    return out;
});

const animationEntries = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (!selected.value) return out;
    const unit = selected.value.unit;
    if (unit.animFrames !== undefined) {
        out["animFrames"] = unit.animFrames.join(", ");
    }
    if (unit.animSpeed !== undefined) {
        out["animSpeed"] = String(unit.animSpeed);
    }
    if (unit.shadowScale !== undefined) {
        out["shadowScale"] = String(unit.shadowScale);
    }
    return out;
});
</script>
