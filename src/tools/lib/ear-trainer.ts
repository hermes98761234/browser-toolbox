// Ear-training theory: interval / chord / scale tables, question generation and score keeping.

export type Mode = 'interval' | 'chord' | 'scale'
export type Level = 1 | 2 | 3

export interface Item {
  id: string
  name: string
  steps: number[] // semitones from the root (root = 0 included)
  level: Level
}

export const INTERVALS: Item[] = [
  ['m2', 'Minor 2nd', 1, 3], ['M2', 'Major 2nd', 2, 2], ['m3', 'Minor 3rd', 3, 2], ['M3', 'Major 3rd', 4, 1],
  ['P4', 'Perfect 4th', 5, 1], ['TT', 'Tritone', 6, 3], ['P5', 'Perfect 5th', 7, 1], ['m6', 'Minor 6th', 8, 2],
  ['M6', 'Major 6th', 9, 2], ['m7', 'Minor 7th', 10, 3], ['M7', 'Major 7th', 11, 3], ['P8', 'Octave', 12, 1],
].map(([id, name, n, level]) => ({ id: id as string, name: name as string, steps: [0, n as number], level: level as Level }))

export const CHORDS: Item[] = (
  [
    ['maj', 'Major', [0, 4, 7], 1], ['min', 'Minor', [0, 3, 7], 1], ['dim', 'Diminished', [0, 3, 6], 2], ['aug', 'Augmented', [0, 4, 8], 2],
    ['sus4', 'Sus4', [0, 5, 7], 2], ['sus2', 'Sus2', [0, 2, 7], 3], ['maj7', 'Major 7th', [0, 4, 7, 11], 3], ['dom7', 'Dominant 7th', [0, 4, 7, 10], 3],
    ['min7', 'Minor 7th', [0, 3, 7, 10], 3], ['hdim7', 'Half-diminished 7th', [0, 3, 6, 10], 3], ['dim7', 'Diminished 7th', [0, 3, 6, 9], 3],
  ] as const
).map(([id, name, steps, level]) => ({ id, name, steps: [...steps], level: level as Level }))

export const SCALES: Item[] = (
  [
    ['ion', 'Major (Ionian)', [0, 2, 4, 5, 7, 9, 11, 12], 1], ['aeo', 'Natural minor', [0, 2, 3, 5, 7, 8, 10, 12], 1],
    ['harm', 'Harmonic minor', [0, 2, 3, 5, 7, 8, 11, 12], 2], ['mel', 'Melodic minor', [0, 2, 3, 5, 7, 9, 11, 12], 2],
    ['pent', 'Major pentatonic', [0, 2, 4, 7, 9, 12], 2], ['dor', 'Dorian', [0, 2, 3, 5, 7, 9, 10, 12], 3],
    ['phr', 'Phrygian', [0, 1, 3, 5, 7, 8, 10, 12], 3], ['lyd', 'Lydian', [0, 2, 4, 6, 7, 9, 11, 12], 3],
    ['mix', 'Mixolydian', [0, 2, 4, 5, 7, 9, 10, 12], 3], ['loc', 'Locrian', [0, 1, 3, 5, 6, 8, 10, 12], 3],
    ['blues', 'Blues', [0, 3, 5, 6, 7, 10, 12], 3], ['whole', 'Whole tone', [0, 2, 4, 6, 8, 10, 12], 3],
  ] as const
).map(([id, name, steps, level]) => ({ id, name, steps: [...steps], level: level as Level }))

export const TABLE: Record<Mode, Item[]> = { interval: INTERVALS, chord: CHORDS, scale: SCALES }

export const pool = (mode: Mode, level: Level) => TABLE[mode].filter((i) => i.level <= level)

/** Equal temperament, A4 = 440 Hz = MIDI 69. */
export const midiToHz = (m: number, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12)

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
export const noteName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`

export interface Question {
  mode: Mode
  item: Item
  root: number // MIDI
  notes: number[] // MIDI notes in play order
  direction: 'up' | 'down' | 'together'
}

/** Builds a question; `rnd` is injectable for tests. Roots keep every note inside C3..C6. */
export function makeQuestion(mode: Mode, level: Level, dir: 'up' | 'down' | 'together' | 'mixed', rnd = Math.random, avoid?: string, from?: Item[]): Question {
  let items = from?.length ? from : pool(mode, level)
  if (avoid && items.length > 2) items = items.filter((i) => i.id !== avoid)
  const item = items[Math.floor(rnd() * items.length)]
  const span = item.steps[item.steps.length - 1]
  const lo = 48, hi = 84 - span
  const root = lo + Math.floor(rnd() * (hi - lo + 1))
  const d = dir === 'mixed' ? (['up', 'down', 'together'] as const)[Math.floor(rnd() * (mode === 'scale' ? 2 : 3))] : dir
  const direction = mode === 'scale' && d === 'together' ? 'up' : d
  const up = item.steps.map((s) => root + s)
  return { mode, item, root, notes: direction === 'down' ? [...up].reverse() : up, direction }
}

export interface Score {
  right: number
  total: number
}
export type Stats = Record<string, Score> // key `${mode}:${id}`

export function record(stats: Stats, mode: Mode, id: string, ok: boolean): Stats {
  const k = `${mode}:${id}`
  const s = stats[k] ?? { right: 0, total: 0 }
  return { ...stats, [k]: { right: s.right + (ok ? 1 : 0), total: s.total + 1 } }
}

export function totals(stats: Stats, mode?: Mode): Score {
  let right = 0, total = 0
  for (const [k, v] of Object.entries(stats)) {
    if (mode && !k.startsWith(mode + ':')) continue
    right += v.right
    total += v.total
  }
  return { right, total }
}

/** Items sorted weakest first (Laplace-smoothed accuracy), for "practice weak spots". */
export function weakest(stats: Stats, mode: Mode, level: Level): Item[] {
  const acc = (i: Item) => {
    const s = stats[`${mode}:${i.id}`] ?? { right: 0, total: 0 }
    return (s.right + 1) / (s.total + 2)
  }
  return [...pool(mode, level)].sort((a, b) => acc(a) - acc(b))
}
