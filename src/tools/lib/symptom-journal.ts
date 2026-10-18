// Symptom journal: entries, daily aggregation, trend slope and trigger association (pure helpers).

export interface Entry {
  id: string
  /** Local date-time "YYYY-MM-DDTHH:MM". */
  at: string
  symptom: string
  /** 0 (none) … 10 (worst imaginable). */
  severity: number
  /** Duration in minutes (0 = unknown / ongoing). */
  minutes: number
  tags: string[]
  triggers: string[]
  meds: string
  notes: string
}

export const dayOf = (at: string) => at.slice(0, 10)

/** Whole days between two YYYY-MM-DD dates (b − a), DST-safe. */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function severityWord(s: number): string {
  if (s <= 0) return 'None'
  if (s <= 3) return 'Mild'
  if (s <= 6) return 'Moderate'
  if (s <= 8) return 'Severe'
  return 'Very severe'
}

export function severityColor(s: number): string {
  if (s <= 3) return '#10b981'
  if (s <= 6) return '#f59e0b'
  if (s <= 8) return '#f97316'
  return '#ef4444'
}

/** Entries within [from, to] (inclusive dates), optionally matching symptom and every given tag. */
export function filterEntries(es: Entry[], o: { from?: string; to?: string; symptom?: string; tags?: string[] }): Entry[] {
  return es
    .filter((e) => (!o.from || dayOf(e.at) >= o.from) && (!o.to || dayOf(e.at) <= o.to))
    .filter((e) => !o.symptom || e.symptom === o.symptom)
    .filter((e) => !o.tags?.length || o.tags.every((t) => e.tags.includes(t)))
    .sort((a, b) => b.at.localeCompare(a.at))
}

/** Daily maximum severity per day of the range for one symptom (null = no entry that day). */
export function dailyMax(es: Entry[], symptom: string, from: string, to: string): (number | null)[] {
  const n = daysBetween(from, to) + 1
  const out: (number | null)[] = Array(Math.max(0, n)).fill(null)
  for (const e of es) {
    if (e.symptom !== symptom) continue
    const i = daysBetween(from, dayOf(e.at))
    if (i >= 0 && i < n) out[i] = Math.max(out[i] ?? 0, e.severity)
  }
  return out
}

/** Least-squares slope of (x, y) pairs; 0 when fewer than 2 distinct x. */
export function slope(pts: [number, number][]): number {
  const n = pts.length
  if (n < 2) return 0
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n
  let sxx = 0, sxy = 0
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my) }
  return sxx ? sxy / sxx : 0
}

export interface SymptomSummary { symptom: string; count: number; days: number; avg: number; max: number; last: string; perWeek: number; trend: number }

/** Per-symptom stats over [from, to]; trend = change in severity per week (regression over entries). */
export function summarize(es: Entry[], from: string, to: string): SymptomSummary[] {
  const span = Math.max(1, daysBetween(from, to) + 1)
  const by = new Map<string, Entry[]>()
  for (const e of filterEntries(es, { from, to })) by.set(e.symptom, [...(by.get(e.symptom) ?? []), e])
  return [...by.entries()]
    .map(([symptom, l]) => ({
      symptom,
      count: l.length,
      days: new Set(l.map((e) => dayOf(e.at))).size,
      avg: l.reduce((a, e) => a + e.severity, 0) / l.length,
      max: Math.max(...l.map((e) => e.severity)),
      last: l[0].at,
      perWeek: (l.length / span) * 7,
      trend: slope(l.map((e) => [daysBetween(from, dayOf(e.at)), e.severity])) * 7,
    }))
    .sort((a, b) => b.count - a.count || a.symptom.localeCompare(b.symptom))
}

export interface TriggerStat { trigger: string; count: number; avgWith: number; avgWithout: number; diff: number }

/** For each trigger: how often it was logged and mean severity of entries with vs. without it. */
export function triggerStats(es: Entry[]): TriggerStat[] {
  const all = new Set(es.flatMap((e) => e.triggers))
  const mean = (l: Entry[]) => (l.length ? l.reduce((a, e) => a + e.severity, 0) / l.length : NaN)
  return [...all]
    .map((t) => {
      const w = es.filter((e) => e.triggers.includes(t)), wo = es.filter((e) => !e.triggers.includes(t))
      const avgWith = mean(w), avgWithout = mean(wo)
      return { trigger: t, count: w.length, avgWith, avgWithout, diff: Number.isFinite(avgWithout) ? avgWith - avgWithout : 0 }
    })
    .sort((a, b) => b.count - a.count || b.diff - a.diff)
}

export const parseList = (s: string) => [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]

export function fmtDuration(min: number): string {
  if (!(min > 0)) return '—'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Characters the PDF standard fonts (WinAnsi) can encode; others become '?'. */
export const pdfSafe = (s: string) => s.replace(/[−]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…]/g, '?')

/** Deterministic sample: ~6 weeks of headaches, fatigue and stomach pain ending on `end`. */
export function sampleEntries(end: string): Entry[] {
  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const out: Entry[] = []
  for (let d = 41; d >= 0; d--) {
    const day = addDays(end, -d)
    const late = r() < 0.35, coffee = r() < 0.3
    if (r() < 0.38 || late) {
      const sev = Math.max(1, Math.min(10, Math.round(3 + (late ? 2 : 0) + (coffee ? 1 : 0) + r() * 3 - d / 30)))
      out.push({ id: `h${d}`, at: `${day}T${String(13 + Math.floor(r() * 7)).padStart(2, '0')}:${r() < 0.5 ? '15' : '40'}`, symptom: 'Headache', severity: sev, minutes: 60 + Math.round(r() * 8) * 30, tags: sev >= 6 ? ['left side', 'throbbing'] : ['forehead'], triggers: [...(late ? ['poor sleep'] : []), ...(coffee ? ['skipped meal'] : []), ...(r() < 0.3 ? ['screen time'] : [])], meds: sev >= 5 ? 'Ibuprofen 400 mg' : '', notes: sev >= 7 ? 'Had to lie down in a dark room.' : '' })
    }
    if (r() < 0.25) out.push({ id: `f${d}`, at: `${day}T${r() < 0.5 ? '10' : '16'}:00`, symptom: 'Fatigue', severity: Math.round(2 + r() * 5), minutes: 0, tags: ['all day'], triggers: late ? ['poor sleep'] : [], meds: '', notes: '' })
    if (r() < 0.14) out.push({ id: `s${d}`, at: `${day}T20:30`, symptom: 'Stomach pain', severity: Math.round(2 + r() * 4), minutes: 45, tags: ['after dinner'], triggers: ['dairy'], meds: '', notes: 'Bloating as well.' })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}
