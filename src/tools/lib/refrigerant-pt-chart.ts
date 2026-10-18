// Refrigerant saturation pressure–temperature relations.
//
// Each curve uses a Wagner-type form fitted (by this project, least squares) to reference saturation data:
//   ln p[kPa] = c0 + (Tc/T)·(a1·τ + a2·τ^1.5 + a3·τ^2.5 + a4·τ^5),  τ = 1 − T/Tc  (T in K)
// Reference data: pure fluids from the NIST Chemistry WebBook (public US-government data, REFPROP-based);
// blends from published saturation tables generated with NIST REFPROP (liquid = bubble, vapour = dew).
// Fit error is below 0.1 % across each listed temperature range.

export type Kind = 'bubble' | 'dew'
type Coef = [tc: number, c0: number, a1: number, a2: number, a3: number, a4: number]

export interface Refrigerant {
  id: string
  name: string
  type: 'pure' | 'near-azeotrope' | 'zeotrope'
  safety: string
  gwp: number // IPCC AR4 100-year
  tmin: number // °C
  tmax: number // °C
  bubble: Coef
  dew: Coef
  note: string
}

const pure = (id: string, name: string, safety: string, gwp: number, tmin: number, tmax: number, c: Coef, note: string): Refrigerant => ({ id, name, type: 'pure', safety, gwp, tmin, tmax, bubble: c, dew: c, note })

export const REFRIGERANTS: Refrigerant[] = [
  pure('R134a', 'R-134a', 'A1', 1430, -60, 95, [101.06, 8.3079966, -7.6114118, 1.6892096, -2.5075135, -3.5548817], 'Automotive A/C, chillers, medium-temperature refrigeration.'),
  pure('R22', 'R-22', 'A1', 1810, -60, 90, [96.145, 8.5149798, -7.0436835, 1.4685184, -1.8012182, -2.8739596], 'HCFC, phased out for new equipment; still found in older systems.'),
  pure('R32', 'R-32', 'A2L', 675, -60, 75, [78.022, 8.6604162, -7.4325955, 1.6333249, -1.8153224, -3.0632318], 'Mildly flammable single-component replacement for R-410A in split A/C.'),
  {
    id: 'R410A', name: 'R-410A', type: 'near-azeotrope', safety: 'A1', gwp: 2088, tmin: -60, tmax: 70,
    bubble: [71.5, 8.5011733, -7.4302821, 1.4933003, -1.9005912, -3.6319099],
    dew: [71.5, 8.5006007, -7.497834, 1.6582781, -2.0959008, -3.3522406],
    note: 'R-32/R-125 50/50 wt %. Glide about 0.1 K, so bubble ≈ dew. High pressure: ~2.4 MPa at 40 °C.',
  },
  {
    id: 'R404A', name: 'R-404A', type: 'near-azeotrope', safety: 'A1', gwp: 3922, tmin: -60, tmax: 70,
    bubble: [72.5, 8.2338412, -7.4039045, 1.6547559, -2.1273844, -3.4710682],
    dew: [72.5, 8.2317994, -7.4977771, 1.7893335, -2.3379807, -4.0712379],
    note: 'R-125/R-143a/R-134a 44/52/4 wt %. Low-temperature commercial refrigeration; glide under 1 K.',
  },
  {
    id: 'R407C', name: 'R-407C', type: 'zeotrope', safety: 'A1', gwp: 1774, tmin: -50, tmax: 80,
    bubble: [86.5, 8.4628897, -6.9448512, 0.82044751, -1.2074514, -3.9094111],
    dew: [86.5, 8.4322797, -8.1747568, 2.7464092, -3.5874573, -2.9218121],
    note: 'R-32/R-125/R-134a 23/25/52 wt %. Large glide (≈ 5–7 K): use DEW for superheat and BUBBLE for subcooling.',
  },
  pure('R290', 'R-290 (propane)', 'A3', 3, -60, 90, [96.74, 8.3547054, -6.7413699, 1.4796044, -1.4575089, -2.3599339], 'Highly flammable hydrocarbon; small charges in plug-in units and heat pumps.'),
  pure('R600a', 'R-600a (isobutane)', 'A3', 3, -40, 130, [134.66, 8.1967051, -6.8690143, 1.4418963, -1.5559384, -2.9497868], 'Domestic refrigerators. Below about −12 °C it runs under atmospheric pressure (vacuum on gauges).'),
  pure('R717', 'R-717 (ammonia)', 'B2L', 0, -60, 125, [132.41, 9.3380042, -7.24958, 1.4734854, -1.7195993, -2.6187382], 'Industrial refrigeration. Toxic; never use copper or brass.'),
  pure('R744', 'R-744 (CO₂)', 'A1', 1, -56.5, 30.9, [30.978, 8.9060557, -7.0184129, 1.498238, -2.1815307, -2.9811106], 'Critical point 31.0 °C / 7.38 MPa: above it there is no saturation (transcritical operation).'),
]

export const byId = (id: string) => REFRIGERANTS.find((r) => r.id === id) ?? REFRIGERANTS[0]

function wagner(c: Coef, tC: number): number {
  const [tc, c0, a1, a2, a3, a4] = c
  const T = tC + 273.15, Tc = tc + 273.15
  const tau = Math.max(0, 1 - T / Tc)
  return Math.exp(c0 + (Tc / T) * (a1 * tau + a2 * tau ** 1.5 + a3 * tau ** 2.5 + a4 * tau ** 5))
}

/** Saturation pressure in kPa absolute (NaN outside the valid range). */
export function psat(r: Refrigerant, tC: number, kind: Kind = 'dew'): number {
  if (!(tC >= r.tmin - 1e-9 && tC <= r.tmax + 1e-9)) return NaN
  return wagner(kind === 'bubble' ? r.bubble : r.dew, tC)
}

/** Saturation temperature (°C) for an absolute pressure in kPa (NaN outside the range). */
export function tsat(r: Refrigerant, pKpa: number, kind: Kind = 'dew'): number {
  let lo = r.tmin, hi = r.tmax
  if (!(pKpa >= psat(r, lo, kind) && pKpa <= psat(r, hi, kind))) return NaN
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2
    if (psat(r, m, kind) < pKpa) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

// ---------- units ----------

export type PUnit = 'kPa' | 'bar' | 'psi' | 'MPa'
export const P_PER_KPA: Record<PUnit, number> = { kPa: 1, bar: 0.01, psi: 1 / 6.894757293168, MPa: 0.001 }
export const ATM = 101.325

/** kPa absolute → display value (gauge subtracts the atmospheric pressure). */
export const fromKpa = (kpaAbs: number, u: PUnit, gauge: boolean, atm = ATM) => (kpaAbs - (gauge ? atm : 0)) * P_PER_KPA[u]
export const toKpa = (v: number, u: PUnit, gauge: boolean, atm = ATM) => v / P_PER_KPA[u] + (gauge ? atm : 0)
export const cToF = (c: number) => (c * 9) / 5 + 32
export const fToC = (f: number) => ((f - 32) * 5) / 9

/** Superheat (K) from suction pressure (kPa abs) and suction-line temperature (°C): uses the dew curve. */
export const superheat = (r: Refrigerant, pKpa: number, tLine: number) => tLine - tsat(r, pKpa, 'dew')
/** Subcooling (K) from liquid-line pressure (kPa abs) and temperature (°C): uses the bubble curve. */
export const subcooling = (r: Refrigerant, pKpa: number, tLine: number) => tsat(r, pKpa, 'bubble') - tLine

export function table(r: Refrigerant, from: number, to: number, step: number) {
  const rows: { t: number; bubble: number; dew: number }[] = []
  if (!(step > 0)) return rows
  for (let t = Math.max(from, r.tmin); t <= Math.min(to, r.tmax) + 1e-9 && rows.length < 400; t += step) {
    const tt = Math.round(t * 1000) / 1000
    rows.push({ t: tt, bubble: psat(r, tt, 'bubble'), dew: psat(r, tt, 'dew') })
  }
  return rows
}
