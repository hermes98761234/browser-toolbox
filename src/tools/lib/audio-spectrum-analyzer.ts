// Metering maths for the live Audio Spectrum Analyzer: 1/3-octave RTA bands, A/C weighting,
// stereo correlation, peak-hold ballistics, Voss–McCartney pink noise and a synthetic demo mix.
import { kWeighting, lufs, gatedLoudness, loudnessRange, truePeakEnvelope, type Biquad } from './loudness-normalizer'
import { fft } from './spectrum-analyzer'

/** ISO 266 nominal 1/3-octave centre frequencies, 20 Hz – 20 kHz (31 bands). */
export const NOMINAL = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]
/** Exact base-10 centres (1000 · 10^(k/10)) used for the band edges. */
export const CENTRES = NOMINAL.map((_, i) => 1000 * 10 ** ((i - 17) / 10))
export const bandEdges = (fc: number): [number, number] => [fc * 10 ** (-1 / 20), fc * 10 ** (1 / 20)]

/** IEC 61672 A-weighting in dB (0 dB at 1 kHz). */
export function aWeightDb(f: number): number {
  const f2 = f * f
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2))
  return 20 * Math.log10(ra) + 2.0
}
/** IEC 61672 C-weighting in dB. */
export function cWeightDb(f: number): number {
  const f2 = f * f
  const rc = (12194 ** 2 * f2) / ((f2 + 20.6 ** 2) * (f2 + 12194 ** 2))
  return 20 * Math.log10(rc) + 0.06
}
export type Weighting = 'Z' | 'A' | 'C'
export const weightDb = (w: Weighting, f: number) => (w === 'A' ? aWeightDb(f) : w === 'C' ? cWeightDb(f) : 0)

/**
 * Sums FFT bin powers (from AnalyserNode.getFloatFrequencyData, dB per bin) into 1/3-octave bands.
 * Bands narrower than one bin take the power of the bin they fall in. Returns dB per band.
 */
export function bandLevels(binsDb: ArrayLike<number>, fs: number, fftSize: number, w: Weighting = 'Z'): number[] {
  const df = fs / fftSize
  const n = binsDb.length
  return CENTRES.map((fc) => {
    const [lo, hi] = bandEdges(fc)
    if (lo >= fs / 2) return -Infinity
    let p = 0
    let k0 = Math.ceil(lo / df), k1 = Math.min(n - 1, Math.floor(hi / df))
    if (k1 < k0) k0 = k1 = Math.min(n - 1, Math.round(fc / df))
    for (let k = Math.max(1, k0); k <= k1; k++) p += 10 ** (binsDb[k] / 10)
    return p > 0 ? 10 * Math.log10(p) + weightDb(w, fc) : -Infinity
  })
}

/** Pearson correlation of two channels: +1 mono, 0 unrelated/wide, −1 out of phase. */
export function correlation(l: ArrayLike<number>, r: ArrayLike<number>): number {
  let lr = 0, ll = 0, rr = 0
  for (let i = 0; i < l.length; i++) {
    lr += l[i] * r[i]
    ll += l[i] * l[i]
    rr += r[i] * r[i]
  }
  return ll > 1e-12 && rr > 1e-12 ? lr / Math.sqrt(ll * rr) : 0
}

export function rms(x: ArrayLike<number>, from = 0, to = x.length): number {
  let s = 0
  for (let i = from; i < to; i++) s += x[i] * x[i]
  return to > from ? Math.sqrt(s / (to - from)) : 0
}

export function peakAbs(x: ArrayLike<number>, from = 0, to = x.length): number {
  let m = 0
  for (let i = from; i < to; i++) {
    const a = Math.abs(x[i])
    if (a > m) m = a
  }
  return m
}

/** Peak-hold ballistics: jumps up instantly, holds `holdSec`, then falls at `fallDbPerSec`. */
export interface Hold { v: number; t: number }
export function hold(h: Hold, v: number, now: number, holdSec = 2, fallDbPerSec = 12): Hold {
  if (v >= h.v || !Number.isFinite(h.v)) return { v, t: now }
  if (now - h.t < holdSec) return h
  const fallen = h.v - fallDbPerSec * (now - h.t - holdSec)
  return fallen > v ? { v: fallen, t: h.t } : { v, t: now }
}

/** Exponential smoothing of a dB value towards a target (meter ballistics; tau in seconds). */
export const smooth = (prev: number, next: number, dt: number, tauUp: number, tauDown: number) => {
  if (!Number.isFinite(prev)) return next
  if (!Number.isFinite(next)) next = -120
  const tau = next > prev ? tauUp : tauDown
  return prev + (next - prev) * (1 - Math.exp(-dt / Math.max(1e-4, tau)))
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Pink (1/f) noise by the Voss–McCartney method: `rows` white generators, generator k is
 * refreshed every 2^k samples (chosen by the trailing zeros of the counter), plus one white term.
 * Scaled to the requested RMS level in dBFS.
 */
export function pinkNoise(n: number, rmsDbfs = -20, seed = 1, rows = 16): Float32Array {
  const rand = rng(seed)
  const gen = new Float64Array(rows).map(() => rand() * 2 - 1)
  let sum = gen.reduce((a, b) => a + b, 0)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const c = i + 1
    let k = 0
    while (k < rows - 1 && !((c >> k) & 1)) k++
    const v = rand() * 2 - 1
    sum += v - gen[k]
    gen[k] = v
    out[i] = sum + (rand() * 2 - 1)
  }
  // remove DC and normalise
  let mean = 0
  for (const v of out) mean += v
  mean /= n || 1
  for (let i = 0; i < n; i++) out[i] -= mean
  const g = 10 ** (rmsDbfs / 20) / (rms(out) || 1)
  for (let i = 0; i < n; i++) out[i] *= g
  return out
}

/** An 8-bar synthetic stereo groove (kick, bass, pad chords, hats) for the no-microphone demo. */
export function demoMix(fs: number, sec = 8, seed = 3): [Float32Array, Float32Array] {
  const n = Math.round(fs * sec)
  const L = new Float32Array(n), R = new Float32Array(n)
  const rand = rng(seed)
  const bpm = 120, beat = 60 / bpm
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12)
  let hp = 0, lp = 0, lastNoise = 0
  for (let i = 0; i < n; i++) {
    const t = i / fs
    const b = t / beat
    const inBeat = (b % 1) * beat
    const bar = Math.floor(b / 4) % 4
    // kick on every beat: pitch sweep 120 → 45 Hz
    const kEnv = Math.exp(-inBeat * 9)
    const kick = Math.sin(2 * Math.PI * (45 * inBeat + (75 / 25) * (1 - Math.exp(-inBeat * 25)))) * kEnv * 0.55
    // bass: root of chord on 8ths
    const eighth = (b * 2) % 1
    const root = hz(chords[bar][0] - 24)
    const bass = Math.tanh(2.2 * Math.sin(2 * Math.PI * root * t)) * Math.exp(-eighth * 2.5) * 0.18
    // pad: detuned saw-ish chords, slowly panned
    let padL = 0, padR = 0
    chords[bar].forEach((m, j) => {
      const f = hz(m)
      const s1 = 2 * ((f * t * 1.003) % 1) - 1, s2 = 2 * ((f * t * 0.997 + 0.3) % 1) - 1
      padL += s1 * (0.5 + 0.2 * j) + s2 * 0.3
      padR += s2 * (0.9 - 0.2 * j) + s1 * 0.3
    })
    const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * t / (beat * 8))
    // hats: high-passed noise bursts on off-beat 16ths, panned right
    const noise = rand() * 2 - 1
    hp = 0.6 * (hp + noise - lastNoise)
    lastNoise = noise
    lp += 0.3 * (hp - lp)
    const six = (b * 4) % 1
    const hat = lp * 0.8 * Math.exp(-six * beat * 0.25 * 160) * (Math.floor(b * 4) % 2 ? 0.35 : 0.15)
    L[i] = kick + bass + padL * 0.035 * swell + hat * 0.6
    R[i] = kick + bass + padR * 0.035 * swell + hat
  }
  // gentle fade at the loop seam
  const f = Math.round(fs * 0.005)
  for (let i = 0; i < f; i++) {
    const g = i / f
    L[i] *= g; R[i] *= g; L[n - 1 - i] *= g; R[n - 1 - i] *= g
  }
  return [L, R]
}

export const fmtDb = (v: number, d = 1) => (Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(d) : '−∞')
export const fmtBand = (f: number) => (f >= 1000 ? `${+(f / 1000).toFixed(f % 1000 ? 1 : 0)}k` : `${f}`)

// ---------- streaming meter engine ----------

class StreamBiquad {
  x1 = 0
  x2 = 0
  y1 = 0
  y2 = 0
  f: Biquad
  constructor(f: Biquad) {
    this.f = f
  }
  run(x: Float32Array, out: Float32Array) {
    const { b0, b1, b2, a1, a2 } = this.f
    let { x1, x2, y1, y2 } = this
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v
      out[i] = v
    }
    Object.assign(this, { x1, x2, y1, y2 })
  }
}

export interface Readout {
  momentary: number
  shortTerm: number
  integrated: number
  lra: number
  maxMomentary: number
  peak: [number, number]
  truePeak: [number, number]
  truePeakMax: number
  rms: [number, number]
  correlation: number
  seconds: number
}

/**
 * Consumes contiguous stereo sample blocks and keeps BS.1770 loudness (100 ms sub-blocks →
 * momentary 400 ms, short-term 3 s, gated integrated, LRA), sample/true peaks, RMS, correlation
 * and a ring buffer for spectrum and phase-scope drawing.
 */
export class Meter {
  fs: number
  ring: [Float32Array, Float32Array]
  pos = 0
  private k: StreamBiquad[][]
  private tmp = [new Float32Array(0), new Float32Array(0)]
  private sub: number[] = []
  private acc = 0
  private accN = 0
  private subLen: number
  private moments: number[] = []
  private shorts: number[] = []
  private hist: Float32Array[] = [new Float32Array(16), new Float32Array(16)]
  private lr = 0
  private ll = 0
  private rr = 0
  r: Readout
  /** Short-term and momentary LUFS history, one entry per 100 ms. */
  history: { m: number; s: number }[] = []
  constructor(fs: number, ringSize = 16384) {
    this.fs = fs
    this.ring = [new Float32Array(ringSize), new Float32Array(ringSize)]
    const kw = kWeighting(fs)
    this.k = [0, 1].map(() => kw.map((f) => new StreamBiquad(f)))
    this.subLen = Math.round(fs * 0.1)
    this.r = Meter.empty()
  }
  static empty(): Readout {
    return { momentary: -Infinity, shortTerm: -Infinity, integrated: -Infinity, lra: 0, maxMomentary: -Infinity, peak: [-Infinity, -Infinity], truePeak: [-Infinity, -Infinity], truePeakMax: -Infinity, rms: [-Infinity, -Infinity], correlation: 0, seconds: 0 }
  }
  resetStats() {
    this.moments = []
    this.shorts = []
    this.history = []
    this.r = { ...this.r, integrated: -Infinity, lra: 0, maxMomentary: -Infinity, truePeakMax: -Infinity, seconds: 0 }
  }
  push(L: Float32Array, R: Float32Array) {
    const n = L.length
    if (!n) return
    // ring buffer
    const N = this.ring[0].length
    for (let i = 0; i < n; i++) {
      this.ring[0][this.pos] = L[i]
      this.ring[1][this.pos] = R[i]
      this.pos = (this.pos + 1) % N
    }
    // K-weighting
    if (this.tmp[0].length < n) this.tmp = [new Float32Array(n), new Float32Array(n)]
    const kw = [this.tmp[0].subarray(0, n), this.tmp[1].subarray(0, n)]
    ;[L, R].forEach((x, c) => {
      this.k[c][0].run(x, kw[c])
      this.k[c][1].run(kw[c], kw[c])
    })
    for (let i = 0; i < n; i++) {
      this.acc += kw[0][i] * kw[0][i] + kw[1][i] * kw[1][i]
      if (++this.accN === this.subLen) {
        this.sub.push(this.acc / this.subLen)
        if (this.sub.length > 30) this.sub.shift()
        this.acc = 0
        this.accN = 0
        this.tick()
      }
    }
    // peaks and true peaks (with 16 samples of history for the interpolator)
    const tau = 0.3
    const a = Math.exp(-n / (this.fs * tau))
    ;[L, R].forEach((x, c) => {
      this.r.peak[c] = 20 * Math.log10(peakAbs(x) || 1e-9)
      const withHist = new Float32Array(16 + n)
      withHist.set(this.hist[c])
      withHist.set(x, 16)
      const env = truePeakEnvelope([withHist], this.fs)
      const tp = 20 * Math.log10(peakAbs(env, 8, env.length - 8) || 1e-9)
      this.r.truePeak[c] = tp
      if (tp > this.r.truePeakMax) this.r.truePeakMax = tp
      this.hist[c] = withHist.slice(withHist.length - 16)
    })
    // rms over the last 300 ms (from the ring) and correlation (exponential averages)
    const w = Math.min(N, Math.round(this.fs * 0.3))
    for (let c = 0; c < 2; c++) {
      let s = 0
      for (let i = 1; i <= w; i++) {
        const v = this.ring[c][(this.pos - i + N) % N]
        s += v * v
      }
      this.r.rms[c] = 10 * Math.log10(s / w || 1e-18)
    }
    let lr = 0, ll = 0, rr = 0
    for (let i = 0; i < n; i++) {
      lr += L[i] * R[i]
      ll += L[i] * L[i]
      rr += R[i] * R[i]
    }
    this.lr = a * this.lr + (1 - a) * (lr / n)
    this.ll = a * this.ll + (1 - a) * (ll / n)
    this.rr = a * this.rr + (1 - a) * (rr / n)
    this.r.correlation = this.ll > 1e-10 && this.rr > 1e-10 ? this.lr / Math.sqrt(this.ll * this.rr) : 0
  }
  private tick() {
    const s = this.sub
    this.r.seconds += 0.1
    const mean = (k: number) => s.slice(-k).reduce((x, y) => x + y, 0) / Math.min(k, s.length)
    if (s.length >= 4) {
      const m = mean(4)
      this.moments.push(m)
      this.r.momentary = lufs(m)
      if (this.r.momentary > this.r.maxMomentary) this.r.maxMomentary = this.r.momentary
      this.r.integrated = gatedLoudness(this.moments)
    }
    if (s.length >= 30) {
      const st = mean(30)
      this.shorts.push(st)
      this.r.shortTerm = lufs(st)
      if (this.shorts.length % 10 === 0) this.r.lra = loudnessRange(this.shorts).lra
    }
    this.history.push({ m: this.r.momentary, s: this.r.shortTerm })
    if (this.history.length > 600) this.history.shift()
  }
  /** Mono (L+R)/2 spectrum of the newest `size` samples: dB per bin in the AnalyserNode convention (Blackman, 1/N). */
  spectrum(size = 8192): Float32Array {
    const N = this.ring[0].length
    const re = new Float64Array(size), im = new Float64Array(size)
    for (let i = 0; i < size; i++) {
      const j = (this.pos - size + i + N) % N
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / size) + 0.08 * Math.cos((4 * Math.PI * i) / size)
      re[i] = ((this.ring[0][j] + this.ring[1][j]) / 2) * w
    }
    fft(re, im)
    const out = new Float32Array(size / 2)
    for (let k = 0; k < size / 2; k++) out[k] = 10 * Math.log10((re[k] ** 2 + im[k] ** 2) / (size * size) + 1e-30)
    return out
  }
}

/** Correction so a band's summed bin power reads in dB RMS re full scale (Blackman window, 1/N scaling, one-sided). */
export const RTA_CAL = -10 * Math.log10(0.25 * (0.42 ** 2 + 0.5 ** 2 / 2 + 0.08 ** 2 / 2)) - 3.0103
