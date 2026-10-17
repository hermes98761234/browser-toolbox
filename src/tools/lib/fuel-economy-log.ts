// Fuel economy by the full-tank method: economy is measured only between two full fill-ups,
// with any partial fills in between added to the fuel used.

export interface Fill { id: string; date: string; odo: number; vol: number; cost: number; full: boolean; missed?: boolean; note?: string }
export interface Segment { date: string; from: number; to: number; distance: number; fuel: number; cost: number }

export function segments(fills: Fill[]): Segment[] {
  const s = [...fills].sort((a, b) => a.odo - b.odo || a.date.localeCompare(b.date))
  const out: Segment[] = []
  let anchor: Fill | null = null
  let fuel = 0, cost = 0, broken = false
  for (const f of s) {
    if (!anchor) {
      if (f.full) anchor = f
      continue
    }
    fuel += f.vol
    cost += f.cost
    if (f.missed) broken = true
    if (f.full) {
      const distance = f.odo - anchor.odo
      if (!broken && distance > 0 && fuel > 0) out.push({ date: f.date, from: anchor.odo, to: f.odo, distance, fuel, cost })
      anchor = f
      fuel = 0
      cost = 0
      broken = false
    }
  }
  return out
}

export const KM_PER_MI = 1.609344
export const L_PER_USGAL = 3.785411784
export const L_PER_UKGAL = 4.54609

export type Metric = 'l100' | 'kml' | 'mpg' | 'mpguk'
export const METRICS: [Metric, string][] = [['l100', 'L/100 km'], ['kml', 'km/L'], ['mpg', 'mpg (US)'], ['mpguk', 'mpg (UK)']]

/** Economy from distance in km and fuel in litres. */
export function economy(km: number, litres: number, m: Metric): number {
  if (!(km > 0) || !(litres > 0)) return NaN
  switch (m) {
    case 'l100': return (litres / km) * 100
    case 'kml': return km / litres
    case 'mpg': return km / KM_PER_MI / (litres / L_PER_USGAL)
    case 'mpguk': return km / KM_PER_MI / (litres / L_PER_UKGAL)
  }
}
/** For L/100 km lower is better. */
export const lowerIsBetter = (m: Metric) => m === 'l100'
