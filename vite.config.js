/*
export default {
    base: "./",
    build: {
        assetsInlineLimit: 0,
    },
};
*/

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: "./",
  build: {
    assetsInlineLimit: 0,
  },
})
