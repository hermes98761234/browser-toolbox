// A compact ABC notation parser (common single-voice subset) + playback timeline + Standard MIDI File writer.

export interface Pitch { step: number; acc: number | null; midi: number }
export interface NoteItem {
  kind: 'note'
  pitches: Pitch[] // empty = rest
  dur: number // in whole notes
  shown: number // notated value (tuplets are drawn at their written value)
  tie: boolean
  beamBreak: boolean
  chord?: string
  tuplet?: { n: number; i: number }
  pos: number // offset in the source text
}
export interface BarItem { kind: 'bar'; type: string; pos: number }
export type Item = NoteItem | BarItem

export interface Tune {
  title: string
  composer: string
  meter: [number, number] | null
  unit: number
  qpm: number
  key: string
  fifths: number
  clef: 'treble' | 'bass'
  items: Item[]
  errors: string[]
}

const LETTERS = 'CDEFGAB'
const SEMI = [0, 2, 4, 5, 7, 9, 11]
const ROOT_FIFTHS: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1 }
const MODES: [RegExp, number][] = [[/^(maj|ion)/, 0], [/^(min|aeo|m(?!ix))/, -3], [/^dor/, -2], [/^phr/, -4], [/^lyd/, 1], [/^mix/, -1], [/^loc/, -5]]

/** Parses an ABC key field. Returns the number of sharps (+) or flats (−), the display name and the clef. */
export function parseKey(v: string): { fifths: number; name: string; clef: 'treble' | 'bass' } {
  const clef = /clef\s*=\s*bass|\bbass\b/i.test(v) ? 'bass' : 'treble'
  const k = v.replace(/clef\s*=\s*\S+|\bbass\b|\btreble\b/gi, '').trim()
  const m = /^([A-Ga-g])([#b]?)\s*([A-Za-z]*)/.exec(k)
  if (!m || /^none/i.test(k)) return { fifths: 0, name: 'C', clef }
  const root = m[1].toUpperCase()
  let f = ROOT_FIFTHS[root] + (m[2] === '#' ? 7 : m[2] === 'b' ? -7 : 0)
  const mode = m[3].toLowerCase()
  const md = MODES.find(([re]) => re.test(mode))
  if (md) f += md[1]
  const label = mode ? (md && md[1] === -3 ? 'minor' : mode.slice(0, 3)) : 'major'
  return { fifths: Math.max(-7, Math.min(7, f)), name: `${root}${m[2].replace('b', '♭').replace('#', '♯')} ${label}`, clef }
}

/** Key-signature accidental for a letter index (0 = C) given fifths. */
export function keyAcc(fifths: number, letter: number): number {
  const sharps = 'FCGDAEB', flats = 'BEADGCF'
  const L = LETTERS[letter]
  if (fifths > 0 && sharps.slice(0, fifths).includes(L)) return 1
  if (fifths < 0 && flats.slice(0, -fifths).includes(L)) return -1
  return 0
}

function parseLen(s: string, i: number): [number, number] {
  const m = /^(\d*)(\/*)(\d*)/.exec(s.slice(i))!
  const n = m[1] ? Number(m[1]) : 1
  let d = 1
  if (m[2]) d = m[3] ? Number(m[3]) * 2 ** (m[2].length - 1) : 2 ** m[2].length
  return [n / d, m[0].length]
}

export function parseAbc(src: string): Tune {
  const t: Tune = { title: '', composer: '', meter: [4, 4], unit: 0, qpm: 120, key: 'C major', fifths: 0, clef: 'treble', items: [], errors: [] }
  let tupletLeft = 0, tupletN = 0, tupletMul = 1, broken = 0
  let barAcc = new Map<number, number>()
  let offset = 0
  for (const raw of src.split('\n')) {
    const lineStart = offset
    offset += raw.length + 1
    const line = raw.replace(/%.*$/, '')
    const hm = /^([A-Za-z]):\s*(.*)$/.exec(line.trim())
    if (hm) {
      const [, f, v] = hm
      if (f === 'T' && !t.title) t.title = v.trim()
      else if (f === 'C') t.composer = v.trim()
      else if (f === 'M') {
        if (/^C\|/.test(v)) t.meter = [2, 2]
        else if (/^C/.test(v)) t.meter = [4, 4]
        else if (/none/i.test(v)) t.meter = null
        else {
          const mm = /(\d+)\s*\/\s*(\d+)/.exec(v)
          if (mm) t.meter = [Number(mm[1]), Number(mm[2])]
        }
      } else if (f === 'L') {
        const mm = /(\d+)\s*\/\s*(\d+)/.exec(v)
        if (mm) t.unit = Number(mm[1]) / Number(mm[2])
      } else if (f === 'Q') {
        const mm = /(?:(\d+)\/(\d+)\s*=\s*)?(\d+)/.exec(v)
        if (mm) t.qpm = Number(mm[3]) * (mm[1] ? Number(mm[1]) / Number(mm[2]) / 0.25 : 1)
      } else if (f === 'K') {
        const k = parseKey(v)
        t.fifths = k.fifths
        t.key = k.name
        t.clef = k.clef
      }
      continue
    }
    if (!t.unit) t.unit = t.meter && t.meter[0] / t.meter[1] < 0.75 ? 1 / 16 : 1 / 8
    const s = line
    let i = 0
    let chord: string | undefined
    let gap = true
    const last = () => {
      for (let k = t.items.length - 1; k >= 0; k--) {
        const it = t.items[k]
        if (it.kind === 'note') return it
        if (it.kind === 'bar') return null
      }
      return null
    }
    const readNote = (): Pitch | null => {
      const m = /^(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)/.exec(s.slice(i))
      if (!m) return null
      i += m[0].length
      const li = LETTERS.indexOf(m[2].toUpperCase())
      let oct = m[2] === m[2].toUpperCase() ? 4 : 5
      for (const c of m[3]) oct += c === "'" ? 1 : -1
      const step = oct * 7 + li
      let acc: number | null = null
      if (m[1]) {
        acc = { '^^': 2, '^': 1, '=': 0, _: -1, __: -2 }[m[1]]!
        barAcc.set(step, acc)
      }
      const eff = barAcc.get(step) ?? keyAcc(t.fifths, li)
      return { step, acc, midi: 12 * (oct + 1) + SEMI[li] + eff }
    }
    const push = (pitches: Pitch[], len: number, pos: number) => {
      let dur = len * t.unit
      if (broken) {
        dur *= broken > 0 ? 0.5 ** broken : 2 - 0.5 ** -broken
        broken = 0
      }
      const shown = dur
      const it: NoteItem = { kind: 'note', pitches, dur, shown, tie: false, beamBreak: gap, chord, pos: lineStart + pos }
      if (tupletLeft > 0) {
        it.dur *= tupletMul
        it.tuplet = { n: tupletN, i: tupletN - tupletLeft }
        tupletLeft--
      }
      chord = undefined
      gap = false
      t.items.push(it)
    }
    while (i < s.length) {
      const c = s[i]
      const pos = i
      if (c === ' ' || c === '\t') { gap = true; i++; continue }
      if (c === '"') {
        const e = s.indexOf('"', i + 1)
        chord = s.slice(i + 1, e < 0 ? s.length : e)
        i = e < 0 ? s.length : e + 1
        continue
      }
      if (c === '!') { const e = s.indexOf('!', i + 1); i = e < 0 ? s.length : e + 1; continue }
      const bar = /^(:\|:|::|:\|\]?|\|:|\|\]|\|\||\[\||\|)\d?/.exec(s.slice(i))
      if (bar) {
        t.items.push({ kind: 'bar', type: bar[1], pos: lineStart + pos })
        barAcc = new Map()
        gap = true
        i += bar[0].length
        continue
      }
      if (c === '[' && /^\[[A-Za-z]:/.test(s.slice(i))) { const e = s.indexOf(']', i); i = e < 0 ? s.length : e + 1; continue }
      if (c === '[') {
        i++
        const ps: Pitch[] = []
        let inner = 1
        while (i < s.length && s[i] !== ']') {
          const p = readNote()
          if (!p) { i++; continue }
          ps.push(p)
          const [l, n] = parseLen(s, i)
          if (ps.length === 1) inner = l
          i += n
        }
        i++
        const [l, n] = parseLen(s, i)
        i += n
        if (ps.length) push(ps.sort((a, b) => a.step - b.step), inner * l, pos)
        continue
      }
      if (c === '(' && /\d/.test(s[i + 1] ?? '')) {
        tupletN = Number(s[i + 1])
        const q = ({ 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 } as Record<number, number>)[tupletN] ?? 2
        tupletMul = q / tupletN
        tupletLeft = tupletN
        i += 2
        continue
      }
      if (c === '-') { const l = last(); if (l) l.tie = true; i++; continue }
      if (c === '>' || c === '<') {
        let k = 0
        while (s[i] === c) { k++; i++ }
        const l = last()
        if (l) {
          l.dur *= c === '>' ? 2 - 0.5 ** k : 0.5 ** k
          l.shown *= c === '>' ? 2 - 0.5 ** k : 0.5 ** k
          broken = c === '>' ? k : -k
        }
        continue
      }
      if (c === 'z' || c === 'x' || c === 'Z') {
        i++
        const [l, n] = parseLen(s, i)
        i += n
        push([], c === 'Z' && t.meter ? (l * t.meter[0]) / t.meter[1] / t.unit : l, pos)
        continue
      }
      const p = readNote()
      if (p) {
        const [l, n] = parseLen(s, i)
        i += n
        push([p], l, pos)
        continue
      }
      if (!'()~.HTuvLMOPS{}\\'.includes(c)) t.errors.push(`Ignored "${c}" at line ${src.slice(0, lineStart).split('\n').length}`)
      i++
    }
  }
  if (!t.unit) t.unit = 1 / 8
  return t
}

/** Notated value → base duration (1, 1/2, 1/4 …) and number of dots. */
export function noteShape(d: number): { base: number; dots: number } {
  for (let b = 1; b >= 1 / 64; b /= 2) {
    if (Math.abs(d - b) < 1e-9) return { base: b, dots: 0 }
    if (Math.abs(d - b * 1.5) < 1e-9) return { base: b, dots: 1 }
    if (Math.abs(d - b * 1.75) < 1e-9) return { base: b, dots: 2 }
  }
  if (d >= 2) return { base: 1, dots: 0 }
  let b = 1
  while (b > d) b /= 2
  return { base: b, dots: 0 }
}

export interface PlayNote { idx: number; t: number; dur: number; midi: number[] }

/** Flattens repeats (|: … :|, each played twice) and ties into a timeline in whole notes. */
export function timeline(items: Item[]): PlayNote[] {
  const out: PlayNote[] = []
  let t = 0
  let start = 0
  const done = new Set<number>()
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.kind === 'bar') {
      if ((it.type.startsWith(':') || it.type === '::') && !done.has(i)) {
        done.add(i)
        i = start - 1
        continue
      }
      if (it.type.endsWith(':') || it.type === '::') start = i + 1
      continue
    }
    const prev = out[out.length - 1]
    const prevItem = prev ? items[prev.idx] : undefined
    if (prevItem && prevItem.kind === 'note' && prevItem.tie && prev.midi.join() === it.pitches.map((p) => p.midi).join() && Math.abs(prev.t + prev.dur - t) < 1e-9) {
      prev.dur += it.dur
    } else {
      out.push({ idx: i, t, dur: it.dur, midi: it.pitches.map((p) => p.midi) })
    }
    t += it.dur
  }
  return out
}

function vlq(n: number): number[] {
  const b = [n & 0x7f]
  while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80)
  return b
}

/** Standard MIDI File (format 0, 480 ticks per quarter). */
export function toMidi(tune: Tune, qpm = tune.qpm, program = 0): Uint8Array {
  const PPQ = 480
  const ev: { tick: number; data: number[] }[] = []
  const usPerQ = Math.round(60_000_000 / qpm)
  ev.push({ tick: 0, data: [0xff, 0x51, 3, (usPerQ >> 16) & 255, (usPerQ >> 8) & 255, usPerQ & 255] })
  if (tune.meter) ev.push({ tick: 0, data: [0xff, 0x58, 4, tune.meter[0], Math.round(Math.log2(tune.meter[1])), 24, 8] })
  ev.push({ tick: 0, data: [0xff, 0x59, 2, tune.fifths & 255, 0] })
  if (tune.title) {
    const b = [...new TextEncoder().encode(tune.title)]
    ev.push({ tick: 0, data: [0xff, 0x03, ...vlq(b.length), ...b] })
  }
  ev.push({ tick: 0, data: [0xc0, program] })
  for (const n of timeline(tune.items)) {
    const on = Math.round(n.t * 4 * PPQ), off = Math.round((n.t + n.dur) * 4 * PPQ)
    for (const m of n.midi) {
      ev.push({ tick: off, data: [0x80, m, 0] })
      ev.push({ tick: on, data: [0x90, m, 90] })
    }
  }
  ev.sort((a, b) => a.tick - b.tick || (a.data[0] === 0x80 ? -1 : 0) - (b.data[0] === 0x80 ? -1 : 0))
  const trk: number[] = []
  let last = 0
  for (const e of ev) {
    trk.push(...vlq(e.tick - last), ...e.data)
    last = e.tick
  }
  trk.push(0, 0xff, 0x2f, 0)
  const len = trk.length
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255,
    0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...trk,
  ])
}

export const midiFreq = (m: number) => 440 * 2 ** ((m - 69) / 12)
