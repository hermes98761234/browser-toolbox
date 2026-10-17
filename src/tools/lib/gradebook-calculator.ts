// Weighted gradebook math.

export interface Category { id: string; name: string; weight: number; drop: number }
export interface Assignment { id: string; name: string; cat: string; max: number }
export interface Student { id: string; name: string; scores: Record<string, number | null> }
export interface ScaleRow { letter: string; min: number }

export interface Result { pct: number; letter: string; byCat: Record<string, number | null> }

/** Category percentage = Σ earned / Σ possible over graded items, after dropping the lowest `drop` (by %). */
export function categoryPct(items: { score: number; max: number }[], drop: number): number | null {
  const sorted = [...items].filter((i) => i.max > 0).sort((a, b) => a.score / a.max - b.score / b.max)
  const kept = sorted.slice(Math.min(Math.max(0, Math.floor(drop)), Math.max(0, sorted.length - 1)))
  const max = kept.reduce((a, i) => a + i.max, 0)
  return max > 0 ? kept.reduce((a, i) => a + i.score, 0) / max : null
}

export function letterFor(pct: number, scale: ScaleRow[]): string {
  const s = [...scale].sort((a, b) => b.min - a.min)
  for (const r of s) if (pct * 100 >= r.min - 1e-9) return r.letter
  return s.length ? s[s.length - 1].letter : '—'
}

/**
 * Final weighted grade. Missing scores are skipped (`missingAsZero=false`) or count as 0.
 * Categories without any graded item are left out and remaining weights renormalised.
 */
export function grade(st: Student, cats: Category[], asg: Assignment[], scale: ScaleRow[], missingAsZero = false): Result {
  const byCat: Record<string, number | null> = {}
  let wsum = 0, acc = 0
  for (const c of cats) {
    const items = asg.filter((a) => a.cat === c.id).flatMap((a) => {
      const v = st.scores[a.id]
      if (v === null || v === undefined || !Number.isFinite(v)) return missingAsZero ? [{ score: 0, max: a.max }] : []
      return [{ score: v, max: a.max }]
    })
    const p = categoryPct(items, c.drop)
    byCat[c.id] = p
    if (p !== null && c.weight > 0) { wsum += c.weight; acc += c.weight * p }
  }
  const pct = wsum > 0 ? acc / wsum : NaN
  return { pct, letter: Number.isFinite(pct) ? letterFor(pct, scale) : '—', byCat }
}

export function stats(xs: number[]) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  const n = v.length
  if (!n) return { n: 0, mean: NaN, median: NaN, sd: NaN, min: NaN, max: NaN }
  const mean = v.reduce((a, b) => a + b, 0) / n
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0
  return { n, mean, median, sd, min: v[0], max: v[n - 1] }
}

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF, ; or , delimiter auto-detected). */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}
