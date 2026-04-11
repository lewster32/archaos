<template>
    <div class="wiz-code-editor">
        <div class="wiz-code-editor__sliders">
            <label for="wiz">Character style</label>
            <SliderControl id="wiz" :min="0" :max="15"
                :model-value="modelCode.wiz"
                @update:model-value="modelCode = { ...modelCode, wiz: $event }"
            />
            <label for="primary">Primary colour</label>
            <SliderControl id="primary" :min="0" :max="35"
                :model-value="modelCode.pri"
                @update:model-value="modelCode = { ...modelCode, pri: $event }"
            />
            <label for="secondary">Secondary colour</label>
            <SliderControl id="secondary" :min="0" :max="35"
                :model-value="modelCode.sec"
                @update:model-value="modelCode = { ...modelCode, sec: $event }"
            />
            <label for="skin">Skin colour</label>
            <SliderControl id="skin" :min="0" :max="9"
                :model-value="modelCode.skin"
                @update:model-value="modelCode = { ...modelCode, skin: $event }"
            />
            <label for="hat">Hat type</label>
            <SliderControl id="hat" :min="0" :max="50"
                :model-value="modelCode.hat"
                @update:model-value="modelCode = { ...modelCode, hat: $event }"
            />
        </div>
        <div class="wiz-code-editor__preview-container">
            <canvas
                ref="canvas"
                class="wiz-code-editor__preview"
                :width="FRAME_W"
                :height="CANVAS_H"
            />
            <input
                type="text"
                v-model="model"
                class="wiz-code-editor__input"
                spellcheck="false"
                minlength="10"
                maxlength="10"
                :class="{
                    'c-green': props.valid,
                    'c-red': !props.valid,
                }"
            />
        </div>
    </div>
</template>
<script setup lang="ts">
import { ref, watch, onMounted, reactive, computed } from "vue";
import SliderControl from "./SliderControl.vue";
import wizardsUrl from "@assets/spritesheets/wizards.png";
import hatsUrl from "@assets/spritesheets/hats.png";
import wizardsJson from "@assets/spritesheets/wizards.json";
const { hatYFix, replaceColors, replaceSkin, searchColors } = wizardsJson;
import { Wizard } from "@archaos/engine";

const props = defineProps<{
    valid?: boolean;
}>();

const FRAME_W = 18;
const FRAME_H = 18;
const HAT_W = 14;
const HAT_H = 14;
const CANVAS_H = 24;

const model = defineModel<string>({ default: Wizard.randomWizCode() });

if (!model.value?.trim()) {
    model.value = Wizard.randomWizCode();
}
const canvas = ref<HTMLCanvasElement | null>(null);

let wizardsImg: HTMLImageElement | null = null;
let hatsImg: HTMLImageElement | null = null;
let imagesLoaded = false;

const modelCode = computed({
    get() {
        const parsed = parseWizCode(model.value ?? "");
        return {
            wiz: parsed?.wiz ?? 0,
            pri: parsed?.pri ?? 0,
            sec: parsed?.sec ?? 0,
            skin: parsed?.skin ?? 0,
            hat: parsed?.hat ?? 0,
        };
    },
    set(newVal) {
        const parsed = parseWizCode(model.value ?? "") ?? {
            wiz: 0,
            pri: 0,
            sec: 0,
            skin: 0,
            hat: 0,
        };
        parsed.wiz = newVal.wiz;
        parsed.pri = newVal.pri;
        parsed.sec = newVal.sec;
        parsed.skin = newVal.skin;
        parsed.hat = newVal.hat;
        model.value = [
            parsed.wiz.toString(16).padStart(2, "0"),
            parsed.pri.toString(16).padStart(2, "0"),
            parsed.sec.toString(16).padStart(2, "0"),
            parsed.skin.toString(16).padStart(2, "0"),
            parsed.hat.toString(16).padStart(2, "0"),
        ].join("");
    },
}); 

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.addEventListener("load", () => resolve(img));
        img.addEventListener("error", reject);
        img.src = url;
    });
}

async function ensureImages() {
    if (imagesLoaded) return;
    [wizardsImg, hatsImg] = await Promise.all([
        loadImage(wizardsUrl),
        loadImage(hatsUrl),
    ]);
    imagesLoaded = true;
}

function parseWizCode(code: string) {
    if (!/^[0-9a-f]{10}$/i.test(code)) return null;
    const s = code.toLowerCase();
    return {
        wiz: Math.min(Number.parseInt(s.slice(0, 2), 16), 15),
        pri: Math.min(Number.parseInt(s.slice(2, 4), 16), 35),
        sec: Math.min(Number.parseInt(s.slice(4, 6), 16), 35),
        skin: Math.min(Number.parseInt(s.slice(6, 8), 16), 9),
        hat: Math.min(Number.parseInt(s.slice(8, 10), 16), 50),
    };
}

function drawFrame(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    frameIndex: number,
    frameW: number,
    frameH: number,
    destX: number,
    destY: number,
) {
    const framesPerRow = Math.floor(img.width / frameW);
    const col = frameIndex % framesPerRow;
    const row = Math.floor(frameIndex / framesPerRow);
    ctx.drawImage(
        img,
        col * frameW,
        row * frameH,
        frameW,
        frameH,
        destX,
        destY,
        frameW,
        frameH,
    );
}

function applyColorReplacements(
    ctx: CanvasRenderingContext2D,
    replacements: [search: number[], replace: number[]][],
) {
    const imgData = ctx.getImageData(0, 0, FRAME_W, CANVAS_H);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] !== 255) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        for (const [search, replace] of replacements) {
            if (
                r === search[0] &&
                g === search[1] &&
                b === search[2]
            ) {
                data[i] = replace[0];
                data[i + 1] = replace[1];
                data[i + 2] = replace[2];
                break;
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

async function render() {
    const el = canvas.value;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, FRAME_W, CANVAS_H);

    const parsed = parseWizCode(model.value ?? "");
    if (!parsed) return;

    await ensureImages();
    if (!wizardsImg || !hatsImg) return;

    const yFix = hatYFix[parsed.wiz] ?? 0;

    // Draw right-facing wizard frame (frame wiz*2) at (0, 5+yFix)
    ctx.imageSmoothingEnabled = false;
    drawFrame(
        ctx,
        wizardsImg,
        parsed.wiz * 2,
        FRAME_W,
        FRAME_H,
        0,
        5 + yFix,
    );

    // Replace wizard colors
    applyColorReplacements(ctx, [
        [searchColors.primaryDark, replaceColors[parsed.pri].dark],
        [searchColors.primaryMid, replaceColors[parsed.pri].mid],
        [searchColors.primaryLight, replaceColors[parsed.pri].light],
        [searchColors.secondaryDark, replaceColors[parsed.sec].dark],
        [searchColors.secondaryMid, replaceColors[parsed.sec].mid],
        [searchColors.secondaryLight, replaceColors[parsed.sec].light],
        [searchColors.skinMid, replaceSkin[parsed.skin].mid],
        [searchColors.skinLight, replaceSkin[parsed.skin].light],
    ]);

    // Draw hat on top
    if (parsed.hat > 0) {
        drawFrame(
            ctx,
            hatsImg,
            parsed.hat * 2,
            HAT_W,
            HAT_H,
            2,
            yFix,
        );
    }
}

onMounted(render);
watch(model, render);
</script>
<style lang="scss" scoped>
.wiz-code-editor {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1em;

    &__preview-container {
        position: relative;
        display: flex;
        align-items: center;
        gap: 1em;
    }

    &__preview {
        image-rendering: pixelated;
        width: calc(18px * 4);
        height: calc(24px * 4);
        margin-inline-end: auto;

        border-style: solid;
        border-width: 6px;
        border-image-width: 6px;
        border-image-slice: 3;
        border-image-repeat: repeat;
        border-image-source: url("@assets/images/ui/callout-hover.png");
        background-color: var(--color-dark-grey);
    }

    &__input {
        width: 14ch;
        font-size: 2rem;
        text-align: center;
        text-transform: uppercase;
    }

    &__sliders {
        margin-block-start: 1rem;
        display: flex;
        flex-direction: column;
        column-gap: 0.5em;
        width: 100%;

        label {
            text-align: center;
        }
    }
}

</style>
