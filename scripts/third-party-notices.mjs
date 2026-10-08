#!/usr/bin/env node
// Writes THIRD-PARTY-NOTICES.txt: the licence of every piece of other people's
// software that ships inside Locker Manager. Run by `npm run build`, after
// electron-vite, and shipped beside the app (electron-builder.yml extraResources).
//
// What ships, and where this script finds it:
//   - Main-process packages: every package in package-lock.json not marked "dev".
//     electron-builder copies exactly these into the app's node_modules.
//   - Window (renderer) packages: Vite bundles their code into out/renderer. The
//     renderer build records which packages it used in out/notices/renderer-packages.json
//     (plugin in electron.vite.config.ts).
//   - Window fonts: the @fontsource packages imported by src/renderer/src/styles.css.
//   - Label and letter fonts: resources/fonts (Arimo, with its OFL text).
//   - Electron itself (MIT), and Chromium, whose licences ship as LICENSES.chromium.html.
//
//   node scripts/third-party-notices.mjs [--root <dir>] [--out <file>] [--renderer <json>]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Notes for packages whose licence needs a word of explanation. */
const SPECIAL = {
  jszip:
    'jszip is offered under a choice of the MIT licence or GPL version 3 or later. ' +
    'Locker Manager uses it under the MIT licence.',
  buffers:
    'This package (by James Halliday, 2010-2011) states no licence: there is no licence ' +
    'field and no licence file. It is pulled in by exceljs > unzipper > binary and is ' +
    "used only by exceljs's streaming workbook reader, which Locker Manager does not call. " +
    "The author's other packages of the same period, including binary, are MIT."
}

const LICENCE_FILE = /^(licen[cs]e|copying|unlicen[cs]e)(\.|-|$)/i

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function licenceField(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ')
  }
  return null
}

function repoUrl(pkg) {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  return r ?? pkg.homepage ?? null
}

/** The licence section of a README, for packages that ship no licence file. */
function readmeLicence(dir) {
  const readme = readdirSync(dir).find((f) => /^readme/i.test(f))
  if (!readme) return null
  const lines = readFileSync(join(dir, readme), 'utf8').split(/\r?\n/)
  const start = lines.findIndex((l) => /^(#+\s*|)licen[cs]e\s*$/i.test(l.trim()))
  if (start < 0) return null
  const out = []
  for (const line of lines.slice(start + 1)) {
    if (/^#+\s/.test(line) || /^[=-]{3,}\s*$/.test(line)) {
      if (out.some((l) => l.trim())) break
      continue
    }
    out.push(line)
    if (out.length > 40) break
  }
  const text = out.join('\n').trim()
  return text ? text : null
}

function licenceTexts(dir) {
  return readdirSync(dir)
    .filter((f) => LICENCE_FILE.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8').trim())
}

function packageEntry(root, relDir) {
  const dir = join(root, relDir)
  const pkg = readJson(join(dir, 'package.json'))
  const texts = licenceTexts(dir)
  return {
    name: pkg.name,
    version: pkg.version,
    licence: licenceField(pkg),
    source: repoUrl(pkg),
    texts,
    readme: texts.length === 0 ? readmeLicence(dir) : null
  }
}

/** Package folders (relative, forward slashes) that electron-builder ships in node_modules. */
export function productionPackageDirs(root) {
  const lock = readJson(join(root, 'package-lock.json'))
  return Object.entries(lock.packages)
    .filter(([path, info]) => path !== '' && !info.dev && !info.devOptional && !info.link)
    .map(([path]) => path)
    .filter((path) => existsSync(join(root, path, 'package.json')))
    .sort()
}

/** Packages the window's stylesheet imports: Tailwind CSS and the @fontsource fonts. */
function stylesheetPackageDirs(root) {
  const css = readFileSync(join(root, 'src/renderer/src/styles.css'), 'utf8')
  const dirs = new Set()
  for (const m of css.matchAll(/@import\s+['"]((?:@[^/'"]+\/)?[^/'".][^/'"]*)/g)) {
    dirs.add(`node_modules/${m[1]}`)
  }
  return [...dirs].sort()
}

function block(entry) {
  const lines = [entry.version ? `${entry.name} ${entry.version}` : entry.name]
  lines.push(`Licence: ${entry.licence ?? 'none stated'}`)
  if (entry.source) lines.push(`Source: ${entry.source}`)
  if (SPECIAL[entry.name]) lines.push('', SPECIAL[entry.name])
  if (entry.texts.length > 0) {
    for (const t of entry.texts) lines.push('', t)
  } else if (entry.readme) {
    lines.push('', '(No licence file in the package. From its README:)', '', entry.readme)
  } else if (!SPECIAL[entry.name]) {
    lines.push('', `(No licence file in the package. Its package.json says: ${entry.licence}.)`)
  }
  return lines.join('\n')
}

const RULE = '='.repeat(78)
const THIN = '-'.repeat(78)

function section(title, intro, entries) {
  const parts = [RULE, title, RULE]
  if (intro) parts.push(intro)
  for (const e of entries) parts.push(THIN, block(e))
  return parts.join('\n\n')
}

/**
 * Builds the notices text.
 * @param {{ root: string, rendererDirs: string[] }} options
 */
export function buildNotices({ root, rendererDirs }) {
  const app = readJson(join(root, 'package.json'))
  const electron = readJson(join(root, 'node_modules/electron/package.json'))
  const mainEntries = productionPackageDirs(root).map((d) => packageEntry(root, d))
  const mainNames = new Set(mainEntries.map((e) => `${e.name}@${e.version}`))
  const seen = new Set()
  const styleDirs = stylesheetPackageDirs(root)
  const fontDirs = styleDirs.filter((d) => d.includes('@fontsource'))
  const rendererEntries = [...rendererDirs, ...styleDirs.filter((d) => !fontDirs.includes(d))]
    .filter((d) => existsSync(join(root, d, 'package.json')))
    .map((d) => packageEntry(root, d))
    .filter((e) => {
      const key = `${e.name}@${e.version}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const fontEntries = fontDirs.map((d) => packageEntry(root, d))

  const unlicensed = [...mainEntries, ...rendererEntries].filter((e) => !e.licence)
  const header = [
    `Locker Manager ${app.version}: third-party software`,
    '',
    'Locker Manager is free software under the MIT licence (see LICENSE in the',
    `source code, ${app.homepage}).`,
    'It is built with the software listed below, each under its own licence. Every',
    'stated licence here allows the software to be shared with Locker Manager.',
    ...unlicensed.map((e) => `${e.name} states no licence; the note beside it explains.`),
    'This file is made automatically each time the app is built.',
    '',
    `In this build: Electron ${electron.version}, ${mainEntries.length} packages in the app's`,
    `own folder, ${rendererEntries.length} packages bundled into the window, and`,
    `${fontEntries.length + 1} font families.`
  ].join('\n')

  const electronEntry = {
    name: 'Electron',
    version: electron.version,
    licence: 'MIT',
    source: 'https://github.com/electron/electron',
    texts: [readFileSync(join(root, 'node_modules/electron/LICENSE'), 'utf8').trim()],
    readme: null
  }
  const chromiumNote = [
    'Chromium, Node.js and the other projects inside Electron',
    '',
    'Electron contains Chromium and Node.js. Their licences, and those of the many',
    'projects they include (among them FFmpeg under the LGPL as a separate library),',
    'are in the file LICENSES.chromium.html that ships with this app. Open it from',
    'About, Third-party software, "Chromium licences".'
  ].join('\n')

  const arimoEntry = {
    name: 'Arimo (labels and letters)',
    version: '',
    licence: 'SIL Open Font License 1.1',
    source: 'https://fonts.google.com/specimen/Arimo',
    texts: [readFileSync(join(root, 'resources/fonts/OFL-Arimo.txt'), 'utf8').trim()],
    readme: null
  }

  return (
    [
      header,
      section('ELECTRON AND CHROMIUM', null, [electronEntry]) +
        '\n\n' +
        THIN +
        '\n\n' +
        chromiumNote,
      section('FONTS', 'Arimo is used on labels and letters; the others are used on screen.', [
        arimoEntry,
        ...fontEntries
      ]),
      section(
        "PACKAGES IN THE APP'S OWN FOLDER (main process)",
        'These run behind the window: reading and saving files, imports, exports, PDFs and updates.',
        mainEntries
      ),
      section(
        'PACKAGES BUNDLED INTO THE WINDOW',
        'Their code (and, for Tailwind CSS, its style sheet) is combined into the window when the app is built.' +
          (rendererEntries.some((e) => mainNames.has(`${e.name}@${e.version}`))
            ? ' Some also appear in the section above.'
            : ''),
        rendererEntries
      )
    ].join('\n\n') + '\n'
  )
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name, fallback) => {
    const i = args.indexOf(name)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
  }
  const here = dirname(fileURLToPath(import.meta.url))
  const root = resolve(opt('--root', join(here, '..')))
  const rendererJson = resolve(root, opt('--renderer', 'out/notices/renderer-packages.json'))
  const out = resolve(root, opt('--out', 'out/notices/THIRD-PARTY-NOTICES.txt'))
  if (!existsSync(rendererJson)) {
    console.error(`third-party-notices: ${rendererJson} is missing. Run electron-vite build first.`)
    process.exit(1)
  }
  const rendererDirs = readJson(rendererJson)
  const text = buildNotices({ root, rendererDirs })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, text)
  console.log(`third-party-notices: wrote ${out} (${Math.round(text.length / 1024)} kB)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
