// Classical speech denoising: STFT → noise-profile learning → spectral subtraction or Wiener gain → ISTFT,
// plus a Butterworth high-pass and a downward noise gate. Pure functions on Float32Array samples.

/** In-place iterative radix-2 complex FFT (`inv` = inverse, scaled by 1/n). */
export function fft(re: Float64Array, im: Float64Array, inv = false): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) {
    re[i] /= n
    im[i] /= n
  }
}

export const hann = (n: number) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n))

/** Power spectra (|X|², bins 0..N/2) of all frames; frame f starts at f·hop − N/2 (zero-padded). */
export function stftPower(x: Float32Array, n: number, hop: number): Float64Array[] {
  const w = hann(n)
  const frames = Math.ceil((x.length + n / 2) / hop)
  const out: Float64Array[] = []
  const re = new Float64Array(n), im = new Float64Array(n)
  for (let f = 0; f < frames; f++) {
    const s = f * hop - n / 2
    for (let i = 0; i < n; i++) {
      const j = s + i
      re[i] = j >= 0 && j < x.length ? x[j] * w[i] : 0
      im[i] = 0
    }
    fft(re, im)
    const p = new Float64Array(n / 2 + 1)
    for (let k = 0; k <= n / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k]
    out.push(p)
  }
  return out
}

/** Mean noise power per bin, from frames in [f0, f1) or (auto) the quietest `share` of frames. */
export function learnProfile(power: Float64Array[], range?: [number, number], share = 0.1): Float64Array {
  let idx: number[]
  if (range) {
    idx = []
    for (let f = Math.max(0, range[0]); f < Math.min(power.length, range[1]); f++) idx.push(f)
  } else {
    const e = power.map((p, i) => [p.reduce((a, b) => a + b, 0), i] as const).filter(([v]) => v > 0)
    e.sort((a, b) => a[0] - b[0])
    idx = e.slice(0, Math.max(1, Math.round(e.length * share))).map(([, i]) => i)
  }
  const bins = power[0]?.length ?? 0
  const prof = new Float64Array(bins)
  for (const f of idx) for (let k = 0; k < bins; k++) prof[k] += power[f][k]
  for (let k = 0; k < bins; k++) prof[k] = idx.length ? prof[k] / idx.length : 0
  return prof
}

export type Method = 'subtract' | 'wiener'
export interface DenoiseOpts {
  method: Method
  reductionDb: number // maximum attenuation (gain floor)
  overSub: number // α: noise over-estimation factor
  smoothing: number // 0..1 temporal smoothing of gains (musical-noise suppression)
}

/** Per-bin gain for one frame. `prevGain`/`prevPost` carry the decision-directed Wiener state. */
export function frameGain(p: Float64Array, noise: Float64Array, o: DenoiseOpts, prev: { g: Float64Array; post: Float64Array } | null): Float64Array {
  const floor = 10 ** (-o.reductionDb / 20)
  const g = new Float64Array(p.length)
  for (let k = 0; k < p.length; k++) {
    const nk = noise[k] * o.overSub + 1e-20
    let v: number
    if (o.method === 'subtract') v = Math.sqrt(Math.max(0, 1 - nk / (p[k] + 1e-20)))
    else {
      const post = p[k] / nk
      const prior = prev ? 0.98 * prev.g[k] * prev.g[k] * prev.post[k] + 0.02 * Math.max(post - 1, 0) : Math.max(post - 1, 0)
      v = prior / (1 + prior)
    }
    g[k] = Math.max(floor, v)
  }
  // light smoothing across frequency (3-tap) reduces isolated "musical" tones
  const s = new Float64Array(g.length)
  for (let k = 0; k < g.length; k++) s[k] = (g[Math.max(0, k - 1)] + 2 * g[k] + g[Math.min(g.length - 1, k + 1)]) / 4
  return s
}

/** STFT-domain denoising with overlap-add resynthesis (Hann analysis + synthesis, hop = N/4). */
export function denoise(x: Float32Array, noise: Float64Array, n: number, o: DenoiseOpts): Float32Array {
  const hop = n / 4
  const w = hann(n)
  const out = new Float64Array(x.length + 2 * n)
  const norm = new Float64Array(x.length + 2 * n)
  const re = new Float64Array(n), im = new Float64Array(n)
  const frames = Math.ceil((x.length + n / 2) / hop)
  let prev: { g: Float64Array; post: Float64Array } | null = null
  let gs: Float64Array | null = null
  for (let f = 0; f < frames; f++) {
    const s = f * hop - n / 2
    for (let i = 0; i < n; i++) {
      const j = s + i
      re[i] = j >= 0 && j < x.length ? x[j] * w[i] : 0
      im[i] = 0
    }
    fft(re, im)
    const p = new Float64Array(n / 2 + 1)
    for (let k = 0; k <= n / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k]
    let g = frameGain(p, noise, o, prev)
    if (o.method === 'wiener') prev = { g, post: p.map((v, k) => v / (noise[k] * o.overSub + 1e-20)) }
    // temporal smoothing: fast attack (gain rises immediately), smoothed release
    if (gs && o.smoothing > 0) {
      const sm = gs
      g = g.map((v, k) => (v > sm[k] ? v : o.smoothing * sm[k] + (1 - o.smoothing) * v))
    }
    gs = g
    for (let k = 0; k <= n / 2; k++) {
      re[k] *= g[k]
      im[k] *= g[k]
      if (k > 0 && k < n / 2) {
        re[n - k] *= g[k]
        im[n - k] *= g[k]
      }
    }
    fft(re, im, true)
    for (let i = 0; i < n; i++) {
      const j = s + i + n
      out[j] += re[i] * w[i]
      norm[j] += w[i] * w[i]
    }
  }
  const y = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) y[i] = norm[i + n] > 1e-9 ? out[i + n] / norm[i + n] : 0
  return y
}

/**
 * Zero-phase high-pass: a 2nd-order Butterworth biquad (RBJ) run forward and then backward
 * (filtfilt), giving 24 dB/oct with no phase shift, so voice waveforms are not smeared.
 */
export function highpass(x: Float32Array, rate: number, fc: number): Float32Array {
  const w0 = (2 * Math.PI * fc) / rate, cos = Math.cos(w0), alpha = Math.sin(w0) / (2 * Math.SQRT1_2)
  const a0 = 1 + alpha
  const b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = b0, a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0
  let y: Float32Array = x
  for (let pass = 0; pass < 2; pass++) {
    const src = y
    const out = new Float32Array(src.length)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0
    for (let t = 0; t < src.length; t++) {
      const i = pass ? src.length - 1 - t : t
      const v = b0 * src[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
      x2 = x1
      x1 = src[i]
      y2 = y1
      y1 = v
      out[i] = v
    }
    y = out
  }
  return y
}

/** Downward noise gate: below `thresholdDb` (RMS, 10 ms window) the signal is attenuated by `rangeDb`. */
export function gate(x: Float32Array, rate: number, thresholdDb: number, rangeDb: number, attackMs = 5, releaseMs = 120, holdMs = 60): Float32Array {
  const thr = 10 ** (thresholdDb / 20), low = 10 ** (-rangeDb / 20)
  const win = Math.max(1, Math.round(rate * 0.01))
  const aA = Math.exp(-1 / ((attackMs / 1000) * rate)), aR = Math.exp(-1 / ((releaseMs / 1000) * rate))
  const hold = Math.round((holdMs / 1000) * rate)
  const y = new Float32Array(x.length)
  let sum = 0, g = low, held = 0
  for (let i = 0; i < x.length; i++) {
    sum += x[i] * x[i]
    if (i >= win) sum -= x[i - win] * x[i - win]
    const rms = Math.sqrt(Math.max(0, sum) / Math.min(i + 1, win))
    let target = low
    if (rms >= thr) {
      target = 1
      held = hold
    } else if (held > 0) {
      held--
      target = 1
    }
    g = target > g ? aA * g + (1 - aA) * target : aR * g + (1 - aR) * target
    y[i] = x[i] * g
  }
  return y
}

export const rmsDb = (x: Float32Array) => {
  let s = 0
  for (const v of x) s += v * v
  return 10 * Math.log10(s / (x.length || 1) + 1e-20)
}

/** Level of the quietest 10% of 20 ms blocks (a robust "noise floor" estimate), dBFS. */
export function noiseFloorDb(x: Float32Array, rate: number): number {
  const b = Math.max(1, Math.round(rate * 0.02))
  const lv: number[] = []
  for (let i = 0; i + b <= x.length; i += b) lv.push(rmsDb(x.subarray(i, i + b)))
  lv.sort((a, c) => a - c)
  const q = lv.slice(0, Math.max(1, Math.round(lv.length * 0.1)))
  return q.reduce((a, c) => a + c, 0) / (q.length || 1)
}

/** SNR of `y` against a known clean reference (dB). */
export function snrDb(clean: Float32Array, y: Float32Array): number {
  let s = 0, e = 0
  for (let i = 0; i < clean.length; i++) {
    s += clean[i] * clean[i]
    e += (y[i] - clean[i]) ** 2
  }
  return 10 * Math.log10(s / (e + 1e-20))
}

/** Deterministic demo: a voice-like signal (glottal pulses through vowel formants) plus hiss, hum and rumble. */
export function demoSignal(rate: number, seconds = 6, seed = 3): { clean: Float32Array; noisy: Float32Array } {
  const N = Math.round(rate * seconds)
  const clean = new Float32Array(N)
  let st = seed
  const rnd = () => ((st = (st * 16807) % 2147483647) / 2147483647) * 2 - 1
  // syllables: [start s, length s, F1, F2, F3, pitch]
  const syl: [number, number, number, number, number, number][] = [
    [0.9, 0.32, 730, 1090, 2440, 150], [1.28, 0.26, 270, 2290, 3010, 165], [1.6, 0.4, 570, 840, 2410, 140],
    [2.4, 0.3, 660, 1720, 2410, 175], [2.75, 0.36, 300, 870, 2240, 160], [3.2, 0.5, 530, 1840, 2480, 130],
    [4.1, 0.28, 440, 1020, 2240, 170], [4.42, 0.34, 730, 1090, 2440, 155], [4.82, 0.55, 390, 1990, 2550, 120],
  ]
  const bp = (f: number, bw: number) => {
    // 2-pole resonator coefficients
    const r = Math.exp((-Math.PI * bw) / rate), th = (2 * Math.PI * f) / rate
    return { a1: -2 * r * Math.cos(th), a2: r * r, g: 1 - r }
  }
  for (const [t0, len, f1, f2, f3, f0] of syl) {
    const i0 = Math.round(t0 * rate), n = Math.round(len * rate)
    const fs = [bp(f1, 90), bp(f2, 110), bp(f3, 160)]
    const st2 = fs.map(() => [0, 0])
    let phase = 0
    for (let i = 0; i < n && i0 + i < N; i++) {
      const t = i / n
      const pitch = f0 * (1 + 0.12 * Math.sin(Math.PI * t) - 0.08 * t)
      phase += pitch / rate
      // glottal source: decaying pulse each period + a little breath noise
      const ph = phase % 1
      const src = Math.exp(-ph * 9) - 0.11 + 0.05 * rnd()
      let v = 0
      fs.forEach((c, j) => {
        const y = c.g * src - c.a1 * st2[j][0] - c.a2 * st2[j][1]
        st2[j][1] = st2[j][0]
        st2[j][0] = y
        v += y * [1, 0.7, 0.35][j]
      })
      const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6
      clean[i0 + i] += v * env * 1.6
    }
  }
  const pk = clean.reduce((a, v) => Math.max(a, Math.abs(v)), 0) || 1
  for (let i = 0; i < N; i++) clean[i] *= 0.55 / pk
  const noisy = new Float32Array(N)
  let pink = 0, rum = 0
  for (let i = 0; i < N; i++) {
    const t = i / rate
    pink = 0.97 * pink + 0.03 * rnd() * 3
    rum = 0.995 * rum + 0.005 * rnd() * 4
    const hum = 0.018 * Math.sin(2 * Math.PI * 60 * t) + 0.008 * Math.sin(2 * Math.PI * 180 * t)
    noisy[i] = clean[i] + 0.028 * rnd() + 0.03 * pink + 0.05 * rum + hum
  }
  return { clean, noisy }
}
