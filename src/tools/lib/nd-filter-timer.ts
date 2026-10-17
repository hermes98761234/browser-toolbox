// ND filter exposure math: shutter parsing, stop arithmetic, reciprocity failure.

/** Parses "1/125", "0.5", "2s", "2\"", "1m30s" into seconds (NaN if invalid). */
export function parseShutter(txt: string): number {
  const t = txt.trim().toLowerCase().replace(/["″]$/, '').replace(/\s+/g, '')
  if (!t) return NaN
  const frac = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)s?$/.exec(t)
  if (frac) return Number(frac[2]) > 0 ? Number(frac[1]) / Number(frac[2]) : NaN
  const ms = /^(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s?)?$/.exec(t)
  if (ms && (ms[1] || ms[2])) return Number(ms[1] ?? 0) * 60 + Number(ms[2] ?? 0)
  return NaN
}

/** Shutter value as photographers write it: 1/250, 1/4, 0.6", 15", 2m 08s, 1h 04m. */
export function formatShutter(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  if (sec < 0.4) return `1/${Math.round(1 / sec)}`
  if (sec < 10) return `${Number(sec.toFixed(1))}″`
  if (sec < 60) return `${Math.round(sec)}″`
  const total = Math.round(sec)
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  if (h) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/** Clock display mm:ss.t or h:mm:ss. */
export function clock(sec: number): string {
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(r)).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${r < 10 ? '0' : ''}${r.toFixed(1)}`
}

/** Stops of a filter given its filter factor (ND1000 → ~9.97). */
export const stopsFromFactor = (factor: number) => Math.log2(factor)
/** Stops from optical density (ND 3.0 → ~9.97). */
export const stopsFromDensity = (d: number) => d / Math.log10(2)

/** Exposure with `stops` more light blocked. */
export const ndTime = (base: number, stops: number) => base * Math.pow(2, stops)

/** Extra stops from changing ISO and aperture between metering and shooting. */
export function settingsStops(isoMeter: number, isoShoot: number, fMeter: number, fShoot: number): number {
  return Math.log2(isoMeter / isoShoot) + 2 * Math.log2(fShoot / fMeter)
}

/** Schwarzschild reciprocity correction Tc = Tm^p (Ilford's published formula), applied above 1 s. */
export function reciprocity(t: number, p: number): number {
  return t > 1 && p > 1 ? Math.pow(t, p) : t
}

/** Stops needed to stretch `base` to `target` seconds. */
export const stopsNeeded = (base: number, target: number) => Math.log2(target / base)

export const STANDARD_SHUTTERS = [1 / 8000, 1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 15, 30]
