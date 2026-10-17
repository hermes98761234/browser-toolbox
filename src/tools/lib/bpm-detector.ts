// Tempo detection: spectral-flux onset envelope → autocorrelation with comb (harmonic) enhancement
// and a mild log-normal tempo prior; beat phase alignment; tap tempo; synthetic test signals.

/** In-place iterative radix-2 FFT (n must be a power of two). */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr; im[b] = im[a] - xi
        re[a] += xr; im[a] += xi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

/**
 * Spectral-flux onset strength: Hann-windowed STFT, log-compressed magnitudes, half-wave rectified
 * frame-to-frame increase summed over bins, then a moving-average detrend. Returns envelope + frames/s.
 */
export function onsetEnvelope(x: Float32Array, sr: number, frame = 1024, hop = 512): { env: Float32Array; fps: number } {
  const frames = Math.max(0, Math.floor((x.length - frame) / hop) + 1)
  const env = new Float32Array(frames)
  const win = new Float64Array(frame)
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1))
  const half = frame / 2
  const maxBin = Math.min(half, Math.round((8000 / sr) * frame)) // ignore content above ~8 kHz
  let prev = new Float64Array(half)
  const re = new Float64Array(frame), im = new Float64Array(frame)
  for (let f = 0; f < frames; f++) {
    const o = f * hop
    for (let i = 0; i < frame; i++) { re[i] = x[o + i] * win[i]; im[i] = 0 }
    fft(re, im)
    const mag = new Float64Array(half)
    let flux = 0
    for (let k = 1; k < maxBin; k++) {
      mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]))
      const d = mag[k] - prev[k]
      if (d > 0) flux += d
    }
    env[f] = f === 0 ? 0 : flux
    prev = mag
  }
  const fps = sr / hop
  // subtract a ~0.5 s local mean and half-wave rectify
  const w = Math.max(1, Math.round(fps * 0.25))
  const out = new Float32Array(frames)
  let acc = 0
  const pre = new Float64Array(frames + 1)
  for (let i = 0; i < frames; i++) { acc += env[i]; pre[i + 1] = acc }
  for (let i = 0; i < frames; i++) {
    const a = Math.max(0, i - w), b = Math.min(frames, i + w + 1)
    out[i] = Math.max(0, env[i] - (pre[b] - pre[a]) / (b - a))
  }
  return { env: out, fps }
}

export interface Tempo { bpm: number; confidence: number; candidates: { bpm: number; score: number }[]; curve: [number, number][] }

/** Tempo estimate from an onset envelope within [minBpm, maxBpm]. */
export function estimateTempo(env: Float32Array, fps: number, minBpm = 60, maxBpm = 200, prior = true): Tempo {
  const n = env.length
  let mean = 0
  for (const v of env) mean += v
  mean /= n || 1
  const e = Float64Array.from(env, (v) => v - mean)
  const maxLag = Math.min(n - 1, Math.ceil((60 * fps) / minBpm) * 4 + 2)
  const ac = new Float64Array(maxLag + 1)
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0
    for (let i = 0; i + lag < n; i++) s += e[i] * e[i + lag]
    ac[lag] = s / (n - lag)
  }
  const at = (l: number) => {
    // linear interpolation of the autocorrelation at a fractional lag
    if (l >= maxLag) return 0
    const i = Math.floor(l), f = l - i
    return ac[i] * (1 - f) + ac[i + 1] * f
  }
  // comb filter: a true beat period also correlates at 2×, 3×, 4× the period
  const score = (bpm: number) => {
    const lag = (60 * fps) / bpm
    let s = 0
    for (let k = 1; k <= 4; k++) s += Math.max(0, at(lag * k)) / k
    const w = prior ? Math.exp(-0.5 * (Math.log2(bpm / 120) / 1.0) ** 2) : 1
    return s * w
  }
  const curve: [number, number][] = []
  for (let b = minBpm; b <= maxBpm + 1e-9; b += 0.25) curve.push([b, score(b)])
  const peaks: { bpm: number; score: number }[] = []
  for (let i = 1; i < curve.length - 1; i++) {
    if (curve[i][1] >= curve[i - 1][1] && curve[i][1] > curve[i + 1][1]) {
      // parabolic refinement
      const [a, b, c] = [curve[i - 1][1], curve[i][1], curve[i + 1][1]]
      const den = a - 2 * b + c
      const off = den ? (0.5 * (a - c)) / den : 0
      peaks.push({ bpm: curve[i][0] + off * 0.25, score: b })
    }
  }
  if (curve.length > 1 && curve[0][1] > curve[1][1]) peaks.push({ bpm: curve[0][0], score: curve[0][1] })
  peaks.sort((p, q) => q.score - p.score)
  let top = peaks[0] ?? { bpm: 0, score: 0 }
  // a comb on lag 2T also fits a beat at T (every other beat), so the slower octave never loses on
  // evidence alone: move up an octave while the faster tempo explains the onsets nearly as well
  for (let guard = 0; guard < 3 && top.bpm; guard++) {
    const up = peaks.find((p) => Math.abs(p.bpm / (top.bpm * 2) - 1) < 0.02)
    if (up && up.score >= 0.85 * top.score) top = up
    else break
  }
  // refine: the autocorrelation peak near k·T (largest k that fits) pins the period to ~1/k frame
  const raw = top
  if (top.bpm) {
    const acAt = (lag: number) => {
      let sum = 0
      for (let i = 0; i + lag < n; i++) sum += e[i] * e[i + lag]
      return sum / (n - lag)
    }
    let period = (60 * fps) / top.bpm
    for (const k of [2, 4, 8, 16, 32]) {
      if (k * period > n * 0.6) break
      const c = Math.round(k * period)
      const r = Math.max(1, Math.ceil(k * period * 0.01) + 1)
      let bl = c, bv = -Infinity
      const vals = new Map<number, number>()
      for (let l = c - r - 1; l <= c + r + 1; l++) { const v = acAt(l); vals.set(l, v); if (l >= c - r && l <= c + r && v > bv) { bv = v; bl = l } }
      const a = vals.get(bl - 1)!, b = vals.get(bl)!, d = vals.get(bl + 1)!
      const den = a - 2 * b + d
      const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - d)) / den)) : 0
      period = (bl + off) / k
    }
    top = { bpm: (60 * fps) / period, score: top.score }
  }
  // confidence: how much the winner stands out from non-related rivals and the curve's mean
  const related = (b: number) => [0.5, 2 / 3, 1, 1.5, 2].some((r) => Math.abs(b / top.bpm - r) < 0.03)
  const rival = peaks.find((p) => !related(p.bpm))?.score ?? 0
  const avg = curve.reduce((s, c) => s + c[1], 0) / (curve.length || 1)
  const confidence = top.score > 0 ? Math.max(0, Math.min(1, (1 - rival / top.score) * 0.6 + (1 - avg / top.score) * 0.4)) : 0
  const max = Math.max(top.score, peaks[0]?.score ?? 0) || 1
  return { bpm: top.bpm, confidence, candidates: [top, ...peaks.filter((p) => p !== raw)].slice(0, 6).map((p) => ({ bpm: p.bpm, score: p.score / max })), curve: curve.map(([b, s]) => [b, s / max]) }
}

/** Beat grid offset (seconds) that best lines up with onsets for a given tempo. */
export function beatPhase(env: Float32Array, fps: number, bpm: number): number {
  const period = (60 * fps) / bpm
  const steps = Math.max(1, Math.round(period))
  let best = 0, bestS = -1
  for (let p = 0; p < steps; p++) {
    let s = 0
    for (let t = p; t < env.length; t += period) s += env[Math.round(t)] ?? 0
    if (s > bestS) { bestS = s; best = p }
  }
  return best / fps
}

/** Full pipeline on mono samples. */
export function detectBpm(x: Float32Array, sr: number, minBpm = 60, maxBpm = 200, prior = true) {
  const { env, fps } = onsetEnvelope(x, sr)
  const t = estimateTempo(env, fps, minBpm, maxBpm, prior)
  return { ...t, env, fps, offset: t.bpm ? beatPhase(env, fps, t.bpm) : 0 }
}

/** Tap tempo from tap timestamps (ms): least-squares slope over tap index, robust to jitter. */
export function tapTempo(times: number[]): { bpm: number; sd: number } | null {
  if (times.length < 2) return null
  const n = times.length
  const mx = (n - 1) / 2
  const my = times.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0
  times.forEach((t, i) => { sxy += (i - mx) * (t - my); sxx += (i - mx) ** 2 })
  const period = sxy / sxx
  const iv = times.slice(1).map((t, i) => t - times[i])
  const m = iv.reduce((a, b) => a + b, 0) / iv.length
  const sd = Math.sqrt(iv.reduce((a, b) => a + (b - m) ** 2, 0) / iv.length)
  return period > 0 ? { bpm: 60000 / period, sd } : null
}

/** Short decaying clicks at the given tempo (test signal). */
export function clickTrack(bpm: number, seconds: number, sr: number, accentEvery = 4): Float32Array {
  const x = new Float32Array(Math.round(seconds * sr))
  const period = (60 / bpm) * sr
  for (let b = 0, t = 0.1 * sr; t < x.length; b++, t += period) {
    const amp = b % accentEvery === 0 ? 1 : 0.6
    const f = b % accentEvery === 0 ? 1500 : 1000
    for (let i = 0; i < 0.03 * sr && t + i < x.length; i++) x[Math.round(t) + i] += amp * Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (0.006 * sr))
  }
  return x
}

/** A two-bar drum loop (kick, snare, closed hi-hats) repeated for `bars` bars. Deterministic. */
export function drumLoop(bpm: number, bars: number, sr: number, style: 'four' | 'break' | 'dnb' = 'four'): Float32Array {
  const beat = 60 / bpm
  const x = new Float32Array(Math.ceil(bars * 4 * beat * sr) + sr / 2)
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  const kick = (t: number, a = 1) => {
    const o = Math.round(t * sr)
    let ph = 0
    for (let i = 0; i < 0.35 * sr && o + i < x.length; i++) {
      const tt = i / sr
      ph += (2 * Math.PI * (45 + 110 * Math.exp(-tt * 30))) / sr
      x[o + i] += a * 0.9 * Math.sin(ph) * Math.exp(-tt * 9)
    }
  }
  const snare = (t: number, a = 1) => {
    const o = Math.round(t * sr)
    for (let i = 0; i < 0.2 * sr && o + i < x.length; i++) {
      const tt = i / sr
      x[o + i] += a * (0.45 * rnd() * Math.exp(-tt * 22) + 0.3 * Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt * 30))
    }
  }
  const hat = (t: number, a = 1) => {
    const o = Math.round(t * sr)
    let prev = 0
    for (let i = 0; i < 0.05 * sr && o + i < x.length; i++) {
      const n = rnd()
      x[o + i] += a * 0.18 * (n - prev) * Math.exp(-(i / sr) * 90) // first difference ≈ high-pass
      prev = n
    }
  }
  const pat: Record<typeof style, { k: number[]; s: number[]; h: number[] }> = {
    four: { k: [0, 1, 2, 3], s: [1, 3], h: [0.5, 1.5, 2.5, 3.5] },
    break: { k: [0, 1.75, 2.5], s: [1, 3, 3.75], h: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
    dnb: { k: [0, 1.5], s: [1, 3], h: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
  }
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat
    const p = pat[style]
    for (const k of p.k) kick(t0 + k * beat)
    for (const s of p.s) snare(t0 + s * beat, s % 1 ? 0.5 : 1)
    for (const h of p.h) hat(t0 + h * beat, h % 1 ? 0.6 : 1)
    if (style === 'dnb' && bar % 2 === 1) kick(t0 + 2.5 * beat)
  }
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v))
  for (let i = 0; i < x.length; i++) x[i] = (x[i] / (peak || 1)) * 0.9
  return x
}
