// ITU-R BS.1770-4 / EBU R128 loudness: K-weighting, gated integrated loudness, momentary / short-term
// loudness, loudness range (EBU Tech 3342) and true peak (4× oversampling), plus gain + true-peak limiter.

export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** K-weighting filter coefficients for any sample rate (pre-filter shelf + RLB high-pass, as in libebur128). */
export function kWeighting(fs: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533
  const G = 3.999843853973347
  let Q = 0.7071752369554196
  let K = Math.tan((Math.PI * f0) / fs)
  const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416
  let a0 = 1 + K / Q + K * K
  const shelf: Biquad = { b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 }
  f0 = 38.13547087602444
  Q = 0.5003270373238773
  K = Math.tan((Math.PI * f0) / fs)
  a0 = 1 + K / Q + K * K
  const hp: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 }
  return [shelf, hp]
}

export function biquad(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v
    y[i] = v
  }
  return y
}

/** BS.1770 channel weights: L, R, C = 1, LFE excluded, surrounds 1.41 (5.1 order L R C LFE Ls Rs). */
export function channelWeights(n: number): number[] {
  if (n === 6) return [1, 1, 1, 0, 1.41, 1.41]
  if (n === 5) return [1, 1, 1, 1.41, 1.41]
  return Array.from({ length: n }, () => 1)
}

/** Weighted mean-square power of K-weighted audio in sliding blocks. */
export function blockPowers(kw: Float32Array[], fs: number, blockSec: number, stepSec: number): number[] {
  const n = kw[0]?.length ?? 0
  const B = Math.round(blockSec * fs), S = Math.round(stepSec * fs)
  const wts = channelWeights(kw.length)
  // prefix sums of squares per channel (double precision)
  const pref = kw.map((c) => {
    const p = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) p[i + 1] = p[i] + c[i] * c[i]
    return p
  })
  const out: number[] = []
  for (let s = 0; s + B <= n; s += S) {
    let z = 0
    for (let c = 0; c < kw.length; c++) z += (wts[c] * (pref[c][s + B] - pref[c][s])) / B
    out.push(z)
  }
  return out
}

export const lufs = (power: number) => (power > 0 ? -0.691 + 10 * Math.log10(power) : -Infinity)

/** Two-stage gated integrated loudness from 400 ms block powers. */
export function gatedLoudness(powers: number[]): number {
  const abs = powers.filter((p) => lufs(p) > -70)
  if (!abs.length) return -Infinity
  const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10
  const g = abs.filter((p) => lufs(p) > rel)
  return g.length ? lufs(g.reduce((a, b) => a + b, 0) / g.length) : -Infinity
}

/** Loudness range (EBU Tech 3342) from 3 s short-term block powers. */
export function loudnessRange(st: number[]): { lra: number; lo: number; hi: number } {
  const abs = st.filter((p) => lufs(p) > -70)
  if (abs.length < 2) return { lra: 0, lo: NaN, hi: NaN }
  const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 20
  const l = abs.map(lufs).filter((v) => v > rel).sort((a, b) => a - b)
  if (l.length < 2) return { lra: 0, lo: NaN, hi: NaN }
  const q = (p: number) => {
    const x = p * (l.length - 1), i = Math.floor(x)
    return l[i] + (l[Math.min(l.length - 1, i + 1)] - l[i]) * (x - i)
  }
  const lo = q(0.1), hi = q(0.95)
  return { lra: hi - lo, lo, hi }
}

// ---------- true peak ----------

const PHASES = 4, TAPS = 16, HALF = TAPS / 2
let polyCache: Float64Array[] | null = null
/** Interpolation filters for the 4× points: coef[p][k] multiplies x[i - 7 + k] to give x(i + p/4). Kaiser (β 7) windowed sinc. */
function polyphase(): Float64Array[] {
  if (polyCache) return polyCache
  const beta = 7
  const I0 = (x: number) => { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t } return s }
  polyCache = Array.from({ length: PHASES }, (_, p) => {
    const f = new Float64Array(TAPS)
    for (let k = 0; k < TAPS; k++) {
      const t = HALF - 1 - k + p / PHASES
      const r = t / HALF
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
      f[k] = sinc * (I0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / I0(beta))
    }
    const sum = f.reduce((a, v) => a + v, 0)
    return f.map((v) => v / sum)
  })
  return polyCache
}

/**
 * Per-sample true-peak envelope (max |x| over the oversampled points between each sample and the next),
 * oversampling 4× below 96 kHz, 2× below 192 kHz, otherwise none (BS.1770-4 Annex 2).
 */
export function truePeakEnvelope(ch: Float32Array[], fs: number): Float32Array {
  const n = ch[0]?.length ?? 0
  const env = new Float32Array(n)
  const ph = polyphase()
  const step = fs >= 192000 ? PHASES : fs >= 96000 ? 2 : 1
  for (const x of ch) {
    for (let i = 0; i < n; i++) {
      let m = Math.abs(x[i])
      for (let p = step; p < PHASES; p += step) {
        const f = ph[p]
        let acc = 0
        const j0 = i - HALF + 1
        if (j0 >= 0 && j0 + TAPS <= n) for (let k = 0; k < TAPS; k++) acc += f[k] * x[j0 + k]
        else for (let k = 0; k < TAPS; k++) { const j = j0 + k; if (j >= 0 && j < n) acc += f[k] * x[j] }
        const a = Math.abs(acc)
        if (a > m) m = a
      }
      if (m > env[i]) env[i] = m
    }
  }
  return env
}

export const dB = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity)

export interface Measure {
  integrated: number
  lra: number
  truePeak: number
  samplePeak: number
  momentaryMax: number
  shortTermMax: number
  /** short-term loudness every 0.5 s (for charts) */
  curve: number[]
  /** 400 ms block powers (for album gain) */
  blocks: number[]
  duration: number
}

export function measure(ch: Float32Array[], fs: number): Measure {
  const [f1, f2] = kWeighting(fs)
  const kw = ch.map((c) => biquad(biquad(c, f1), f2))
  const blocks = blockPowers(kw, fs, 0.4, 0.1)
  const st = blockPowers(kw, fs, 3, 0.1)
  const env = truePeakEnvelope(ch, fs)
  let tp = 0, sp = 0
  for (let i = 0; i < env.length; i++) if (env[i] > tp) tp = env[i]
  for (const c of ch) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > sp) sp = a }
  return {
    integrated: gatedLoudness(blocks),
    lra: loudnessRange(st).lra,
    truePeak: dB(tp),
    samplePeak: dB(sp),
    momentaryMax: blocks.length ? lufs(Math.max(...blocks)) : -Infinity,
    shortTermMax: st.length ? lufs(Math.max(...st)) : -Infinity,
    curve: st.filter((_, i) => i % 5 === 0).map(lufs),
    blocks,
    duration: (ch[0]?.length ?? 0) / fs,
  }
}

/** Album (batch) loudness: gating over all files' blocks together. */
export const albumLoudness = (ms: Measure[]) => gatedLoudness(ms.flatMap((m) => m.blocks))

/**
 * Look-ahead true-peak limiter: required gain per sample → sliding minimum over the look-ahead window →
 * moving average of the same length (never exceeds the requirement at a peak) → slow release.
 */
export function limit(ch: Float32Array[], fs: number, ceilingDb: number, lookaheadMs = 5, releaseMs = 80): { out: Float32Array[]; reduction: number } {
  const n = ch[0]?.length ?? 0
  const ceil = 10 ** (ceilingDb / 20)
  const env = truePeakEnvelope(ch, fs)
  const L = Math.max(1, Math.round((lookaheadMs / 1000) * fs))
  const need = new Float32Array(n)
  let any = false
  for (let i = 0; i < n; i++) { need[i] = env[i] > ceil ? ceil / env[i] : 1; if (need[i] < 1) any = true }
  if (!any) return { out: ch.map((c) => c.slice()), reduction: 0 }
  // sliding minimum over [i - L, i + L] (monotone deque)
  const mn = new Float32Array(n)
  const dq = new Int32Array(n)
  let h = 0, t = 0
  for (let i = 0, j = 0; i < n; i++) {
    for (; j < Math.min(n, i + L + 1); j++) { while (t > h && need[dq[t - 1]] >= need[j]) t--; dq[t++] = j }
    while (dq[h] < i - L) h++
    mn[i] = need[dq[h]]
  }
  // release: gain may rise only slowly
  const rel = Math.exp(-1 / ((releaseMs / 1000) * fs))
  let g = 1
  for (let i = 0; i < n; i++) { g = mn[i] < g ? mn[i] : mn[i] + (g - mn[i]) * rel; mn[i] = g }
  // moving average (window 2L+1) for a smooth attack; then clamp to need so peaks are always caught
  const gain = new Float32Array(n)
  let s = 0
  for (let i = -L; i < n + L; i++) {
    if (i + L < n) s += mn[Math.max(0, i + L)]
    if (i - L - 1 >= 0) s -= mn[i - L - 1]
    if (i >= 0 && i < n) gain[i] = Math.min(s / (Math.min(n - 1, i + L) - Math.max(0, i - L) + 1), need[i])
  }
  let worst = 1
  for (let i = 0; i < n; i++) if (gain[i] < worst) worst = gain[i]
  // tiny safety margin for inter-sample overshoot after gain changes
  const out = ch.map((c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = c[i] * gain[i] * 0.9995; return o })
  return { out, reduction: -dB(worst) }
}

export interface NormOptions { target: number; ceiling: number; mode: 'limit' | 'reduce' | 'off'; gainOverride?: number }
export interface NormResult { out: Float32Array[]; gain: number; limited: number; capped: boolean }

/** Applies the gain that brings `m.integrated` to target, then protects the true-peak ceiling. */
export function normalize(ch: Float32Array[], fs: number, m: Measure, o: NormOptions): NormResult {
  let gain = o.gainOverride ?? (Number.isFinite(m.integrated) ? o.target - m.integrated : 0)
  let capped = false
  if (o.mode === 'reduce' && m.truePeak + gain > o.ceiling) { gain = o.ceiling - m.truePeak; capped = true }
  const apply = (gn: number) => { const g = 10 ** (gn / 20); return ch.map((c) => c.map((v) => v * g)) }
  let out: Float32Array[] = apply(gain)
  let limited = 0
  if (o.mode === 'limit' && m.truePeak + gain > o.ceiling) {
    // Limiting removes some loudness: re-measure and make up the difference (a few passes).
    let g = gain
    for (let pass = 0; pass < 8; pass++) {
      const r = limit(apply(g), fs, o.ceiling)
      out = r.out
      limited = r.reduction
      if (o.gainOverride !== undefined) break
      const after = measure(out, fs).integrated
      if (!Number.isFinite(after) || Math.abs(after - o.target) < 0.1) break
      g += o.target - after
    }
    gain = g
  }
  return { out, gain, limited, capped }
}

export const PRESETS: { id: string; label: string; target: number; ceiling: number }[] = [
  { id: 'stream', label: 'Streaming (Spotify, YouTube, Tidal) −14 LUFS', target: -14, ceiling: -1 },
  { id: 'apple', label: 'Apple Music / podcasts −16 LUFS', target: -16, ceiling: -1 },
  { id: 'ebu', label: 'Broadcast EBU R128 −23 LUFS', target: -23, ceiling: -1 },
  { id: 'atsc', label: 'Broadcast ATSC A/85 −24 LKFS', target: -24, ceiling: -2 },
  { id: 'audiobook', label: 'Audiobooks (ACX) ≈ −20 LUFS', target: -20, ceiling: -3 },
  { id: 'loud', label: 'Club / loud master −9 LUFS', target: -9, ceiling: -0.3 },
]

/** Sine of `dbfs` peak amplitude on every channel. */
export function sine(fs: number, sec: number, hz: number, dbfs: number, channels = 2, phase = 0): Float32Array[] {
  const a = 10 ** (dbfs / 20)
  const n = Math.round(fs * sec)
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) c[i] = a * Math.sin((2 * Math.PI * hz * i) / fs + phase)
  return Array.from({ length: channels }, () => c.slice())
}
export function concatCh(parts: Float32Array[][]): Float32Array[] {
  return parts[0].map((_, k) => {
    const out = new Float32Array(parts.reduce((s, p) => s + p[k].length, 0))
    let o = 0
    for (const p of parts) { out.set(p[k], o); o += p[k].length }
    return out
  })
}
