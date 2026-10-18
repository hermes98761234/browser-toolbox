// Typing tutor logic: lessons by keyboard row, drill generation, WPM/accuracy and per-key error stats.

export const KEY_ROWS: string[][] = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
]
/** Row indent in key widths (as on a staggered keyboard). */
export const ROW_OFFSET = [0, 0.5, 0.75, 1.25]

/** Finger for each key (0 = left pinky … 3 = left index, 4 = right index … 7 = right pinky). */
export function fingerOf(k: string): number {
  const cols: Record<string, number> = {}
  KEY_ROWS.forEach((row, r) => row.forEach((c, i) => (cols[c] = i - (r === 0 ? 1 : 0))))
  const i = cols[k.toLowerCase()]
  if (i === undefined) return -1
  const map = [0, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 7, 7]
  return map[Math.max(0, i)]
}

export interface Lesson { id: string; name: string; keys: string; note: string }

export const LESSONS: Lesson[] = [
  { id: 'home1', name: 'Home row: F J D K', keys: 'fjdk', note: 'Rest your index fingers on the bumps of F and J.' },
  { id: 'home2', name: 'Home row: all', keys: 'asdfghjkl;', note: 'Every finger stays on its home key; reach only for G and H.' },
  { id: 'top1', name: 'Top row + home', keys: 'asdfghjklqwertyuiop', note: 'Reach up from the home row and come straight back.' },
  { id: 'bottom1', name: 'Bottom row + home', keys: 'asdfghjklzxcvbnm', note: 'Curl the fingers down; keep the wrists still.' },
  { id: 'letters', name: 'All letters', keys: 'abcdefghijklmnopqrstuvwxyz', note: 'Real words using the whole alphabet.' },
  { id: 'caps', name: 'Capitals & punctuation', keys: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,;\'?!', note: 'Use the opposite hand’s Shift key for capitals.' },
  { id: 'numbers', name: 'Number row', keys: '0123456789', note: 'Reach up two rows; glance less, trust the stretch.' },
]

/** Original word list (common English words) used to build drills. */
export const WORDS =
  'a ad add ads aid all ash ask fad fall fast flag flask glad gas had hall has jag lad lag lash sad salad dash ' +
  'sash shall slag slash fjord kid did dig dial fig fish gild hid his kiss lid silk ski skid aside ideas ' +
  'the to of and in is it for on you that with was as are be this have from or one had by word but not what ' +
  'all were we when your can said there use each which she do how their if will up other about out many then ' +
  'them these so some her would make like him into time has look two more write go see number no way could ' +
  'people my than first water been call who oil its now find long down day did get come made may part over ' +
  'new sound take only little work know place year live me back give most very after thing our just name good ' +
  'sentence man think say great where help through much before line right too mean old any same tell boy ' +
  'follow came want show also around form three small set put end does another well large must big even such ' +
  'because turn here why ask went men read need land different home us move try kind hand picture again change ' +
  'off play spell air away animal house point page letter mother answer found study still learn should world ' +
  'quiet quick jump zero zone joke jazz box fox wax vex lazy cozy puzzle quote equal major object value voice ' +
  'river table tower sweet street paper pepper quality pottery tripod yeti trip wiry proper typewriter ' +
  'zinc civic convex mix exam banner number common combine cabin vivid'

export const CUSTOM_SAMPLE =
  'Morning light crept over the harbour while the bakers pulled the first trays from their ovens. ' +
  'A cyclist waved at the ferry crew, and somewhere a kettle began to whistle. Small habits, practised daily, ' +
  'turn clumsy fingers into calm and steady ones.'

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const uniqWords = [...new Set(WORDS.split(/\s+/).filter(Boolean))]

/** Words that use only the allowed (lower-case) keys. */
export function wordsFor(keys: string): string[] {
  const set = new Set(keys.toLowerCase())
  return uniqWords.filter((w) => [...w].every((c) => set.has(c)))
}

/**
 * Builds a drill of about `count` words for a lesson. Uses real words when at least 8 fit,
 * otherwise synthesises 2–5 letter groups. `focus` keys (weak keys) are favoured.
 */
export function makeDrill(lesson: Lesson, count: number, seed: number, focus: string[] = []): string {
  const r = rng(seed)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]
  if (/^[0-9]+$/.test(lesson.keys)) {
    return Array.from({ length: count }, () => Array.from({ length: 2 + Math.floor(r() * 3) }, () => pick([...lesson.keys])).join('')).join(' ')
  }
  const lower = lesson.keys.replace(/[^a-z;]/g, '')
  const pool = wordsFor(lower)
  const fset = new Set(focus.map((f) => f.toLowerCase()))
  const weighted = fset.size ? [...pool, ...pool.filter((w) => [...w].some((c) => fset.has(c)))] : pool
  const letters = [...new Set(lower.replace(';', ''))]
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    let w: string
    if (pool.length >= 8 && r() < 0.8) w = pick(weighted)
    else w = Array.from({ length: 2 + Math.floor(r() * 4) }, () => (fset.size && r() < 0.4 ? pick([...fset].filter((c) => letters.includes(c)).concat(letters)) : pick(letters))).join('')
    if (lesson.id === 'caps') {
      if (i === 0 || /[.?!]$/.test(out[i - 1] ?? '') || r() < 0.12) w = w[0].toUpperCase() + w.slice(1)
      if (r() < 0.18) w += pick(['.', ',', ';', '?', '!'])
      if (r() < 0.05) w = `'${w}'`
    }
    out.push(w)
  }
  return out.join(' ')
}

export interface Stroke { expected: string; typed: string; t: number }

export interface Result {
  chars: number
  correct: number
  keystrokes: number
  errors: number
  ms: number
  wpm: number
  rawWpm: number
  accuracy: number
}

/** Net WPM = correct characters / 5 per minute; raw WPM counts every typed character; accuracy = correct keystrokes / all keystrokes. */
export function score(strokes: Stroke[], finalTyped: string, target: string): Result {
  const ms = strokes.length > 1 ? strokes[strokes.length - 1].t - strokes[0].t : 0
  const minutes = ms / 60000
  let correct = 0
  for (let i = 0; i < finalTyped.length; i++) if (finalTyped[i] === target[i]) correct++
  const errors = strokes.filter((s) => s.typed !== s.expected).length
  const keystrokes = strokes.length
  return {
    chars: finalTyped.length,
    correct,
    keystrokes,
    errors,
    ms,
    wpm: minutes > 0 ? correct / 5 / minutes : 0,
    rawWpm: minutes > 0 ? finalTyped.length / 5 / minutes : 0,
    accuracy: keystrokes ? (keystrokes - errors) / keystrokes : 1,
  }
}

export type KeyStats = Record<string, { n: number; err: number }>

/** Adds strokes to the per-key tally (keyed by the expected key, lower case; space as ' '). */
export function tally(prev: KeyStats, strokes: Stroke[]): KeyStats {
  const out: KeyStats = { ...prev }
  for (const s of strokes) {
    const k = s.expected.toLowerCase()
    const cur = out[k] ?? { n: 0, err: 0 }
    out[k] = { n: cur.n + 1, err: cur.err + (s.typed === s.expected ? 0 : 1) }
  }
  return out
}

/** Keys with the highest error rate (Laplace-smoothed so rarely seen keys don't dominate). */
export function weakKeys(st: KeyStats, n = 5): { key: string; rate: number; n: number }[] {
  return Object.entries(st)
    .filter(([k, v]) => k.trim() && v.n >= 3)
    .map(([key, v]) => ({ key, n: v.n, rate: (v.err + 0.5) / (v.n + 2) }))
    .filter((x) => x.rate > 0.06)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, n)
}
