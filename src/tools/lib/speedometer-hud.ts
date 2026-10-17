// GPS speed helpers: great-circle distance, unit conversion, fix-to-fix speed and a trip accumulator.

export type Unit = 'kmh' | 'mph' | 'kn' | 'ms'
export const FACTOR: Record<Unit, number> = { kmh: 3.6, mph: 2.2369362920544, kn: 1.9438444924406, ms: 1 }
export const LABEL: Record<Unit, string> = { kmh: 'km/h', mph: 'mph', kn: 'kn', ms: 'm/s' }

/** Haversine distance in metres (WGS-84 mean radius). */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8, rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial bearing in degrees (0 = north). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad)
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad)
  return ((Math.atan2(y, x) / rad) + 360) % 360
}

export const compass = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8]

export interface Fix { lat: number; lon: number; t: number; speed: number | null; acc: number; heading: number | null }
export interface Trip { dist: number; moving: number; max: number; last: Fix | null; speed: number; heading: number | null }
export const emptyTrip = (): Trip => ({ dist: 0, moving: 0, max: 0, last: null, speed: 0, heading: null })

/**
 * Adds a fix. Uses the device's Doppler speed when present, else distance/time from the previous fix.
 * Ignores jumps inside the accuracy radius when standing still, and smooths with an exponential filter.
 */
export function addFix(tr: Trip, f: Fix, smooth = 0.5): Trip {
  if (!tr.last) return { ...tr, last: f, speed: Math.max(0, f.speed ?? 0), heading: f.heading }
  const dt = (f.t - tr.last.t) / 1000
  if (dt <= 0) return tr
  const d = haversine(tr.last.lat, tr.last.lon, f.lat, f.lon)
  const derived = d / dt
  let v = f.speed !== null && Number.isFinite(f.speed) ? Math.max(0, f.speed) : derived
  if (f.speed === null && d < Math.max(f.acc, tr.last.acc) * 0.5) v = 0 // GPS jitter
  const sp = tr.speed * (1 - smooth) + v * smooth
  const moved = v > 0.5
  return {
    dist: tr.dist + (moved ? d : 0),
    moving: tr.moving + (moved ? dt : 0),
    max: Math.max(tr.max, sp),
    last: f,
    speed: sp,
    heading: f.heading ?? (moved ? bearing(tr.last.lat, tr.last.lon, f.lat, f.lon) : tr.heading),
  }
}
