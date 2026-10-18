// Simple PV yield model (PVWatts-like structure, own implementation):
// NOAA sun position → clear-sky irradiance (Meinel air-mass model) scaled by a monthly "clearness"
// factor → plane-of-array irradiance (beam + isotropic diffuse + ground) → incidence-angle and
// cell-temperature derates → DC → system losses and inverter → AC. Results are estimates.
import { sunPosition } from './sunrise-sunset-planner'

const RAD = Math.PI / 180
const DAY = 86400000

export interface Irr { dni: number; dhi: number; ghi: number }

/** Kasten–Young relative air mass for an apparent elevation in degrees. */
export function airMass(elev: number): number {
  if (elev <= 0) return Infinity
  const z = 90 - elev
  return 1 / (Math.cos(z * RAD) + 0.50572 * Math.pow(96.07995 - z, -1.6364))
}

/** Clear-sky irradiance W/m² (Meinel: DNI = S·0.7^(AM^0.678), diffuse ≈ 10 % of DNI). */
export function clearSky(elev: number, doy: number): Irr {
  if (elev <= 0) return { dni: 0, dhi: 0, ghi: 0 }
  const S = 1361 * (1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365))
  const dni = S * Math.pow(0.7, Math.pow(airMass(elev), 0.678))
  const dhi = 0.1 * dni
  return { dni, dhi, ghi: dni * Math.sin(elev * RAD) + dhi }
}

/** Apply cloudiness: clearness c (0..1) scales beam; clouds add some diffuse light back. */
export function cloudy(cs: Irr, c: number, elev: number): Irr {
  const dni = cs.dni * c
  const dhi = cs.dhi * c + (1 - c) * 0.3 * cs.dni * Math.sin(Math.max(0, elev) * RAD)
  return { dni, dhi, ghi: dni * Math.sin(Math.max(0, elev) * RAD) + dhi }
}

/** Cosine of the angle of incidence on a plane with tilt β and azimuth γ (deg from N, clockwise). */
export function cosIncidence(elev: number, az: number, tilt: number, panelAz: number): number {
  return Math.sin(elev * RAD) * Math.cos(tilt * RAD) + Math.cos(elev * RAD) * Math.sin(tilt * RAD) * Math.cos((az - panelAz) * RAD)
}

/** ASHRAE incidence-angle modifier (b0 = 0.05) for the glass cover. */
export const iam = (cosI: number) => (cosI <= 0.05 ? 0 : Math.max(0, 1 - 0.05 * (1 / cosI - 1)))

export function poa(irr: Irr, elev: number, az: number, tilt: number, panelAz: number, albedo = 0.2) {
  const ci = cosIncidence(elev, az, tilt, panelAz)
  const beam = irr.dni * Math.max(0, ci) * iam(ci)
  const diff = irr.dhi * (1 + Math.cos(tilt * RAD)) / 2
  const ground = irr.ghi * albedo * (1 - Math.cos(tilt * RAD)) / 2
  return { beam, diff, ground, total: beam + diff + ground }
}

export interface System {
  lat: number
  lon: number
  tilt: number
  azimuth: number
  kWp: number
  /** Monthly clearness factor 0..1 (12 values). */
  clear: number[]
  /** Monthly mean ambient temperature °C (12 values). */
  temp: number[]
  losses: number // fraction, e.g. 0.14
  inverter: number // efficiency, e.g. 0.96
  gamma: number // power temp. coefficient per °C, e.g. -0.0037
  noct: number // °C, e.g. 45
  albedo: number
}

export const DEFAULT_SYS: Omit<System, 'lat' | 'lon' | 'clear' | 'temp'> = { tilt: 30, azimuth: 180, kWp: 6, losses: 0.14, inverter: 0.96, gamma: -0.0037, noct: 45, albedo: 0.2 }

const YEAR = 2025
const monthOf = (d: number) => new Date(Date.UTC(YEAR, 0, 1) + d * DAY).getUTCMonth()

/** AC power (W) and POA irradiance for one instant. */
export function instant(sys: System, ms: number) {
  const { elevation: el, azimuth: az } = sunPosition(ms, sys.lat, sys.lon)
  if (el <= 0) return { el, az, poa: 0, ac: 0, cell: 0 }
  const d = new Date(ms)
  const doy = Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY)
  const m = d.getUTCMonth()
  const irr = cloudy(clearSky(el, doy), sys.clear[m], el)
  const p = poa(irr, el, az, sys.tilt, sys.azimuth, sys.albedo).total
  const cell = sys.temp[m] + (p / 800) * (sys.noct - 20)
  const dc = (p / 1000) * sys.kWp * 1000 * (1 + sys.gamma * (cell - 25))
  const ac = Math.min(dc * (1 - sys.losses) * sys.inverter, sys.kWp * 1000 * 1.0)
  return { el, az, poa: p, ac: Math.max(0, ac), cell }
}

export interface Yearly {
  monthlyKWh: number[]
  monthlyPOA: number[] // kWh/m² per month
  annualKWh: number
  specific: number // kWh/kWp
  poaAnnual: number
}

/** Simulates a typical year at `stepMin` resolution (UTC; day totals don't depend on time zone). */
export function simulate(sys: System, stepMin = 30): Yearly {
  const monthlyKWh = Array(12).fill(0), monthlyPOA = Array(12).fill(0)
  const t0 = Date.UTC(YEAR, 0, 1)
  const h = stepMin / 60
  for (let d = 0; d < 365; d++) {
    const m = monthOf(d)
    for (let i = 0; i < 1440 / stepMin; i++) {
      const r = instant(sys, t0 + d * DAY + (i + 0.5) * stepMin * 60000)
      monthlyKWh[m] += (r.ac * h) / 1000
      monthlyPOA[m] += (r.poa * h) / 1000
    }
  }
  const annualKWh = monthlyKWh.reduce((a, b) => a + b, 0)
  return { monthlyKWh, monthlyPOA, annualKWh, specific: sys.kWp ? annualKWh / sys.kWp : 0, poaAnnual: monthlyPOA.reduce((a, b) => a + b, 0) }
}

/** Modelled mean daily GHI (kWh/m²/day) for a month with clearness c. */
export function monthGhi(lat: number, lon: number, month: number, c: number, stepMin = 30): number {
  let sum = 0, days = 0
  const t0 = Date.UTC(YEAR, month, 1)
  const n = new Date(Date.UTC(YEAR, month + 1, 0)).getUTCDate()
  for (let d = 0; d < n; d += 3) {
    days++
    for (let i = 0; i < 1440 / stepMin; i++) {
      const ms = t0 + d * DAY + (i + 0.5) * stepMin * 60000
      const { elevation: el } = sunPosition(ms, lat, lon)
      if (el <= 0) continue
      const doy = Math.floor((ms - Date.UTC(YEAR, 0, 1)) / DAY)
      sum += (cloudy(clearSky(el, doy), c, el).ghi * stepMin) / 60 / 1000
    }
  }
  return sum / days
}

/** Clearness factor that reproduces a measured mean daily GHI (bisection). */
export function calibrate(lat: number, lon: number, month: number, measured: number): number {
  let lo = 0.02, hi = 1.2
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    if (monthGhi(lat, lon, month, mid, 60) < measured) lo = mid
    else hi = mid
  }
  return Math.round(((lo + hi) / 2) * 1000) / 1000
}

/** Seasonal temperature curve from annual mean and half-range (coldest mid-January in the north). */
export function seasonalTemps(mean: number, amp: number, lat: number): number[] {
  return Array.from({ length: 12 }, (_, m) => mean - Math.sign(lat || 1) * amp * Math.cos((2 * Math.PI * (m * 30.4 + 15 - 15)) / 365))
}

export interface Layout { cols: number; rows: number; count: number; pw: number; ph: number }

/** Fits panels (w × h metres, portrait = long side up the slope) on a roof plane with edge setback and gaps. */
export function fitPanels(roofW: number, roofL: number, panelW: number, panelH: number, portrait: boolean, setback: number, gap = 0.02): Layout {
  const pw = portrait ? panelW : panelH
  const ph = portrait ? panelH : panelW
  const cols = Math.max(0, Math.floor((roofW - 2 * setback + gap) / (pw + gap)))
  const rows = Math.max(0, Math.floor((roofL - 2 * setback + gap) / (ph + gap)))
  return { cols, rows, count: cols * rows, pw, ph }
}
