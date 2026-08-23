import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'

// Overlay plugin build: bundle the SFCs into a single ESM file. `vue` is
// aliased to the shared host-bridge shim so the artifact runs on the host's
// Vue runtime (window.__DINOTTY_VUE__) with no bare `vue` specifier.
const sharedBridge = fileURLToPath(new URL('../_shared/host-bridge', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      vue: resolve(sharedBridge, 'vue.ts'),
    },
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/entry.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    outDir: fileURLToPath(new URL('.', import.meta.url)),
    emptyOutDir: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        // Scoped SFC styles land in scoped.css; build-styles.mjs renames the
        // concatenation to styles.css (the file plugin.json ships).
        assetFileNames: 'scoped.css',
      },
    },
  },
})
