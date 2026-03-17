<template>
    <div class="loading-screen">
        <img src="../../assets/images/ui/logo.png" alt="Archaos" class="logo" />
        <div class="loading-bar">
            <div class="loading-bar__fill" :style="{ width: `${Math.round(progress * 100)}%` }" />
        </div>
        <div class="loading-label">{{ Math.round(progress * 100) }}%</div>
    </div>
</template>

<script setup lang="ts">
import { loadingProgress } from '../game/loading-state';

const progress = loadingProgress;
</script>

<style lang="scss" scoped>
.loading-screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5em;
    z-index: 50;
}

.logo {
    width: 156 * 2px;
    height: 87 * 2px;
    image-rendering: pixelated;
}

.loading-bar {
    width: 312px;
    height: 10px;
    background: var(--bg-colour);
    border: 1px solid var(--fg-colour);
    overflow: hidden;
}

.loading-bar__fill {
    height: 100%;
    background: var(--color-cyan);
    transition: width 0.1s linear;
}

.loading-label {
    color: var(--color-cyan);
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
}
</style>
