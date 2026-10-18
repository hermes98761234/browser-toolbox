// Customer Survey Kiosk logic: survey schema, answer validation, tallies (ratings, NPS, choices)
// and CSV rows. Storage (IndexedDB) and UI live in the component.

export type QType = 'rating' | 'nps' | 'emoji' | 'choice' | 'multi' | 'yesno' | 'text'
export interface Question { id: string; type: QType; label: string; options: string[]; required: boolean }
export interface Survey { title: string; intro: string; thanks: string; questions: Question[] }
export type Answer = number | string | string[] | null
export interface Resp { id: string; at: number; answers: Record<string, Answer>; demo?: boolean }

export const EMOJI = ['😠', '🙁', '😐', '🙂', '😍']

/** True when the answer counts as given. */
export function answered(a: Answer | undefined): boolean {
  if (a === null || a === undefined) return false
  if (Array.isArray(a)) return a.length > 0
  if (typeof a === 'string') return a.trim() !== ''
  return Number.isFinite(a)
}

/** Ids of required questions that are still unanswered. */
export function missing(s: Survey, answers: Record<string, Answer>): string[] {
  return s.questions.filter((q) => q.required && !answered(answers[q.id])).map((q) => q.id)
}

export interface NumStats { n: number; mean: number; dist: number[] }
/** Distribution over lo..hi (inclusive) and mean of numeric answers. */
export function numStats(values: Answer[], lo: number, hi: number): NumStats {
  const dist = new Array<number>(hi - lo + 1).fill(0)
  let sum = 0, n = 0
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) continue
    dist[Math.round(v) - lo]++
    sum += v
    n++
  }
  return { n, mean: n ? sum / n : NaN, dist }
}

/** Net Promoter Score: % promoters (9–10) − % detractors (0–6). */
export function nps(values: Answer[]): { n: number; score: number; promoters: number; passives: number; detractors: number } {
  const xs = values.filter((v): v is number => typeof v === 'number' && v >= 0 && v <= 10)
  const p = xs.filter((v) => v >= 9).length, d = xs.filter((v) => v <= 6).length
  const n = xs.length
  return { n, score: n ? Math.round(((p - d) / n) * 100) : NaN, promoters: p, passives: n - p - d, detractors: d }
}

/** Counts per option (single or multiple choice). Unknown answers are grouped under "Other". */
export function choiceCounts(values: Answer[], options: string[]): { label: string; value: number }[] {
  const m = new Map<string, number>(options.map((o) => [o, 0]))
  for (const v of values) {
    const list = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []
    for (const x of list) {
      const k = m.has(x) ? x : 'Other'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
  }
  return [...m].map(([label, value]) => ({ label, value }))
}

/** Responses per local day (YYYY-MM-DD), sorted. */
export function perDay(rs: Resp[]): [string, number][] {
  const m = new Map<string, number>()
  for (const r of rs) {
    const d = new Date(r.at)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m].sort((a, b) => a[0].localeCompare(b[0]))
}

export function answerText(q: Question, a: Answer | undefined): string {
  if (!answered(a ?? null)) return ''
  if (Array.isArray(a)) return a.join('; ')
  if (q.type === 'emoji' && typeof a === 'number') return `${a} ${EMOJI[a - 1] ?? ''}`.trim()
  return String(a)
}

/** CSV rows: header + one row per response. */
export function csvRows(s: Survey, rs: Resp[]): string[][] {
  return [
    ['Response ID', 'Submitted', ...s.questions.map((q) => q.label)],
    ...rs.map((r) => [r.id, new Date(r.at).toISOString(), ...s.questions.map((q) => answerText(q, r.answers[q.id]))]),
  ]
}

/** Deterministic pseudo-random generator (mulberry32) for demo data. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Plausible demo responses spread over the last `days` days. */
export function demoResponses(s: Survey, n: number, now: number, days = 14, seed = 7): Resp[] {
  const r = rng(seed)
  const skew = (lo: number, hi: number) => Math.min(hi, lo + Math.floor(Math.pow(r(), 0.55) * (hi - lo + 1)))
  const comments = ['Friendly staff, quick service.', 'Wait was a bit long at lunch.', 'Loved the new seasonal menu!', 'Could use more seating.', 'Great coffee as always.', 'Card reader was slow.', 'Clean and bright, will come back.', '']
  return Array.from({ length: n }, (_, i) => {
    const answers: Record<string, Answer> = {}
    for (const q of s.questions) {
      if (q.type === 'rating' || q.type === 'emoji') answers[q.id] = skew(1, 5)
      else if (q.type === 'nps') answers[q.id] = skew(3, 10)
      else if (q.type === 'yesno') answers[q.id] = r() < 0.78 ? 'Yes' : 'No'
      else if (q.type === 'choice') answers[q.id] = q.options[Math.floor(Math.pow(r(), 1.4) * q.options.length)] ?? null
      else if (q.type === 'multi') answers[q.id] = q.options.filter(() => r() < 0.4)
      else answers[q.id] = r() < 0.45 ? comments[Math.floor(r() * comments.length)] : ''
    }
    const at = now - Math.floor(r() * days * 86400000)
    return { id: `demo-${i + 1}`, at, answers, demo: true }
  }).sort((a, b) => a.at - b.at)
}
