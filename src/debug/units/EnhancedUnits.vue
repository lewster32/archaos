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
            <h1 v-else>{{ selected.name }}</h1>
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
</script>
