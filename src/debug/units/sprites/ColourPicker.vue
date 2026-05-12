<template>
    <div class="colour-picker">
        <div class="colour-picker__main">
            <div
                ref="svEl"
                class="colour-picker__sv"
                :class="{ 'colour-picker__sv--disabled': disabled }"
                :style="{ '--hue-bg': hueBg }"
                @pointerdown="onSvDown"
                @pointermove="onSvMove"
                @pointerup="onSvUp"
                @pointercancel="onSvUp"
            >
                <div
                    class="colour-picker__sv-marker"
                    :style="{
                        left: internalS * 100 + '%',
                        top: (1 - internalV) * 100 + '%',
                        background: rgbHex,
                    }"
                ></div>
            </div>
            <div
                ref="hueEl"
                class="colour-picker__hue"
                :class="{ 'colour-picker__hue--disabled': disabled }"
                @pointerdown="onHueDown"
                @pointermove="onHueMove"
                @pointerup="onHueUp"
                @pointercancel="onHueUp"
            >
                <div
                    class="colour-picker__hue-marker"
                    :style="{ top: (internalH / 360) * 100 + '%' }"
                ></div>
            </div>
            <div class="colour-picker__rgb">
                <label class="colour-picker__field">
                    <span class="c-red">R</span>
                    <input
                        type="number"
                        min="0"
                        max="255"
                        :value="modelValue[0]"
                        :disabled="disabled"
                        @input="(e) => onRgbInput(0, e)"
                    />
                </label>
                <label class="colour-picker__field">
                    <span class="c-green">G</span>
                    <input
                        type="number"
                        min="0"
                        max="255"
                        :value="modelValue[1]"
                        :disabled="disabled"
                        @input="(e) => onRgbInput(1, e)"
                    />
                </label>
                <label class="colour-picker__field">
                    <span class="c-blue">B</span>
                    <input
                        type="number"
                        min="0"
                        max="255"
                        :value="modelValue[2]"
                        :disabled="disabled"
                        @input="(e) => onRgbInput(2, e)"
                    />
                </label>
            </div>
        </div>
        <label class="colour-picker__field colour-picker__hex">
            <span class="c-yellow" style="font-size:2rem">#</span>
            <input
                type="text"
                maxlength="6"
                spellcheck="false"
                :value="hexDraft"
                :disabled="disabled"
                @input="onHexInput"
                @blur="onHexBlur"
                @keydown.enter.prevent="onHexCommit"
            />
        </label>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Rgba } from "../data/types";

const props = defineProps<{
    modelValue: Rgba;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", rgba: Rgba): void;
}>();

const svEl = ref<HTMLDivElement | null>(null);
const hueEl = ref<HTMLDivElement | null>(null);

// Internal HSV is the source of truth for the picker UI. RGB is
// derived from HSV when the user drags / types; the modelValue
// watcher syncs back from external RGB changes without clobbering the
// last-known hue when the colour happens to be grayscale.
const internalH = ref(0); // 0..360
const internalS = ref(0); // 0..1
const internalV = ref(0); // 0..1

// Hex input keeps its own draft string so the user can type "f" and
// see "f" rather than the partial value getting clobbered mid-typing.
const hexDraft = ref("");

// Track the RGB we most recently emitted so the modelValue watcher can
// tell echoes from external changes (eyedropper, swatch click etc).
let lastEmitted: Rgba | null = null;

const hueBg = computed(() => `hsl(${internalH.value}, 100%, 50%)`);

const rgbHex = computed(() => {
    return rgbToCssHex(
        props.modelValue[0],
        props.modelValue[1],
        props.modelValue[2],
    );
});

function rgbToCssHex(r: number, g: number, b: number): string {
    const h = (n: number) => clamp255(n).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

function clamp255(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHsv(
    r: number,
    g: number,
    b: number,
): { h: number; s: number; v: number } {
    const rN = r / 255;
    const gN = g / 255;
    const bN = b / 255;
    const max = Math.max(rN, gN, bN);
    const min = Math.min(rN, gN, bN);
    const v = max;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d !== 0) {
        if (max === rN) h = ((gN - bN) / d) % 6;
        else if (max === gN) h = (bN - rN) / d + 2;
        else h = (rN - gN) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s, v };
}

function hsvToRgb(
    h: number,
    s: number,
    v: number,
): { r: number; g: number; b: number } {
    const c = v * s;
    const hh = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (hh < 1) {
        r1 = c;
        g1 = x;
    } else if (hh < 2) {
        r1 = x;
        g1 = c;
    } else if (hh < 3) {
        g1 = c;
        b1 = x;
    } else if (hh < 4) {
        g1 = x;
        b1 = c;
    } else if (hh < 5) {
        r1 = x;
        b1 = c;
    } else {
        r1 = c;
        b1 = x;
    }
    const m = v - c;
    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    };
}

function syncFromModel(value: Rgba): void {
    const { h, s, v } = rgbToHsv(value[0], value[1], value[2]);
    // Only update hue when the model has actual chroma; for grayscale
    // colours hue is mathematically undefined and we keep whatever the
    // user last picked so the SV square does not snap to red.
    if (s > 0) internalH.value = h;
    internalS.value = s;
    internalV.value = v;
    hexDraft.value = rgbToCssHex(value[0], value[1], value[2]).slice(1);
}

watch(
    () => props.modelValue,
    (value) => {
        if (
            lastEmitted &&
            lastEmitted[0] === value[0] &&
            lastEmitted[1] === value[1] &&
            lastEmitted[2] === value[2] &&
            lastEmitted[3] === value[3]
        ) {
            // Our own echo - ignore.
            return;
        }
        syncFromModel(value);
    },
    { immediate: true },
);

function commit(h: number, s: number, v: number): void {
    internalH.value = h;
    internalS.value = s;
    internalV.value = v;
    const { r, g, b } = hsvToRgb(h, s, v);
    const out: Rgba = [r, g, b, 255];
    lastEmitted = out;
    hexDraft.value = rgbToCssHex(r, g, b).slice(1);
    emit("update:modelValue", out);
}

function emitRgb(r: number, g: number, b: number): void {
    const out: Rgba = [clamp255(r), clamp255(g), clamp255(b), 255];
    lastEmitted = out;
    // Re-derive HSV ourselves so the SV/hue markers track instantly,
    // without waiting for the parent's prop update to round-trip.
    const { h, s, v } = rgbToHsv(out[0], out[1], out[2]);
    if (s > 0) internalH.value = h;
    internalS.value = s;
    internalV.value = v;
    hexDraft.value = rgbToCssHex(out[0], out[1], out[2]).slice(1);
    emit("update:modelValue", out);
}

// --- SV square drag handling ---

let svDragging = false;

function onSvDown(e: PointerEvent): void {
    if (props.disabled) return;
    svDragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateSv(e);
}

function onSvMove(e: PointerEvent): void {
    if (!svDragging) return;
    updateSv(e);
}

function onSvUp(e: PointerEvent): void {
    if (!svDragging) return;
    svDragging = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
}

function updateSv(e: PointerEvent): void {
    const el = svEl.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const s = rect.width > 0 ? x / rect.width : 0;
    const v = rect.height > 0 ? 1 - y / rect.height : 0;
    commit(internalH.value, s, v);
}

// --- Hue slider drag handling ---

let hueDragging = false;

function onHueDown(e: PointerEvent): void {
    if (props.disabled) return;
    hueDragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateHue(e);
}

function onHueMove(e: PointerEvent): void {
    if (!hueDragging) return;
    updateHue(e);
}

function onHueUp(e: PointerEvent): void {
    if (!hueDragging) return;
    hueDragging = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
}

function updateHue(e: PointerEvent): void {
    const el = hueEl.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const h = rect.height > 0 ? (y / rect.height) * 360 : 0;
    commit(h, internalS.value, internalV.value);
}

// --- RGB inputs ---

function onRgbInput(channel: 0 | 1 | 2, e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    const clamped = clamp255(n);
    const r = channel === 0 ? clamped : props.modelValue[0];
    const g = channel === 1 ? clamped : props.modelValue[1];
    const b = channel === 2 ? clamped : props.modelValue[2];
    emitRgb(r, g, b);
}

// --- Hex input ---

function onHexInput(e: Event): void {
    // Keep the draft in sync with user typing without committing.
    // Strip leading # if pasted, lowercase for stability.
    hexDraft.value = (e.target as HTMLInputElement).value
        .replace(/^#/, "")
        .toLowerCase()
        .slice(0, 6);
}

function onHexBlur(): void {
    onHexCommit();
}

function onHexCommit(): void {
    const m = /^([0-9a-f]{6})$/i.exec(hexDraft.value);
    if (!m) {
        // Revert to the current model value's hex.
        hexDraft.value = rgbToCssHex(
            props.modelValue[0],
            props.modelValue[1],
            props.modelValue[2],
        ).slice(1);
        return;
    }
    const hex = m[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    emitRgb(r, g, b);
}
</script>

<style lang="scss" scoped>
.colour-picker {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    &__main {
        display: flex;
        align-items: stretch;
        gap: 0.75rem;
    }

    &__sv {
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
        aspect-ratio: 4 / 3;
        cursor: crosshair;
        background:
            linear-gradient(to top, #000, transparent),
            linear-gradient(to right, #fff, transparent),
            var(--hue-bg, #f00);
        border: 2px solid #111;
        touch-action: none;
        image-rendering: auto;

        &--disabled {
            pointer-events: none;
            opacity: 0.5;
        }
    }

    &__sv-marker {
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px #000;
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    &__hue {
        position: relative;
        flex: 0 0 1.5rem;
        width: 1.5rem;
        cursor: ns-resize;
        background: linear-gradient(
            to bottom,
            hsl(0, 100%, 50%) 0%,
            hsl(60, 100%, 50%) 16.66%,
            hsl(120, 100%, 50%) 33.33%,
            hsl(180, 100%, 50%) 50%,
            hsl(240, 100%, 50%) 66.66%,
            hsl(300, 100%, 50%) 83.33%,
            hsl(360, 100%, 50%) 100%
        );
        border: 2px solid #111;
        touch-action: none;

        &--disabled {
            pointer-events: none;
            opacity: 0.5;
        }
    }

    &__hue-marker {
        position: absolute;
        left: -2px;
        right: -2px;
        height: 4px;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 0 0 1px #000;
        transform: translateY(-50%);
        pointer-events: none;
    }

    &__rgb {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 0 0 auto;
        min-width: 0;
        width: 6rem;
    }

    &__field {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        min-width: 0;

        > span {
            font-size: 0.85rem;
            letter-spacing: 0.5px;
        }

        input {
            flex: 1 1 0;
            min-width: 0;
            width: 4em;
            text-align: left;
            font-variant-numeric: tabular-nums;
            padding: 0.15em 0.25em;
        }
    }

    &__hex {
        margin-top: 0.1rem;
        font-size: 2rem;

        input {
            text-transform: lowercase;
            letter-spacing: 0.1em;
            text-align: left;
            padding-left: 0.4em;
        }
    }
}
</style>
