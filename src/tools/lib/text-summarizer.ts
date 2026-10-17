// Classical extractive summarisation: sentence splitting, TF-IDF sentence scores, TextRank
// (PageRank over cosine similarity) and MMR redundancy filtering. No language model involved.

const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'u.s', 'u.k', 'inc', 'ltd', 'co', 'corp', 'no', 'fig', 'approx', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'mt', 'gen', 'gov'])

/** Splits text into sentences, keeping abbreviations, initials and decimals intact. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  for (const para of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const p = para.replace(/\s+/g, ' ').trim()
    if (!p) continue
    let start = 0
    const re = /[.!?]+["'”’)\]]*(\s+|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(p))) {
      const end = m.index + m[0].length
      const before = p.slice(start, m.index)
      const lastWord = (before.split(/\s+/).pop() ?? '').toLowerCase().replace(/^["'“‘(]+/, '')
      const next = p.slice(end, end + 1)
      const isAbbr = m[0][0] === '.' && (ABBR.has(lastWord) || /^[a-z]$/i.test(lastWord) || /^([a-z]\.)+[a-z]$/i.test(lastWord))
      if ((isAbbr || (next && /[a-z0-9]/.test(next))) && end < p.length) continue
      out.push(p.slice(start, end).trim())
      start = end
    }
    if (start < p.length) out.push(p.slice(start).trim())
  }
  return out.filter((s) => /[a-z0-9]/i.test(s))
}

export const STOP = new Set('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves one two may might must shall us many much also however yet still even though although s t can\'t won\'t don\'t it\'s'.split(' '))

/** Very light suffix stripping so "cities"/"city", "running"/"run" share a stem. */
export function stem(w: string): string {
  if (w.length <= 3) return w
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  if (w.endsWith('sses')) return w.slice(0, -2)
  if (w.endsWith('ing') && w.length > 5) { const b = w.slice(0, -3); return /(.)\1$/.test(b) && !/[lsz]$/.test(b) ? b.slice(0, -1) : b }
  if (w.endsWith('ed') && w.length > 4) { const b = w.slice(0, -2); return /(.)\1$/.test(b) && !/[lsz]$/.test(b) ? b.slice(0, -1) : b }
  if (w.endsWith('ly') && w.length > 5) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1)
  return w
}

export function terms(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z'’-]*[a-z]|[a-z]|\d+(?:\.\d+)?/g) ?? []).map((w) => w.replace(/[’]/g, "'")).filter((w) => !STOP.has(w) && w.length > 1).map(stem)
}

type Vec = Map<string, number>

/** TF-IDF vector per sentence (sentences are the "documents"). Also returns idf. */
export function tfidf(sentTerms: string[][]): { vecs: Vec[]; idf: Map<string, number> } {
  const N = sentTerms.length
  const df = new Map<string, number>()
  for (const ts of sentTerms) for (const t of new Set(ts)) df.set(t, (df.get(t) ?? 0) + 1)
  const idf = new Map<string, number>()
  for (const [t, d] of df) idf.set(t, Math.log((1 + N) / (1 + d)) + 1)
  const vecs = sentTerms.map((ts) => {
    const v: Vec = new Map()
    for (const t of ts) v.set(t, (v.get(t) ?? 0) + 1)
    for (const [t, c] of v) v.set(t, (c / ts.length) * idf.get(t)!)
    return v
  })
  return { vecs, idf }
}

export function cosine(a: Vec, b: Vec): number {
  let dot = 0, na = 0, nb = 0
  for (const [t, x] of a) { na += x * x; const y = b.get(t); if (y) dot += x * y }
  for (const y of b.values()) nb += y * y
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** PageRank over a weighted, symmetric similarity graph. */
export function pageRank(sim: number[][], d = 0.85, iters = 100, tol = 1e-8): number[] {
  const n = sim.length
  if (!n) return []
  const out = sim.map((row) => row.reduce((a, x) => a + x, 0))
  let r = new Array<number>(n).fill(1 / n)
  for (let k = 0; k < iters; k++) {
    const nr = new Array<number>(n).fill((1 - d) / n)
    for (let j = 0; j < n; j++) {
      if (!out[j]) { for (let i = 0; i < n; i++) nr[i] += (d * r[j]) / n; continue }
      for (let i = 0; i < n; i++) if (sim[j][i]) nr[i] += (d * r[j] * sim[j][i]) / out[j]
    }
    const diff = nr.reduce((a, x, i) => a + Math.abs(x - r[i]), 0)
    r = nr
    if (diff < tol) break
  }
  return r
}

export type Method = 'tfidf' | 'textrank'
export interface Options { method: Method; count: number; lead: boolean; mmr: boolean }
export interface Result {
  sentences: string[]
  scores: number[]
  /** Indices of chosen sentences, in original order. */
  chosen: number[]
  keywords: [string, number][]
}

export function summarize(text: string, o: Options): Result {
  const sentences = splitSentences(text)
  const st = sentences.map(terms)
  const { vecs, idf } = tfidf(st)
  const n = sentences.length
  let scores: number[]
  if (o.method === 'textrank') {
    const sim = vecs.map((a, i) => vecs.map((b, j) => (i === j ? 0 : cosine(a, b))))
    scores = pageRank(sim)
  } else {
    // mean TF-IDF weight of the sentence's terms against the whole document's term frequency
    const docTf = new Map<string, number>()
    for (const ts of st) for (const t of ts) docTf.set(t, (docTf.get(t) ?? 0) + 1)
    scores = st.map((ts) => (ts.length ? [...new Set(ts)].reduce((a, t) => a + docTf.get(t)! * idf.get(t)!, 0) / Math.sqrt(ts.length) / Math.max(1, ts.length >= 5 ? 1 : 2) : 0))
  }
  const max = Math.max(...scores, 1e-12)
  scores = scores.map((x) => x / max)
  if (o.lead) scores = scores.map((x, i) => x * (1 + 0.25 * Math.max(0, 1 - i / Math.max(3, n * 0.2))))
  const k = Math.max(1, Math.min(n, Math.round(o.count)))
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a])
  let chosen: number[]
  if (o.mmr) {
    chosen = []
    const lambda = 0.7
    const pool = new Set(order)
    while (chosen.length < k && pool.size) {
      let best = -1, bestV = -Infinity
      for (const i of pool) {
        const red = chosen.length ? Math.max(...chosen.map((j) => cosine(vecs[i], vecs[j]))) : 0
        const v = lambda * scores[i] - (1 - lambda) * red
        if (v > bestV) { bestV = v; best = i }
      }
      chosen.push(best)
      pool.delete(best)
    }
  } else chosen = order.slice(0, k)
  chosen.sort((a, b) => a - b)
  // keywords: most frequent stems weighted by idf, shown with the most common surface form
  const surface = new Map<string, Map<string, number>>()
  for (const w of text.toLowerCase().match(/[a-z][a-z'-]*[a-z]/g) ?? []) {
    if (STOP.has(w)) continue
    const s = stem(w)
    const m = surface.get(s) ?? new Map<string, number>()
    m.set(w, (m.get(w) ?? 0) + 1)
    surface.set(s, m)
  }
  const kw = new Map<string, number>()
  for (const ts of st) for (const t of ts) kw.set(t, (kw.get(t) ?? 0) + idf.get(t)!)
  const keywords = [...kw.entries()].filter(([t]) => !/^\d/.test(t) && t.length > 2).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, v]) => {
    const forms = surface.get(t)
    const word = forms ? [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0] : t
    return [word, v] as [string, number]
  })
  return { sentences, scores, chosen, keywords }
}

export const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length
