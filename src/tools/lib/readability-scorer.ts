// Readability formulas (Flesch, Flesch–Kincaid, Gunning Fog, SMOG, Coleman–Liau, ARI) with a
// heuristic English syllable counter.

/** Heuristic syllable count for one English word (≈90–95% accurate on common prose). */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const special: Record<string, number> = { every: 2, different: 3, business: 2, people: 2, area: 3, idea: 3, being: 2, create: 2, created: 3, really: 2, science: 2, quiet: 2, poem: 2, real: 1, toward: 2, whole: 1 }
  if (special[w]) return special[w]
  if (/[^td]ed$/.test(w)) w = w.slice(0, -2)
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, '').replace(/^y/, '')
  let n = (w.match(/[aeiouy]+/g) ?? []).length
  if (/[^aeiouy]le$/.test(word.toLowerCase()) && !/[aeiouy]le$/.test(w) && n === 0) n = 1
  if (/(?:ia|iu|io(?!n)|eo|ua|uo)/.test(w)) n += (w.match(/ia|iu|io(?!n)|eo|ua|uo/g) ?? []).length
  return Math.max(1, n)
}

const ABBR = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|approx|Inc|Ltd|Co|No|Fig|U\.S)\./gi

export interface Sentence { text: string; start: number; end: number; words: string[] }

/** Splits text into sentences, keeping character offsets for highlighting. */
export function sentences(text: string): Sentence[] {
  const masked = text.replace(ABBR, (m) => m.replace(/\./g, '\u0000')).replace(/(\d)\.(\d)/g, '$1\u0000$2')
  const out: Sentence[] = []
  const re = /[^.!?\n]+(?:[.!?]+["'”’)\]]*|\n|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(masked))) {
    if (!m[0]) { re.lastIndex++; continue }
    const raw = text.slice(m.index, m.index + m[0].length)
    const ws = words(raw)
    if (ws.length) out.push({ text: raw, start: m.index, end: m.index + m[0].length, words: ws })
    if (re.lastIndex >= masked.length) break
  }
  return out
}

export const words = (s: string) => s.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.filter((w) => /[A-Za-z]/.test(w)) ?? []

/** Gunning's "complex word": 3+ syllables, not a proper noun, not hyphenated, ignoring -es/-ed/-ing. */
export function isComplex(word: string, first: boolean): boolean {
  if (word.includes('-')) return false
  if (!first && /^[A-Z]/.test(word)) return false
  const base = word.replace(/(?:es|ed|ing)$/i, '')
  return syllables(base.length > 2 ? base : word) >= 3
}

export interface Report {
  words: number; sentences: number; syllables: number; letters: number; complex: number; poly: number
  fre: number; fk: number; fog: number; smog: number; cli: number; ari: number
  avgWps: number; avgSpw: number; minutes: number
}

export function analyze(text: string): Report {
  const ss = sentences(text)
  let W = 0, Syl = 0, Let = 0, C = 0, P = 0
  for (const s of ss)
    s.words.forEach((w, i) => {
      const sy = syllables(w)
      W++
      Syl += sy
      Let += w.replace(/[^A-Za-z0-9]/g, '').length
      if (sy >= 3) P++
      if (isComplex(w, i === 0)) C++
    })
  const S = ss.length
  const wps = S ? W / S : 0, spw = W ? Syl / W : 0
  return {
    words: W, sentences: S, syllables: Syl, letters: Let, complex: C, poly: P,
    fre: W ? 206.835 - 1.015 * wps - 84.6 * spw : NaN,
    fk: W ? 0.39 * wps + 11.8 * spw - 15.59 : NaN,
    fog: W ? 0.4 * (wps + (100 * C) / W) : NaN,
    smog: S ? 1.043 * Math.sqrt((P * 30) / S) + 3.1291 : NaN,
    cli: W ? 0.0588 * ((Let / W) * 100) - 0.296 * ((S / W) * 100) - 15.8 : NaN,
    ari: W ? 4.71 * (Let / W) + 0.5 * wps - 21.43 : NaN,
    avgWps: wps, avgSpw: spw, minutes: W / 238,
  }
}

/** Plain-English band for a Flesch Reading Ease score. */
export function freBand(x: number): [string, string] {
  if (!Number.isFinite(x)) return ['—', '']
  if (x >= 90) return ['Very easy', '5th grade']
  if (x >= 80) return ['Easy', '6th grade']
  if (x >= 70) return ['Fairly easy', '7th grade']
  if (x >= 60) return ['Plain English', '8th–9th grade']
  if (x >= 50) return ['Fairly difficult', '10th–12th grade']
  if (x >= 30) return ['Difficult', 'college']
  if (x >= 10) return ['Very difficult', 'college graduate']
  return ['Extremely difficult', 'professional']
}
