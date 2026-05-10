<template>
    <SoundsDebug v-if="panel === 'sounds'" />
    <EnhancedUnits v-else-if="panel === 'units'" />
    <div v-else>
        <h1>Archaos Debug Tools</h1>
        <ul>
            <li><a href="?sounds">Sounds</a></li>
            <li><a href="?units">Enhanced Units</a></li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import SoundsDebug from "./sounds/SoundsDebug.vue";
import EnhancedUnits from "./units/EnhancedUnits.vue";

const params = new URLSearchParams(globalThis.location.search);
let panel: "sounds" | "units" | "" = "";
if (params.has("sounds")) panel = "sounds";
else if (params.has("units")) panel = "units";
</script>
