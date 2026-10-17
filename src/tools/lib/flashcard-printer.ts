// Flashcard printer core: parse term lists, fit cards on paper, map backs for duplex printing.
import { detectDelimiter, parseCsv } from './csv-json-converter'

export interface Card { front: string; back: string }

const HEADER = /^(term|front|question|word|q)$/i

/**
 * Parses "term ⇥ definition" lines. Separators tried per line: tab, " - ", " — ", " = ", "::", ";", then ",".
 * A whole CSV (quoted fields, multi-line cells) is detected when the text looks like one.
 */
export function parseCards(text: string): Card[] {
  const src = text.replace(/\r\n?/g, '\n').trim()
  if (!src) return []
  const lines = src.split('\n').filter((l) => l.trim())
  let rows: string[][]
  if (src.includes('"') || lines.every((l) => l.includes('\t'))) {
    const d = detectDelimiter(src)
    rows = parseCsv(src, d)
  } else {
    rows = lines.map((l) => {
      for (const sep of ['\t', ' - ', ' — ', ' – ', ' = ', '::', ': ', ';', ',']) {
        const i = l.indexOf(sep)
        if (i > 0) return [l.slice(0, i), l.slice(i + sep.length)]
      }
      return [l]
    })
  }
  const cards = rows
    .map((r) => ({ front: (r[0] ?? '').trim(), back: r.slice(1).join(', ').trim() }))
    .filter((c) => c.front || c.back)
  if (cards.length > 1 && HEADER.test(cards[0].front)) cards.shift()
  return cards
}

export interface Grid { cols: number; rows: number; perPage: number; x0: number; y0: number; cw: number; ch: number; gap: number }

/** Grid of w×h cards (mm) on a W×H page with margin m and gap g, centred so mirrored backs line up. */
export function grid(W: number, H: number, w: number, h: number, m: number, g: number): Grid {
  const cols = Math.max(0, Math.floor((W - 2 * m + g) / (w + g)))
  const rows = Math.max(0, Math.floor((H - 2 * m + g) / (h + g)))
  const usedW = cols * w + Math.max(0, cols - 1) * g
  const usedH = rows * h + Math.max(0, rows - 1) * g
  return { cols, rows, perPage: cols * rows, x0: (W - usedW) / 2, y0: (H - usedH) / 2, cw: w, ch: h, gap: g }
}

export type Duplex = 'long' | 'short'

/** Slot on the back page that sits behind front slot `i` (row-major). */
export function backSlot(i: number, cols: number, rows: number, mode: Duplex): number {
  const r = Math.floor(i / cols), c = i % cols
  return mode === 'long' ? r * cols + (cols - 1 - c) : (rows - 1 - r) * cols + c
}

/** Chunks cards into pages; each back page lists the card for every slot (null = empty). */
export function paginate<T>(cards: T[], g: Grid, mode: Duplex): { fronts: (T | null)[]; backs: (T | null)[] }[] {
  const out: { fronts: (T | null)[]; backs: (T | null)[] }[] = []
  if (!g.perPage) return out
  for (let p = 0; p < cards.length; p += g.perPage) {
    const fronts: (T | null)[] = Array.from({ length: g.perPage }, (_, i) => cards[p + i] ?? null)
    const backs: (T | null)[] = Array(g.perPage).fill(null)
    fronts.forEach((c, i) => (backs[backSlot(i, g.cols, g.rows, mode)] = c))
    out.push({ fronts, backs })
  }
  return out
}

/** Font size (pt) so `text` roughly fills at most ~65 % of a w×h mm box, capped at maxPt. */
export function fitFont(text: string, w: number, h: number, maxPt: number, minPt = 6): number {
  const n = Math.max(1, text.length)
  const mm = Math.sqrt((0.65 * w * h) / (n * 0.55 * 1.3)) // char ≈ 0.55 em wide, line ≈ 1.3 em
  const longest = Math.max(1, ...text.split(/\s+/).map((s) => s.length))
  const wordCap = (0.9 * w) / (longest * 0.6) // the longest word must fit on one line
  const pt = Math.min(mm, wordCap, (h * 0.8) / 1.3) / 0.3528
  return Math.max(minPt, Math.min(maxPt, Math.round(pt * 2) / 2))
}

export const PAPERS: Record<string, [number, number]> = { A4: [210, 297], Letter: [215.9, 279.4], A5: [148, 210], Legal: [215.9, 355.6] }
export const SIZES: Record<string, [number, number]> = {
  'Index card 5×3 in': [127, 76.2],
  'Index card 6×4 in': [152.4, 101.6],
  'Playing card 63×88 mm': [63, 88],
  'Business card 85×55 mm': [85, 55],
  'Half A6 (74×52 mm)': [74, 52],
  'A7 (105×74 mm)': [105, 74],
}
