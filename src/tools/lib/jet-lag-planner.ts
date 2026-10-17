/** UTC offset of an IANA time zone at a given instant, in minutes (e.g. Asia/Tokyo → 540). */
export function tzOffsetMin(zone: string, at: Date): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at)
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value)
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000)
}

/** Wrap hours into [0, 24). */
export const wrap24 = (h: number) => ((h % 24) + 24) % 24
export const fmtH = (h: number) => {
  const m = Math.round(wrap24(h) * 60) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export type Dir = 'auto' | 'advance' | 'delay'
export interface PlanInput {
  delta: number // destination minus home, hours
  bed: number // usual bedtime (home clock), e.g. 23
  wake: number // usual wake time, e.g. 7
  preDays: number
  dir: Dir
  advanceRate: number // h/day
  delayRate: number // h/day
  depart: string // ISO date of travel day
}

export interface Day {
  date: string
  offset: number // days relative to travel day
  where: 'home' | 'travel' | 'destination'
  bed: number // local clock hours
  wake: number
  seek: [number, number]
  avoid: [number, number]
  behind: number // hours still to shift after this day
}

export interface Plan {
  delta: number
  direction: 'advance' | 'delay'
  need: number
  days: Day[]
}

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

export function normalizeDelta(d: number): number {
  let x = wrap24(d)
  if (x > 12) x -= 24
  return x
}

export function plan(i: PlanInput): Plan {
  const delta = normalizeDelta(i.delta)
  const needA = delta >= 0 ? delta : delta + 24
  const needD = delta <= 0 ? -delta : 24 - delta
  let direction: 'advance' | 'delay' = i.dir === 'advance' ? 'advance' : i.dir === 'delay' ? 'delay' : needA / i.advanceRate <= needD / i.delayRate ? 'advance' : 'delay'
  if (delta === 0) direction = 'advance'
  const need = delta === 0 ? 0 : direction === 'advance' ? needA : needD
  const rate = direction === 'advance' ? i.advanceRate : i.delayRate
  const sgn = direction === 'advance' ? -1 : 1
  const days: Day[] = []
  let c = 0
  for (let k = -i.preDays; k <= 21; k++) {
    if (k > 0 && c >= need - 1e-9) break
    c = Math.min(need, c + rate)
    const atDest = k >= 0
    const shift = sgn * c + (atDest ? delta : 0)
    const wake = wrap24(i.wake + shift)
    const bed = wrap24(i.bed + shift)
    const seek: [number, number] = direction === 'advance' ? [wake, wake + 3] : [bed - 4, bed - 1]
    const avoid: [number, number] = direction === 'advance' ? [bed - 3, bed] : [wake, wake + 3]
    days.push({ date: addDays(i.depart, k), offset: k, where: k < 0 ? 'home' : k === 0 ? 'travel' : 'destination', bed, wake, seek: [wrap24(seek[0]), wrap24(seek[1])], avoid: [wrap24(avoid[0]), wrap24(avoid[1])], behind: need - c })
    if (need === 0 && k >= 0) break
  }
  return { delta, direction, need, days }
}

const icsTime = (date: string, h: number) => `${date.replace(/-/g, '')}T${fmtH(h).replace(':', '')}00`
const esc = (s: string) => s.replace(/[,;\\]/g, (m) => '\\' + m)

/** iCalendar file with floating (local wall-clock) times for each day's light and sleep windows. */
export function toIcs(p: Plan, stamp: string): string {
  const ev: string[] = []
  const add = (id: string, date: string, from: number, to: number, title: string, desc: string) => {
    const endDate = wrap24(to) <= wrap24(from) ? addDays(date, 1) : date
    ev.push(['BEGIN:VEVENT', `UID:${id}@jet-lag-planner`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(date, from)}`, `DTEND:${icsTime(endDate, to)}`, `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`, 'END:VEVENT'].join('\r\n'))
  }
  for (const d of p.days) {
    const where = d.where === 'home' ? 'home time' : 'destination time'
    add(`${d.date}-seek`, d.date, d.seek[0], d.seek[1], '☀ Seek bright light', `Get outdoor light or a light box (${where}).`)
    add(`${d.date}-avoid`, d.date, d.avoid[0], d.avoid[1], '🕶 Avoid bright light', `Dim lights, wear sunglasses outdoors (${where}).`)
    const bedDate = d.bed < 12 ? addDays(d.date, 1) : d.date
    add(`${d.date}-sleep`, bedDate, d.bed, d.wake, '🛏 Sleep', `Shifted bedtime (${where}).`)
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Jet Lag Planner//EN', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR', ''].join('\r\n')
}
