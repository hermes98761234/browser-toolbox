// Sound level helpers: A-weighting, energy averaging (Leq), level → zone.

/** IEC 61672 A-weighting in dB at frequency f (Hz); 0 dB at 1 kHz. */
export function aWeight(f: number): number {
  if (f <= 0) return -Infinity
  const f2 = f * f
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2))
  return 20 * Math.log10(ra) + 2.0
}

/** Sums FFT bins given in dB into one level (dB), optionally A-weighted. */
export function bandLevel(binsDb: ArrayLike<number>, sampleRate: number, weighted: boolean, fMin = 20): number {
  const n = binsDb.length
  const hz = sampleRate / 2 / n
  let p = 0
  for (let i = 1; i < n; i++) {
    const f = i * hz
    if (f < fMin) continue
    const db = binsDb[i]
    if (!Number.isFinite(db)) continue
    p += 10 ** ((db + (weighted ? aWeight(f) : 0)) / 10)
  }
  return p > 0 ? 10 * Math.log10(p) : -120
}

/** Equivalent continuous level: energy average of dB samples. */
export function leq(levels: number[]): number {
  if (!levels.length) return NaN
  return 10 * Math.log10(levels.reduce((a, l) => a + 10 ** (l / 10), 0) / levels.length)
}

/** Exponential time weighting (Fast = 0.125 s, Slow = 1 s) applied to energy. */
export function smooth(prevDb: number, nowDb: number, dt: number, tau: number): number {
  if (!Number.isFinite(prevDb)) return nowDb
  const a = 1 - Math.exp(-dt / tau)
  return 10 * Math.log10((1 - a) * 10 ** (prevDb / 10) + a * 10 ** (nowDb / 10))
}

export type Zone = 'quiet' | 'ok' | 'loud'
export const zone = (db: number, threshold: number, warnBand = 6): Zone => (db >= threshold ? 'loud' : db >= threshold - warnBand ? 'ok' : 'quiet')

export const REFERENCE: [number, string][] = [
  [30, 'Whisper, quiet library'],
  [40, 'Quiet classroom, individual work'],
  [50, 'Quiet conversation'],
  [60, 'Normal conversation, group work'],
  [70, 'Busy classroom, vacuum cleaner'],
  [80, 'Shouting, noisy cafeteria'],
  [85, 'Hearing protection advised for long exposure'],
  [100, 'Rock concert, power tools'],
]
