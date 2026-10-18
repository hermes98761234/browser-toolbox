// Appointment book logic: recurring bookings, occurrence expansion, conflicts, free-slot search,
// utilisation and iCalendar (RFC 5545) export. Dates are local "YYYY-MM-DD", times "HH:MM".

export type Repeat = 'none' | 'weekly' | 'biweekly' | 'monthly'
export type Status = 'booked' | 'confirmed' | 'done' | 'no-show' | 'cancelled'
export interface Service { id: string; name: string; minutes: number; price: number; color: string }
export interface Client { id: string; name: string; email: string; phone: string }
export interface Appt {
  id: string
  clientId: string
  serviceId: string
  date: string
  start: string
  minutes: number
  status: Status
  notes: string
  repeat: Repeat
  count: number
  /** dates of skipped occurrences in a series */
  skip: string[]
}
/** Working hours per weekday (0 = Sunday): [open, close] in minutes, or null when closed. */
export type Hours = ([number, number] | null)[]
export interface Occ { appt: Appt; date: string; startMin: number; endMin: number; index: number }

const D = 86400000
export const parseD = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
export const fmtD = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => fmtD(parseD(s) + n * D)
export const dow = (s: string) => new Date(parseD(s)).getUTCDay()
export const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + (m || 0) }
export const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** Monday of the week containing `s`. */
export const weekStart = (s: string) => addDays(s, -((dow(s) + 6) % 7))

function addMonths(s: string, n: number): string | null {
  const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + n, d = +s.slice(8, 10)
  const t = new Date(Date.UTC(y, m, d))
  return t.getUTCDate() === d ? fmtD(t.getTime()) : null // skip months without that day (e.g. the 31st)
}

/** Dates of every occurrence of a (possibly recurring) appointment. */
export function seriesDates(a: Appt): string[] {
  const n = a.repeat === 'none' ? 1 : Math.max(1, Math.min(520, a.count))
  const out: string[] = []
  for (let k = 0; out.length < n && k < n * 2 + 12; k++) {
    const d = a.repeat === 'weekly' ? addDays(a.date, 7 * k) : a.repeat === 'biweekly' ? addDays(a.date, 14 * k) : a.repeat === 'monthly' ? addMonths(a.date, k) : k === 0 ? a.date : null
    if (d === null) { if (a.repeat === 'none') break; continue }
    out.push(d)
  }
  return out
}

export function occurrences(appts: Appt[], from: string, to: string, includeCancelled = false): Occ[] {
  const out: Occ[] = []
  for (const a of appts) {
    if (!includeCancelled && a.status === 'cancelled') continue
    seriesDates(a).forEach((date, index) => {
      if (date < from || date > to || a.skip.includes(date)) return
      const s = toMin(a.start)
      out.push({ appt: a, date, startMin: s, endMin: s + a.minutes, index })
    })
  }
  return out.sort((x, y) => (x.date === y.date ? x.startMin - y.startMin : x.date < y.date ? -1 : 1))
}

/** Pairs of overlapping occurrences (same day), considering a buffer between appointments. */
export function conflicts(occs: Occ[], buffer = 0): [Occ, Occ][] {
  const out: [Occ, Occ][] = []
  const byDay = new Map<string, Occ[]>()
  for (const o of occs) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o])
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startMin - b.startMin)
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].startMin < list[i].endMin + buffer; j++) out.push([list[i], list[j]])
  }
  return out
}

/** Free start times for `minutes` between `from` and `to` (inclusive), honouring hours, buffer and existing bookings. */
export function freeSlots(occs: Occ[], hours: Hours, from: string, days: number, minutes: number, buffer: number, step = 15, notBefore?: { date: string; min: number }, limit = 40): { date: string; start: number }[] {
  const out: { date: string; start: number }[] = []
  for (let k = 0; k < days && out.length < limit; k++) {
    const date = addDays(from, k)
    const h = hours[dow(date)]
    if (!h) continue
    const busy = occs.filter((o) => o.date === date).map((o) => [o.startMin - buffer, o.endMin + buffer] as const)
    for (let t = Math.ceil(h[0] / step) * step; t + minutes <= h[1] && out.length < limit; t += step) {
      if (notBefore && (date < notBefore.date || (date === notBefore.date && t < notBefore.min))) continue
      if (busy.some(([a, b]) => t < b && t + minutes > a)) continue
      out.push({ date, start: t })
    }
  }
  return out
}

/** Share of open hours that is booked, for the days in [from, to]. */
export function utilisation(occs: Occ[], hours: Hours, from: string, days: number): { open: number; booked: number } {
  let open = 0, booked = 0
  for (let k = 0; k < days; k++) {
    const date = addDays(from, k)
    const h = hours[dow(date)]
    if (!h) continue
    open += h[1] - h[0]
    for (const o of occs) if (o.date === date) booked += Math.max(0, Math.min(o.endMin, h[1]) - Math.max(o.startMin, h[0]))
  }
  return { open, booked }
}

// ---------- iCalendar ----------

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
/** Folds content lines at 75 octets (RFC 5545 §3.1). */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let cur = '', len = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (len + n > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; len = 0 }
    cur += ch; len += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}
/** Local date + minutes → UTC basic format, using the runtime's time zone. */
export function utcStamp(date: string, min: number): string {
  const d = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), Math.floor(min / 60), min % 60)
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export interface Business { name: string; email: string; address: string }

export function toIcs(occs: Occ[], services: Service[], clients: Client[], biz: Business, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Appointment Book//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const o of occs) {
    const sv = services.find((s) => s.id === o.appt.serviceId)
    const cl = clients.find((c) => c.id === o.appt.clientId)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${o.appt.id}-${o.date.replace(/-/g, '')}@browser-toolbox`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(o.date, o.startMin)}`,
      `DTEND:${utcStamp(o.date, o.endMin)}`,
      `SUMMARY:${esc(`${sv?.name ?? 'Appointment'}${biz.name ? ' — ' + biz.name : ''}`)}`,
      ...(biz.address ? [`LOCATION:${esc(biz.address)}`] : []),
      `DESCRIPTION:${esc([cl ? `Client: ${cl.name}` : '', sv ? `${sv.minutes} min${sv.price ? ` · ${sv.price}` : ''}` : '', o.appt.notes].filter(Boolean).join('\n'))}`,
      `STATUS:${o.appt.status === 'cancelled' ? 'CANCELLED' : o.appt.status === 'booked' ? 'TENTATIVE' : 'CONFIRMED'}`,
      ...(biz.email ? [`ORGANIZER;CN=${esc(biz.name || biz.email)}:mailto:${biz.email}`] : []),
      ...(cl?.email ? [`ATTENDEE;CN=${esc(cl.name)};ROLE=REQ-PARTICIPANT:mailto:${cl.email}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'TRIGGER:-PT2H', 'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
