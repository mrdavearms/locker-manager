import { brand } from './brand'

/** The only sites the app will open in the operator's browser. */
export function isAllowedExternalUrl(url: string): boolean {
  let parsed: URL
  let repo: URL
  try {
    parsed = new URL(url)
    repo = new URL(brand.repoUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.host !== repo.host) return false
  const base = repo.pathname.replace(/\/$/, '')
  return parsed.pathname === base || parsed.pathname.startsWith(`${base}/`)
}
