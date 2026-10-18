// Countdown maths and compact share-link encoding.

export interface Countdown {
  id: string
  title: string
  at: string // local date-time "YYYY-MM-DDTHH:MM"
  emoji: string
  color: string
  yearly: boolean
  created: string // ISO, used for the progress bar
}

/** Next occurrence (for yearly events, rolls forward to the next year once passed). */
export function target(c: Countdown, now: Date): Date {
  const d = new Date(c.at)
  if (!c.yearly || Number.isNaN(d.getTime())) return d
  const t = new Date(d)
  t.setFullYear(now.getFullYear())
  if (t.getTime() <= now.getTime()) t.setFullYear(now.getFullYear() + 1)
  return t
}

export function parts(ms: number) {
  const past = ms < 0
  let s = Math.floor(Math.abs(ms) / 1000)
  const days = Math.floor(s / 86400)
  s -= days * 86400
  const hours = Math.floor(s / 3600)
  s -= hours * 3600
  const minutes = Math.floor(s / 60)
  return { past, days, hours, minutes, seconds: s - minutes * 60 }
}

/** Calendar difference in whole months + days (for a friendlier "3 months, 4 days"). */
export function monthsDays(from: Date, to: Date): { months: number; days: number } {
  const a = from < to ? from : to
  const b = from < to ? to : from
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  const shift = (n: number) => {
    const d = new Date(a)
    d.setMonth(a.getMonth() + n)
    return d
  }
  let probe = shift(months)
  if (probe > b) probe = shift(--months)
  return { months, days: Math.floor((b.getTime() - probe.getTime()) / 86400000) }
}

export function progress(c: Countdown, now: Date): number {
  const start = new Date(c.created).getTime()
  const end = target(c, now).getTime()
  if (!(end > start)) return 1
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)))
}

// ---- share links: compact array form, base64url ----
type Packed = [string, string, string, string, number]

export function encode(cs: Countdown[]): string {
  const packed: Packed[] = cs.map((c) => [c.title, c.at, c.emoji, c.color, c.yearly ? 1 : 0])
  const bytes = new TextEncoder().encode(JSON.stringify(packed))
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decode(s: string, mkId: () => string, nowIso: string): Countdown[] | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const arr = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))) as unknown
    if (!Array.isArray(arr)) return null
    return arr
      .filter((p): p is Packed => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string')
      .slice(0, 50)
      .map((p) => ({ id: mkId(), title: p[0].slice(0, 120), at: p[1].slice(0, 16), emoji: String(p[2] ?? '⏳').slice(0, 8), color: /^#[0-9a-f]{6}$/i.test(String(p[3])) ? String(p[3]) : '#6366f1', yearly: p[4] === 1, created: nowIso }))
  } catch {
    return null
  }
}
