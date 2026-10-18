// PDF Compare Tool logic: positioned words from pdf.js text runs, a word-level diff between two
// documents (Myers diff from text-diff-viewer), change grouping and a per-pixel visual diff.
import { toLines, type Run } from './pdf-text-extractor'
import { diffKeys } from './text-diff-viewer'

export interface PageRuns { runs: Run[]; w: number; h: number }
/** One word with its box in PDF user space (x/y = baseline-left, y grows upward). */
export interface Word { text: string; page: number; x: number; y: number; w: number; h: number }

/** Splits every run into words (reading order per page), spreading the run width over its characters. */
export function pageWords(pages: PageRuns[]): Word[] {
  const out: Word[] = []
  pages.forEach((p, page) => {
    for (const line of toLines(p.runs)) {
      for (const r of line.runs) {
        const len = r.str.length || 1
        const re = /\S+/g
        let m: RegExpExecArray | null
        while ((m = re.exec(r.str))) {
          out.push({ text: m[0], page, x: r.x + (r.w * m.index) / len, y: r.y, w: (r.w * m[0].length) / len, h: r.h })
        }
      }
    }
  })
  return out
}

export interface CompareOpts { ignoreCase: boolean; ignorePunct: boolean }

export function wordKey(w: string, o: CompareOpts): string {
  let k = o.ignoreCase ? w.toLowerCase() : w
  if (o.ignorePunct) k = k.replace(/[^\p{L}\p{N}]/gu, '') || k
  return k
}

export type Kind = 'added' | 'removed' | 'changed'
export interface Change { id: number; kind: Kind; a: number[]; b: number[]; aText: string; bText: string; pageA: number; pageB: number }

export interface Comparison { changes: Change[]; same: number; added: number; removed: number; similarity: number; aWord: Int32Array; bWord: Int32Array }

/**
 * Word diff of two documents. Consecutive inserted/deleted words form one change;
 * `aWord[i]` / `bWord[j]` give the change id of each word (-1 = unchanged).
 */
export function compareWords(A: Word[], B: Word[], o: CompareOpts): Comparison {
  const ops = diffKeys(A.map((w) => wordKey(w.text, o)), B.map((w) => wordKey(w.text, o)), 6000)
  const changes: Change[] = []
  const aWord = new Int32Array(A.length).fill(-1), bWord = new Int32Array(B.length).fill(-1)
  let same = 0, added = 0, removed = 0
  let cur: Change | null = null
  let lastA = -1, lastB = -1
  for (const op of ops) {
    if (op.t === 'eq') {
      same++
      cur = null
      lastA = op.a
      lastB = op.b
      continue
    }
    if (!cur) {
      cur = { id: changes.length, kind: 'added', a: [], b: [], aText: '', bText: '', pageA: A[lastA]?.page ?? 0, pageB: B[lastB]?.page ?? 0 }
      changes.push(cur)
    }
    if (op.t === 'del') {
      cur.a.push(op.a)
      aWord[op.a] = cur.id
      removed++
    } else {
      cur.b.push(op.b)
      bWord[op.b] = cur.id
      added++
    }
  }
  for (const c of changes) {
    c.kind = c.a.length && c.b.length ? 'changed' : c.a.length ? 'removed' : 'added'
    c.aText = c.a.map((i) => A[i].text).join(' ')
    c.bText = c.b.map((i) => B[i].text).join(' ')
    if (c.a.length) c.pageA = A[c.a[0]].page
    if (c.b.length) c.pageB = B[c.b[0]].page
  }
  const total = A.length + B.length
  return { changes, same, added, removed, similarity: total ? (2 * same) / total : 1, aWord, bWord }
}

/** Highlight rectangles (in PDF user space) for the words of one change on one page, merged per line. */
export function boxes(words: Word[], idx: number[], page: number): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = []
  for (const i of idx) {
    const w = words[i]
    if (w.page !== page) continue
    const last = out[out.length - 1]
    const top = w.y + w.h * 0.9, bottom = w.y - w.h * 0.25
    if (last && Math.abs(last.y - bottom) < w.h * 0.5 && w.x >= last.x && w.x - (last.x + last.w) < w.h * 1.5) {
      last.w = Math.max(last.w, w.x + w.w - last.x)
      last.h = Math.max(last.h, top - bottom)
    } else out.push({ x: w.x, y: bottom, w: w.w, h: top - bottom })
  }
  return out
}

/**
 * Pixel diff of two RGBA images of equal size. A pixel differs when any channel differs by more
 * than `threshold` (0–255). Returns the count and an RGBA overlay: faded grey copy of `b` with
 * differing pixels in red (only in a) / green (only in b ink) / orange (both inked).
 */
export function pixelDiff(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, h: number, threshold = 32): { count: number; out: Uint8ClampedArray<ArrayBuffer> } {
  const out = new Uint8ClampedArray(w * h * 4)
  let count = 0
  for (let i = 0; i < w * h * 4; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]))
    const la = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) * (a[i + 3] / 255) + 255 * (1 - a[i + 3] / 255)
    const lb = (b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114) * (b[i + 3] / 255) + 255 * (1 - b[i + 3] / 255)
    if (d > threshold) {
      count++
      const inkA = la < 200, inkB = lb < 200
      if (inkA && !inkB) out.set([220, 38, 38, 255], i)
      else if (inkB && !inkA) out.set([5, 150, 105, 255], i)
      else out.set([234, 128, 12, 255], i)
    } else {
      const g = 255 - (255 - lb) * 0.25
      out.set([g, g, g, 255], i)
    }
  }
  return { count, out }
}

/** Plain-text report of all changes. */
export function report(changes: Change[], nameA: string, nameB: string): string {
  const lines = [`Comparison: ${nameA} → ${nameB}`, `${changes.length} change(s)`, '']
  for (const c of changes) {
    lines.push(`#${c.id + 1} ${c.kind.toUpperCase()} (old p.${c.pageA + 1} / new p.${c.pageB + 1})`)
    if (c.aText) lines.push(`  - ${c.aText}`)
    if (c.bText) lines.push(`  + ${c.bText}`)
  }
  return lines.join('\n')
}
