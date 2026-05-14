<template>
    <div class="sounds-debug">
        <section class="callout sounds-debug__panel">
            <header class="sounds-debug__header">
                <a href="debug.html" class="button"><i class="icon icon--left"></i> Debug menu</a>
                <h1>Sounds</h1>
            </header>
            <table class="sounds-debug__table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>outerCount</th>
                        <th>middleCount</th>
                        <th>pitch</th>
                        <th>increments</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="sound in sounds.toSorted((a, b) => a.id.localeCompare(b.id))" :key="sound.id">
                        <td>{{ sound.id }}</td>
                        <td>{{ sound.outerCount }}</td>
                        <td>{{ sound.middleCount }}</td>
                        <td>{{ sound.pitch.join(", ") }}</td>
                        <td>{{ sound.increments.join(", ") }}</td>
                        <td>
                            <button class="button button--small" :disabled="playing" @click="play(sound)">Play</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </section>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import soundsData from "../../../assets/data/chaossounds.json";
import { playSound } from "../../gameobjects/chaossounds";
import type { SoundParams } from "../../gameobjects/chaossounds";

interface SoundEntry extends SoundParams {
    id: string;
    address: string;
    calledFrom: string[];
    _note?: string;
}

const sounds = soundsData as SoundEntry[];
const playing = ref(false);

async function play(sound: SoundEntry): Promise<void> {
    playing.value = true;
    try {
        await playSound(sound);
    } catch (e) {
        console.error("Failed to play sound", sound.id, e);
    } finally {
        playing.value = false;
    }
}
</script>

<style lang="scss" scoped>
.sounds-debug {
    min-height: 100vh;
    padding: 1.5rem;
    color: var(--fg-colour);
    text-shadow: var(--text-shadow);

    &__panel {
        h1 {
            margin: 0;
            font-size: 1.75rem;
            color: var(--color-yellow);
        }
    }

    &__header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin: 0 0 1rem;

        a {
            text-decoration: none;
        }
    }

    &__table {
        width: 100%;
        border-collapse: collapse;

        th,
        td {
            padding: 0.4rem 0.75rem;
            text-align: left;
            vertical-align: middle;
        }

        th {
            color: var(--color-cyan);
            font-weight: normal;
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        td {
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            font-family: monospace;
            font-size: 0.95em;
        }

        tbody tr:hover td {
            background: rgba(255, 255, 255, 0.04);
        }
    }
}
</style>
