// Dictation checker: word-level comparison of a student's dictation with the original text.
// Own LCS-based diff over word/punctuation tokens, then classification of each difference.

export interface Tok {
  text: string
  kind: 'word' | 'punct'
}

export interface Opts {
  ignoreCase: boolean
  ignorePunct: boolean
}

/** Splits text into word tokens (letters, digits, apostrophes, inner hyphens) and punctuation marks. */
export function tokenize(s: string, ignorePunct = false): Tok[] {
  const out: Tok[] = []
  const re = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu
  for (const m of s.matchAll(re)) {
    const kind = /[\p{L}\p{N}]/u.test(m[0]) ? 'word' : 'punct'
    if (kind === 'punct' && ignorePunct) continue
    out.push({ text: m[0].replace(/’/g, "'"), kind })
  }
  return out
}

export type OpKind = 'eq' | 'del' | 'ins'
export interface Op {
  op: OpKind
  a?: Tok
  b?: Tok
}

/** Longest-common-subsequence diff of two token lists using a key function. */
export function lcsDiff(a: Tok[], b: Tok[], key: (t: Tok) => string): Op[] {
  const n = a.length
  const m = b.length
  const ka = a.map(key)
  const kb = b.map(key)
  // suffix LCS lengths, (n+1) x (m+1)
  const W = m + 1
  const L = new Uint32Array((n + 1) * W)
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i * W + j] = ka[i] === kb[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1])
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (ka[i] === kb[j]) ops.push({ op: 'eq', a: a[i++], b: b[j++] })
    else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) ops.push({ op: 'del', a: a[i++] })
    else ops.push({ op: 'ins', b: b[j++] })
  }
  while (i < n) ops.push({ op: 'del', a: a[i++] })
  while (j < m) ops.push({ op: 'ins', b: b[j++] })
  return ops
}

export function levenshtein(x: string, y: string): number {
  if (x === y) return 0
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[y.length]
}

export type ErrKind = 'spelling' | 'wrong word' | 'capitalization' | 'missing' | 'extra' | 'punctuation'

/** One piece of the marked-up result, in reading order. */
export interface Piece {
  kind: 'ok' | ErrKind
  /** What the original has (correction). */
  want?: string
  /** What the student wrote. */
  got?: string
  punct: boolean
}

export function classify(want: string, got: string): ErrKind {
  if (want.toLowerCase() === got.toLowerCase()) return 'capitalization'
  const d = levenshtein(want.toLowerCase(), got.toLowerCase())
  return d <= Math.max(1, Math.round(Math.max(want.length, got.length) / 3)) ? 'spelling' : 'wrong word'
}

export function compare(original: string, student: string, o: Opts): Piece[] {
  const a = tokenize(original, o.ignorePunct)
  const b = tokenize(student, o.ignorePunct)
  const ops = lcsDiff(a, b, (t) => (o.ignoreCase ? t.text.toLowerCase() : t.text))
  const out: Piece[] = []
  let k = 0
  while (k < ops.length) {
    if (ops[k].op === 'eq') {
      out.push({ kind: 'ok', want: ops[k].a!.text, got: ops[k].b!.text, punct: ops[k].a!.kind === 'punct' })
      k++
      continue
    }
    // a block of changes between two matches: pair words with words, punct with punct, in order
    const dels: Tok[] = []
    const ins: Tok[] = []
    while (k < ops.length && ops[k].op !== 'eq') {
      if (ops[k].op === 'del') dels.push(ops[k].a!)
      else ins.push(ops[k].b!)
      k++
    }
    const dw = dels.filter((t) => t.kind === 'word')
    const iw = ins.filter((t) => t.kind === 'word')
    const pairs = Math.min(dw.length, iw.length)
    // emit in original order: walk deletions, pairing the first `pairs` words
    let wi = 0
    const insP = ins.filter((t) => t.kind === 'punct')
    let pi = 0
    for (const t of dels) {
      if (t.kind === 'word') {
        if (wi < pairs) out.push({ kind: classify(t.text, iw[wi].text), want: t.text, got: iw[wi].text, punct: false })
        else out.push({ kind: 'missing', want: t.text, punct: false })
        wi++
      } else if (pi < insP.length) {
        out.push({ kind: 'punctuation', want: t.text, got: insP[pi++].text, punct: true })
      } else out.push({ kind: 'punctuation', want: t.text, punct: true })
    }
    for (let x = pairs; x < iw.length; x++) out.push({ kind: 'extra', got: iw[x].text, punct: false })
    for (; pi < insP.length; pi++) out.push({ kind: 'punctuation', got: insP[pi].text, punct: true })
  }
  return out
}

export interface Score {
  words: number // words in original
  correct: number
  errors: Record<ErrKind, number>
  weighted: number
  accuracy: number // correct words / original words
  wer: number // word error rate
  score: number // 0..1 after weighted penalties
}

export function score(p: Piece[], halfMinor: boolean): Score {
  const errors: Record<ErrKind, number> = { spelling: 0, 'wrong word': 0, capitalization: 0, missing: 0, extra: 0, punctuation: 0 }
  let words = 0
  let correct = 0
  for (const x of p) {
    if (!x.punct && x.want !== undefined) words++
    if (x.kind === 'ok') {
      if (!x.punct) correct++
    } else errors[x.kind]++
  }
  const minor = errors.capitalization + errors.punctuation
  const major = errors.spelling + errors['wrong word'] + errors.missing + errors.extra
  const weighted = major + minor * (halfMinor ? 0.5 : 1)
  const wer = words ? (errors.spelling + errors['wrong word'] + errors.capitalization + errors.missing + errors.extra) / words : 0
  return { words, correct, errors, weighted, accuracy: words ? correct / words : 0, wer, score: words ? Math.max(0, 1 - weighted / words) : 0 }
}
