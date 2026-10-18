// Greenhouse climate log: VPD and dew point, sensor CSV import, threshold excursions and daily summaries.

/** [epoch ms, air °C, relative humidity %] */
export type Reading = [number, number, number]

/** Saturation vapour pressure in kPa (Tetens). */
export const svp = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3))

/** Vapour pressure deficit in kPa; leaf temperature = air + leafOffset. */
export const vpd = (t: number, rh: number, leafOffset = 0) => Math.max(0, svp(t + leafOffset) - svp(t) * (rh / 100))

/** Dew point in °C (Magnus, Sonntag constants). */
export function dewPoint(t: number, rh: number): number {
  const b = 17.62, c = 243.12
  const g = Math.log(Math.max(1e-6, rh) / 100) + (b * t) / (c + t)
  return (c * g) / (b - g)
}

export const cToF = (c: number) => (c * 9) / 5 + 32
export const fToC = (f: number) => ((f - 32) * 5) / 9

export const VPD_ZONES: { max: number; name: string; color: string; tip: string }[] = [
  { max: 0.4, name: 'Too humid', color: '#3b82f6', tip: 'Little transpiration; risk of mould, botrytis and mildew.' },
  { max: 0.8, name: 'Propagation', color: '#14b8a6', tip: 'Good for cuttings and seedlings.' },
  { max: 1.2, name: 'Vegetative', color: '#10b981', tip: 'Ideal for most growing plants.' },
  { max: 1.6, name: 'Flowering', color: '#f59e0b', tip: 'Fine for flowering and fruiting crops.' },
  { max: Infinity, name: 'Too dry', color: '#ef4444', tip: 'Plants close stomata; wilting and tip burn.' },
]
export const vpdZone = (v: number) => VPD_ZONES.find((z) => v < z.max) ?? VPD_ZONES[VPD_ZONES.length - 1]

/** Parses common sensor timestamp formats to epoch ms (local time); NaN when unknown. */
export function parseTime(s: string, dayFirst = true): number {
  const t = s.trim().replace(/^"|"$/g, '')
  if (/^\d{10}(\.\d+)?$/.test(t)) return Number(t) * 1000
  if (/^\d{13}$/.test(t)) return Number(t)
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(t)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime()
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    const [d, mo] = dayFirst ? [+m[1], +m[2]] : [+m[2], +m[1]]
    let h = +(m[4] ?? 0)
    if (m[7]) h = (h % 12) + (/p/i.test(m[7]) ? 12 : 0)
    return new Date(y, mo - 1, d, h, +(m[5] ?? 0), +(m[6] ?? 0)).getTime()
  }
  const d = Date.parse(t)
  return Number.isFinite(d) ? d : NaN
}

export interface CsvResult { readings: Reading[]; skipped: number; columns: string[]; used: [string, string, string]; fahrenheit: boolean }

function splitRow(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === sep && !q) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** Imports sensor CSV: finds time / temperature / humidity columns by header name, converts °F when the header says so. */
export function parseCsv(text: string, opts: { dayFirst?: boolean; forceF?: boolean } = {}): CsvResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { readings: [], skipped: 0, columns: [], used: ['', '', ''], fahrenheit: false }
  const first = lines[0]
  const sep = ['\t', ';', ','].reduce((a, b) => (first.split(b).length > first.split(a).length ? b : a), ',')
  const head = splitRow(first, sep)
  const hasHeader = head.some((h) => /[a-z]/i.test(h) && !Number.isFinite(parseTime(h)))
  const cols = hasHeader ? head : head.map((_, i) => `Column ${i + 1}`)
  const find = (re: RegExp, def: number) => { const i = cols.findIndex((c) => re.test(c)); return i >= 0 ? i : def }
  const ti = find(/time|date|stamp/i, 0)
  const te = find(/temp|°c|°f|\bt\b/i, 1)
  const hu = find(/hum|rh|moist/i, 2)
  const fahrenheit = opts.forceF ?? /°?f\b|fahrenheit/i.test(cols[te] ?? '')
  const readings: Reading[] = []
  let skipped = 0
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const r = splitRow(line, sep)
    const t = parseTime(r[ti] ?? '', opts.dayFirst ?? true)
    let temp = Number((r[te] ?? '').replace(',', '.'))
    const rh = Number((r[hu] ?? '').replace(',', '.').replace('%', ''))
    if (fahrenheit) temp = fToC(temp)
    if (!Number.isFinite(t) || !Number.isFinite(temp) || !Number.isFinite(rh) || rh < 0 || rh > 100 || temp < -50 || temp > 70) { skipped++; continue }
    readings.push([t, Math.round(temp * 100) / 100, Math.round(rh * 10) / 10])
  }
  readings.sort((a, b) => a[0] - b[0])
  return { readings, skipped, columns: cols, used: [cols[ti], cols[te], cols[hu]], fahrenheit }
}

/** Merges readings, de-duplicating identical timestamps (newer import wins). */
export function merge(a: Reading[], b: Reading[]): Reading[] {
  const m = new Map<number, Reading>()
  for (const r of [...a, ...b]) m.set(r[0], r)
  return [...m.values()].sort((x, y) => x[0] - y[0])
}

export interface Limits { tMin: number; tMax: number; rhMin: number; rhMax: number; vpdMin: number; vpdMax: number }

export interface Excursion { metric: 'Temperature' | 'Humidity' | 'VPD'; kind: 'low' | 'high'; start: number; end: number; peak: number; count: number }

/**
 * Runs of readings outside the limits. Out-of-range readings of the same kind less than `mergeMs` apart
 * join one excursion, so sensor noise around a threshold does not create a flood of alerts.
 */
export function excursions(rs: Reading[], L: Limits, leafOffset = 0, mergeMs = 90 * 60_000): Excursion[] {
  const metrics: [Excursion['metric'], (r: Reading) => number, number, number][] = [
    ['Temperature', (r) => r[1], L.tMin, L.tMax],
    ['Humidity', (r) => r[2], L.rhMin, L.rhMax],
    ['VPD', (r) => vpd(r[1], r[2], leafOffset), L.vpdMin, L.vpdMax],
  ]
  const out: Excursion[] = []
  for (const [metric, f, lo, hi] of metrics) {
    let cur: Excursion | null = null
    for (const r of rs) {
      const v = f(r)
      const kind = v < lo ? 'low' : v > hi ? 'high' : null
      if (cur && (r[0] - cur.end > mergeMs || (kind && kind !== cur.kind))) { out.push(cur); cur = null }
      if (!kind) continue
      if (!cur) cur = { metric, kind, start: r[0], end: r[0], peak: v, count: 0 }
      cur.end = r[0]
      cur.count++
      cur.peak = kind === 'low' ? Math.min(cur.peak, v) : Math.max(cur.peak, v)
    }
    if (cur) out.push(cur)
  }
  return out.sort((a, b) => b.start - a.start)
}

export interface Day { day: string; n: number; tMin: number; tMax: number; tAvg: number; rhMin: number; rhMax: number; rhAvg: number; vpdAvg: number; dewMin: number; inRange: number }

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export function daily(rs: Reading[], L: Limits, leafOffset = 0): Day[] {
  const by = new Map<string, Reading[]>()
  for (const r of rs) { const k = dayKey(r[0]); by.set(k, [...(by.get(k) ?? []), r]) }
  return [...by.entries()].map(([day, l]) => {
    const T = l.map((r) => r[1]), H = l.map((r) => r[2]), V = l.map((r) => vpd(r[1], r[2], leafOffset))
    const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length
    const ok = l.filter((r, i) => r[1] >= L.tMin && r[1] <= L.tMax && r[2] >= L.rhMin && r[2] <= L.rhMax && V[i] >= L.vpdMin && V[i] <= L.vpdMax).length
    return { day, n: l.length, tMin: Math.min(...T), tMax: Math.max(...T), tAvg: avg(T), rhMin: Math.min(...H), rhMax: Math.max(...H), rhAvg: avg(H), vpdAvg: avg(V), dewMin: Math.min(...l.map((r) => dewPoint(r[1], r[2]))), inRange: ok / l.length }
  }).sort((a, b) => b.day.localeCompare(a.day))
}

/** Seven days of half-hourly readings with a day/night swing, a hot afternoon and a humid night. */
export function sampleReadings(end: number): Reading[] {
  const out: Reading[] = []
  const start = end - 7 * 86400_000
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5)
  for (let t = start - (start % 1800_000); t <= end; t += 1800_000) {
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60
    const day = Math.floor((t - start) / 86400_000)
    const sun = Math.max(0, Math.sin(((h - 6) / 14) * Math.PI))
    let temp = 15 + 12 * sun + (day === 4 ? 6 * sun : 0) + rnd() * 1.2
    let rh = 67 - 13 * sun + (day === 2 && h < 7 ? 18 : 0) - (day === 4 ? 8 * sun : 0) + rnd() * 4
    temp = Math.round(temp * 10) / 10
    rh = Math.round(Math.min(99, Math.max(25, rh)) * 10) / 10
    out.push([t, temp, rh])
  }
  return out
}
