// Lexical paraphrase similarity: n-gram overlap, TF-IDF cosine, char shingles, ROUGE-L, word order,
// word-level diff and copied-phrase detection. All measures are surface-level (no meaning model).

const STOP = new Set(
  'a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those i you he she we they me him her us them my your his our their not no do does did have has had will would can could should may might must shall into over under about than too very just also there here what which who whom whose when where why how all any each both few more most other some such only own same s t'.split(' '),
)

/** Small synonym map → canonical word (lexical normalization only). */
const SYN: Record<string, string> = {}
for (const group of [
  'big large huge enormous vast', 'small little tiny minor', 'buy purchase acquire', 'use utilize employ', 'help assist aid support',
  'show demonstrate reveal display indicate', 'start begin commence initiate launch', 'end finish conclude complete terminate',
  'important significant crucial vital essential key', 'fast quick rapid swift', 'slow sluggish', 'get obtain gain receive',
  'make create produce build generate', 'think believe consider suppose', 'say state claim assert declare', 'need require',
  'many numerous several multiple', 'often frequently', 'maybe perhaps possibly', 'also additionally furthermore moreover',
  'because since', 'however nevertheless nonetheless', 'increase rise grow climb', 'decrease decline drop fall reduce',
  'problem issue difficulty', 'result outcome consequence effect', 'method approach technique way', 'study research investigation',
  'people individuals persons', 'kids children', 'job work occupation', 'answer response reply', 'choose select pick',
  'change alter modify', 'find discover', 'try attempt', 'enough sufficient adequate', 'whole entire', 'main primary principal chief',
]) {
  const w = group.split(' ')
  for (const x of w) SYN[x] = w[0]
}

/** Very light suffix stripping so "studies/studied/studying" meet. */
export function stem(w: string): string {
  if (w.length <= 3) return w
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  if (w.endsWith('ied')) return w.slice(0, -3) + 'y'
  for (const suf of ['ingly', 'edly', 'ing', 'ed', 'ly', 'es', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3 && !(suf === 's' && w.endsWith('ss'))) return w.slice(0, -suf.length)
  }
  return w
}

export const words = (t: string) => t.toLowerCase().replace(/[’']/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? []

export interface Opts {
  synonyms: boolean
  stopwords: boolean // keep stopwords?
}

/** Normalized tokens used by the content measures. */
export function terms(t: string, o: Opts): string[] {
  return words(t)
    .filter((w) => o.stopwords || !STOP.has(w))
    .map((w) => {
      const b = w.replace(/'s$/, '')
      if (o.synonyms) {
        const sy = SYN[b] ?? SYN[stem(b)]
        if (sy) return sy
      }
      return stem(b)
    })
}

export function ngrams(t: string[], n: number): string[] {
  const out: string[] = []
  for (let i = 0; i + n <= t.length; i++) out.push(t.slice(i, i + n).join(' '))
  return out
}

const bag = (xs: string[]) => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}

/** Multiset Jaccard |A∩B| / |A∪B|. */
export function jaccard(a: string[], b: string[]): number {
  const A = bag(a), B = bag(b)
  let inter = 0, uni = 0
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    const x = A.get(k) ?? 0, y = B.get(k) ?? 0
    inter += Math.min(x, y)
    uni += Math.max(x, y)
  }
  return uni ? inter / uni : 0
}

/** Share of `b`'s items that also occur in `a` (multiset containment): "how much of the rewrite is source". */
export function containment(a: string[], b: string[]): number {
  if (!b.length) return 0
  const A = bag(a)
  let hit = 0
  for (const [k, n] of bag(b)) hit += Math.min(n, A.get(k) ?? 0)
  return hit / b.length
}

export function charShingles(t: string, k = 4): string[] {
  const s = ' ' + words(t).join(' ') + ' '
  const out: string[] = []
  for (let i = 0; i + k <= s.length; i++) out.push(s.slice(i, i + k))
  return out
}

export function lcsLength(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

/** ROUGE-L F1 over token sequences. */
export function rougeL(ref: string[], cand: string[]): number {
  const l = lcsLength(ref, cand)
  if (!l) return 0
  const p = l / cand.length, r = l / ref.length
  return (2 * p * r) / (p + r)
}

/** TF-IDF cosine between two token lists, IDF learned from `docs` (smoothed, sklearn-style). */
export function tfidfCosine(a: string[], b: string[], docs: string[][]): number {
  const N = docs.length
  const df = new Map<string, number>()
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1)
  const idf = (w: string) => Math.log((1 + N) / (1 + (df.get(w) ?? 0))) + 1
  const vec = (t: string[]) => {
    const m = bag(t)
    for (const [k, v] of m) m.set(k, v * idf(k))
    return m
  }
  const A = vec(a), B = vec(b)
  let dot = 0, na = 0, nb = 0
  for (const [k, v] of A) {
    na += v * v
    dot += v * (B.get(k) ?? 0)
  }
  for (const v of B.values()) nb += v * v
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** Kendall-style order agreement of the shared (first-occurrence) words: 1 = same order, 0 = reversed. */
export function orderSimilarity(a: string[], b: string[]): number {
  const posA = new Map<string, number>()
  a.forEach((w, i) => {
    if (!posA.has(w)) posA.set(w, i)
  })
  const seq: number[] = []
  const seen = new Set<string>()
  for (const w of b) {
    if (!posA.has(w) || seen.has(w)) continue
    seen.add(w)
    seq.push(posA.get(w)!)
  }
  if (seq.length < 2) return seq.length ? 1 : 0
  let conc = 0, tot = 0
  for (let i = 0; i < seq.length; i++)
    for (let j = i + 1; j < seq.length; j++) {
      tot++
      if (seq[i] < seq[j]) conc++
    }
  return conc / tot
}

export const sentences = (t: string) => (t.match(/[^.!?\n]+[.!?]*/g) ?? []).map((s) => s.trim()).filter((s) => words(s).length > 0)

export interface Report {
  uni: number
  bi: number
  tri: number
  tfidf: number
  chars: number
  rouge: number
  order: number
  overall: number
  verdict: string
}

/** Weighted blend; the weights favour phrase-level reuse, which is what readers notice as copying. */
export function compare(src: string, rew: string, o: Opts): Report {
  const a = terms(src, o), b = terms(rew, o)
  const all = (t: string) => terms(t, { ...o, stopwords: true })
  const fa = all(src), fb = all(rew)
  const docs = [...sentences(src), ...sentences(rew)].map((s) => terms(s, o))
  const uni = containment(a, b)
  const bi = containment(ngrams(fa, 2), ngrams(fb, 2))
  const tri = containment(ngrams(fa, 3), ngrams(fb, 3))
  const tfidf = tfidfCosine(a, b, docs.length ? docs : [a, b])
  const chars = jaccard(charShingles(src), charShingles(rew))
  const rouge = rougeL(fa, fb)
  const order = orderSimilarity(a, b)
  const overall = 0.15 * uni + 0.15 * tfidf + 0.15 * bi + 0.2 * tri + 0.1 * chars + 0.2 * rouge + 0.05 * order * uni
  const verdict = overall >= 0.7 ? 'Near copy' : overall >= 0.45 ? 'Light paraphrase' : overall >= 0.25 ? 'Moderate rewrite' : 'Substantially reworded'
  return { uni, bi, tri, tfidf, chars, rouge, order, overall, verdict }
}

export type Op = { t: 'eq' | 'del' | 'add'; s: string }

/** Word-level diff (LCS on normalized words, display keeps original spelling). */
export function diffWords(src: string, rew: string): Op[] {
  const A = src.match(/\S+/g) ?? [], B = rew.match(/\S+/g) ?? []
  const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')
  const ka = A.map(key), kb = B.map(key)
  const n = A.length, m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ka[i] === kb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ops: Op[] = []
  const push = (t: Op['t'], s: string) => {
    const last = ops[ops.length - 1]
    if (last && last.t === t) last.s += ' ' + s
    else ops.push({ t, s })
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      push('eq', B[j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', A[i++])
    else push('add', B[j++])
  }
  while (i < n) push('del', A[i++])
  while (j < m) push('add', B[j++])
  return ops
}

/** Maximal runs of ≥ minLen identical consecutive words shared by both texts (longest first). */
export function copiedPhrases(src: string, rew: string, minLen = 4): string[] {
  const a = words(src), b = words(rew)
  const found = new Map<string, number>()
  const idx = new Map<string, number[]>()
  a.forEach((w, i) => idx.set(w, [...(idx.get(w) ?? []), i]))
  let j = 0
  while (j < b.length) {
    let best = 0
    for (const i of idx.get(b[j]) ?? []) {
      let k = 0
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++
      best = Math.max(best, k)
    }
    if (best >= minLen) {
      const p = b.slice(j, j + best).join(' ')
      found.set(p, best)
      j += best
    } else j++
  }
  return [...found.entries()].sort((x, y) => y[1] - x[1]).map(([p]) => p)
}

/** For each rewrite sentence: the most similar source sentence (TF-IDF cosine). */
export function alignSentences(src: string, rew: string, o: Opts) {
  const S = sentences(src), R = sentences(rew)
  const docs = [...S, ...R].map((s) => terms(s, o))
  return R.map((r) => {
    const tr = terms(r, o)
    let best = -1, score = 0
    S.forEach((s, i) => {
      const c = tfidfCosine(terms(s, o), tr, docs)
      if (c > score) {
        score = c
        best = i
      }
    })
    return { rewrite: r, source: best >= 0 ? S[best] : '', score }
  })
}
