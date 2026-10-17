// GPS trip distance for vehicle trips (filtered fixes), a synthetic demo drive and report grouping.
import { acceptFix, haversine, type Fix, type LL } from './dog-walk-tracker'

/** Driving filter: reject fixes worse than 50 m, jitter under 15 m and jumps faster than 70 m/s. */
export const acceptDriveFix = (prev: Fix | undefined, f: Fix) => acceptFix(prev, f, 50, 15, 70)

/** Accumulates accepted fixes; returns metres and the kept points. */
export function trackDistance(fixes: Fix[]): { metres: number; kept: Fix[] } {
  const kept: Fix[] = []
  let metres = 0
  for (const f of fixes) {
    const prev = kept[kept.length - 1]
    if (!acceptDriveFix(prev, f)) continue
    if (prev) metres += haversine([prev.lat, prev.lon], [f.lat, f.lon])
    kept.push(f)
  }
  return { metres, kept }
}

export const M_PER_MI = 1609.344
export const toUnit = (m: number, unit: 'mi' | 'km') => m / (unit === 'mi' ? M_PER_MI : 1000)

/** A deterministic city drive (street grid legs with GPS noise and occasional bad fixes), one fix per second. */
export function demoDrive(start: LL = [40.7484, -73.9857], seed = 7): Fix[] {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const legs: [number, number, number][] = [[0, 900, 12], [90, 600, 10], [0, 1400, 15], [90, 2200, 22], [180, 700, 11], [90, 900, 14]] // bearing°, metres, m/s
  const mLat = 111320, mLon = 111320 * Math.cos((start[0] * Math.PI) / 180)
  let [lat, lon] = start
  let t = 0
  const out: Fix[] = [{ lat, lon, t: 0, acc: 8 }]
  for (const [b, dist, v] of legs) {
    const n = Math.round(dist / v)
    for (let i = 0; i < n; i++) {
      lat += (Math.cos((b * Math.PI) / 180) * v) / mLat
      lon += (Math.sin((b * Math.PI) / 180) * v) / mLon
      t += 1000
      const bad = rnd() < 0.02
      const noise = bad ? 120 : 3
      out.push({ lat: lat + ((rnd() - 0.5) * noise) / mLat, lon: lon + ((rnd() - 0.5) * noise) / mLon, t, acc: bad ? 90 : 5 + rnd() * 8 })
    }
  }
  return out
}

/** Total true length of the demo route in metres (for tests and the demo label). */
export const DEMO_METRES = 900 + 600 + 1400 + 2200 + 700 + 900

export interface ReportRow { key: string; trips: number; distance: number; amount: number }
export function groupBy<T>(items: T[], key: (t: T) => string, dist: (t: T) => number, amt: (t: T) => number): ReportRow[] {
  const m = new Map<string, ReportRow>()
  for (const it of items) {
    const k = key(it)
    const r = m.get(k) ?? { key: k, trips: 0, distance: 0, amount: 0 }
    r.trips++
    r.distance += dist(it)
    r.amount += amt(it)
    m.set(k, r)
  }
  return [...m.values()].sort((a, b) => a.key.localeCompare(b.key))
}
