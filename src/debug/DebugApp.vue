<template>
    <SoundsDebug v-if="panel === 'sounds'" />
    <div v-else>
        <h1>Archaos Debug Tools</h1>
        <ul>
            <li><a href="?sounds">Sounds</a></li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import SoundsDebug from "./sounds/SoundsDebug.vue";

const params = new URLSearchParams(window.location.search);
const panel: "sounds" | "" = params.has("sounds") ? "sounds" : "";
</script>
