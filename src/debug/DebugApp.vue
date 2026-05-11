<template>
    <SoundsDebug v-if="panel === 'sounds'" />
    <UnitsEditor v-else-if="panel === 'units'" />
    <div v-else class="debug-index">
        <section class="callout debug-index__panel">
            <h1>Archaos Debug Tools</h1>
            <ul class="debug-index__tools">
                <li><a href="?sounds" class="button">Sounds</a></li>
                <li><a href="?units" class="button">Units Editor</a></li>
            </ul>
        </section>
    </div>
</template>

<script setup lang="ts">
import SoundsDebug from "./sounds/SoundsDebug.vue";
import UnitsEditor from "./units/UnitsEditor.vue";

const params = new URLSearchParams(globalThis.location.search);
let panel: "sounds" | "units" | "" = "";
if (params.has("sounds")) panel = "sounds";
else if (params.has("units")) panel = "units";
</script>

<style lang="scss" scoped>
.debug-index {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    min-height: 100vh;
    padding: 3rem 1.5rem;
    color: var(--fg-colour);
    text-shadow: var(--text-shadow);

    &__panel {
        min-width: 320px;
        max-width: 480px;

        h1 {
            margin: 0 0 1rem;
            font-size: 1.75rem;
            color: var(--color-yellow);
        }
    }

    &__tools {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        a.button {
            display: block;
            text-decoration: none;
            text-align: center;
        }
    }
}
</style>
