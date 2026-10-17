// Psychrometric equations, SI units (ASHRAE Handbook — Fundamentals 2017, ch. 1).
// t in °C, p in kPa, W in kg water / kg dry air, h in kJ/kg dry air, v in m³/kg dry air.

/** Saturation vapour pressure (kPa), Hyland–Wexler, over ice below 0 °C, over water above. */
export function pws(t: number): number {
  const T = t + 273.15
  let ln: number
  if (t < 0) {
    ln = -5.6745359e3 / T + 6.3925247 - 9.677843e-3 * T + 6.2215701e-7 * T ** 2 + 2.0747825e-9 * T ** 3 - 9.484024e-13 * T ** 4 + 4.1635019 * Math.log(T)
  } else {
    ln = -5.8002206e3 / T + 1.3914993 - 4.8640239e-2 * T + 4.1764768e-5 * T ** 2 - 1.4452093e-8 * T ** 3 + 6.5459673 * Math.log(T)
  }
  return Math.exp(ln) / 1000
}

/** Buck (1981) enhancement factor for moist air (p in kPa) — makes tables match ASHRAE values. */
export const enhancement = (t: number, p: number) => (t < 0 ? 1.0003 + 4.18e-5 * p : 1.0007 + 3.46e-5 * p)
/** Saturation partial pressure of water vapour in moist air (kPa). */
export const psat = (t: number, p: number) => enhancement(t, p) * pws(t)

/** Standard atmospheric pressure (kPa) at altitude z (m). */
export const pressureAt = (z: number) => 101.325 * (1 - 2.25577e-5 * z) ** 5.2559

export const wFromPw = (pw: number, p: number) => (0.621945 * pw) / (p - pw)
export const pwFromW = (W: number, p: number) => (p * W) / (0.621945 + W)
export const enthalpy = (t: number, W: number) => 1.006 * t + W * (2501 + 1.86 * t)
export const specVolume = (t: number, W: number, p: number) => (0.287042 * (t + 273.15) * (1 + 1.607858 * W)) / p
/** Humidity ratio at saturation. */
export const wsat = (t: number, p: number) => wFromPw(psat(t, p), p)

/** Humidity ratio from dry bulb and relative humidity (0..1). */
export const wFromRh = (t: number, rh: number, p: number) => wFromPw(rh * psat(t, p), p)

/** Humidity ratio from dry bulb and thermodynamic wet bulb (ASHRAE eq. 33/35). */
export function wFromWb(t: number, twb: number, p: number): number {
  const wss = wsat(twb, p)
  if (twb >= 0) return ((2501 - 2.326 * twb) * wss - 1.006 * (t - twb)) / (2501 + 1.86 * t - 4.186 * twb)
  return ((2830 - 0.24 * twb) * wss - 1.006 * (t - twb)) / (2830 + 1.86 * t - 2.1 * twb)
}

function bisect(f: (x: number) => number, lo: number, hi: number, it = 80): number {
  let flo = f(lo)
  for (let i = 0; i < it; i++) {
    const mid = (lo + hi) / 2
    const fm = f(mid)
    if (fm * flo > 0) { lo = mid; flo = fm } else hi = mid
  }
  return (lo + hi) / 2
}

/** Wet-bulb temperature from dry bulb and humidity ratio. */
export const wetBulb = (t: number, W: number, p: number) => bisect((x) => wFromWb(t, x, p) - W, -60, t)
/** Dew point from humidity ratio. */
export function dewPoint(W: number, p: number): number {
  const pw = pwFromW(W, p)
  if (pw <= 0) return -Infinity
  return bisect((x) => psat(x, p) - pw, -90, 100)
}
/** Dry bulb from enthalpy and humidity ratio. */
export const tFromH = (h: number, W: number) => (h - 2501 * W) / (1.006 + 1.86 * W)

export interface AirState {
  t: number; W: number; rh: number; twb: number; tdp: number; h: number; v: number; pw: number; rho: number
}

export function stateFrom(t: number, W: number, p: number): AirState {
  const pw = pwFromW(W, p)
  const v = specVolume(t, W, p)
  return { t, W, rh: pw / psat(t, p), twb: wetBulb(t, W, p), tdp: dewPoint(W, p), h: enthalpy(t, W), v, pw, rho: (1 + W) / v }
}

/** Adiabatic mixing of two air streams by dry-air mass flow (m1, m2). */
export function mix(a: { t: number; W: number }, m1: number, b: { t: number; W: number }, m2: number) {
  const m = m1 + m2
  const W = (m1 * a.W + m2 * b.W) / m
  const h = (m1 * enthalpy(a.t, a.W) + m2 * enthalpy(b.t, b.W)) / m
  return { t: tFromH(h, W), W }
}

/** Cooling coil leaving state with apparatus dew point and bypass factor. */
export function coilOutlet(inlet: { t: number; W: number }, adp: number, bf: number, p: number) {
  const wadp = wsat(adp, p)
  if (wadp >= inlet.W) {
    // Sensible-only cooling (coil surface above dew point)
    return { t: adp + bf * (inlet.t - adp), W: inlet.W }
  }
  return { t: adp + bf * (inlet.t - adp), W: wadp + bf * (inlet.W - wadp) }
}

/** Sensible heat ratio between two states. */
export function shr(a: { t: number; W: number }, b: { t: number; W: number }) {
  const total = enthalpy(b.t, b.W) - enthalpy(a.t, a.W)
  const lat = (b.W - a.W) * (2501 + 1.86 * b.t)
  return total === 0 ? 1 : (total - lat) / total
}
