// Medication timetable logic: which doses fall on a date, daily timeline, adherence and next dose.

export type Freq = 'daily' | 'weekdays' | 'interval' | 'prn'

export interface Med {
  id: string
  name: string
  dose: string // "500 mg", "1 tablet"
  purpose: string
  times: string[] // "HH:MM"
  freq: Freq
  weekdays: number[] // 0 = Sunday … 6, used when freq = weekdays
  every: number // days, used when freq = interval
  start: string // YYYY-MM-DD
  end: string // '' = ongoing
  food: 'any' | 'with' | 'before' | 'after'
  color: string
  notes: string
}

export interface Dose {
  med: Med
  time: string
  key: string // `${date}|${medId}|${time}` for the taken-log
}

const dayNum = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000)
export const weekday = (iso: string) => (dayNum(iso) + 4) % 7 // 1970-01-01 was a Thursday
export function addDays(iso: string, n: number) {
  const d = new Date((dayNum(iso) + n) * 86400000)
  return d.toISOString().slice(0, 10)
}

export const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)

/** Scheduled (non-PRN) doses of `med` on `date`. */
export function dueOn(med: Med, date: string): boolean {
  if (med.freq === 'prn') return false
  if (med.start && date < med.start) return false
  if (med.end && date > med.end) return false
  if (med.freq === 'weekdays') return med.weekdays.includes(weekday(date))
  if (med.freq === 'interval') {
    const n = Math.max(1, Math.round(med.every))
    return ((dayNum(date) - dayNum(med.start || date)) % n + n) % n === 0
  }
  return true
}

export function dosesOn(meds: Med[], date: string): Dose[] {
  const out: Dose[] = []
  for (const m of meds) if (dueOn(m, date)) for (const t of m.times.filter(validTime)) out.push({ med: m, time: t, key: `${date}|${m.id}|${t}` })
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name))
}

/** Doses grouped by clock time for the timetable view. */
export function slots(doses: Dose[]): [string, Dose[]][] {
  const m = new Map<string, Dose[]>()
  for (const d of doses) m.set(d.time, [...(m.get(d.time) ?? []), d])
  return [...m.entries()]
}

export function adherence(meds: Med[], taken: Record<string, string>, from: string, to: string) {
  let due = 0, done = 0
  for (let d = from; d <= to; d = addDays(d, 1))
    for (const x of dosesOn(meds, d)) {
      due++
      if (taken[x.key]) done++
    }
  return { due, done, rate: due ? done / due : 0 }
}

/** First dose at or after `now` (local date + "HH:MM"), looking up to 14 days ahead. */
export function nextDose(meds: Med[], date: string, hhmm: string): { date: string; dose: Dose } | null {
  for (let i = 0; i < 14; i++) {
    const d = addDays(date, i)
    const hit = dosesOn(meds, d).find((x) => i > 0 || x.time >= hhmm)
    if (hit) return { date: d, dose: hit }
  }
  return null
}

export const minutesUntil = (fromHHMM: string, toHHMM: string, days = 0) => {
  const m = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5)
  return days * 1440 + m(toHHMM) - m(fromHHMM)
}
