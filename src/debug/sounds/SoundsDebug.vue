<template>
    <div>
        <h1>Sounds</h1>
        <table>
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
                        <button
                            :disabled="playing"
                            @click="play(sound)"
                        >
                            Play
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>
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
