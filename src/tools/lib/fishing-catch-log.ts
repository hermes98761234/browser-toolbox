// Fishing log helpers: moon phase, per-species summaries, time-of-day histogram, unit conversion,
// photo downscale sizing and the inverse Web-Mercator projection for picking spots on the map.

export interface Catch {
  id: string
  at: string // local ISO "YYYY-MM-DDTHH:MM"
  species: string
  length: number // cm (0 = not measured)
  weight: number // kg (0 = not weighed)
  method: string
  bait: string
  released: boolean
  lat: number | null
  lon: number | null
  spot: string
  weather: string
  airT: number | null // °C
  waterT: number | null // °C
  wind: string
  notes: string
  photo: boolean // a photo is stored in IndexedDB under this id
}

const SYNODIC = 29.530588853
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14) // reference new moon

/** Moon age fraction (0 = new, 0.5 = full), illuminated fraction and phase name. */
export function moonPhase(ms: number): { frac: number; illum: number; name: string; icon: string } {
  const days = (ms - NEW_MOON_2000) / 86400000
  const frac = (((days / SYNODIC) % 1) + 1) % 1
  const illum = (1 - Math.cos(2 * Math.PI * frac)) / 2
  const i = Math.round(frac * 8) % 8
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
  return { frac, illum, name: names[i], icon: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][i] }
}

export interface SpeciesRow { species: string; count: number; released: number; maxLen: number; maxWt: number; avgLen: number }

export function speciesSummary(cs: Catch[]): SpeciesRow[] {
  const m = new Map<string, Catch[]>()
  for (const c of cs) {
    const k = c.species.trim() || 'Unknown'
    m.set(k, [...(m.get(k) ?? []), c])
  }
  return [...m.entries()]
    .map(([species, l]) => {
      const lens = l.map((c) => c.length).filter((x) => x > 0)
      return {
        species, count: l.length, released: l.filter((c) => c.released).length,
        maxLen: Math.max(0, ...lens), maxWt: Math.max(0, ...l.map((c) => c.weight)),
        avgLen: lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0,
      }
    })
    .sort((a, b) => b.count - a.count || a.species.localeCompare(b.species))
}

/** Catches per 3-hour block of the day (8 bins: 0–3, 3–6, …). */
export function byDayPart(cs: Catch[]): number[] {
  const out = new Array(8).fill(0)
  for (const c of cs) {
    const h = Number(c.at.slice(11, 13))
    if (Number.isFinite(h)) out[Math.min(7, Math.floor(h / 3))]++
  }
  return out
}

/** Count of catches by key, most common first. */
export function tally(cs: Catch[], key: (c: Catch) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const c of cs) {
    const k = key(c).trim()
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export const cmToIn = (cm: number) => cm / 2.54
export const kgToLb = (kg: number) => kg * 2.2046226218

/** Fit w×h inside a max×max box (never upscales). */
export function fitWithin(w: number, h: number, max: number): [number, number] {
  const k = Math.min(1, max / Math.max(w, h))
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]
}

/** World pixel (256·2^z tiles) → [lat, lon]. Inverse of the Web-Mercator projection. */
export function unproject(x: number, y: number, z: number): [number, number] {
  const s = 256 * 2 ** z
  const lon = (x / s) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / s
  return [(180 / Math.PI) * Math.atan(Math.sinh(n)), lon]
}
