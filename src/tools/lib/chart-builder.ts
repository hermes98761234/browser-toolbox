// CSV parsing, number cleaning, axis scaling and pie geometry for the chart builder.

export function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 5).join('\n')
  const cands = [',', ';', '\t', '|']
  let best = ',', score = -1
  for (const d of cands) {
    const counts = head.split('\n').filter(Boolean).map((l) => l.split(d).length - 1)
    const min = counts.length ? Math.min(...counts) : 0
    if (min > score) { score = min; best = d }
  }
  return best
}

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF), auto-detecting the delimiter. */
export function parseCsv(text: string, delim = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"' && cell === '') q = true
    else if (c === delim) { row.push(cell.trim()); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell.trim())
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

/** "$1,234.50" → 1234.5, "12%" → 12, "(30)" → -30, "1 234,5" → 1234.5; NaN when not numeric. */
export function toNumber(s: string): number {
  let t = s.trim().replace(/[$€£¥₴\s%]/g, '').replace(/ /g, '')
  if (!t) return NaN
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.')
  else t = t.replace(/,/g, '')
  const v = Number(t)
  return neg ? -v : v
}

export interface Table { headers: string[]; rows: string[][]; numeric: boolean[] }

export function toTable(cells: string[][]): Table {
  const [h = [], ...rows] = cells
  const n = Math.max(h.length, ...rows.map((r) => r.length))
  const headers = Array.from({ length: n }, (_, i) => h[i] || `Column ${i + 1}`)
  const padded = rows.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? ''))
  const numeric = headers.map((_, i) => padded.length > 0 && padded.filter((r) => r[i] !== '').every((r) => Number.isFinite(toNumber(r[i]))) && padded.some((r) => r[i] !== ''))
  return { headers, rows: padded, numeric }
}

/** Rounded axis range and ticks covering [lo, hi]. */
export function niceScale(lo: number, hi: number, count = 5): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, ticks: [0, 1] }
  if (lo === hi) { hi = lo + (lo === 0 ? 1 : Math.abs(lo) * 0.1); lo = lo === 0 ? 0 : lo - Math.abs(lo) * 0.1 }
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const min = Math.floor(lo / step + 1e-9) * step, max = Math.ceil(hi / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(10)))
  return { min, max, ticks }
}

/** SVG path of a pie/donut slice; angles in radians from 12 o'clock, clockwise. */
export function arcPath(cx: number, cy: number, r: number, ir: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4
  const f = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2))
  const p = (rad: number, a: number) => `${f(cx + rad * Math.sin(a))} ${f(cy - rad * Math.cos(a))}`
  const large = a1 - a0 > Math.PI ? 1 : 0
  if (ir <= 0) return `M${cx} ${cy}L${p(r, a0)}A${r} ${r} 0 ${large} 1 ${p(r, a1)}Z`
  return `M${p(r, a0)}A${r} ${r} 0 ${large} 1 ${p(r, a1)}L${p(ir, a1)}A${ir} ${ir} 0 ${large} 0 ${p(ir, a0)}Z`
}

/** Compact tick label: 1500 → "1.5k", 2000000 → "2M". */
export function short(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return `${+(v / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}k`
  return String(+v.toFixed(4))
}
