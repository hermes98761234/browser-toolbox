// Fourier series of a periodic signal sampled over one period [0, 1).

export type Wave = 'square' | 'sawtooth' | 'triangle' | 'halfsine' | 'pulse' | 'abs-sine' | 'custom'

/** Value of a preset waveform at phase t ∈ [0, 1). Amplitude ±1 unless noted. */
export function wave(kind: Wave, t: number, duty = 0.25, custom: number[] = []): number {
  const p = ((t % 1) + 1) % 1
  switch (kind) {
    case 'square': return p < 0.5 ? 1 : -1
    case 'sawtooth': return 2 * p - 1
    case 'triangle': return p < 0.5 ? 4 * p - 1 : 3 - 4 * p
    case 'halfsine': return p < 0.5 ? Math.sin(2 * Math.PI * p) : 0
    case 'abs-sine': return Math.abs(Math.sin(2 * Math.PI * p))
    case 'pulse': return p < duty ? 1 : 0
    case 'custom': {
      if (!custom.length) return 0
      const x = p * custom.length
      const i = Math.floor(x), f = x - i
      return custom[i % custom.length] * (1 - f) + custom[(i + 1) % custom.length] * f
    }
  }
}

export function sample(kind: Wave, M = 4096, duty = 0.25, custom: number[] = []): number[] {
  // mid-point sampling avoids landing exactly on jump discontinuities
  return Array.from({ length: M }, (_, k) => wave(kind, (k + 0.5) / M, duty, custom))
}

export interface Coefs { a0: number; a: number[]; b: number[] }

/** a0 (mean), a_n, b_n for n = 1..N by rectangle-rule integration (exact for trig polynomials). */
export function coefficients(f: number[], N: number): Coefs {
  const M = f.length
  const a: number[] = [], b: number[] = []
  const a0 = f.reduce((s, x) => s + x, 0) / M
  for (let n = 1; n <= N; n++) {
    let sa = 0, sb = 0
    for (let k = 0; k < M; k++) {
      const th = (2 * Math.PI * n * (k + 0.5)) / M
      sa += f[k] * Math.cos(th)
      sb += f[k] * Math.sin(th)
    }
    a.push((2 * sa) / M)
    b.push((2 * sb) / M)
  }
  return { a0, a, b }
}

/** Partial sum S_N(t) = a0 + Σ_{n≤N} a_n cos 2πnt + b_n sin 2πnt. */
export function partial(c: Coefs, t: number, N = c.a.length): number {
  let s = c.a0
  for (let n = 1; n <= Math.min(N, c.a.length); n++) s += c.a[n - 1] * Math.cos(2 * Math.PI * n * t) + c.b[n - 1] * Math.sin(2 * Math.PI * n * t)
  return s
}

/** Amplitude and phase so that a cos + b sin = R sin(θ + φ). */
export const amp = (c: Coefs, n: number) => Math.hypot(c.a[n - 1], c.b[n - 1])
export const phase = (c: Coefs, n: number) => Math.atan2(c.a[n - 1], c.b[n - 1])

/** Overshoot of S_N above the signal maximum, as a fraction of the total jump (max − min). */
export function overshoot(f: number[], c: Coefs, N: number, M = 4000): number {
  const hi = Math.max(...f), lo = Math.min(...f)
  let peak = -Infinity
  for (let k = 0; k < M; k++) peak = Math.max(peak, partial(c, k / M, N))
  return (hi - lo) > 0 ? (peak - hi) / (hi - lo) : 0
}

/** RMS error between signal and partial sum, and Parseval energy fraction captured (AC part). */
export function errorStats(f: number[], c: Coefs, N: number): { rms: number; energy: number } {
  const M = f.length
  let e = 0
  for (let k = 0; k < M; k++) e += (f[k] - partial(c, (k + 0.5) / M, N)) ** 2
  const mean = c.a0
  const acPower = f.reduce((s, x) => s + (x - mean) ** 2, 0) / M
  let cap = 0
  for (let n = 1; n <= N; n++) cap += (c.a[n - 1] ** 2 + c.b[n - 1] ** 2) / 2
  return { rms: Math.sqrt(e / M), energy: acPower > 0 ? cap / acPower : 1 }
}

/** Exact closed forms for checking (square ±1: b_n = 4/(πn) odd n). */
export const squareB = (n: number) => (n % 2 ? 4 / (Math.PI * n) : 0)
