// Set by electron.vite.config.ts at build time. Absent under Vitest.
declare const __BUILD_COMMIT__: string | undefined
declare const __BUILD_DATE__: string | undefined

/** Short Git commit of this build, for example "ae0f6f8". */
export const buildCommit: string =
  typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unknown'

/** When this build was made (ISO 8601). */
export const buildDate: string =
  typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : new Date(0).toISOString()
