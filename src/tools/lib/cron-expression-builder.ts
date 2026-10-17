// Cron expression parsing, next-run computation and plain-English description.
// Standard 5-field (Vixie) cron: minute hour day-of-month month day-of-week.

export interface FieldSpec {
  key: 'minute' | 'hour' | 'dom' | 'month' | 'dow'
  label: string
  min: number
  max: number
  names?: string[]
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const FIELDS: FieldSpec[] = [
  { key: 'minute', label: 'Minute', min: 0, max: 59 },
  { key: 'hour', label: 'Hour', min: 0, max: 23 },
  { key: 'dom', label: 'Day of month', min: 1, max: 31 },
  { key: 'month', label: 'Month', min: 1, max: 12, names: MONTHS.map((m) => m.slice(0, 3).toUpperCase()) },
  { key: 'dow', label: 'Day of week', min: 0, max: 6, names: DAYS.map((d) => d.slice(0, 3).toUpperCase()) },
]

export const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

export interface Cron {
  fields: string[]
  sets: Set<number>[]
  domStar: boolean
  dowStar: boolean
}

function value(tok: string, f: FieldSpec): number {
  const up = tok.toUpperCase()
  if (f.names) {
    const i = f.names.indexOf(up)
    if (i >= 0) return i + f.min
  }
  if (!/^\d+$/.test(tok)) throw new Error(`${f.label}: "${tok}" is not a number${f.names ? ' or name' : ''}`)
  let v = Number(tok)
  if (f.key === 'dow' && v === 7) v = 0
  if (v < f.min || v > f.max) throw new Error(`${f.label}: ${v} is out of range ${f.min}–${f.key === 'dow' ? 7 : f.max}`)
  return v
}

/** Expands one cron field into the set of matching values. */
export function parseField(text: string, f: FieldSpec): Set<number> {
  const out = new Set<number>()
  if (!text) throw new Error(`${f.label}: empty field`)
  for (const part of text.split(',')) {
    const [rangeTxt, stepTxt, extra] = part.split('/')
    if (extra !== undefined) throw new Error(`${f.label}: too many "/" in "${part}"`)
    let step = 1
    if (stepTxt !== undefined) {
      if (!/^\d+$/.test(stepTxt) || Number(stepTxt) < 1) throw new Error(`${f.label}: bad step "${stepTxt}"`)
      step = Number(stepTxt)
    }
    let lo: number, hi: number
    if (rangeTxt === '*' || rangeTxt === '?') {
      lo = f.min
      hi = f.max
    } else if (rangeTxt.includes('-')) {
      const [a, b] = rangeTxt.split('-')
      lo = value(a, f)
      // allow 1-7 for dow ranges (7 = Sunday at the end)
      hi = f.key === 'dow' && b === '7' ? 7 : value(b, f)
      if (hi < lo) throw new Error(`${f.label}: range ${rangeTxt} goes backwards`)
    } else {
      lo = value(rangeTxt, f)
      hi = stepTxt !== undefined ? (f.key === 'dow' ? 6 : f.max) : lo
    }
    for (let v = lo; v <= hi; v += step) out.add(f.key === 'dow' && v === 7 ? 0 : v)
  }
  return out
}

export function parseCron(expr: string): Cron {
  let t = expr.trim().replace(/\s+/g, ' ')
  if (t.startsWith('@')) {
    const m = MACROS[t.toLowerCase()]
    if (!m) throw new Error(`Unknown macro ${t}`)
    t = m
  }
  const fields = t.split(' ')
  if (fields.length !== 5) throw new Error(`Expected 5 fields (minute hour day month weekday), got ${fields.length}`)
  const sets = fields.map((x, i) => parseField(x, FIELDS[i]))
  return { fields, sets, domStar: fields[2] === '*' || fields[2] === '?', dowStar: fields[4] === '*' || fields[4] === '?' }
}

interface Parts { y: number; mo: number; d: number; h: number; mi: number }

function parts(t: Date, utc: boolean): Parts {
  return utc
    ? { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() }
    : { y: t.getFullYear(), mo: t.getMonth(), d: t.getDate(), h: t.getHours(), mi: t.getMinutes() }
}

function make(p: Parts, utc: boolean): Date {
  return utc ? new Date(Date.UTC(p.y, p.mo, p.d, p.h, p.mi)) : new Date(p.y, p.mo, p.d, p.h, p.mi)
}

function dayMatches(c: Cron, y: number, mo: number, d: number, utc: boolean): boolean {
  const dow = (utc ? new Date(Date.UTC(y, mo, d)).getUTCDay() : new Date(y, mo, d).getDay())
  const domOk = c.sets[2].has(d)
  const dowOk = c.sets[4].has(dow)
  // Vixie cron: when both day fields are restricted, either may match.
  if (!c.domStar && !c.dowStar) return domOk || dowOk
  return domOk && dowOk
}

/** Next `count` run times strictly after `from`. */
export function nextRuns(c: Cron, from: Date, count: number, utc = false): Date[] {
  const out: Date[] = []
  const p = parts(new Date(from.getTime() + 60000), utc)
  let guard = 0
  while (out.length < count && guard++ < 200000) {
    if (p.y > parts(from, utc).y + 30) break
    const daysIn = new Date(Date.UTC(p.y, p.mo + 1, 0)).getUTCDate()
    if (!c.sets[3].has(p.mo + 1)) {
      p.mo++; p.d = 1; p.h = 0; p.mi = 0
      if (p.mo > 11) { p.mo = 0; p.y++ }
      continue
    }
    if (p.d > daysIn || !dayMatches(c, p.y, p.mo, p.d, utc)) {
      p.d++; p.h = 0; p.mi = 0
      if (p.d > daysIn) { p.d = 1; p.mo++; if (p.mo > 11) { p.mo = 0; p.y++ } }
      continue
    }
    if (!c.sets[1].has(p.h)) {
      p.h++; p.mi = 0
      if (p.h > 23) { p.h = 0; p.d++ }
      continue
    }
    if (!c.sets[0].has(p.mi)) {
      p.mi++
      if (p.mi > 59) { p.mi = 0; p.h++; if (p.h > 23) { p.h = 0; p.d++ } }
      continue
    }
    const t = make(p, utc)
    // Skip local times that do not exist (DST gap) – Date shifts them.
    const q = parts(t, utc)
    if (q.h === p.h && q.mi === p.mi && t > from) out.push(t)
    p.mi++
    if (p.mi > 59) { p.mi = 0; p.h++; if (p.h > 23) { p.h = 0; p.d++ } }
  }
  return out
}

// ---------- description ----------

const pad = (n: number) => String(n).padStart(2, '0')
const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
function listJoin(a: string[]): string {
  if (a.length <= 1) return a.join('')
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`
}

function nameOf(f: FieldSpec, tok: string): string {
  const v = f.key === 'dow' && tok === '7' ? 0 : value(tok, f)
  if (f.key === 'month') return MONTHS[v - 1]
  if (f.key === 'dow') return DAYS[v]
  if (f.key === 'dom') return ord(v)
  if (f.key === 'hour') return `${pad(v)}:00`
  return String(v)
}

function partText(part: string, f: FieldSpec, unit: string): string {
  const [r, st] = part.split('/')
  const every = !st ? '' : st === '1' ? `every ${unit}` : `every ${st} ${unit}s`
  if (r === '*' || r === '?') return st ? every : `every ${unit}`
  if (r.includes('-')) {
    const [a, b] = r.split('-')
    const span = `${nameOf(f, a)} through ${nameOf(f, b)}`
    return st ? `${every} from ${span}` : span
  }
  return st ? `${every} starting at ${nameOf(f, r)}` : nameOf(f, r)
}

function fieldText(text: string, f: FieldSpec, unit: string): string {
  return listJoin(text.split(',').map((p) => partText(p, f, unit)))
}

const simple = (t: string) => /^\d+(,\d+)*$/.test(t)

export function describe(expr: string): string {
  const c = parseCron(expr)
  const [mi, h, dom, mo, dow] = c.fields
  let time: string
  if (simple(mi) && simple(h) && mi.split(',').length * h.split(',').length <= 6) {
    const ts: string[] = []
    for (const hh of h.split(',')) for (const mm of mi.split(',')) ts.push(`${pad(Number(hh))}:${pad(Number(mm))}`)
    time = `At ${listJoin(ts)}`
  } else if (mi === '*' && h === '*') time = 'Every minute'
  else {
    const m = mi === '*' ? 'Every minute' : /^\*\/\d+$/.test(mi) ? `Every ${mi.slice(2)} minutes` : simple(mi) ? `At minute ${listJoin(mi.split(','))}` : `At ${fieldText(mi, FIELDS[0], 'minute')} past the hour`
    let hr = ''
    if (h === '*') hr = mi === '*' || /^\*\//.test(mi) ? '' : ' past every hour'
    else if (/^\*\/\d+$/.test(h)) hr = `, every ${h.slice(2)} hours`
    else if (/^\d+-\d+$/.test(h)) {
      const [a, b] = h.split('-').map(Number)
      hr = `, between ${pad(a)}:00 and ${pad(b)}:59`
    } else if (simple(h)) hr = `, during hour${h.includes(',') ? 's' : ''} ${listJoin(h.split(',').map((x) => `${pad(Number(x))}:00`))}`
    else hr = `, ${fieldText(h, FIELDS[1], 'hour')}`
    time = m + hr
  }
  const days: string[] = []
  const domT = c.domStar ? '' : `on the ${fieldText(dom, FIELDS[2], 'day')} of the month`.replace('on the every', 'every')
  const dowT = c.dowStar ? '' : `on ${fieldText(dow, FIELDS[4], 'day')}`.replace('on every', 'every')
  if (domT && dowT) days.push(`${domT} or ${dowT}`)
  else if (domT || dowT) days.push(domT || dowT)
  if (mo !== '*' && mo !== '?') days.push(`in ${fieldText(mo, FIELDS[3], 'month')}`.replace('in every', 'every'))
  return [time, ...days].join(', ')
}
