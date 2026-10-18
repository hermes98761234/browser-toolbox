// Table reconstruction for PDF Table Extractor: positioned text runs (pdf.js getTextContent)
// plus optional ruling-line segments (from the operator list) → rows × columns of cell text.
import { toLines, type Run } from './pdf-text-extractor'

export type { Run }
/** A straight segment in PDF user space (y grows upward). */
export interface Seg { x0: number; y0: number; x1: number; y1: number }
/** A cell candidate: text with its horizontal extent on one baseline. */
export interface Chunk { str: string; x0: number; x1: number; y: number; h: number }
export interface TLine { y: number; h: number; chunks: Chunk[] }

export interface Opts {
  /** Horizontal gap (in multiples of font size) that separates two cells on a line. */
  gap: number
  /** Lines with fewer cell candidates than this are not table rows (titles, notes). */
  minCells: number
  /** Use ruling lines (vertical → columns, horizontal → row bands) when present. */
  rules: boolean
  /** Merge a line whose first column is empty into the row above (wrapped cells). */
  mergeWrapped: boolean
}
export const DEF_OPTS: Opts = { gap: 0.9, minCells: 2, rules: true, mergeWrapped: true }

export interface PageTable {
  rows: string[][]
  /** Column boundaries (x, ascending) actually used. */
  bounds: number[]
  /** Where the boundaries came from. */
  source: 'manual' | 'rules' | 'gaps' | 'none'
  /** Table region (y range, PDF units) and horizontal extent. */
  top: number
  bottom: number
  left: number
  right: number
  /** Baselines of the row lines (for overlays). */
  rowYs: number[]
}

/** Splits runs on runs of 2+ spaces (proportionally) and merges neighbours closer than the cell gap. */
export function toChunks(runs: Run[], gap: number): TLine[] {
  const pieces: Run[] = []
  for (const r of runs) {
    if (!r.str.trim()) continue
    const n = r.str.length || 1
    const cw = r.w / n
    const re = /\S+(?: \S+)*/g
    let m: RegExpExecArray | null
    while ((m = re.exec(r.str))) pieces.push({ str: m[0], x: r.x + m.index * cw, y: r.y, w: m[0].length * cw, h: r.h })
  }
  return toLines(pieces).map((l) => {
    const chunks: Chunk[] = []
    for (const r of l.runs) {
      const last = chunks[chunks.length - 1]
      const h = Math.max(1, r.h)
      if (last && r.x - last.x1 < gap * Math.max(h, last.h)) {
        const g = r.x - last.x1
        last.str += g > 0.15 * h ? ` ${r.str}` : r.str
        last.x1 = Math.max(last.x1, r.x + r.w)
        last.h = Math.max(last.h, h)
      } else chunks.push({ str: r.str, x0: r.x, x1: r.x + r.w, y: r.y, h })
    }
    return { y: l.y, h: l.h, chunks }
  })
}

/** Keeps the horizontal and vertical segments of a set, merging collinear overlaps. */
export function splitRules(segs: Seg[], minLen = 8): { h: Seg[]; v: Seg[] } {
  const h: Seg[] = [], v: Seg[] = []
  for (const s of segs) {
    const dx = Math.abs(s.x1 - s.x0), dy = Math.abs(s.y1 - s.y0)
    if (dy <= 1 && dx >= minLen) h.push({ x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), y0: (s.y0 + s.y1) / 2, y1: (s.y0 + s.y1) / 2 })
    else if (dx <= 1 && dy >= minLen) v.push({ y0: Math.min(s.y0, s.y1), y1: Math.max(s.y0, s.y1), x0: (s.x0 + s.x1) / 2, x1: (s.x0 + s.x1) / 2 })
  }
  return { h, v }
}

/** Distinct values, merging those within `tol` of each other (keeps their mean). */
export function cluster(vals: number[], tol = 2.5): number[] {
  const s = [...vals].sort((a, b) => a - b)
  const out: number[][] = []
  for (const x of s) {
    const g = out[out.length - 1]
    if (g && x - g[g.length - 1] <= tol) g.push(x)
    else out.push([x])
  }
  return out.map((g) => g.reduce((a, b) => a + b, 0) / g.length)
}

/** Column boundaries at the centres of x-intervals no table line covers (wider than minGap). */
export function gapBounds(lines: TLine[], minGap = 4): number[] {
  const cs = lines.flatMap((l) => l.chunks)
  if (!cs.length) return []
  const x0 = Math.floor(Math.min(...cs.map((c) => c.x0))), x1 = Math.ceil(Math.max(...cs.map((c) => c.x1)))
  const n = x1 - x0 + 1
  const cover = new Uint16Array(n)
  for (const l of lines) {
    const seen = new Uint8Array(n)
    for (const c of l.chunks) for (let b = Math.max(0, Math.floor(c.x0 - x0)); b < Math.min(n, Math.ceil(c.x1 - x0)); b++) seen[b] = 1
    for (let b = 0; b < n; b++) cover[b] += seen[b]
  }
  const out: number[] = []
  let start = -1
  for (let b = 0; b <= n; b++) {
    const empty = b < n && cover[b] === 0
    if (empty && start < 0) start = b
    if (!empty && start >= 0) {
      if (start > 0 && b < n && b - start >= minGap) out.push(x0 + (start + b) / 2)
      start = -1
    }
  }
  return out
}

/** Index of the column containing x, given ascending boundaries. */
export const colOf = (x: number, bounds: number[]) => {
  let i = 0
  while (i < bounds.length && x > bounds[i]) i++
  return i
}

const joinCell = (a: string, b: string) => (a ? (b ? `${a} ${b}` : a) : b)

/** Extracts one table from one page. `manual` boundaries override detection. */
export function extractTable(runs: Run[], segs: Seg[], o: Opts, manual?: number[] | null): PageTable {
  const lines = toChunks(runs, o.gap)
  const rich = lines.filter((l) => l.chunks.length >= o.minCells)
  const empty: PageTable = { rows: [], bounds: [], source: 'none', top: 0, bottom: 0, left: 0, right: 0, rowYs: [] }
  if (!rich.length) return empty
  const top = rich[0].y + rich[0].h, bottom = rich[rich.length - 1].y - rich[rich.length - 1].h * 0.4
  const region = lines.filter((l) => l.y <= rich[0].y + 0.01 && l.y >= rich[rich.length - 1].y - 0.01)
  const all = region.flatMap((l) => l.chunks)
  const left = Math.min(...all.map((c) => c.x0)), right = Math.max(...all.map((c) => c.x1))
  const { h: hr, v: vr } = o.rules ? splitRules(segs) : { h: [], v: [] }
  const vIn = vr.filter((s) => s.y1 >= bottom && s.y0 <= top)
  const vx = cluster(vIn.map((s) => s.x0)).filter((x) => x > left + 1 && x < right - 1)
  let bounds: number[]
  let source: PageTable['source']
  if (manual && manual.length) {
    bounds = [...manual].sort((a, b) => a - b)
    source = 'manual'
  } else if (vx.length) {
    bounds = vx
    source = 'rules'
  } else {
    bounds = gapBounds(rich)
    source = 'gaps'
  }
  const ncol = bounds.length + 1
  const toCells = (l: TLine) => {
    const cells = new Array<string>(ncol).fill('')
    for (const c of l.chunks) {
      const i = colOf((c.x0 + c.x1) / 2, bounds)
      cells[i] = joinCell(cells[i], c.str)
    }
    return cells
  }
  // Horizontal rules spanning most of the table width define row bands.
  const width = right - left
  const hy = cluster(hr.filter((s) => s.x1 - s.x0 >= width * 0.5 && s.x0 <= left + width * 0.5).map((s) => s.y0)).filter((y) => y <= top + 4 && y >= bottom - 30)
  const rows: string[][] = []
  const rowYs: number[] = []
  if (hy.length >= 3) {
    const bands = hy.sort((a, b) => b - a)
    let cur = -1
    let row: string[] | null = null
    for (const l of region) {
      let band = bands.findIndex((y, i) => i < bands.length - 1 && l.y < y && l.y > bands[i + 1])
      if (band < 0) band = -2 - rows.length // outside the ruled grid: its own row
      const cells = toCells(l)
      if (band === cur && row) cells.forEach((c, i) => (row![i] = joinCell(row![i], c)))
      else {
        row = cells
        rows.push(row)
        rowYs.push(l.y)
        cur = band
      }
    }
  } else {
    let lastY = Infinity
    for (const l of region) {
      const cells = toCells(l)
      const prev = rows[rows.length - 1]
      const filled = prev ? prev.filter((c) => c).length : 0
      if (o.mergeWrapped && prev && !cells[0] && l.chunks.length < Math.max(2, filled) && lastY - l.y < l.h * 1.9) {
        cells.forEach((c, i) => (prev[i] = joinCell(prev[i], c)))
      } else {
        rows.push(cells)
        rowYs.push(l.y)
      }
      lastY = l.y
    }
  }
  return { rows: dropEmptyCols(rows), bounds, source, top, bottom, left, right, rowYs }
}

/** Removes columns that are empty in every row. */
export function dropEmptyCols(rows: string[][]): string[][] {
  const n = Math.max(0, ...rows.map((r) => r.length))
  const keep = Array.from({ length: n }, (_, i) => rows.some((r) => (r[i] ?? '').trim() !== ''))
  return rows.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? '').filter((_, i) => keep[i]))
}

/** Joins per-page tables; optionally drops header rows repeated on later pages. */
export function combine(tables: string[][][], dropRepeatedHeader = true): string[][] {
  const out: string[][] = []
  const header = tables.find((t) => t.length)?.[0]
  const key = (r: string[]) => r.map((c) => c.trim().toLowerCase()).join('\u0001')
  tables.forEach((t, i) => {
    t.forEach((r, j) => {
      if (dropRepeatedHeader && i > 0 && j === 0 && header && key(r) === key(header)) return
      out.push(r)
    })
  })
  const n = Math.max(0, ...out.map((r) => r.length))
  return out.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? ''))
}

export function toTsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n')
}

export function toMarkdown(rows: string[][]): string {
  if (!rows.length) return ''
  const esc = (c: string) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const n = Math.max(...rows.map((r) => r.length))
  const line = (r: string[]) => `| ${Array.from({ length: n }, (_, i) => esc(r[i] ?? '')).join(' | ')} |`
  const numeric = Array.from({ length: n }, (_, i) => rows.slice(1).filter((r) => r[i]?.trim()).every((r) => /^[-+−(]?[$€£]?\s?[\d.,]+%?\)?$/.test(r[i].trim())) && rows.length > 1)
  return [line(rows[0]), `| ${numeric.map((x) => (x ? '---:' : '---')).join(' | ')} |`, ...rows.slice(1).map(line)].join('\n')
}

/**
 * Walks a pdf.js operator list and returns straight path segments in page space.
 * `fn`/`args` are OperatorList.fnArray/argsArray; `ops` maps names → codes (pdfjs OPS).
 * Path data uses pdf.js DrawOPS codes: 0 moveTo, 1 lineTo, 2 curveTo, 3 quadraticCurveTo, 4 closePath.
 */
export function segmentsFromOps(fn: number[], args: unknown[], ops: { save: number; restore: number; transform: number; constructPath: number }): Seg[] {
  type M = [number, number, number, number, number, number]
  let ctm: M = [1, 0, 0, 1, 0, 0]
  const stack: M[] = []
  const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
  const ap = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]
  const out: Seg[] = []
  for (let i = 0; i < fn.length; i++) {
    const f = fn[i]
    if (f === ops.save) stack.push(ctm)
    else if (f === ops.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
    else if (f === ops.transform) ctm = mul(ctm, args[i] as M)
    else if (f === ops.constructPath) {
      const a = args[i] as unknown[]
      const raw = (a?.[1] as unknown[] | undefined)?.[0]
      if (!raw || typeof raw !== 'object' || !('length' in raw)) continue
      const d = raw as ArrayLike<number>
      let cx = 0, cy = 0, sx = 0, sy = 0
      for (let k = 0; k < d.length; ) {
        const op = d[k++]
        if (op === 0) {
          cx = sx = d[k++]
          cy = sy = d[k++]
        } else if (op === 1) {
          const x = d[k++], y = d[k++]
          const [p0x, p0y] = ap(cx, cy), [p1x, p1y] = ap(x, y)
          out.push({ x0: p0x, y0: p0y, x1: p1x, y1: p1y })
          cx = x
          cy = y
        } else if (op === 2) {
          k += 4
          cx = d[k++]
          cy = d[k++]
        } else if (op === 3) {
          k += 2
          cx = d[k++]
          cy = d[k++]
        } else if (op === 4) {
          const [p0x, p0y] = ap(cx, cy), [p1x, p1y] = ap(sx, sy)
          if (p0x !== p1x || p0y !== p1y) out.push({ x0: p0x, y0: p0y, x1: p1x, y1: p1y })
          cx = sx
          cy = sy
        } else break
      }
    }
  }
  return out
}
