<template>
    <Suspense>
        <Game />
        <template #fallback>
            <LoadingScreen />
        </template>
    </Suspense>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import LoadingScreen from './components/LoadingScreen.vue';

const Game = defineAsyncComponent(() => import('./components/Game.vue'));
</script>
