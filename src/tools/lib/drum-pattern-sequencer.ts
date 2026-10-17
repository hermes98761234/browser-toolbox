// Pure timing and pattern logic for the drum sequencer (audio synthesis lives in the component).

export const TRACKS = ['Kick', 'Snare', 'Clap', 'Closed hat', 'Open hat', 'Low tom', 'High tom', 'Rim'] as const
export type Track = (typeof TRACKS)[number]
/** One row per track; each cell 0 = off, 1 = on, 2 = accent. */
export type Pattern = number[][]

/** Length of one step (a 16th note when stepsPerBeat = 4). */
export const stepDur = (bpm: number, stepsPerBeat = 4) => 60 / bpm / stepsPerBeat

/**
 * Start time of step `i` relative to the bar start.
 * Swing (50–75 %) delays every off-beat step: 50 % = straight, 66.7 % = triplet shuffle.
 */
export function stepTime(i: number, bpm: number, swing: number, stepsPerBeat = 4): number {
  const d = stepDur(bpm, stepsPerBeat)
  const pair = Math.floor(i / 2)
  const sw = Math.min(75, Math.max(50, swing)) / 100
  return pair * 2 * d + (i % 2 ? sw * 2 * d : 0)
}

export interface Hit { t: number; track: number; vel: number }

/** All hits for `loops` repetitions of the pattern, sorted by time. */
export function events(p: Pattern, bpm: number, swing: number, loops = 1, mutes: boolean[] = []): Hit[] {
  const steps = p[0]?.length ?? 0
  const bar = steps * stepDur(bpm)
  const out: Hit[] = []
  for (let l = 0; l < loops; l++)
    for (let s = 0; s < steps; s++)
      p.forEach((row, tr) => {
        if (row[s] && !mutes[tr]) out.push({ t: l * bar + stepTime(s, bpm, swing), track: tr, vel: row[s] === 2 ? 1 : 0.7 })
      })
  return out.sort((a, b) => a.t - b.t || a.track - b.track)
}

/** Compact text form: one line per track, x = hit, X = accent, . = rest. */
export const encode = (p: Pattern) => p.map((r) => r.map((v) => (v === 2 ? 'X' : v ? 'x' : '.')).join('')).join('|')

export function decode(s: string, tracks: number = TRACKS.length, steps = 16): Pattern {
  const rows = s.split('|')
  return Array.from({ length: tracks }, (_, i) => {
    const r = rows[i] ?? ''
    return Array.from({ length: steps }, (_, j) => (r[j] === 'X' ? 2 : r[j] === 'x' ? 1 : 0))
  })
}

/** Resize every row to n steps, repeating the existing pattern when growing. */
export function resize(p: Pattern, n: number): Pattern {
  return p.map((r) => Array.from({ length: n }, (_, i) => (r.length ? r[i % r.length] : 0)))
}

export const PRESETS: Record<string, { bpm: number; swing: number; p: string }> = {
  'Rock beat': { bpm: 112, swing: 50, p: 'X.......X.x.....|....X.......X...|................|x.x.x.x.x.x.x.x.|................|................|................|................' },
  'Four on the floor': { bpm: 124, swing: 50, p: 'X...X...X...X...|................|....x.......x...|x.x.x.x.x.x.x.x.|..x...x...x...x.|................|................|................' },
  'Boom bap': { bpm: 90, swing: 62, p: 'X......x..X.....|....X.......X...|................|x.x.x.x.x.x.x.xx|................|................|................|.........x......' },
  'Funky breakbeat': { bpm: 100, swing: 56, p: 'X.x.......x..x..|....X..x.x..X..x|................|x.x.x.x.x.x.x.x.|..............x.|................|................|................' },
  'Trap': { bpm: 140, swing: 50, p: 'X......x..X.....|........X.......|........x.......|x.xxx.x.x.xxx.xx|................|...............x|................|................' },
  'Bossa nova': { bpm: 128, swing: 50, p: 'X..x X..x X..x X..x'.replace(/ /g, '') + '|................|................|x.x.x.x.x.x.x.x.|................|................|................|x..x..x...x..x..' },
  'Reggaeton': { bpm: 96, swing: 50, p: 'X...X...X...X...|...x..x....x..x.|................|x.x.x.x.x.x.x.x.|................|................|................|...x..x....x..x.' },
}
