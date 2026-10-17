// FAO-56 crop water use: Penman–Monteith ET0 (Hargreaves fallback), single crop coefficients,
// and a daily root-zone soil water balance that triggers irrigation at the allowed depletion.

const RAD = Math.PI / 180

/** Saturation vapour pressure (kPa) at T (°C), FAO-56 eq. 11. */
export const esat = (T: number) => 0.6108 * Math.exp((17.27 * T) / (T + 237.3))

/** Day of year (1–366) for an ISO date. */
export function doy(iso: string): number {
  const d = new Date(iso + 'T00:00:00Z')
  return Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1
}

/** Extraterrestrial radiation Ra (MJ m⁻² day⁻¹) and daylight hours N, FAO-56 eqs. 21–25, 34. */
export function solar(latDeg: number, J: number) {
  const phi = latDeg * RAD
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * J) / 365)
  const dec = 0.409 * Math.sin((2 * Math.PI * J) / 365 - 1.39)
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(dec))))
  const Ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(ws))
  return { Ra: Math.max(0, Ra), N: (24 / Math.PI) * ws }
}

/** Wind speed at 2 m from a measurement at height z (m), FAO-56 eq. 47. */
export const windAt2m = (uz: number, z: number) => (z === 2 ? uz : (uz * 4.87) / Math.log(67.8 * z - 5.42))

export interface Day {
  tmax: number; tmin: number
  /** Relative humidity, %. Either both min/max, or mean, or dew point. */
  rhmax?: number; rhmin?: number; rhmean?: number; tdew?: number
  /** Wind at 2 m, m/s. */
  u2?: number
  /** Sunshine hours, or measured solar radiation Rs (MJ m⁻² day⁻¹). */
  sun?: number; rs?: number
}

export interface Et0Result { et0: number; method: 'Penman–Monteith' | 'Hargreaves'; Ra: number; N: number; Rs: number; Rn: number; es: number; ea: number; delta: number; gamma: number }

/** Daily reference evapotranspiration (mm/day). Falls back to Hargreaves when humidity, wind or radiation are missing. */
export function et0(d: Day, latDeg: number, elev: number, J: number): Et0Result {
  const { Ra, N } = solar(latDeg, J)
  const tmean = (d.tmax + d.tmin) / 2
  const P = 101.3 * Math.pow((293 - 0.0065 * elev) / 293, 5.26)
  const gamma = 0.000665 * P
  const es = (esat(d.tmax) + esat(d.tmin)) / 2
  const delta = (4098 * esat(tmean)) / Math.pow(tmean + 237.3, 2)
  let ea: number | undefined
  if (d.rhmax !== undefined && d.rhmin !== undefined) ea = (esat(d.tmin) * d.rhmax + esat(d.tmax) * d.rhmin) / 200
  else if (d.tdew !== undefined) ea = esat(d.tdew)
  else if (d.rhmean !== undefined) ea = (d.rhmean / 100) * es
  const Rs = d.rs ?? (d.sun !== undefined ? (0.25 + (0.5 * Math.min(d.sun, N)) / (N || 1)) * Ra : undefined)
  if (ea === undefined || Rs === undefined || d.u2 === undefined) {
    const h = hargreaves(d.tmax, d.tmin, Ra)
    return { et0: h, method: 'Hargreaves', Ra, N, Rs: Rs ?? NaN, Rn: NaN, es, ea: ea ?? NaN, delta, gamma }
  }
  const Rso = (0.75 + 2e-5 * elev) * Ra
  const Rns = 0.77 * Rs
  const sigma = 4.903e-9
  const tk4 = (Math.pow(d.tmax + 273.16, 4) + Math.pow(d.tmin + 273.16, 4)) / 2
  const rel = Rso > 0 ? Math.min(1, Rs / Rso) : 0.5
  const Rnl = sigma * tk4 * (0.34 - 0.14 * Math.sqrt(Math.max(0, ea))) * (1.35 * rel - 0.35)
  const Rn = Rns - Rnl
  const num = 0.408 * delta * Rn + gamma * (900 / (tmean + 273)) * d.u2 * (es - ea)
  const den = delta + gamma * (1 + 0.34 * d.u2)
  return { et0: Math.max(0, num / den), method: 'Penman–Monteith', Ra, N, Rs, Rn, es, ea, delta, gamma }
}

/** Hargreaves–Samani ET0 (mm/day), FAO-56 eq. 52; Ra in MJ m⁻² day⁻¹. */
export const hargreaves = (tmax: number, tmin: number, Ra: number) =>
  Math.max(0, 0.0023 * ((tmax + tmin) / 2 + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * 0.408 * Ra)

// ---------- crops and soils ----------

export interface Crop { name: string; kc: [number, number, number]; stages: [number, number, number, number]; p: number; zr: number }

/** FAO-56 Tables 11, 12 and 22 (typical values). */
export const CROPS: Crop[] = [
  { name: 'Tomato', kc: [0.6, 1.15, 0.8], stages: [30, 40, 40, 25], p: 0.4, zr: 1.0 },
  { name: 'Maize (grain)', kc: [0.3, 1.2, 0.6], stages: [30, 40, 50, 30], p: 0.55, zr: 1.2 },
  { name: 'Spring wheat', kc: [0.3, 1.15, 0.25], stages: [20, 25, 60, 30], p: 0.55, zr: 1.2 },
  { name: 'Potato', kc: [0.5, 1.15, 0.75], stages: [25, 30, 45, 30], p: 0.35, zr: 0.5 },
  { name: 'Lettuce', kc: [0.7, 1.0, 0.95], stages: [20, 30, 15, 10], p: 0.3, zr: 0.4 },
  { name: 'Green beans', kc: [0.5, 1.05, 0.9], stages: [20, 30, 30, 10], p: 0.45, zr: 0.6 },
  { name: 'Onion (dry)', kc: [0.7, 1.05, 0.75], stages: [15, 25, 70, 40], p: 0.3, zr: 0.4 },
  { name: 'Cucumber', kc: [0.6, 1.0, 0.75], stages: [20, 30, 40, 15], p: 0.5, zr: 0.9 },
  { name: 'Strawberry', kc: [0.4, 0.85, 0.75], stages: [30, 40, 60, 30], p: 0.2, zr: 0.3 },
  { name: 'Table grapes', kc: [0.3, 0.85, 0.45], stages: [20, 40, 120, 60], p: 0.35, zr: 1.2 },
  { name: 'Citrus (no ground cover)', kc: [0.7, 0.65, 0.7], stages: [60, 90, 120, 95], p: 0.5, zr: 1.2 },
  { name: 'Alfalfa (average)', kc: [0.4, 0.95, 0.9], stages: [10, 30, 25, 10], p: 0.55, zr: 1.2 },
  { name: 'Lawn, cool-season', kc: [0.9, 0.95, 0.95], stages: [1, 1, 363, 1], p: 0.4, zr: 0.4 },
  { name: 'Lawn, warm-season', kc: [0.8, 0.85, 0.85], stages: [1, 1, 363, 1], p: 0.5, zr: 0.6 },
]

/** Field capacity and wilting point (m³/m³), FAO-56 Table 19 mid-range values. */
export const SOILS: [string, number, number][] = [
  ['Sand', 0.12, 0.045], ['Loamy sand', 0.14, 0.06], ['Sandy loam', 0.23, 0.1], ['Loam', 0.25, 0.12], ['Silt loam', 0.29, 0.13],
  ['Silt', 0.32, 0.15], ['Silty clay loam', 0.34, 0.21], ['Silty clay', 0.36, 0.23], ['Clay', 0.36, 0.22],
]

/** Crop coefficient on day d (0-based) after planting: flat, linear rise, flat, linear decline. */
export function kcOn(c: Crop, d: number): number {
  const [a, b, m, l] = c.stages
  const [ini, mid, end] = c.kc
  if (d < a) return ini
  if (d < a + b) return ini + ((d - a) / b) * (mid - ini)
  if (d < a + b + m) return mid
  if (d < a + b + m + l) return mid + ((d - a - b - m) / l) * (end - mid)
  return end
}

export const seasonLength = (c: Crop) => c.stages.reduce((s, x) => s + x, 0)

export function stageName(c: Crop, d: number): string {
  const [a, b, m] = c.stages
  return d < a ? 'Initial' : d < a + b ? 'Development' : d < a + b + m ? 'Mid-season' : 'Late season'
}

// ---------- water balance ----------

export interface BalanceIn { et0: number; rain: number; kc: number }
export interface BalanceOpts { taw: number; p: number; mad: number; eff: number; startDepl: number; minRain?: number }
export interface BalanceRow { day: number; et0: number; kc: number; ks: number; etc: number; rainEff: number; irrNet: number; irrGross: number; deplStart: number; depl: number; dp: number }

/**
 * Daily root-zone depletion Dr (mm), FAO-56 eq. 85. Irrigates back to field capacity on the day
 * the end-of-day depletion would exceed the management allowed depletion (mad × TAW).
 */
export function balance(days: BalanceIn[], o: BalanceOpts): BalanceRow[] {
  const raw = o.p * o.taw
  const trigger = o.mad * o.taw
  let Dr = Math.min(o.taw, Math.max(0, o.startDepl))
  return days.map((d, i) => {
    const deplStart = Dr
    const ks = Dr > raw ? Math.max(0, (o.taw - Dr) / ((1 - o.p) * o.taw || 1)) : 1
    const etc = ks * d.kc * d.et0
    const rainEff = d.rain >= (o.minRain ?? 0.2 * d.et0) ? d.rain : 0
    let next = Dr - rainEff + etc
    let dp = 0
    if (next < 0) {
      dp = -next
      next = 0
    }
    let irrNet = 0
    if (next >= trigger) {
      irrNet = next
      next = 0
    }
    Dr = Math.min(o.taw, next)
    return { day: i, et0: d.et0, kc: d.kc, ks, etc, rainEff, irrNet, irrGross: irrNet / (o.eff || 1), deplStart, depl: Dr, dp }
  })
}

// ---------- synthetic climate for the demo ----------

export interface Climate { name: string; tmax: [number, number]; tmin: [number, number]; rh: [number, number]; u2: number; sun: [number, number]; rainDays: [number, number]; rainMm: number }

/** [winter, summer] pairs in the northern-hemisphere sense; flipped for southern latitudes. */
export const CLIMATES: Climate[] = [
  { name: 'Mediterranean (hot dry summer)', tmax: [14, 32], tmin: [6, 19], rh: [72, 45], u2: 2.2, sun: [5, 11.5], rainDays: [0.35, 0.03], rainMm: 9 },
  { name: 'Temperate oceanic', tmax: [7, 23], tmin: [2, 13], rh: [85, 68], u2: 2.8, sun: [2, 7], rainDays: [0.45, 0.35], rainMm: 6 },
  { name: 'Semi-arid continental', tmax: [3, 33], tmin: [-6, 17], rh: [70, 35], u2: 3.2, sun: [5, 11], rainDays: [0.12, 0.15], rainMm: 8 },
  { name: 'Humid subtropical', tmax: [15, 33], tmin: [5, 23], rh: [70, 75], u2: 1.8, sun: [5, 8], rainDays: [0.25, 0.4], rainMm: 14 },
]

/** Deterministic daily weather from a climate (seeded so the demo is stable). */
export function synthWeather(c: Climate, startIso: string, n: number, lat: number, seed = 7) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const out: (Day & { date: string; rain: number })[] = []
  const t0 = new Date(startIso + 'T00:00:00Z').getTime()
  for (let i = 0; i < n; i++) {
    const date = new Date(t0 + i * 86400000).toISOString().slice(0, 10)
    const J = doy(date)
    // 0 = mid-winter, 1 = mid-summer (peak ~ July 20 in the north)
    let f = (1 - Math.cos((2 * Math.PI * (J - 20)) / 365)) / 2
    if (lat < 0) f = 1 - f
    const mix = ([w, su]: [number, number]) => w + (su - w) * f
    const noise = (rnd() - 0.5) * 4
    const pRain = mix(c.rainDays)
    const wet = rnd() < pRain
    const rain = wet ? +(c.rainMm * (0.2 + 1.6 * rnd())).toFixed(1) : 0
    const tmax = +(mix(c.tmax) + noise - (wet ? 3 : 0)).toFixed(1)
    const tmin = +(mix(c.tmin) + noise * 0.6).toFixed(1)
    const rhmean = Math.min(98, mix(c.rh) + (wet ? 15 : 0))
    out.push({
      date, rain, tmax, tmin,
      rhmax: +Math.min(100, rhmean + 18).toFixed(0), rhmin: +Math.max(10, rhmean - 18).toFixed(0),
      u2: +(c.u2 * (0.6 + 0.8 * rnd())).toFixed(1),
      sun: +Math.max(0, mix(c.sun) * (wet ? 0.35 : 0.85 + 0.3 * rnd())).toFixed(1),
    })
  }
  return out
}
