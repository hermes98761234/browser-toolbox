// Music theory for the fretboard scale explorer: pitch classes, scale formulas, spelling, tunings.

export const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
/** Keys conventionally spelled with flats. */
const FLAT_KEYS = new Set([5, 10, 3, 8, 1, 6]) // F Bb Eb Ab Db Gb

export const INTERVALS = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7']

export interface Scale { name: string; steps: number[]; group: string }

export const SCALES: Scale[] = [
  { name: 'Major (Ionian)', steps: [0, 2, 4, 5, 7, 9, 11], group: 'Modes' },
  { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10], group: 'Modes' },
  { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10], group: 'Modes' },
  { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11], group: 'Modes' },
  { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10], group: 'Modes' },
  { name: 'Natural minor (Aeolian)', steps: [0, 2, 3, 5, 7, 8, 10], group: 'Modes' },
  { name: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10], group: 'Modes' },
  { name: 'Major pentatonic', steps: [0, 2, 4, 7, 9], group: 'Pentatonic & blues' },
  { name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10], group: 'Pentatonic & blues' },
  { name: 'Blues', steps: [0, 3, 5, 6, 7, 10], group: 'Pentatonic & blues' },
  { name: 'Major blues', steps: [0, 2, 3, 4, 7, 9], group: 'Pentatonic & blues' },
  { name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11], group: 'Minor family' },
  { name: 'Melodic minor', steps: [0, 2, 3, 5, 7, 9, 11], group: 'Minor family' },
  { name: 'Phrygian dominant', steps: [0, 1, 4, 5, 7, 8, 10], group: 'Minor family' },
  { name: 'Lydian dominant', steps: [0, 2, 4, 6, 7, 9, 10], group: 'Minor family' },
  { name: 'Altered (super Locrian)', steps: [0, 1, 3, 4, 6, 8, 10], group: 'Minor family' },
  { name: 'Whole tone', steps: [0, 2, 4, 6, 8, 10], group: 'Symmetric' },
  { name: 'Diminished (W-H)', steps: [0, 2, 3, 5, 6, 8, 9, 11], group: 'Symmetric' },
  { name: 'Diminished (H-W)', steps: [0, 1, 3, 4, 6, 7, 9, 10], group: 'Symmetric' },
  { name: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], group: 'Symmetric' },
  { name: 'Hungarian minor', steps: [0, 2, 3, 6, 7, 8, 11], group: 'World' },
  { name: 'Double harmonic', steps: [0, 1, 4, 5, 7, 8, 11], group: 'World' },
  { name: 'Hirajoshi', steps: [0, 2, 3, 7, 8], group: 'World' },
  { name: 'In-sen', steps: [0, 1, 5, 7, 10], group: 'World' },
]

/** Tunings as MIDI note numbers, lowest string first. */
export const TUNINGS: { name: string; notes: number[] }[] = [
  { name: 'Guitar standard (EADGBE)', notes: [40, 45, 50, 55, 59, 64] },
  { name: 'Drop D (DADGBE)', notes: [38, 45, 50, 55, 59, 64] },
  { name: 'DADGAD', notes: [38, 45, 50, 55, 57, 62] },
  { name: 'Open G (DGDGBD)', notes: [38, 43, 50, 55, 59, 62] },
  { name: 'Open D (DADF#AD)', notes: [38, 45, 50, 54, 57, 62] },
  { name: 'Half step down (Eb)', notes: [39, 44, 49, 54, 58, 63] },
  { name: '7-string (BEADGBE)', notes: [35, 40, 45, 50, 55, 59, 64] },
  { name: 'Bass 4 (EADG)', notes: [28, 33, 38, 43] },
  { name: 'Bass 5 (BEADG)', notes: [23, 28, 33, 38, 43] },
  { name: 'Ukulele (GCEA)', notes: [67, 60, 64, 69] },
  { name: 'Mandolin (GDAE)', notes: [55, 62, 69, 76] },
  { name: 'Banjo open G (gDGBD)', notes: [67, 50, 55, 59, 62] },
]

export const pc = (n: number) => ((n % 12) + 12) % 12
export const midiToFreq = (m: number, a4 = 440) => a4 * 2 ** ((m - 69) / 12)
export const noteName = (m: number, flats = false) => `${(flats ? FLATS : SHARPS)[pc(m)]}${Math.floor(m / 12) - 1}`

/** Parses "E2", "F#3", "Bb1" → MIDI. */
export function parseNote(s: string): number | null {
  const m = /^\s*([A-Ga-g])([#b]?)(-?\d)\s*$/.exec(s)
  if (!m) return null
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase() as 'C']
  return (Number(m[3]) + 1) * 12 + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}

/** Spells a 7-note scale with one letter per degree (e.g. F major → Bb, not A#); other scales use key preference. */
export function spell(root: number, steps: number[]): string[] {
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const nat = [0, 2, 4, 5, 7, 9, 11]
  const rootName = (FLAT_KEYS.has(pc(root)) ? FLATS : SHARPS)[pc(root)]
  if (steps.length === 7) {
    const li = letters.indexOf(rootName[0])
    const out = steps.map((st, i) => {
      const L = (li + i) % 7
      let d = pc(root + st) - nat[L]
      if (d > 6) d -= 12
      if (d < -6) d += 12
      return letters[L] + (d > 0 ? '#'.repeat(d) : 'b'.repeat(-d))
    })
    if (out.every((n) => n.length <= 2)) return out
  }
  const names = FLAT_KEYS.has(pc(root)) || /b/.test(rootName) ? FLATS : SHARPS
  return steps.map((st) => names[pc(root + st)])
}

/** Diatonic triads for 7-note scales: roman numeral + quality. */
export function triads(root: number, steps: number[]): { roman: string; name: string; quality: string }[] {
  if (steps.length !== 7) return []
  const names = spell(root, steps)
  const R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  return steps.map((st, i) => {
    const third = pc(steps[(i + 2) % 7] - st), fifth = pc(steps[(i + 4) % 7] - st)
    const q = third === 4 && fifth === 7 ? 'maj' : third === 3 && fifth === 7 ? 'min' : third === 3 && fifth === 6 ? 'dim' : third === 4 && fifth === 8 ? 'aug' : '?'
    const roman = q === 'maj' || q === 'aug' ? R[i] : R[i].toLowerCase()
    return { roman: roman + (q === 'dim' ? '°' : q === 'aug' ? '+' : ''), name: names[i] + (q === 'min' ? 'm' : q === 'dim' ? 'dim' : q === 'aug' ? 'aug' : ''), quality: q }
  })
}
