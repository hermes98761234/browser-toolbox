// Rubric scoring: weighted criteria × point levels, student totals, letter grades, class statistics.

export interface Level {
  id: string
  name: string
  points: number
}
export interface Criterion {
  id: string
  name: string
  weight: number
  cells: Record<string, string> // level id → descriptor
}
export interface Student {
  id: string
  name: string
  picks: Record<string, string> // criterion id → level id
  comment: string
}

export const maxLevel = (levels: Level[]) => Math.max(0, ...levels.map((l) => l.points))

export function maxTotal(criteria: Criterion[], levels: Level[]) {
  return criteria.reduce((a, c) => a + c.weight * maxLevel(levels), 0)
}

/** Points earned on one criterion, or null when it has not been scored. */
export function criterionScore(c: Criterion, levels: Level[], st: Student): number | null {
  const l = levels.find((x) => x.id === st.picks[c.id])
  return l ? l.points * c.weight : null
}

export interface Result {
  earned: number
  max: number
  pct: number
  scored: number // criteria scored
  complete: boolean
}

export function studentResult(criteria: Criterion[], levels: Level[], st: Student): Result {
  let earned = 0, scored = 0
  for (const c of criteria) {
    const v = criterionScore(c, levels, st)
    if (v !== null) {
      earned += v
      scored++
    }
  }
  const max = maxTotal(criteria, levels)
  return { earned, max, pct: max ? earned / max : 0, scored, complete: scored === criteria.length && criteria.length > 0 }
}

export const GRADES: [number, string][] = [[0.9, 'A'], [0.8, 'B'], [0.7, 'C'], [0.6, 'D'], [0, 'F']]
export function letter(p: number, scale = GRADES) {
  for (const [min, g] of scale) if (p >= min - 1e-9) return g
  return scale[scale.length - 1][1]
}

export function median(xs: number[]) {
  if (!xs.length) return NaN
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/** Average level points per criterion (unweighted, over students who were scored on it). */
export function criterionAverages(criteria: Criterion[], levels: Level[], students: Student[]) {
  return criteria.map((c) => {
    const pts = students.map((s) => levels.find((l) => l.id === s.picks[c.id])?.points).filter((x): x is number => x !== undefined)
    return { id: c.id, name: c.name, avg: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : NaN, n: pts.length }
  })
}

/** Keeps text printable with pdf-lib's standard (WinAnsi) fonts. */
export function pdfSafe(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, '?')
}

/** Greedy word wrap with a width function (e.g. font.widthOfTextAtSize). */
export function wrap(text: string, max: number, width: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w
      if (width(t) <= max || !line) line = t
      else {
        out.push(line)
        line = w
      }
    }
    out.push(line)
  }
  return out
}
