import { dirname, join } from 'node:path'

// Where the third-party notices live. Pure, so Vitest covers it.
//
// THIRD-PARTY-NOTICES.txt is made by scripts/third-party-notices.mjs during
// `npm run build` and shipped as a resource (electron-builder.yml). Chromium's
// licences are LICENSES.chromium.html: Windows keeps Electron's copy beside the
// .exe; on a Mac electron-builder removes it, so it is added back as a resource.

export interface NoticePlaces {
  packaged: boolean
  platform: NodeJS.Platform
  resourcesPath: string
  execPath: string
  appPath: string
}

export function noticesPath(p: NoticePlaces): string {
  return p.packaged
    ? join(p.resourcesPath, 'THIRD-PARTY-NOTICES.txt')
    : join(p.appPath, 'out', 'notices', 'THIRD-PARTY-NOTICES.txt')
}

export function chromiumLicencesPath(p: NoticePlaces): string {
  if (!p.packaged) {
    return join(p.appPath, 'node_modules', 'electron', 'dist', 'LICENSES.chromium.html')
  }
  return p.platform === 'darwin'
    ? join(p.resourcesPath, 'LICENSES.chromium.html')
    : join(dirname(p.execPath), 'LICENSES.chromium.html')
}
