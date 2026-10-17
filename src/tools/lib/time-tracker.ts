// Time entries: durations, rounding for invoices, per-day/per-project aggregation (local time).

export interface Project { id: string; name: string; client: string; rate: number; color: string }
export interface Entry { id: string; project: string; start: number; end: number | null; note: string; billable: boolean }

export const durMs = (e: Entry, now: number) => Math.max(0, (e.end ?? now) - e.start)

/** Round milliseconds up to an increment in minutes (0 = exact). */
export const roundUp = (ms: number, incMin: number) => (incMin > 0 ? Math.ceil(ms / (incMin * 60000) - 1e-9) * incMin * 60000 : ms)

export const hhmm = (ms: number) => {
  const m = Math.round(ms / 60000)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
export const hms = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** Local midnight of the Monday of the week containing `ms`. */
export function weekStart(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}
export const addDaysMs = (ms: number, n: number) => {
  const d = new Date(ms)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** Splits an entry at local midnights so each piece lands on its own day. */
export function splitByDay(e: Entry, now: number): { day: string; ms: number }[] {
  const out: { day: string; ms: number }[] = []
  const end = e.end ?? now
  let t = e.start
  while (t < end) {
    const d = new Date(t)
    d.setHours(24, 0, 0, 0)
    const stop = Math.min(end, d.getTime())
    out.push({ day: dayKey(t), ms: stop - t })
    t = stop
  }
  return out
}

/** ms per day key per project, for entries overlapping [from, to). */
export function byDayProject(entries: Entry[], from: number, to: number, now: number): Record<string, Record<string, number>> {
  const r: Record<string, Record<string, number>> = {}
  for (const e of entries) {
    const clipped = { ...e, start: Math.max(e.start, from), end: Math.min(e.end ?? now, to) }
    if (clipped.end <= clipped.start) continue
    for (const p of splitByDay(clipped, now)) {
      r[p.day] ??= {}
      r[p.day][e.project] = (r[p.day][e.project] ?? 0) + p.ms
    }
  }
  return r
}

export interface InvoiceLine { date: string; project: string; client: string; note: string; hours: number; rate: number; amount: number }

/** Billable lines with per-entry rounding; hours to 2 decimals. */
export function invoiceLines(entries: Entry[], projects: Project[], from: number, to: number, incMin: number, now: number): InvoiceLine[] {
  const lines: InvoiceLine[] = []
  for (const e of [...entries].sort((a, b) => a.start - b.start)) {
    if (!e.billable || e.start < from || e.start >= to) continue
    const p = projects.find((x) => x.id === e.project)
    if (!p) continue
    const hours = +(roundUp(durMs(e, now), incMin) / 3600000).toFixed(2)
    lines.push({ date: dayKey(e.start), project: p.name, client: p.client, note: e.note, hours, rate: p.rate, amount: +(hours * p.rate).toFixed(2) })
  }
  return lines
}
