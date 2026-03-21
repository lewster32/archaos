<template>
    <div class="loading-screen">
        <img src="../../assets/images/ui/logo.png" alt="Archaos" class="logo" />
        <div
            class="loading-bar"
            role="progressbar"
            :aria-valuenow="Math.round(progress * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
            :title="`Loading... ${Math.round(progress * 100)}% (${totalMB ? `~${totalMB} MB` : 'size unknown'})`"
        >
            <div
                class="loading-bar__fill"
                :style="{ width: `${Math.round(progress * 100)}%` }"
            />
        </div>
        <p class="loading-label">
            {{ Math.round(progress * 100) }}%
            <span v-if="totalMB"> of about {{ totalMB }} MB</span>
        </p>
    </div>
</template>

<script setup lang="ts">
import { loadingProgress } from "../game/loading-state";
import { TOTAL_GAME_ASSET_BYTES } from "../game/asset-sizes";

const progress = loadingProgress;
const totalMB =
    TOTAL_GAME_ASSET_BYTES > 0
        ? (TOTAL_GAME_ASSET_BYTES / 1024 / 1024).toFixed(1)
        : null;
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
    --width: clamp(100px, 50vw, 400px);
    width: var(--width);
    height: 16px;
    image-rendering: pixelated;
    border-style: solid;
    border-width: 6px;
    border-image-width: 6px;
    border-image-slice: 3;
    border-image-repeat: repeat;
    border-image-source: url("../../assets/images/ui/callout.png");
    background-image: url("../../assets/images/ui/background.png");
    background-size: 32px;
    overflow: hidden;
}

.loading-label {
    color: var(--color-grey);
    font-variant-numeric: tabular-nums;
    font-size: 1rem;
}

.loading-bar__fill {
    height: 100%;
    background: linear-gradient(
        to right,
        var(--color-blue) 0% 14.28%,
        var(--color-red) 14.28% 28.56%,
        var(--color-magenta) 28.56% 42.84%,
        var(--color-green) 42.84% 57.12%,
        var(--color-cyan) 57.12% 71.4%,
        var(--color-yellow) 71.4% 85.68%,
        var(--color-white) 85.68% 100%
    );
    background-size: var(--width) 100%;
    transition: width 0.1s linear;

    animation: scroll-fill-colors 0.6s steps(14) infinite;
}

@keyframes scroll-fill-colors {
    0% {
        background-position: 0 0;
    }
    100% {
        background-position: var(--width) 0;
    }
}
</style>
