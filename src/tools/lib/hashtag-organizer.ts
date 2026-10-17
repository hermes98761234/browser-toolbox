// Hashtag parsing, validation, formatting and rotation for the Hashtag Organizer.

/** Pulls hashtags out of free text ("#a #b", "a, b", one per line). Dedupes case-insensitively, keeps first spelling. */
export function extractTags(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const hasHash = /#[\p{L}\p{N}_]/u.test(text)
  const parts = hasHash ? [...text.matchAll(/#([\p{L}\p{M}\p{N}_]+)/gu)].map((m) => m[1]) : text.split(/[\s,;]+/)
  for (const p of parts) {
    const t = p.replace(/^#+/, '').replace(/[^\p{L}\p{M}\p{N}_]/gu, '')
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/** Problems that make a tag unusable or unwise. Empty array = fine. */
export function tagIssues(tag: string): string[] {
  const issues: string[] = []
  if (/^\d+$/.test(tag)) issues.push('numbers only — will not link')
  if (tag.length > 100) issues.push('longer than 100 characters')
  if (tag.length < 2) issues.push('too short')
  if (/__/.test(tag)) issues.push('double underscore')
  return issues
}

export type Fmt = 'space' | 'line' | 'dots'
export function formatTags(tags: string[], fmt: Fmt): string {
  const h = tags.map((t) => `#${t}`)
  if (fmt === 'line') return h.join('\n')
  if (fmt === 'dots') return `.\n.\n.\n${h.join(' ')}`
  return h.join(' ')
}

export interface Platform { id: string; name: string; max: number; best: [number, number]; chars?: number }
export const PLATFORMS: Platform[] = [
  { id: 'ig', name: 'Instagram', max: 30, best: [3, 5], chars: 2200 },
  { id: 'tt', name: 'TikTok', max: 100, best: [3, 6], chars: 4000 },
  { id: 'x', name: 'X / Twitter', max: 100, best: [1, 2], chars: 280 },
  { id: 'li', name: 'LinkedIn', max: 100, best: [3, 5], chars: 3000 },
  { id: 'yt', name: 'YouTube', max: 15, best: [3, 5], chars: 5000 },
  { id: 'pin', name: 'Pinterest', max: 20, best: [2, 5], chars: 500 },
  { id: 'fb', name: 'Facebook', max: 100, best: [1, 3], chars: 63206 },
]

/** Counts characters the way most networks do (code points, not UTF-16 units). */
export const charCount = (s: string) => [...s].length

/**
 * Picks `n` tags favouring the least used ones (ties broken by `rand`), so consecutive
 * posts don't repeat the same block. Returns the picked tags in shuffled order.
 */
export function pickRotation(tags: string[], uses: Record<string, number>, n: number, rand: () => number = Math.random): string[] {
  const keyed = tags.map((t) => ({ t, u: uses[t.toLowerCase()] ?? 0, r: rand() }))
  keyed.sort((a, b) => a.u - b.u || a.r - b.r)
  return shuffle(keyed.slice(0, Math.max(0, Math.min(n, tags.length))).map((k) => k.t), rand)
}

export function shuffle<T>(a: T[], rand: () => number = Math.random): T[] {
  const out = a.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Deterministic PRNG for tests and reproducible shuffles. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
