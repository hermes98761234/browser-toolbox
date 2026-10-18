// Music theory for the chord progression builder: keys/modes with correct letter spelling,
// diatonic triads and sevenths, a Roman-numeral parser (secondary dominants, borrowed chords,
// Neapolitan), voice leading and a Standard MIDI File writer.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]
export const MODES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
}
export const TONICS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const mod = (n: number, m: number) => ((n % m) + m) % m

export function parseNote(n: string): { letter: number; pc: number } {
  const letter = LETTERS.indexOf(n[0].toUpperCase())
  let acc = 0
  for (const ch of n.slice(1)) acc += ch === '#' || ch === '♯' ? 1 : ch === 'b' || ch === '♭' ? -1 : 0
  return { letter, pc: mod(LETTER_PC[letter] + acc, 12) }
}

/** Spell pitch class `pc` using letter index `letter` (adds ♯/♭ as needed). */
export function spell(pc: number, letter: number): string {
  const l = mod(letter, 7)
  let d = mod(pc - LETTER_PC[l], 12)
  if (d > 6) d -= 12
  const acc = d > 0 ? '♯'.repeat(d) : d < 0 ? '♭'.repeat(-d) : ''
  return LETTERS[l] + (d === 2 ? '𝄪' : d === -2 ? '𝄫' : acc)
}

export interface Key { tonic: string; mode: string }

export function scaleOf(k: Key): { pcs: number[]; letters: number[]; names: string[] } {
  const t = parseNote(k.tonic)
  const steps = MODES[k.mode] ?? MODES.major
  const pcs = steps.map((s) => mod(t.pc + s, 12))
  const letters = steps.map((_, i) => mod(t.letter + i, 7))
  return { pcs, letters, names: pcs.map((p, i) => spell(p, letters[i])) }
}

export type Quality = 'maj' | 'min' | 'dim' | 'aug' | 'maj7' | '7' | 'm7' | 'm7b5' | 'dim7' | 'mMaj7' | 'augMaj7' | 'sus2' | 'sus4'
export const INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], mMaj7: [0, 3, 7, 11], augMaj7: [0, 4, 8, 11],
}
// letter steps for chord tones (thirds), sus chords use 2nd/4th
const LETTER_STEPS: Partial<Record<Quality, number[]>> = { sus2: [0, 1, 4], sus4: [0, 3, 4] }
const SYMBOL: Record<Quality, string> = { maj: '', min: 'm', dim: '°', aug: '+', maj7: 'maj7', '7': '7', m7: 'm7', m7b5: 'm7♭5', dim7: '°7', mMaj7: 'm(maj7)', augMaj7: '+maj7', sus2: 'sus2', sus4: 'sus4' }

function qualityFrom(iv: number[]): Quality {
  const key = iv.join(',')
  const found = (Object.keys(INTERVALS) as Quality[]).find((q) => INTERVALS[q].join(',') === key)
  return found ?? 'maj'
}

export interface Chord {
  roman: string
  root: number // pitch class
  letter: number // letter index of root
  quality: Quality
  fn: 'T' | 'PD' | 'D' | 'other'
  source: 'diatonic' | 'secondary' | 'borrowed' | 'chromatic'
}

export function chordName(c: Chord, inversion = 0): string {
  const base = spell(c.root, c.letter) + SYMBOL[c.quality]
  if (!inversion) return base
  const tones = chordNotes(c)
  return `${base}/${tones[Math.min(inversion, tones.length - 1)]}`
}

export function chordNotes(c: Chord): string[] {
  const iv = INTERVALS[c.quality]
  const ls = LETTER_STEPS[c.quality] ?? [0, 2, 4, 6]
  return iv.map((v, i) => spell(mod(c.root + v, 12), c.letter + ls[i]))
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
function romanFor(deg: number, q: Quality): string {
  const upper = q === 'maj' || q === 'aug' || q === 'maj7' || q === '7' || q === 'augMaj7' || q === 'sus2' || q === 'sus4'
  const r = upper ? ROMAN[deg] : ROMAN[deg].toLowerCase()
  const suf: Record<Quality, string> = { maj: '', min: '', dim: '°', aug: '+', maj7: 'maj7', '7': '7', m7: '7', m7b5: 'ø7', dim7: '°7', mMaj7: 'maj7', augMaj7: '+maj7', sus2: 'sus2', sus4: 'sus4' }
  return r + suf[q]
}

const FUNC = (deg: number): Chord['fn'] => (deg === 0 || deg === 2 || deg === 5 ? 'T' : deg === 1 || deg === 3 ? 'PD' : 'D')

/** Diatonic chord on scale degree (0-based) — triad or seventh, by stacking scale thirds. */
export function diatonic(k: Key, deg: number, seventh: boolean): Chord {
  const sc = scaleOf(k)
  const n = seventh ? 4 : 3
  const pcs = Array.from({ length: n }, (_, i) => sc.pcs[(deg + 2 * i) % 7])
  const iv = pcs.map((p) => mod(p - pcs[0], 12))
  const q = qualityFrom(iv)
  return { roman: romanFor(deg, q), root: pcs[0], letter: sc.letters[deg], quality: q, fn: FUNC(deg), source: 'diatonic' }
}

/**
 * Parse a Roman numeral such as "ii", "V7", "viiø7", "bVI", "#iv°", "V7/V", "vii°7/ii", "N6"/"bII".
 * Degrees refer to the current key's scale; a leading ♭/♯ alters the root by a semitone.
 */
export function parseRoman(text: string, k: Key): Chord | null {
  const t = text.trim().replace(/♭/g, 'b').replace(/♯/g, '#')
  if (/^N6?$/.test(t)) {
    const c = parseRoman('bII', k)
    return c && { ...c, roman: 'N', source: 'chromatic', fn: 'PD' }
  }
  const [main, target] = t.split('/')
  const m = /^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|o|ø|\+)?(maj7|M7|7|sus2|sus4)?$/.exec(main)
  if (!m) return null
  const sc = scaleOf(k)
  const deg = ROMAN.indexOf(m[2].toUpperCase())
  const upper = m[2] === m[2].toUpperCase()
  let root: number, letter: number
  let source: Chord['source'] = 'diatonic'
  if (target) {
    const tc = parseRoman(target, k)
    if (!tc || tc.quality === 'dim' || tc.quality === 'm7b5') return null
    root = mod(tc.root + MODES.major[deg], 12)
    letter = mod(tc.letter + deg, 7)
    source = 'secondary'
  } else {
    root = sc.pcs[deg]
    letter = sc.letters[deg]
  }
  if (m[1]) root = mod(root + (m[1] === '#' ? 1 : -1), 12)
  const sym = m[3] ?? ''
  const ext = m[4] ?? ''
  let q: Quality
  if (ext === 'sus2' || ext === 'sus4') q = ext
  else if (sym === 'ø') q = 'm7b5'
  else if (sym === '°' || sym === 'o') q = ext === '7' ? 'dim7' : 'dim'
  else if (sym === '+') q = ext ? 'augMaj7' : 'aug'
  else if (ext === 'maj7' || ext === 'M7') q = upper ? 'maj7' : 'mMaj7'
  else if (ext === '7') q = upper ? '7' : 'm7'
  else q = upper ? 'maj' : 'min'
  if (source === 'diatonic') {
    const pcs = INTERVALS[q].map((v) => mod(root + v, 12))
    const inScale = pcs.every((p) => sc.pcs.includes(p))
    if (!inScale) source = m[1] || isBorrowed(pcs, k) ? 'borrowed' : 'chromatic'
  }
  const fn: Chord['fn'] = target ? 'D' : source === 'diatonic' ? FUNC(deg) : deg === 4 || deg === 6 ? 'D' : deg === 1 || deg === 3 ? 'PD' : 'other'
  const roman = (m[1] ? (m[1] === '#' ? '♯' : '♭') : '') + romanFor(deg, q) + (target ? '/' + target : '')
  return { roman, root, letter, quality: q, fn, source }
}

/** Chord tones are all in the parallel major or minor scale. */
function isBorrowed(pcs: number[], k: Key): boolean {
  const t = parseNote(k.tonic).pc
  return ['major', 'minor', 'harmonic minor'].some((mode) => {
    const sc = MODES[mode].map((s) => mod(t + s, 12))
    return mode !== k.mode && pcs.every((p) => sc.includes(p))
  })
}

/** Palette of useful chords for a key. */
export function palette(k: Key): { group: string; chords: string[] }[] {
  const tri = Array.from({ length: 7 }, (_, d) => diatonic(k, d, false).roman)
  const sev = Array.from({ length: 7 }, (_, d) => diatonic(k, d, true).roman)
  const minorish = k.mode !== 'major' && k.mode !== 'lydian' && k.mode !== 'mixolydian'
  const borrowed = minorish ? ['IV', 'V', 'V7', 'I', 'ii', 'vi'] : ['iv', 'bIII', 'bVI', 'bVII', 'ii°', 'v', 'iv7', 'bII']
  const targets = tri.map((r, d) => ({ r, d })).filter(({ r, d }) => d > 0 && !/°|ø/.test(r)).map(({ r }) => r.replace(/[^IViv]/g, ''))
  return [
    { group: 'Diatonic triads', chords: tri },
    { group: 'Diatonic sevenths', chords: sev },
    { group: 'Secondary dominants', chords: targets.flatMap((t) => [`V7/${t}`]).concat(targets.slice(0, 3).map((t) => `vii°7/${t}`)) },
    { group: minorish ? 'Borrowed from major' : 'Borrowed from minor', chords: borrowed },
    { group: 'Colour', chords: ['N6', 'Isus4', 'Vsus4', 'I+', minorish ? 'i' : 'I'] },
  ]
}

/** MIDI note numbers of a chord in close position near `center`, with optional inversion. */
export function voice(c: Chord, inversion: number, octave = 4): number[] {
  const iv = INTERVALS[c.quality]
  const base = 12 * (octave + 1) + c.root
  const notes = iv.map((v) => base + v)
  for (let i = 0; i < Math.min(inversion, notes.length - 1); i++) notes.push(notes.shift()! + 12)
  return notes
}

/** Choose the inversion/octave whose voicing moves least from `prev` (sum of |Δ| on sorted notes). */
export function smoothVoice(c: Chord, prev: number[] | null, octave = 4): { notes: number[]; inversion: number } {
  if (!prev) return { notes: voice(c, 0, octave), inversion: 0 }
  let best = { notes: voice(c, 0, octave), inversion: 0, cost: Infinity }
  const center = prev.reduce((a, b) => a + b, 0) / prev.length
  for (let inv = 0; inv < INTERVALS[c.quality].length; inv++) {
    for (const o of [octave - 1, octave, octave + 1]) {
      const n = voice(c, inv, o)
      const mean = n.reduce((a, b) => a + b, 0) / n.length
      let cost = Math.abs(mean - center) * 0.5
      const len = Math.max(n.length, prev.length)
      for (let i = 0; i < len; i++) cost += Math.abs((n[Math.min(i, n.length - 1)] ?? 0) - (prev[Math.min(i, prev.length - 1)] ?? 0))
      if (n[0] < 48 || n[n.length - 1] > 84) cost += 50
      if (cost < best.cost) best = { notes: n, inversion: inv, cost }
    }
  }
  return { notes: best.notes, inversion: best.inversion }
}

// ---------- Standard MIDI File (format 0) ----------
export function vlq(n: number): number[] {
  const out = [n & 0x7f]
  n >>= 7
  while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7 }
  return out
}

export interface MidiEvent { tick: number; notes: number[]; dur: number; vel: number; ch: number }

export function writeMidi(events: MidiEvent[], bpm: number, program = 0, tpq = 480): Uint8Array {
  type Raw = { t: number; d: number[]; order: number }
  const raw: Raw[] = []
  for (const e of events) for (const n of e.notes) {
    raw.push({ t: e.tick, d: [0x90 | e.ch, n, e.vel], order: 1 })
    raw.push({ t: e.tick + e.dur, d: [0x80 | e.ch, n, 0], order: 0 })
  }
  raw.sort((a, b) => a.t - b.t || a.order - b.order)
  const us = Math.round(60_000_000 / bpm)
  const track: number[] = [0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8]
  for (const ch of [...new Set(events.map((e) => e.ch))]) track.push(0, 0xc0 | ch, ch === 9 ? 0 : program)
  let last = 0
  for (const r of raw) { track.push(...vlq(r.t - last), ...r.d); last = r.t }
  track.push(0, 0xff, 0x2f, 0)
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (tpq >> 8) & 255, tpq & 255]
  const len = track.length
  return new Uint8Array([...head, 0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...track])
}
