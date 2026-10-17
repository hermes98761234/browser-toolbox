// Rainfall log maths: daily aggregation, monthly / seasonal / year-to-date totals, dry spells, CSV import.

export interface Reading { id: string; date: string; mm: number; note?: string }

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MM_PER_IN = 25.4
export const RAIN_DAY = 0.2 // mm, WMO "rain day" threshold is commonly 0.2 mm (or 1 mm for "wet day")

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'))

/** Sum of readings per calendar day (several gauge reads on one day add up). */
export function daily(rs: Reading[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rs) if (isDate(r.date) && Number.isFinite(r.mm) && r.mm >= 0) m.set(r.date, (m.get(r.date) ?? 0) + r.mm)
  return m
}

export function monthly(rs: Reading[], year: number): number[] {
  const out = new Array(12).fill(0)
  for (const [d, v] of daily(rs)) if (+d.slice(0, 4) === year) out[+d.slice(5, 7) - 1] += v
  return out
}

export function years(rs: Reading[]): number[] {
  return [...new Set(rs.filter((r) => isDate(r.date)).map((r) => +r.date.slice(0, 4)))].sort((a, b) => a - b)
}

const doy = (d: string) => {
  const t = Date.parse(d + 'T00:00:00Z'), y0 = Date.UTC(+d.slice(0, 4), 0, 1)
  return Math.round((t - y0) / 864e5) + 1
}

/** Cumulative rainfall by day of year: [[dayOfYear, total], …] for a year (stops at `lastDoy`). */
export function cumulative(rs: Reading[], year: number, lastDoy = 366): [number, number][] {
  const days = [...daily(rs)].filter(([d]) => +d.slice(0, 4) === year).map(([d, v]) => [doy(d), v] as [number, number]).sort((a, b) => a[0] - b[0])
  const out: [number, number][] = [[0, 0]]
  let acc = 0
  for (const [n, v] of days) {
    if (n > lastDoy) break
    acc += v
    out.push([n, acc])
  }
  if (out[out.length - 1][0] < lastDoy) out.push([lastDoy, acc])
  return out
}

/** Total up to and including day-of-year `n`. */
export function toDate(rs: Reading[], year: number, n: number): number {
  let s = 0
  for (const [d, v] of daily(rs)) if (+d.slice(0, 4) === year && doy(d) <= n) s += v
  return s
}

export type Season = 'Winter' | 'Spring' | 'Summer' | 'Autumn'
/** Meteorological seasons (N hemisphere names). December counts toward the following year's winter. */
export function seasonOf(d: string, southern = false): { season: Season; year: number } {
  const m = +d.slice(5, 7), y = +d.slice(0, 4)
  const idx = m === 12 || m <= 2 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3
  const names: Season[] = southern ? ['Summer', 'Autumn', 'Winter', 'Spring'] : ['Winter', 'Spring', 'Summer', 'Autumn']
  return { season: names[idx], year: m === 12 ? y + 1 : y }
}

export function seasonTotals(rs: Reading[], southern = false): Map<number, Record<Season, number>> {
  const out = new Map<number, Record<Season, number>>()
  for (const [d, v] of daily(rs)) {
    const { season, year } = seasonOf(d, southern)
    const row = out.get(year) ?? { Winter: 0, Spring: 0, Summer: 0, Autumn: 0 }
    row[season] += v
    out.set(year, row)
  }
  return out
}

export interface Summary { total: number; rainDays: number; wettest: { date: string; mm: number } | null; longestDry: number; mean: number }

/** Stats for one year (dry spell counted between the first and last logged day, or `untilDate`). */
export function summary(rs: Reading[], year: number, untilDate?: string): Summary {
  const days = [...daily(rs)].filter(([d]) => +d.slice(0, 4) === year).sort((a, b) => a[0].localeCompare(b[0]))
  let total = 0, rainDays = 0, wettest: Summary['wettest'] = null
  for (const [d, v] of days) {
    total += v
    if (v >= RAIN_DAY) rainDays++
    if (!wettest || v > wettest.mm) wettest = { date: d, mm: v }
  }
  // longest run of consecutive days without ≥ RAIN_DAY between Jan 1 and the end date
  const wet = days.filter(([, v]) => v >= RAIN_DAY).map(([d]) => doy(d))
  const end = untilDate && +untilDate.slice(0, 4) === year ? doy(untilDate) : days.length ? doy(days[days.length - 1][0]) : 0
  let longestDry = 0, prev = 0
  for (const w of [...wet, end + 1]) { longestDry = Math.max(longestDry, w - prev - 1); prev = w }
  return { total, rainDays, wettest, longestDry: Math.max(0, longestDry), mean: rainDays ? total / rainDays : 0 }
}

/** Parses "date,amount[,note]" lines (header optional; amount in mm unless `inches`). */
export function parseCsv(text: string, inches = false): { readings: Omit<Reading, 'id'>[]; skipped: number } {
  const readings: Omit<Reading, 'id'>[] = []
  let skipped = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const delim = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ','
    const [d, a, ...rest] = line.split(delim).map((x) => x.trim().replace(/^"|"$/g, ''))
    let date = d
    const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(d) // DD/MM/YYYY
    if (m) date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    const v = Number((a ?? '').replace(',', '.'))
    if (!isDate(date) || !Number.isFinite(v) || v < 0) { skipped++; continue }
    readings.push({ date, mm: inches ? v * MM_PER_IN : v, note: rest.join(', ') || undefined })
  }
  return { readings, skipped }
}

/** Deterministic sample: ~2.8 years of daily rain with a wet autumn/winter climate. */
export function sample(endDate: string): Reading[] {
  let x = 20240101
  const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296)
  const end = Date.parse(endDate + 'T00:00:00Z')
  const startY = +endDate.slice(0, 4) - 2
  const out: Reading[] = []
  for (let t = Date.UTC(startY, 0, 1); t <= end; t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10)
    const m = +d.slice(5, 7)
    const pWet = [0.45, 0.4, 0.38, 0.33, 0.32, 0.3, 0.25, 0.27, 0.33, 0.42, 0.47, 0.48][m - 1] * (+d.slice(0, 4) === startY + 1 ? 0.85 : 1)
    if (rnd() < pWet) {
      const mm = Math.round(-Math.log(1 - rnd()) * (m >= 6 && m <= 8 ? 7 : 5) * 10) / 10
      if (mm >= 0.2) out.push({ id: d, date: d, mm, note: mm > 25 ? 'Heavy shower' : undefined })
    }
  }
  return out
}
