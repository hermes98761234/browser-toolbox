// Procedural sample generators for the soundscape mixer. All return Float32Array in [-1, 1].

/** Small fast seeded PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function white(n: number, r = rng(1)): Float32Array {
  const o = new Float32Array(n)
  for (let i = 0; i < n; i++) o[i] = r() * 2 - 1
  return o
}

/** Pink (1/f) noise, Paul Kellet's refined filter. */
export function pink(n: number, r = rng(2)): Float32Array {
  const o = new Float32Array(n)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898
    o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  return o
}

/** Brown (1/f²) noise: leaky integrated white noise. */
export function brown(n: number, r = rng(3)): Float32Array {
  const o = new Float32Array(n)
  let last = 0
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (r() * 2 - 1)) / 1.02
    o[i] = last * 3.5
  }
  return o
}

/** Sparse short decaying noise bursts (rain drops, fire crackles). rate = events per second. */
export function impulses(n: number, sr: number, rate: number, decayMs: number, r = rng(4), sharp = false): Float32Array {
  const o = new Float32Array(n)
  const len = Math.max(4, Math.round((decayMs / 1000) * sr))
  const count = Math.round((n / sr) * rate)
  for (let k = 0; k < count; k++) {
    const at = Math.floor(r() * n)
    const amp = sharp ? Math.pow(r(), 3) : 0.2 + 0.8 * r() * r()
    const l = Math.round(len * (0.3 + r()))
    for (let i = 0; i < l && at + i < n; i++) o[at + i] += amp * (r() * 2 - 1) * Math.exp((-5 * i) / l)
  }
  for (let i = 0; i < n; i++) o[i] = Math.max(-1, Math.min(1, o[i]))
  return o
}

/** Smooth random 0..1 envelope with `rate` bumps per second and a share of silent gaps (speech-like syllables). */
export function bumps(n: number, sr: number, rate: number, gap: number, r = rng(5)): Float32Array {
  const o = new Float32Array(n)
  let i = 0
  while (i < n) {
    const len = Math.round((sr / rate) * (0.5 + r()))
    const on = r() > gap
    const peak = on ? 0.4 + 0.6 * r() : 0
    for (let j = 0; j < len && i + j < n; j++) o[i + j] = peak * Math.sin((Math.PI * j) / len) ** 2
    i += len
  }
  return o
}

/** Ocean swell envelope: waves of 6–11 s with a fast-ish build and a long hiss-out. Loops seamlessly (ends at the floor). */
export function swells(n: number, sr: number, r = rng(6)): Float32Array {
  const o = new Float32Array(n).fill(0.12)
  let i = 0
  while (i < n) {
    const len = Math.round(sr * (6 + 5 * r()))
    const peak = 0.6 + 0.4 * r()
    const rise = 0.35 + 0.15 * r()
    for (let j = 0; j < len && i + j < n; j++) {
      const t = j / len
      const e = t < rise ? Math.sin((t / rise) * Math.PI / 2) ** 2 : Math.exp((-(t - rise) / (1 - rise)) * 4)
      o[i + j] = 0.12 + (peak - 0.12) * e
    }
    i += len
  }
  return o
}

/** Lag-1 autocorrelation: ~0 for white, close to 1 for brown. */
export function lag1(a: Float32Array): number {
  let m = 0
  for (const v of a) m += v
  m /= a.length
  let num = 0, den = 0
  for (let i = 0; i < a.length; i++) {
    den += (a[i] - m) ** 2
    if (i) num += (a[i] - m) * (a[i - 1] - m)
  }
  return den ? num / den : 0
}

export const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / (a.length || 1))

/** Binaural beat bands (Hz) commonly associated with mental states. */
export const BANDS: [string, number, string][] = [
  ['Delta', 2, 'deep rest'], ['Theta', 6, 'meditation'], ['Alpha', 10, 'relaxed focus'], ['Beta', 18, 'active focus'], ['Gamma', 40, 'high attention'],
]
