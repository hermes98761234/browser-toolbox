// Reading-support helpers: word tokens with offsets, a heuristic English syllabifier,
// a word-by-word pacer schedule and reading-speed maths.
export { segments, wordAt, type Seg } from './text-to-speech-reader'

export interface Tok {
  start: number
  end: number
  text: string
  word: boolean // false = whitespace / punctuation
}

/** Splits text into word and non-word tokens covering every character. */
export function tokenize(text: string): Tok[] {
  const out: Tok[] = []
  const re = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ start: last, end: m.index, text: text.slice(last, m.index), word: false })
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0], word: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ start: last, end: text.length, text: text.slice(last), word: false })
  return out
}

const DIGRAPHS = new Set(['ch', 'sh', 'th', 'ph', 'wh', 'gh', 'ng', 'qu'])
const BLENDS = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw', 'wr', 'thr', 'str', 'spr', 'scr', 'spl', 'shr'])

/** Heuristic English syllable split ("banana" → ["ba","na","na"]). Keeps original letter case. */
export function syllabify(word: string): string[] {
  const w = word.toLowerCase()
  if (!/^[a-z]+$/.test(w) || w.length <= 3) return [word]
  const isV = (i: number) => 'aeiou'.includes(w[i]) || (w[i] === 'y' && i > 0 && !'aeiou'.includes(w[i - 1]))
  // vowel groups [start, end)
  const groups: [number, number][] = []
  for (let i = 0; i < w.length; i++) {
    if (isV(i)) {
      const s = i
      while (i + 1 < w.length && isV(i + 1)) i++
      groups.push([s, i + 1])
    }
  }
  if (groups.length <= 1) return [word]
  const lastG = groups[groups.length - 1]
  const endsLe = /[^aeiouy]le$/.test(w)
  // silent final e ("make", "stone") — but keep consonant+le ("table")
  if (lastG[0] === w.length - 1 && w.endsWith('e') && !endsLe && groups.length > 1) groups.pop()
  // -ed after anything but t/d is not a syllable ("jumped")
  else if (w.endsWith('ed') && lastG[0] === w.length - 2 && lastG[1] === w.length - 1 && !/[td]ed$/.test(w) && groups.length > 1) groups.pop()
  if (groups.length <= 1) return [word]
  const cuts: number[] = []
  for (let g = 0; g < groups.length - 1; g++) {
    const a = groups[g][1]
    const b = groups[g + 1][0]
    const cl = w.slice(a, b)
    let cut: number
    if (g === groups.length - 2 && endsLe && b === w.length - 1) cut = b - 2 // ta-ble, lit-tle
    else if (cl.length === 0) cut = a
    else if (cl.length === 1) cut = a // V-CV
    else if (cl.length === 2) cut = cl === 'ck' ? b : DIGRAPHS.has(cl) ? a : a + 1
    else {
      const tail3 = cl.slice(-3), tail2 = cl.slice(-2)
      if (BLENDS.has(tail3) && cl.length > 3) cut = b - 3
      else if (BLENDS.has(tail2) || DIGRAPHS.has(tail2)) cut = b - 2
      else cut = b - 1
    }
    cuts.push(cut)
  }
  // keep common suffixes whole: want-ed, read-ing (but run-ning)
  const L = w.length
  if (/[td]ed$/.test(w)) cuts[cuts.length - 1] = L - 2
  else if (w.endsWith('ing') && L > 5 && w[L - 4] !== w[L - 5] && !isV(L - 4)) cuts[cuts.length - 1] = L - 3
  const parts: string[] = []
  let p = 0
  for (const c of cuts) {
    if (c > p && c < word.length) {
      parts.push(word.slice(p, c))
      p = c
    }
  }
  parts.push(word.slice(p))
  return parts
}

/** Start times (seconds) for each word at a target pace, with pauses at punctuation; total = n / wpm minutes. */
export function paceSchedule(tokens: Tok[], wpm: number): { idx: number; t: number; d: number }[] {
  const items: { idx: number; w: number }[] = []
  tokens.forEach((t, i) => {
    if (!t.word) return
    const next = tokens[i + 1]?.text ?? ''
    let w = 0.6 + Math.min(12, t.text.length) * 0.08
    if (/[.!?…]/.test(next)) w += 0.6
    else if (/[,;:—–]/.test(next)) w += 0.3
    if (/\n/.test(next)) w += 0.3
    items.push({ idx: i, w })
  })
  const total = (items.length / Math.max(1, wpm)) * 60
  const sum = items.reduce((s, x) => s + x.w, 0) || 1
  let t = 0
  return items.map((x) => {
    const d = (x.w / sum) * total
    const r = { idx: x.idx, t, d }
    t += d
    return r
  })
}

export const wpm = (words: number, seconds: number) => (seconds > 0 ? (words / seconds) * 60 : 0)

/** Rough grade-level guide for oral reading fluency (words correct per minute, spring norms, 50th pct). */
export const FLUENCY_NORMS: [string, number][] = [
  ['Grade 1', 60], ['Grade 2', 100], ['Grade 3', 112], ['Grade 4', 133], ['Grade 5', 146], ['Grade 6', 146], ['Adult (aloud)', 160],
]
