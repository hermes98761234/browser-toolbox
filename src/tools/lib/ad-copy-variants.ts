// Spintax engine for Ad Copy Variants: nested {a|b|{c|d}} groups, {{variables}}, exact combination counts,
// index → variant decoding (so sampling is uniform and duplicate-free) and ad-platform length limits.

export type Node = string | Node[][] // a string literal, or an alternation of sequences
export type Seq = Node[]

/** Parses spintax. `\{ \} \|` escape braces/pipes. Unbalanced braces are reported. */
export function parse(src: string): { seq: Seq; error: string } {
  let i = 0
  let error = ''
  const seq = (depth: number): Seq => {
    const out: Seq = []
    let lit = ''
    while (i < src.length) {
      const c = src[i]
      if (c === '\\' && i + 1 < src.length) {
        lit += src[i + 1]
        i += 2
      } else if (c === '{') {
        if (lit) out.push(lit)
        lit = ''
        i++
        const alts: Seq[] = [seq(depth + 1)]
        while (src[i] === '|') {
          i++
          alts.push(seq(depth + 1))
        }
        if (src[i] === '}') i++
        else if (!error) error = 'Missing closing }'
        out.push(alts)
      } else if ((c === '|' || c === '}') && depth > 0) break
      else if (c === '}' && depth === 0) {
        if (!error) error = `Unexpected } at position ${i + 1}`
        lit += c
        i++
      } else {
        lit += c
        i++
      }
    }
    if (lit) out.push(lit)
    return out
  }
  const s = seq(0)
  return { seq: s, error }
}

/** Number of distinct expansions (as BigInt-safe float; may be Infinity for huge templates). */
export function count(s: Seq): number {
  let n = 1
  for (const node of s) if (typeof node !== 'string') n *= node.reduce((a, alt) => a + count(alt), 0)
  return n
}

/** The k-th expansion (0 ≤ k < count) in mixed-radix order. */
export function decode(s: Seq, k: number): string {
  let out = ''
  for (const node of s) {
    if (typeof node === 'string') {
      out += node
      continue
    }
    const total = node.reduce((a, alt) => a + count(alt), 0)
    let r = k % total
    k = Math.floor(k / total)
    for (const alt of node) {
      const c = count(alt)
      if (r < c) {
        out += decode(alt, r)
        break
      }
      r -= c
    }
  }
  return out
}

/** Collapses doubled spaces left by empty options and tidies spaces before punctuation. */
export const tidy = (s: string) => s.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.!?;:])/g, '$1').trim()

/** Replaces {{name}} placeholders (case-insensitive) from a vars map; unknown ones stay visible. */
export function applyVars(src: string, vars: Record<string, string>): string {
  const low = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k.trim().toLowerCase(), v]))
  return src.replace(/\{\{\s*([\w -]+?)\s*\}\}/g, (m, k: string) => low[k.toLowerCase()] ?? m)
}

/** Parses "key = value" lines into a map. */
export function parseVars(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of text.split(/\r?\n/)) {
    const i = l.indexOf('=')
    if (i > 0) out[l.slice(0, i).trim()] = l.slice(i + 1).trim()
  }
  return out
}

/** Deterministic PRNG for reproducible samples. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** All expansions when there are at most `max`, else `max` distinct random ones (uniform). Deduplicated after tidying. */
export function expand(s: Seq, max: number, seed = 1): string[] {
  const n = count(s)
  const idx: number[] = []
  if (n <= max) for (let k = 0; k < n; k++) idx.push(k)
  else {
    const r = rng(seed)
    const seen = new Set<number>()
    let guard = 0
    while (seen.size < max && guard++ < max * 20) seen.add(Math.floor(r() * n))
    idx.push(...seen)
  }
  return [...new Set(idx.map((k) => tidy(decode(s, k))))]
}

export type CaseMode = 'asis' | 'title' | 'sentence' | 'upper'
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'via', 'with'])
export function applyCase(s: string, m: CaseMode): string {
  if (m === 'upper') return s.toUpperCase()
  if (m === 'sentence') return s.charAt(0).toUpperCase() + s.slice(1)
  if (m === 'title')
    return s.replace(/[A-Za-z][\w'’]*/g, (w, off: number) => (off > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
  return s
}

export const LIMITS: { key: string; label: string; max: number }[] = [
  { key: 'gads-h', label: 'Google Ads headline', max: 30 },
  { key: 'gads-d', label: 'Google Ads description', max: 90 },
  { key: 'meta-h', label: 'Meta headline', max: 40 },
  { key: 'meta-p', label: 'Meta primary text (before “See more”)', max: 125 },
  { key: 'li-h', label: 'LinkedIn headline', max: 70 },
  { key: 'x', label: 'X / Twitter post', max: 280 },
  { key: 'sms', label: 'SMS (GSM-7, one segment)', max: 160 },
  { key: 'custom', label: 'Custom', max: 0 },
]
