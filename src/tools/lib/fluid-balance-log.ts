// Fluid balance arithmetic: clinical day windows, shift buckets, running balance.

export interface Entry { id: string; t: string; kind: 'in' | 'out'; route: string; ml: number; note: string }

/** Minutes since local midnight of `YYYY-MM-DD`, for a local `YYYY-MM-DDTHH:mm` timestamp. */
export function minutesFrom(day: string, t: string): number {
  const [y, m, d] = day.split('-').map(Number)
  const [date, time = '00:00'] = t.split('T')
  const [Y, M, D] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const a = Date.UTC(y, m - 1, d), b = Date.UTC(Y, M - 1, D, h, mi)
  return Math.round((b - a) / 60000)
}

/** Shift index (0…n−1) inside the clinical day that starts at `startHour` on `day`, or −1 if outside it. */
export function shiftIndex(day: string, t: string, startHour: number, shifts: number): number {
  const m = minutesFrom(day, t) - startHour * 60
  if (m < 0 || m >= 1440) return -1
  return Math.floor(m / (1440 / shifts))
}

export function shiftLabels(startHour: number, shifts: number): string[] {
  const len = 24 / shifts
  const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`
  return Array.from({ length: shifts }, (_, i) => `${hh(startHour + i * len)}–${hh(startHour + (i + 1) * len)}`)
}

export interface Totals { inMl: number; outMl: number; balance: number; urine: number; byRoute: Record<string, number> }

export function totals(es: Entry[]): Totals {
  const byRoute: Record<string, number> = {}
  let inMl = 0, outMl = 0, urine = 0
  for (const e of es) {
    if (!(e.ml > 0)) continue
    if (e.kind === 'in') inMl += e.ml
    else outMl += e.ml
    if (e.kind === 'out' && /urine/i.test(e.route)) urine += e.ml
    byRoute[`${e.kind}:${e.route}`] = (byRoute[`${e.kind}:${e.route}`] ?? 0) + e.ml
  }
  return { inMl, outMl, balance: inMl - outMl, urine, byRoute }
}

/** Urine output rate in mL/kg/h. */
export const urineRate = (ml: number, kg: number, hours: number) => (kg > 0 && hours > 0 ? ml / kg / hours : NaN)

/** Cumulative balance points [hours since day start, mL] — a step series in time order. */
export function running(day: string, es: Entry[], startHour: number): [number, number][] {
  const pts: [number, number][] = [[0, 0]]
  let b = 0
  const sorted = es.map((e) => ({ e, h: (minutesFrom(day, e.t) - startHour * 60) / 60 })).filter((x) => x.h >= 0 && x.h < 24).sort((a, c) => a.h - c.h)
  for (const { e, h } of sorted) {
    pts.push([h, b])
    b += e.kind === 'in' ? e.ml : -e.ml
    pts.push([h, b])
  }
  return pts
}
