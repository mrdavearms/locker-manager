#!/usr/bin/env node
// Checks a (draft) GitHub Release has every file the updater needs before it is
// published. A missing latest-mac.yml breaks Mac updates silently (SPEC.md 9.1).
//
//   node scripts/verify-release-assets.mjs v0.0.2 [--repo owner/name]
//
// Needs the gh CLI with a token (GH_TOKEN in CI).
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const tag = args.find((a) => !a.startsWith('--')) ?? process.env.GITHUB_REF_NAME
const repoIndex = args.indexOf('--repo')
const repo =
  repoIndex >= 0
    ? args[repoIndex + 1]
    : (process.env.GITHUB_REPOSITORY ?? 'mrdavearms/locker-manager')
if (!tag || !/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) {
  console.error(`Usage: verify-release-assets.mjs vX.Y.Z (got "${tag ?? ''}")`)
  process.exit(2)
}
const version = tag.slice(1)

const gh = (ghArgs) => execFileSync('gh', ghArgs, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })

const release = JSON.parse(
  gh(['release', 'view', tag, '--repo', repo, '--json', 'assets,isDraft,isPrerelease,tagName'])
)
const names = new Set(release.assets.map((a) => a.name))

export const expectedAssets = (v) => [
  `Locker-Manager-Setup-${v}.exe`,
  `Locker-Manager-Setup-${v}.exe.blockmap`,
  'latest.yml',
  `Locker-Manager-${v}-universal.dmg`,
  `Locker-Manager-${v}-universal.zip`,
  `Locker-Manager-${v}-universal.zip.blockmap`,
  'latest-mac.yml'
]

const problems = []
for (const name of expectedAssets(version)) {
  if (!names.has(name)) problems.push(`missing asset: ${name}`)
}

// The manifests must name this version and files that exist on the release.
function checkManifest(name, expectVersion) {
  if (!names.has(name)) return
  const text = gh(['release', 'download', tag, '--repo', repo, '--pattern', name, '--output', '-'])
  const m = /^version:\s*(.+)$/m.exec(text)
  if (!m || m[1].trim() !== expectVersion)
    problems.push(`${name}: version is "${m?.[1]?.trim() ?? '?'}", expected ${expectVersion}`)
  for (const [, file] of text.matchAll(/^\s*(?:-\s*)?(?:url|path):\s*(.+)$/gm)) {
    const f = file.trim()
    if (!names.has(f)) problems.push(`${name} refers to ${f}, which is not on the release`)
  }
}
checkManifest('latest.yml', version)
checkManifest('latest-mac.yml', version)

if (problems.length > 0) {
  console.error(`Release ${tag} on ${repo} is not complete:`)
  for (const p of problems) console.error('  - ' + p)
  console.error('Assets present: ' + [...names].sort().join(', '))
  process.exit(1)
}
console.log(
  `Release ${tag}: all ${expectedAssets(version).length} expected assets present and manifests match (draft=${release.isDraft}, prerelease=${release.isPrerelease}).`
)
