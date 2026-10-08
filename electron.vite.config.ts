import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The short Git commit and the build time are stamped into the main process so
// every copy can say exactly which build it is (About, Home, the bottom bar).
// Release builds on GitHub Actions read GITHUB_SHA; local builds ask git.
function buildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}
const buildStamp = {
  __BUILD_COMMIT__: JSON.stringify(buildCommit()),
  __BUILD_DATE__: JSON.stringify(new Date().toISOString())
}

// Records which npm packages the window bundle uses, so
// scripts/third-party-notices.mjs can list their licences (the packages
// themselves do not ship; only their code does, inside out/renderer).
function recordRendererPackages(): Plugin {
  return {
    name: 'record-renderer-packages',
    apply: 'build',
    generateBundle() {
      const dirs = new Set<string>()
      for (const id of this.getModuleIds()) {
        const path = relative(process.cwd(), id.replace(/^\0/, '').split('?')[0] ?? '')
        const parts = path.split(/[\\/]/)
        const last = parts.lastIndexOf('node_modules')
        if (last < 0 || parts.slice(0, last).includes('..')) continue
        const nameParts = parts[last + 1]?.startsWith('@') ? 2 : 1
        dirs.add(parts.slice(0, last + 1 + nameParts).join('/'))
      }
      mkdirSync(resolve('out/notices'), { recursive: true })
      writeFileSync(
        resolve('out/notices/renderer-packages.json'),
        JSON.stringify([...dirs].sort(), null, 2)
      )
    }
  }
}

// Three Vite builds: main (Node, Electron main process), preload (the typed bridge)
// and renderer (React). Dependencies of main and preload are left external and
// loaded from node_modules at runtime; the renderer is fully bundled.
export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    define: buildStamp,
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
    plugins: [react(), tailwindcss(), recordRendererPackages()]
  }
})
