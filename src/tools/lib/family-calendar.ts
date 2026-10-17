// Calendar events with recurrence rules (RRULE subset), occurrence expansion and ICS import/export.

export type Freq = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export interface Ev {
  id: string
  title: string
  date: string // YYYY-MM-DD (first occurrence)
  start: string // HH:MM or '' for all-day
  end: string // HH:MM or ''
  member: string // member id
  freq: Freq
  interval: number
  byday: number[] // 0=Sun … 6=Sat (weekly)
  until: string // YYYY-MM-DD or ''
  count: number // 0 = no limit
  exdates: string[]
  notes?: string
}

const D = 86400000
export const parseD = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
export const fmtD = (t: number) => new Date(t).toISOString().slice(0, 10)
export const dow = (s: string) => new Date(parseD(s)).getUTCDay()
export const addDays = (s: string, n: number) => fmtD(parseD(s) + n * D)

/** All occurrence dates of `e` within [from, to] (inclusive, YYYY-MM-DD). */
export function occurrences(e: Ev, from: string, to: string): string[] {
  const out: string[] = []
  const ex = new Set(e.exdates)
  const lim = e.until && e.until < to ? e.until : to
  let n = 0
  const take = (d: string) => {
    n++
    if (e.count && n > e.count) return false
    if (d >= from && d <= lim && !ex.has(d)) out.push(d)
    return d <= lim
  }
  const iv = Math.max(1, Math.floor(e.interval || 1))
  if (e.freq === 'NONE') {
    take(e.date)
    return out
  }
  const [y0, m0, d0] = [+e.date.slice(0, 4), +e.date.slice(5, 7) - 1, +e.date.slice(8, 10)]
  for (let i = 0; i < 5000; i++) {
    if (e.freq === 'DAILY') {
      if (!take(addDays(e.date, i * iv))) break
    } else if (e.freq === 'WEEKLY') {
      const days = e.byday.length ? [...e.byday].sort() : [dow(e.date)]
      const weekStart = addDays(e.date, -dow(e.date) + i * 7 * iv)
      let go = true
      for (const wd of days) {
        const d = addDays(weekStart, wd)
        if (d < e.date) continue
        if (!take(d)) { go = false; break }
      }
      if (!go) break
    } else if (e.freq === 'MONTHLY') {
      const t = Date.UTC(y0, m0 + i * iv, d0)
      if (new Date(t).getUTCDate() !== d0) continue // e.g. 31st in a 30-day month: skipped (RFC 5545)
      if (!take(fmtD(t))) break
    } else {
      const t = Date.UTC(y0 + i * iv, m0, d0)
      if (new Date(t).getUTCDate() !== d0) continue
      if (!take(fmtD(t))) break
    }
  }
  return out
}

// ---------- ICS ----------

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([\\;,])/g, '$1')
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const fold = (l: string) => (l.length <= 74 ? l : l.match(/.{1,73}/g)!.join('\r\n '))
const icsDate = (d: string) => d.replace(/-/g, '')
const icsDT = (d: string, t: string) => `${icsDate(d)}T${t.replace(':', '')}00`

export function toIcs(events: Ev[], memberName: (id: string) => string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Family Calendar//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:${e.id}@family-calendar`, `DTSTAMP:${stamp}`)
    if (e.start) {
      L.push(`DTSTART:${icsDT(e.date, e.start)}`)
      L.push(`DTEND:${icsDT(e.date, e.end && e.end > e.start ? e.end : e.start)}`)
    } else {
      L.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.date, 1))}`)
    }
    L.push(`SUMMARY:${esc(e.title)}`)
    const m = memberName(e.member)
    if (m) L.push(`CATEGORIES:${esc(m)}`)
    if (e.notes) L.push(`DESCRIPTION:${esc(e.notes)}`)
    if (e.freq !== 'NONE') {
      let r = `RRULE:FREQ=${e.freq}`
      if (e.interval > 1) r += `;INTERVAL=${e.interval}`
      if (e.freq === 'WEEKLY' && e.byday.length) r += `;BYDAY=${e.byday.map((d) => DAYS[d]).join(',')}`
      if (e.until) r += `;UNTIL=${icsDate(e.until)}`
      else if (e.count) r += `;COUNT=${e.count}`
      L.push(r)
    }
    for (const x of e.exdates) L.push(e.start ? `EXDATE:${icsDT(x, e.start)}` : `EXDATE;VALUE=DATE:${icsDate(x)}`)
    L.push('END:VEVENT')
  }
  L.push('END:VCALENDAR')
  return L.map(fold).join('\r\n') + '\r\n'
}

/** Parses an ICS value like 20260315, 20260315T093000, 20260315T093000Z → [date, time]. UTC times become local. */
function parseIcsDT(v: string): [string, string] {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(v.trim())
  if (!m) return ['', '']
  if (!m[4]) return [`${m[1]}-${m[2]}-${m[3]}`, '']
  if (m[7]) {
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
    const p = (n: number) => String(n).padStart(2, '0')
    return [`${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`, `${p(t.getHours())}:${p(t.getMinutes())}`]
  }
  return [`${m[1]}-${m[2]}-${m[3]}`, `${m[4]}:${m[5]}`]
}

export interface Parsed extends Omit<Ev, 'id' | 'member'> { category: string; uid: string }

export function parseIcs(text: string): Parsed[] {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const out: Parsed[] = []
  let cur: Parsed | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { title: '', date: '', start: '', end: '', freq: 'NONE', interval: 1, byday: [], until: '', count: 0, exdates: [], category: '', uid: '' }; continue }
    if (line === 'END:VEVENT') { if (cur?.date) out.push(cur); cur = null; continue }
    if (!cur) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    const [name, ...params] = line.slice(0, i).split(';')
    const val = line.slice(i + 1)
    const key = name.toUpperCase()
    if (key === 'SUMMARY') cur.title = unesc(val)
    else if (key === 'UID') cur.uid = val
    else if (key === 'DESCRIPTION') cur.notes = unesc(val)
    else if (key === 'CATEGORIES') cur.category = unesc(val).split(',')[0]
    else if (key === 'DTSTART') [cur.date, cur.start] = parseIcsDT(val)
    else if (key === 'DTEND') { const [d, t] = parseIcsDT(val); cur.end = t && d === cur.date ? t : t ? '23:59' : '' }
    else if (key === 'EXDATE') cur.exdates.push(...val.split(',').map((v) => parseIcsDT(v)[0]).filter(Boolean))
    else if (key === 'RRULE') {
      const r = Object.fromEntries(val.split(';').map((kv) => kv.split('=') as [string, string]))
      if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.FREQ)) cur.freq = r.FREQ as Freq
      cur.interval = Math.max(1, Number(r.INTERVAL) || 1)
      if (r.BYDAY && cur.freq === 'WEEKLY') cur.byday = r.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0)
      if (r.UNTIL) cur.until = parseIcsDT(r.UNTIL)[0]
      if (r.COUNT) cur.count = Number(r.COUNT) || 0
    }
    void params
  }
  return out
}
