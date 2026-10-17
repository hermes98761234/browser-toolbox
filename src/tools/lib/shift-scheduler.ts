// Shift Scheduler: shift lengths (incl. overnight), weekly totals, rest-rule checks,
// fair auto-fill from staffing needs, and iCalendar export.

export interface Emp { id: string; name: string; role: string; color: string; max: number; rate: number }
export interface Tpl { id: string; name: string; start: string; end: string; brk: number; color: string; need: number[] }
export type Cells = Record<string, string> // `${empId}:${day}` → template id

export const key = (emp: string, day: number) => `${emp}:${day}`
export const toMin = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  return m ? (Number(m[1]) % 24) * 60 + Math.min(59, Number(m[2])) : 0
}

/** [start, end) minutes from the start of its day; end > 1440 for overnight shifts. */
export function span(t: Pick<Tpl, 'start' | 'end'>): [number, number] {
  const a = toMin(t.start)
  let b = toMin(t.end)
  if (b <= a) b += 1440
  return [a, b]
}

/** Paid hours = length − unpaid break. */
export function hours(t: Pick<Tpl, 'start' | 'end' | 'brk'>): number {
  const [a, b] = span(t)
  return Math.max(0, (b - a - t.brk) / 60)
}

export function empHours(emp: string, cells: Cells, tpls: Tpl[]): number {
  let h = 0
  for (let d = 0; d < 7; d++) {
    const t = tpls.find((x) => x.id === cells[key(emp, d)])
    if (t) h += hours(t)
  }
  return h
}

export function coverage(cells: Cells, emps: Emp[], tpl: string, day: number): number {
  return emps.filter((e) => cells[key(e.id, day)] === tpl).length
}

export interface Issue { emp: string; day: number; kind: 'rest' | 'max' | 'nodayoff'; text: string }

/** Rest between consecutive shifts shorter than `minRest` hours, weekly max exceeded, no day off. */
export function issues(emps: Emp[], cells: Cells, tpls: Tpl[], minRest = 11): Issue[] {
  const out: Issue[] = []
  const T = (e: string, d: number) => tpls.find((x) => x.id === cells[key(e, d)])
  for (const e of emps) {
    for (let d = 0; d < 6; d++) {
      const a = T(e.id, d), b = T(e.id, d + 1)
      if (!a || !b) continue
      const gap = (1440 + span(b)[0] - span(a)[1]) / 60
      if (gap < minRest) out.push({ emp: e.id, day: d + 1, kind: 'rest', text: `${e.name}: only ${Math.max(0, gap).toFixed(1)} h rest before ${DAYS[d + 1]} ${b.name}` })
    }
    const h = empHours(e.id, cells, tpls)
    if (e.max > 0 && h > e.max + 1e-9) out.push({ emp: e.id, day: -1, kind: 'max', text: `${e.name}: ${h.toFixed(1)} h scheduled, over the ${e.max} h limit` })
    if ([0, 1, 2, 3, 4, 5, 6].every((d) => T(e.id, d))) out.push({ emp: e.id, day: -1, kind: 'nodayoff', text: `${e.name}: no day off this week` })
  }
  return out
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Greedy fair fill: for every day and template (earliest first) assign the required number of
 * people, preferring those with the fewest hours so far, never double-booking a day,
 * respecting max hours and minimum rest after the previous day's shift. Existing cells are kept.
 */
export function autoFill(emps: Emp[], tpls: Tpl[], cells: Cells, minRest = 11): { cells: Cells; short: { day: number; tpl: string; missing: number }[] } {
  const out: Cells = { ...cells }
  const short: { day: number; tpl: string; missing: number }[] = []
  const order = [...tpls].sort((a, b) => toMin(a.start) - toMin(b.start))
  const hrs = new Map(emps.map((e) => [e.id, empHours(e.id, out, tpls)]))
  for (let d = 0; d < 7; d++) {
    for (const t of order) {
      let need = (t.need[d] ?? 0) - coverage(out, emps, t.id, d)
      const pool = emps
        .filter((e) => !out[key(e.id, d)])
        .filter((e) => e.max <= 0 || (hrs.get(e.id) ?? 0) + hours(t) <= e.max + 1e-9)
        .filter((e) => {
          const prev = tpls.find((x) => x.id === out[key(e.id, d - 1)])
          const next = tpls.find((x) => x.id === out[key(e.id, d + 1)])
          const okPrev = !prev || (1440 + span(t)[0] - span(prev)[1]) / 60 >= minRest
          const okNext = !next || (1440 + span(next)[0] - span(t)[1]) / 60 >= minRest
          return okPrev && okNext
        })
        .filter((e) => [0, 1, 2, 3, 4, 5, 6].filter((x) => x !== d && out[key(e.id, x)]).length < 6)
        .sort((a, b) => (hrs.get(a.id) ?? 0) - (hrs.get(b.id) ?? 0) || emps.indexOf(a) - emps.indexOf(b))
      for (const e of pool) {
        if (need <= 0) break
        out[key(e.id, d)] = t.id
        hrs.set(e.id, (hrs.get(e.id) ?? 0) + hours(t))
        need--
      }
      if (need > 0) short.push({ day: d, tpl: t.id, missing: need })
    }
  }
  return { cells: out, short }
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Monday of the week containing `iso`. */
export function monday(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return addDays(iso, -((d.getUTCDay() + 6) % 7))
}

const icsDate = (iso: string, min: number) => {
  const day = addDays(iso, Math.floor(min / 1440))
  const m = ((min % 1440) + 1440) % 1440
  return `${day.replace(/-/g, '')}T${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`
}
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const fold = (line: string) => {
  const out: string[] = []
  let s = line
  while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74) }
  out.push(s)
  return out.join('\r\n')
}

/** iCalendar with one event per shift (floating local time); `weeks` > 1 adds a weekly RRULE. */
export function ics(weekStart: string, emps: Emp[], cells: Cells, tpls: Tpl[], o: { only?: string; weeks?: number; place?: string; stamp?: string } = {}): string {
  const stamp = o.stamp ?? new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Shift Scheduler//EN', 'CALSCALE:GREGORIAN']
  for (const e of emps) {
    if (o.only && e.id !== o.only) continue
    for (let d = 0; d < 7; d++) {
      const t = tpls.find((x) => x.id === cells[key(e.id, d)])
      if (!t) continue
      const [a, b] = span(t)
      const date = addDays(weekStart, d)
      L.push('BEGIN:VEVENT', `UID:${e.id}-${date}-${t.id}@shift-scheduler`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(date, a)}`, `DTEND:${icsDate(date, b)}`,
        fold(`SUMMARY:${esc(`${t.name} shift – ${e.name}`)}`), fold(`DESCRIPTION:${esc(`${e.role ? e.role + ' · ' : ''}${hours(t).toFixed(2)} paid hours${t.brk ? ` · ${t.brk} min break` : ''}`)}`))
      if (o.place) L.push(fold(`LOCATION:${esc(o.place)}`))
      if ((o.weeks ?? 1) > 1) L.push(`RRULE:FREQ=WEEKLY;COUNT=${o.weeks}`)
      L.push('END:VEVENT')
    }
  }
  L.push('END:VCALENDAR')
  return L.join('\r\n') + '\r\n'
}
