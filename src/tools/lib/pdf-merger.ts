// Page-range parsing for the PDF merger: "1-3, 5, 8-", "odd", "even", "last", reversed "5-1".

export interface RangeResult {
  pages: number[] // 0-based page indices in output order
  error?: string
}

/** Parses a page selection for a document with `total` pages. Empty → all pages. */
export function parseRanges(spec: string, total: number): RangeResult {
  const s = spec.trim().toLowerCase()
  const all = Array.from({ length: total }, (_, i) => i)
  if (!s || s === 'all') return { pages: all }
  const out: number[] = []
  for (const raw of s.split(/[,;]+/)) {
    const part = raw.trim().replace(/\s+/g, '')
    if (!part) continue
    if (part === 'odd') { out.push(...all.filter((i) => i % 2 === 0)); continue }
    if (part === 'even') { out.push(...all.filter((i) => i % 2 === 1)); continue }
    const tok = (t: string, dflt: number) => (t === '' ? dflt : t === 'last' || t === 'end' ? total : Number(t))
    const m = /^(\d+|last|end)?(?:(-)(\d+|last|end)?)?$/.exec(part)
    if (!m || (m[1] === undefined && m[2] === undefined)) return { pages: [], error: `Can't read "${raw.trim()}"` }
    const a = tok(m[1] ?? '', 1)
    const b = m[2] ? tok(m[3] ?? '', total) : a
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) return { pages: [], error: `Pages start at 1 ("${raw.trim()}")` }
    if (a > total || b > total) return { pages: [], error: `Page ${Math.max(a, b)} doesn't exist (document has ${total})` }
    const step = a <= b ? 1 : -1
    for (let p = a; p !== b + step; p += step) out.push(p - 1)
  }
  return { pages: out }
}

/** Compact human form of a page list: [0,1,2,4] → "1–3, 5". */
export function describePages(pages: number[]): string {
  const parts: string[] = []
  let i = 0
  while (i < pages.length) {
    let j = i
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++
    parts.push(j > i ? `${pages[i] + 1}–${pages[j] + 1}` : `${pages[i] + 1}`)
    i = j + 1
  }
  return parts.join(', ')
}

/** Paper name for a page size in PDF points (1 pt = 1/72 in), tolerant to ±3 pt and orientation. */
export function paperName(w: number, h: number): string {
  const sizes: [string, number, number][] = [['A3', 842, 1191], ['A4', 595, 842], ['A5', 420, 595], ['Letter', 612, 792], ['Legal', 612, 1008], ['Tabloid', 792, 1224]]
  const [a, b] = w < h ? [w, h] : [h, w]
  const hit = sizes.find(([, x, y]) => Math.abs(a - x) <= 3 && Math.abs(b - y) <= 3)
  const mm = (v: number) => Math.round((v / 72) * 25.4)
  return hit ? `${hit[0]}${w > h ? ' landscape' : ''}` : `${mm(w)}×${mm(h)} mm`
}
