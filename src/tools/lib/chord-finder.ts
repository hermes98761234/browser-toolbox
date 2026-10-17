// Chord theory + fretted-instrument voicing search.

export const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const
const ALIASES: Record<string, number> = { C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 }

/** Chord qualities: [suffix, name, intervals in semitones, optional intervals that may be omitted]. */
export const QUALITIES: [string, string, number[], number[]][] = [
  ['', 'major', [0, 4, 7], []],
  ['m', 'minor', [0, 3, 7], []],
  ['7', 'dominant 7th', [0, 4, 7, 10], [7]],
  ['maj7', 'major 7th', [0, 4, 7, 11], [7]],
  ['m7', 'minor 7th', [0, 3, 7, 10], [7]],
  ['6', 'major 6th', [0, 4, 7, 9], [7]],
  ['m6', 'minor 6th', [0, 3, 7, 9], [7]],
  ['sus2', 'suspended 2nd', [0, 2, 7], []],
  ['sus4', 'suspended 4th', [0, 5, 7], []],
  ['7sus4', '7th suspended 4th', [0, 5, 7, 10], [7]],
  ['dim', 'diminished', [0, 3, 6], []],
  ['dim7', 'diminished 7th', [0, 3, 6, 9], []],
  ['m7b5', 'half-diminished', [0, 3, 6, 10], []],
  ['aug', 'augmented', [0, 4, 8], []],
  ['add9', 'added 9th', [0, 4, 7, 2], [7]],
  ['9', 'dominant 9th', [0, 4, 7, 10, 2], [7]],
  ['maj9', 'major 9th', [0, 4, 7, 11, 2], [7]],
  ['m9', 'minor 9th', [0, 3, 7, 10, 2], [7]],
  ['5', 'power chord', [0, 7], []],
]
const INTERVAL_NAMES = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', '#5', '6', 'b7', '7']
export function intervalName(semi: number, quality: string) {
  if (semi === 2 && /9/.test(quality)) return '9'
  if (semi === 8 && quality === 'aug') return '#5'
  if (semi === 9 && quality === 'dim7') return 'bb7'
  return INTERVAL_NAMES[semi]
}

export function noteIndex(n: string): number | undefined {
  return ALIASES[n.charAt(0).toUpperCase() + n.slice(1)]
}

/** Parses names like "Am7", "F#maj7", "Bbsus4", "C/E". */
export function parseChord(name: string): { root: number; quality: string; bass?: number } | null {
  const m = name.trim().match(/^([A-Ga-g][#b]?)([^/]*)(?:\/([A-Ga-g][#b]?))?$/)
  if (!m) return null
  const root = noteIndex(m[1])
  if (root === undefined) return null
  const raw = m[2].replace('min', 'm').replace(/^M7$|^Δ7?$|^ma7$/, 'maj7').replace(/^-/, 'm').replace(/^\+$/, 'aug').replace('°7', 'dim7').replace('°', 'dim').replace('ø', 'm7b5')
  const q = QUALITIES.find((x) => x[0] === raw)
  if (!q) return null
  const bass = m[3] ? noteIndex(m[3]) : undefined
  return { root, quality: q[0], bass }
}

export function chordTones(root: number, quality: string) {
  const q = QUALITIES.find((x) => x[0] === quality) ?? QUALITIES[0]
  return { pcs: q[2].map((i) => (root + i) % 12), intervals: q[2], optional: q[3].map((i) => (root + i) % 12), name: q[1] }
}

export interface Instrument { id: string; name: string; tuning: number[]; frets: number; rootBass: boolean }
export const INSTRUMENTS: Instrument[] = [
  { id: 'guitar', name: 'Guitar (EADGBE)', tuning: [40, 45, 50, 55, 59, 64], frets: 15, rootBass: true },
  { id: 'dropd', name: 'Guitar drop D', tuning: [38, 45, 50, 55, 59, 64], frets: 15, rootBass: true },
  { id: 'ukulele', name: 'Ukulele (GCEA)', tuning: [67, 60, 64, 69], frets: 12, rootBass: false },
]

/** -1 = muted string. */
export type Voicing = number[]

export function voicingNotes(v: Voicing, tuning: number[]) {
  return v.map((f, i) => (f < 0 ? -1 : tuning[i] + f))
}

function fingers(v: Voicing) {
  const fr = v.filter((f) => f > 0)
  if (!fr.length) return { count: 0, barre: 0 }
  const min = Math.min(...fr)
  const atMin = v.map((f, i) => (f === min ? i : -1)).filter((i) => i >= 0)
  const first = atMin[0], last = atMin[atMin.length - 1]
  // a barre needs every string between its ends to be fretted at or above the barre fret
  const barreOk = atMin.length >= 2 && v.slice(first, last + 1).every((f) => f >= min)
  return { count: barreOk ? fr.length - atMin.length + 1 : fr.length, barre: barreOk ? min : 0 }
}

/** Searches playable voicings, best first. */
export function findVoicings(root: number, quality: string, inst: Instrument, bass?: number, limit = 12): { v: Voicing; score: number; barre: number }[] {
  const { pcs, optional } = chordTones(root, quality)
  const required = pcs.filter((p) => !optional.includes(p))
  const wantBass = bass ?? root
  const n = inst.tuning.length
  const seen = new Set<string>()
  const out: { v: Voicing; score: number; barre: number }[] = []
  for (let pos = 0; pos <= inst.frets - 3; pos++) {
    const cur: number[] = []
    const rec = (s: number) => {
      if (s === n) {
        const played = cur.filter((f) => f >= 0)
        if (played.length < Math.min(n, 3)) return
        // muted strings only at the bass side for guitar; ukulele allows none muted mid-chord either
        const firstPlayed = cur.findIndex((f) => f >= 0)
        if (cur.slice(firstPlayed).some((f) => f < 0)) return
        const fr = played.filter((f) => f > 0)
        if (fr.length && Math.max(...fr) - Math.min(...fr) > 3) return
        if (pos > 0 && !fr.some((f) => f === pos)) return // anchored at window start, avoids duplicates
        const notes = voicingNotes(cur, inst.tuning).filter((x) => x >= 0)
        const set = new Set(notes.map((x) => x % 12))
        if (!required.every((p) => set.has(p))) return
        const low = Math.min(...notes) % 12
        if (inst.rootBass && low !== wantBass) return
        const f = fingers(cur)
        if (f.count > 4) return
        const key = cur.join(',')
        if (seen.has(key)) return
        seen.add(key)
        let score = 0
        score += pos * 2.2 + (fr.length ? Math.max(...fr) - Math.min(...fr) : 0)
        score += (n - played.length) * 3
        score += f.barre ? 2 : 0
        score += f.count
        if (low !== wantBass) score += 6
        if (pcs.some((p) => !set.has(p))) score += 2
        out.push({ v: [...cur], score, barre: f.barre })
        return
      }
      const opts = [-1, 0]
      for (let f = Math.max(1, pos); f <= pos + 3 && f <= inst.frets; f++) opts.push(f)
      for (const f of opts) {
        if (f >= 0 && !pcs.includes((inst.tuning[s] + f) % 12)) continue
        cur.push(f)
        rec(s + 1)
        cur.pop()
      }
    }
    rec(0)
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit)
}

/** Piano voicing: MIDI notes starting from the given octave (root position or inversion). */
export function pianoNotes(root: number, quality: string, inversion = 0, base = 60, bass?: number) {
  const { intervals } = chordTones(root, quality)
  const sorted = intervals.map((i) => (i === 2 && intervals.length > 3 ? 14 : i))
  let notes = sorted.map((i) => base + root + i).sort((a, b) => a - b)
  for (let k = 0; k < inversion % notes.length; k++) notes = [...notes.slice(1), notes[0] + 12].sort((a, b) => a - b)
  if (bass !== undefined) notes = [base - 12 + bass, ...notes]
  return notes
}

export const midiName = (m: number) => NOTES[m % 12] + (Math.floor(m / 12) - 1)
export const midiFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
