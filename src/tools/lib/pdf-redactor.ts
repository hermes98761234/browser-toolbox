// Pure logic for PDF Redactor: finding text to redact from positioned runs and handling boxes.
// All coordinates are in "page points" with a top-left origin (pdf.js viewport at scale 1).

/** One text run: left x, baseline y, advance width and font size (pt). */
export interface TRun { str: string; x: number; y: number; w: number; h: number }
/** A redaction rectangle on page `page` (0-based). */
export interface Box { id: string; page: number; x: number; y: number; w: number; h: number; src: string; text?: string }

export const PRESETS: { key: string; label: string; re: string }[] = [
  { key: 'email', label: 'E-mail', re: String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)+` },
  { key: 'phone', label: 'Phone', re: String.raw`(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3}[\s.-]?\d{3,4}` },
  { key: 'ssn', label: 'SSN', re: String.raw`\b\d{3}-\d{2}-\d{4}\b` },
  { key: 'card', label: 'Card no.', re: String.raw`\b(?:\d{4}[ -]?){3}\d{4}\b` },
  { key: 'iban', label: 'IBAN', re: String.raw`\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b` },
  { key: 'date', label: 'Dates', re: String.raw`\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\b` },
  { key: 'money', label: 'Amounts', re: String.raw`[$€£]\s?\d[\d,]*(?:\.\d{2})?` },
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Builds a global RegExp from a search term; returns null for empty or invalid input. */
export function buildRegex(term: string, o: { regex: boolean; caseSens: boolean; word: boolean }): RegExp | null {
  if (!term.trim()) return null
  let src = o.regex ? term : escapeRe(term.trim())
  if (o.word) src = `\\b(?:${src})\\b`
  try {
    const re = new RegExp(src, o.caseSens ? 'g' : 'gi')
    if (new RegExp(src).test('')) return null // patterns matching the empty string would loop forever
    return re
  } catch {
    return null
  }
}

/**
 * Finds every match of `re` inside each run and returns a box covering the matched characters.
 * `measure` gives the width of a substring relative to the run (defaults to character count).
 */
export function findBoxes(runs: TRun[], re: RegExp, page: number, src: string, pad = 1.5, measure?: (s: string, full: string) => number): Box[] {
  const out: Box[] = []
  const rel = measure ?? ((s: string, full: string) => (full.length ? s.length / full.length : 0))
  for (const r of runs) {
    if (!r.str) continue
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(r.str))) {
      if (!m[0].length) {
        re.lastIndex++
        continue
      }
      const a = rel(r.str.slice(0, m.index), r.str)
      const b = rel(r.str.slice(0, m.index + m[0].length), r.str)
      const top = r.y - r.h * 0.92
      out.push({ id: `${src}-${page}-${out.length}-${Math.round(r.x)}-${Math.round(r.y)}`, page, x: r.x + r.w * a - pad, y: top - pad, w: r.w * (b - a) + 2 * pad, h: r.h * 1.18 + 2 * pad, src, text: m[0] })
    }
  }
  return out
}

/** True when two boxes on the same page overlap by most of the smaller one (dedupe repeated searches). */
export function sameBox(a: Box, b: Box): boolean {
  if (a.page !== b.page) return false
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return ix * iy > 0.8 * Math.min(a.w * a.h, b.w * b.h)
}

export function addUnique(list: Box[], add: Box[]): Box[] {
  const out = [...list]
  for (const b of add) if (!out.some((x) => sameBox(x, b))) out.push(b)
  return out
}

/** Normalizes a drag rectangle (any direction) and clamps it to the page. */
export function normRect(x0: number, y0: number, x1: number, y1: number, pw: number, ph: number) {
  const x = Math.max(0, Math.min(x0, x1)), y = Math.max(0, Math.min(y0, y1))
  return { x, y, w: Math.min(pw, Math.max(x0, x1)) - x, h: Math.min(ph, Math.max(y0, y1)) - y }
}

/** Pages (0-based, sorted) that must be rasterized. */
export function pagesToRaster(boxes: Box[], total: number, all: boolean): number[] {
  if (all) return Array.from({ length: total }, (_, i) => i)
  return [...new Set(boxes.map((b) => b.page))].filter((p) => p >= 0 && p < total).sort((a, b) => a - b)
}
