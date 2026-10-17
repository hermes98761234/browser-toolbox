// Pure layout logic for PDF Text Extractor: turns positioned text runs (as returned by
// pdf.js getTextContent) into readable plain text — lines, paragraphs, columns.

/** One text run in PDF user space: x/y = baseline origin (y grows upward), w = advance width, h = font size. */
export interface Run { str: string; x: number; y: number; w: number; h: number }
export type Mode = 'lines' | 'paragraphs' | 'layout'
export interface Opts { mode: Mode; columns: boolean; dehyphen: boolean }

export interface Line { y: number; h: number; runs: Run[] }

/** Groups runs into lines (top to bottom), each sorted left to right. */
export function toLines(runs: Run[]): Line[] {
  const rs = runs.filter((r) => r.str.trim() !== '' || r.w > 0).filter((r) => r.str !== '')
  rs.sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Line[] = []
  for (const r of rs) {
    const h = Math.max(1, r.h)
    const ln = lines.find((l) => Math.abs(l.y - r.y) < 0.5 * Math.min(Math.max(l.h, 1), h) + 0.01)
    if (ln) {
      ln.runs.push(r)
      ln.h = Math.max(ln.h, h)
    } else lines.push({ y: r.y, h, runs: [r] })
  }
  for (const l of lines) l.runs.sort((a, b) => a.x - b.x)
  return lines.sort((a, b) => b.y - a.y)
}

/** Joins the runs of one line, inserting spaces at gaps (or padding to columns in layout mode). */
export function joinLine(l: Line, layout = false, charW = 0): string {
  let out = ''
  let end = -Infinity
  for (const r of l.runs) {
    const gap = r.x - end
    const h = Math.max(1, r.h)
    if (out) {
      if (layout && charW > 0 && gap > h) out += ' '.repeat(Math.max(2, Math.round(gap / charW)))
      else if (gap > 0.15 * h && !out.endsWith(' ') && !r.str.startsWith(' ')) out += ' '
    } else if (layout && charW > 0 && r.x > 0) out += ' '.repeat(Math.max(0, Math.round(r.x / charW)))
    out += r.str
    end = Math.max(end, r.x + r.w)
  }
  return layout ? out.replace(/\s+$/, '') : out.replace(/\s+/g, ' ').trim()
}

/** Finds a vertical gutter (x position) separating two text columns, or null. */
export function findGutter(lines: Line[]): number | null {
  const runs = lines.flatMap((l) => l.runs).filter((r) => r.str.trim())
  if (lines.length < 6 || runs.length < 6) return null
  const x0 = Math.min(...runs.map((r) => r.x)), x1 = Math.max(...runs.map((r) => r.x + r.w))
  const bin = 2, n = Math.ceil((x1 - x0) / bin) + 1
  const cover = new Array<number>(n).fill(0)
  for (const l of lines) {
    const seen = new Set<number>()
    for (const r of l.runs) if (r.str.trim()) for (let b = Math.floor((r.x - x0) / bin); b <= Math.floor((r.x + r.w - x0) / bin); b++) seen.add(b)
    for (const b of seen) if (b >= 0 && b < n) cover[b]++
  }
  const limit = Math.max(1, lines.length * 0.08)
  let best: [number, number] | null = null
  let start = -1
  for (let b = 0; b <= n; b++) {
    const empty = b < n && cover[b] <= limit && b > n * 0.2 && b < n * 0.8
    if (empty && start < 0) start = b
    if (!empty && start >= 0) {
      if (!best || b - start > best[1] - best[0]) best = [start, b]
      start = -1
    }
  }
  if (!best || (best[1] - best[0]) * bin < 10) return null
  // Both sides must actually hold text on a good share of lines.
  const g = x0 + ((best[0] + best[1]) / 2) * bin
  const left = lines.filter((l) => l.runs.some((r) => r.x + r.w < g)).length
  const right = lines.filter((l) => l.runs.some((r) => r.x > g)).length
  return left >= lines.length * 0.3 && right >= lines.length * 0.3 ? g : null
}

/** Reorders lines so that two-column regions read left column first, then right. */
export function columnOrder(lines: Line[], g: number): Line[] {
  const out: Line[] = []
  let L: Line[] = [], R: Line[] = []
  const flush = () => {
    out.push(...L, ...R)
    L = []
    R = []
  }
  for (const l of lines) {
    if (l.runs.some((r) => r.x < g && r.x + r.w > g)) {
      flush()
      out.push(l)
      continue
    }
    const a = l.runs.filter((r) => r.x + r.w / 2 < g), b = l.runs.filter((r) => r.x + r.w / 2 >= g)
    if (a.length) L.push({ ...l, runs: a })
    if (b.length) R.push({ ...l, runs: b })
  }
  flush()
  return out
}

const endsHyphen = (s: string) => /[A-Za-zÀ-ɏЀ-ӿ]-$/.test(s)

/** Turns one page's runs into text according to the options. */
export function pageText(runs: Run[], o: Opts): string {
  let lines = toLines(runs)
  if (!lines.length) return ''
  if (o.mode === 'layout') {
    const hs = runs.map((r) => r.h).filter((h) => h > 0).sort((a, b) => a - b)
    const charW = (hs[Math.floor(hs.length / 2)] ?? 10) * 0.5
    const minX = Math.min(...runs.map((r) => r.x))
    const shifted = lines.map((l) => ({ ...l, runs: l.runs.map((r) => ({ ...r, x: r.x - minX })) }))
    const out: string[] = []
    shifted.forEach((l, i) => {
      if (i > 0) {
        const gap = shifted[i - 1].y - l.y
        const extra = Math.round(gap / (l.h * 1.25)) - 1
        for (let k = 0; k < Math.min(extra, 3); k++) out.push('')
      }
      out.push(joinLine(l, true, charW))
    })
    return out.join('\n')
  }
  if (o.columns) {
    const g = findGutter(lines)
    if (g !== null) lines = columnOrder(lines, g)
  }
  const texts = lines.map((l) => joinLine(l))
  // Paragraph breaks: a vertical jump clearly larger than normal leading, or a column restart.
  const breaks = lines.map((l, i) => {
    if (i === 0) return false
    const dy = lines[i - 1].y - l.y
    return dy < 0 || dy > Math.max(lines[i - 1].h, l.h) * 1.75 || Math.abs(lines[i - 1].h - l.h) > 1.5
  })
  const out: string[] = []
  let cur = ''
  texts.forEach((t, i) => {
    if (o.mode === 'lines') {
      if (breaks[i]) out.push('')
      if (o.dehyphen && out.length && endsHyphen(out[out.length - 1]) && /^[a-zß-ÿа-я]/.test(t) && !breaks[i]) {
        out[out.length - 1] = out[out.length - 1].slice(0, -1) + t
      } else out.push(t)
      return
    }
    if (breaks[i] && cur) {
      out.push(cur, '')
      cur = ''
    }
    if (!cur) cur = t
    else if (o.dehyphen && endsHyphen(cur) && /^[a-zß-ÿа-я]/.test(t)) cur = cur.slice(0, -1) + t
    else cur += ' ' + t
  })
  if (cur) out.push(cur)
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export const wordCount = (s: string) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length
