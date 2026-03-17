import { ref } from 'vue';

/** Phaser asset loader progress, 0–1. Updated by GameScene during preload(). */
export const loadingProgress = ref(0);
