import { ref } from "vue";
import type { Ref } from "vue";

const params: URLSearchParams = new URLSearchParams(globalThis.location?.search);

/**
 * When `?debugLoading` is in the URL, freeze the loading screen at 50% for
 * styling work.
 **/
export const debugLoading: boolean = params.has("debugLoading");

/**
 * Phaser asset loader progress, 0–1. Updated by GameScene during preload().
 **/
export const loadingProgress: Ref<number> = ref(debugLoading ? 0.5 : 0);
