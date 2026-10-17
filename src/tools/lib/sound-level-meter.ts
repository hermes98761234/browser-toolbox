// Frequency weighting (IEC 61672 A / C / Z) as digital biquad cascades, plus level maths.

export type Weighting = 'A' | 'C' | 'Z'
/** One second-order section: [b0, b1, b2, a1, a2] with a0 normalised to 1. */
export type SOS = [number, number, number, number, number]

const F1 = 20.598997, F2 = 107.65265, F3 = 737.86223, F4 = 12194.217

/** Bilinear transform of an analog 2nd-order section (num, den in descending powers of s). */
export function bilinear(num: [number, number, number], den: [number, number, number], fs: number): SOS {
  const K = 2 * fs, K2 = K * K
  const [b0, b1, b2] = num, [a0, a1, a2] = den
  const B0 = b0 * K2 + b1 * K + b2, B1 = 2 * b2 - 2 * b0 * K2, B2 = b0 * K2 - b1 * K + b2
  const A0 = a0 * K2 + a1 * K + a2, A1 = 2 * a2 - 2 * a0 * K2, A2 = a0 * K2 - a1 * K + a2
  return [B0 / A0, B1 / A0, B2 / A0, A1 / A0, A2 / A0]
}

/** Magnitude response (dB) of a cascade at frequency f. */
export function responseDb(sos: SOS[], f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w)
  let mag = 1
  for (const [b0, b1, b2, a1, a2] of sos) {
    const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2)
    const dr = 1 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2)
    mag *= Math.hypot(nr, ni) / Math.hypot(dr, di)
  }
  return 20 * Math.log10(mag)
}

/** Weighting filter for sample rate fs, normalised to 0 dB at 1 kHz. Pole frequencies are pre-warped. */
export function weightingSOS(type: Weighting, fs: number): SOS[] {
  if (type === 'Z') return []
  const warp = (f: number) => 2 * fs * Math.tan((Math.PI * f) / fs)
  const w1 = warp(F1), w2 = warp(F2), w3 = warp(F3), w4 = warp(F4)
  const sos: SOS[] =
    type === 'A'
      ? [bilinear([1, 0, 0], [1, 2 * w1, w1 * w1], fs), bilinear([1, 0, 0], [1, w2 + w3, w2 * w3], fs), bilinear([0, 0, w4 * w4], [1, 2 * w4, w4 * w4], fs)]
      : [bilinear([1, 0, 0], [1, 2 * w1, w1 * w1], fs), bilinear([0, 0, w4 * w4], [1, 2 * w4, w4 * w4], fs)]
  const g = 10 ** (-responseDb(sos, 1000, fs) / 20)
  sos[0] = [sos[0][0] * g, sos[0][1] * g, sos[0][2] * g, sos[0][3], sos[0][4]]
  return sos
}

/** Analytic IEC 61672 A-weighting in dB (reference curve). */
export function aWeightDb(f: number): number {
  const f2 = f * f
  const ra = (F4 ** 2 * f2 * f2) / ((f2 + F1 ** 2) * Math.sqrt((f2 + F2 ** 2) * (f2 + F3 ** 2)) * (f2 + F4 ** 2))
  return 20 * Math.log10(ra) + 2.0
}

/** Stateful cascade (Direct Form II transposed). */
export class Cascade {
  private z: Float64Array
  private sos: SOS[]
  constructor(sos: SOS[]) {
    this.sos = sos
    this.z = new Float64Array(sos.length * 2)
  }
  /** Filters in place and returns { ms: mean square, peak: max |x| } of the output block. */
  process(x: Float32Array | number[]): { ms: number; peak: number } {
    let sum = 0, peak = 0
    const z = this.z
    for (let i = 0; i < x.length; i++) {
      let v = x[i]
      for (let k = 0; k < this.sos.length; k++) {
        const [b0, b1, b2, a1, a2] = this.sos[k]
        const y = b0 * v + z[2 * k]
        z[2 * k] = b1 * v - a1 * y + z[2 * k + 1]
        z[2 * k + 1] = b2 * v - a2 * y
        v = y
      }
      x[i] = v
      sum += v * v
      const a = Math.abs(v)
      if (a > peak) peak = a
    }
    return { ms: x.length ? sum / x.length : 0, peak }
  }
}

export const msToDb = (ms: number) => (ms > 1e-20 ? 10 * Math.log10(ms) : -200)
export const TAU = { fast: 0.125, slow: 1 } as const

/** Exponential time weighting of mean square over a step of dt seconds. */
export const timeWeight = (prev: number, ms: number, dt: number, tau: number) => prev + (ms - prev) * (1 - Math.exp(-dt / tau))

/** NIOSH REL: permissible exposure in minutes at level L dBA (85 dBA for 8 h, 3 dB exchange rate). */
export const nioshMinutes = (L: number) => 480 / 2 ** ((L - 85) / 3)

export const REFS: [number, string][] = [
  [0, 'Threshold of hearing'], [20, 'Rustling leaves'], [30, 'Whisper, quiet library'], [40, 'Quiet office, fridge hum'],
  [50, 'Moderate rainfall'], [60, 'Normal conversation'], [70, 'Vacuum cleaner, busy traffic'], [80, 'Alarm clock, city traffic'],
  [85, 'Hearing damage possible (8 h)'], [90, 'Lawn mower, motorcycle'], [100, 'Hand drill, subway'], [110, 'Rock concert'], [120, 'Thunderclap, siren up close'],
]

/** Synthetic "city street" demo signal generator (deterministic PRNG). */
export function makeDemo(fs: number) {
  let seed = 12345, t = 0, lp = 0, br = 0
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
  return (n: number): Float32Array => {
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++, t += 1 / fs) {
      const w = rnd()
      lp += 0.02 * (w - lp)
      br = 0.995 * br + 0.02 * w
      const car = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 9) ** 8 // a car passes every ~9 s
      const voice = Math.max(0, Math.sin(2 * Math.PI * 0.7 * t)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4.5 * t))
      const vf = 180 + 40 * Math.sin(2 * Math.PI * 0.9 * t)
      const beep = t % 15 > 12 && t % 15 < 12.4 ? 0.12 * Math.sin(2 * Math.PI * 1000 * t) : 0
      out[i] = 0.02 * w + 0.06 * br * (1 + 6 * car) + 0.05 * lp * car + 0.03 * voice * (Math.sin(2 * Math.PI * vf * t) + 0.5 * Math.sin(4 * Math.PI * vf * t)) + beep
    }
    return out
  }
}
