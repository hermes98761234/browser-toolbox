// Word-level comparison of a target phrase with what the recogniser heard: tokenising,
// fuzzy word similarity (letters + a phonetic key) and a Levenshtein alignment.

export const tokens = (s: string) =>
  s.toLocaleLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}'\s-]/gu, ' ').replace(/-/g, ' ').split(/\s+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean)

export function editDistance(a: string, b: string): number {
  const A = [...a], B = [...b]
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j)
  for (let i = 1; i <= A.length; i++) {
    const cur = [i]
    for (let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[B.length]
}

/** Rough phonetic key (English-leaning): collapses common spellings of the same sound. */
export function phoneKey(w: string): string {
  let s = w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  s = s.replace(/x/g, 'ks').replace(/^kn|^gn|^pn|^wr/, (m) => m[1]).replace(/ph/g, 'f').replace(/ck|q/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k')
    .replace(/dg(?=[eiy])/g, 'j').replace(/th/g, '0').replace(/sch|sh/g, 'X').replace(/z/g, 's').replace(/gh(?![aeiou])/g, '')
    .replace(/wh/g, 'w').replace(/v/g, 'f').replace(/(.)\1+/g, '$1')
  s = s.replace(/X/g, 'x')
  const first = s[0] ?? ''
  return first + s.slice(1).replace(/[aeiouyhw]/g, '')
}

/** 0..1 similarity of two words (1 = identical). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  const d = editDistance(a, b) / Math.max([...a].length, [...b].length, 1)
  const letters = 1 - d
  const pa = phoneKey(a), pb = phoneKey(b)
  const phon = pa && pb ? 1 - editDistance(pa, pb) / Math.max(pa.length, pb.length) : 0
  return Math.max(letters, phon * 0.9)
}

export type Mark = 'ok' | 'close' | 'wrong' | 'missed' | 'extra'
export interface Cell { mark: Mark; target?: string; heard?: string; sim: number }

/** Aligns target and heard word lists; returns per-word marks and a 0..100 score. */
export function compare(target: string, heard: string, closeAt = 0.55): { cells: Cell[]; score: number; counts: Record<Mark, number> } {
  const T = tokens(target), H = tokens(heard)
  const n = T.length, m = H.length
  const cost = (i: number, j: number) => 1 - similarity(T[i], H[j])
  const D: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + cost(i - 1, j - 1) * 1.6)
  const cells: Cell[] = []
  let i = n, j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(D[i][j] - (D[i - 1][j - 1] + cost(i - 1, j - 1) * 1.6)) < 1e-9) {
      const sim = 1 - cost(i - 1, j - 1)
      cells.push({ mark: sim === 1 ? 'ok' : sim >= closeAt ? 'close' : 'wrong', target: T[i - 1], heard: H[j - 1], sim })
      i--; j--
    } else if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) {
      cells.push({ mark: 'missed', target: T[i - 1], sim: 0 })
      i--
    } else {
      cells.push({ mark: 'extra', heard: H[j - 1], sim: 0 })
      j--
    }
  }
  cells.reverse()
  const counts: Record<Mark, number> = { ok: 0, close: 0, wrong: 0, missed: 0, extra: 0 }
  for (const c of cells) counts[c.mark]++
  const credit = cells.reduce((a, c) => a + (c.mark === 'ok' ? 1 : c.mark === 'close' ? 0.3 + 0.4 * c.sim : c.mark === 'wrong' ? 0.15 * c.sim : 0), 0)
  const score = n ? Math.max(0, Math.round((100 * credit) / n - counts.extra * (50 / n))) : 0
  return { cells, score: Math.min(100, score), counts }
}

/** Picks the recognition alternative that best matches the target. */
export function bestAlternative(target: string, alts: string[]): { text: string; score: number } {
  let best = { text: alts[0] ?? '', score: -1 }
  for (const a of alts) {
    const sc = compare(target, a).score
    if (sc > best.score) best = { text: a, score: sc }
  }
  return best
}

/** Simulates a learner's attempt (for the demo mode): swaps a few words for near-misses or drops one. */
export function simulateAttempt(target: string, seed: number): string {
  let x = seed >>> 0 || 7
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296)
  const swaps: [RegExp, string][] = [[/th/, 'd'], [/v/, 'w'], [/w/, 'v'], [/ee/, 'i'], [/i(?=[^aeiou])/, 'ee'], [/r/, 'l'], [/s$/, ''], [/ed$/, ''], [/a/, 'e']]
  return tokens(target).map((w) => {
    const r = rnd()
    if (r < 0.08 && w.length > 3) return ''
    if (r < 0.32) {
      const opts = swaps.filter(([re]) => re.test(w))
      if (opts.length) { const [re, to] = opts[Math.floor(rnd() * opts.length)]; return w.replace(re, to) }
    }
    return w
  }).filter(Boolean).join(' ')
}
