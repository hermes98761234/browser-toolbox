// Date grid helpers and iCalendar (RFC 5545) export for the content calendar.

export interface Post { id: string; date: string; time: string; title: string; channel: string; status: Status; notes: string }
export type Status = 'idea' | 'draft' | 'scheduled' | 'published'
export interface Channel { id: string; name: string; color: string }

const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
export const addDays = (s: string, n: number) => {
  const d = parseIso(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

/** Start of the week containing `s` (Monday or Sunday). */
export function weekStart(s: string, monday = true): string {
  const d = parseIso(s)
  const dow = d.getDay()
  const back = monday ? (dow + 6) % 7 : dow
  return addDays(s, -back)
}

/** 6×7 grid of ISO dates covering the month (y, m0 = 0-based month). */
export function monthGrid(y: number, m0: number, monday = true): string[] {
  const first = iso(new Date(y, m0, 1))
  const start = weekStart(first, monday)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** ISO 8601 week number. */
export function isoWeek(s: string): number {
  const d = parseIso(s)
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)
}

export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Folds a content line to ≤75 octets per physical line (UTF-8 aware). */
export function fold(line: string): string {
  const enc = new TextEncoder()
  const out: string[] = []
  let cur = '', bytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = out.length ? 74 : 75 // continuation lines start with a space
    if (bytes + b > limit) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function toIcs(posts: Post[], channels: Channel[], stamp: Date, durationMin = 30): string {
  const name = (id: string) => channels.find((c) => c.id === id)?.name ?? 'Other'
  const z = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Content Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Content calendar']
  for (const p of posts) {
    const day = p.date.replace(/-/g, '')
    lines.push('BEGIN:VEVENT', `UID:${p.id}@browser-toolbox`, `DTSTAMP:${z(stamp)}`)
    if (/^\d{2}:\d{2}$/.test(p.time)) {
      lines.push(`DTSTART:${day}T${p.time.replace(':', '')}00`, `DURATION:PT${durationMin}M`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${addDays(p.date, 1).replace(/-/g, '')}`)
    }
    lines.push(`SUMMARY:${icsEscape(`[${name(p.channel)}] ${p.title}`)}`, `CATEGORIES:${icsEscape(name(p.channel))}`, `DESCRIPTION:${icsEscape(`Status: ${p.status}${p.notes ? `\n\n${p.notes}` : ''}`)}`, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Sort by date then time (untimed first). */
export const byDate = (a: Post, b: Post) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')
