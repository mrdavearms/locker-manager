import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Three Vite builds: main (Node, Electron main process), preload (the typed bridge)
// and renderer (React). Dependencies of main and preload are left external and
// loaded from node_modules at runtime; the renderer is fully bundled.
export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    // CommonJS output: electron-updater and electron-log are CommonJS packages
    // and their named exports are not reachable from an ES-module main process.
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
        output: { format: 'cjs' }
      }
    }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    // The renderer is sandboxed, and a sandboxed preload must be CommonJS with
    // no runtime imports beyond Electron itself (hence src/shared/channels.ts).
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs' }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
