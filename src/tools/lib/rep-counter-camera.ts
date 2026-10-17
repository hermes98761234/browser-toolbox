// Rep detection from a 1-D activity signal: smoothing, adaptive range normalisation,
// hysteresis thresholds and a min-gap debounce. Fed by camera ROI differencing or an accelerometer.

export interface DetectorOpts {
  /** upper hysteresis threshold on the normalised signal (0..1) */
  hi: number
  /** lower hysteresis threshold (0..1), must be below hi */
  lo: number
  /** ignore swings smaller than this (signal units) — keeps noise from counting */
  minRange: number
  /** seconds of history used for the adaptive min/max */
  windowSec: number
  /** minimum seconds between two counted reps */
  minGapSec: number
  /** high→low cycles per rep (1 for pose match, 2 for motion bursts) */
  cycles: number
  /** EMA smoothing factor 0..1 (1 = no smoothing) */
  alpha: number
}

export const DEFAULT_OPTS: DetectorOpts = { hi: 0.6, lo: 0.3, minRange: 4, windowSec: 8, minGapSec: 0.6, cycles: 1, alpha: 0.4 }

export interface Step {
  /** smoothed raw value */
  s: number
  /** value normalised to the recent range (0..1), NaN while the range is too small */
  v: number
  high: boolean
  counted: boolean
}

export class RepDetector {
  opts: DetectorOpts
  reps = 0
  repTimes: number[] = []
  private buf: { t: number; s: number }[] = []
  private ema = NaN
  private high = false
  private halfCycles = 0
  private lastRep = -Infinity

  constructor(opts: Partial<DetectorOpts> = {}) {
    this.opts = { ...DEFAULT_OPTS, ...opts }
  }

  reset() {
    this.reps = 0
    this.repTimes = []
    this.buf = []
    this.ema = NaN
    this.high = false
    this.halfCycles = 0
    this.lastRep = -Infinity
  }

  /** Feed one sample (t in seconds, monotonically increasing). */
  push(t: number, x: number): Step {
    const o = this.opts
    this.ema = Number.isFinite(this.ema) ? this.ema + o.alpha * (x - this.ema) : x
    const s = this.ema
    this.buf.push({ t, s })
    while (this.buf.length && this.buf[0].t < t - o.windowSec) this.buf.shift()
    let lo = Infinity, hi = -Infinity
    for (const b of this.buf) {
      if (b.s < lo) lo = b.s
      if (b.s > hi) hi = b.s
    }
    const range = hi - lo
    if (range < o.minRange) return { s, v: NaN, high: this.high, counted: false }
    const v = (s - lo) / range
    let counted = false
    if (!this.high && v >= o.hi) this.high = true
    else if (this.high && v <= o.lo) {
      this.high = false
      this.halfCycles++
      if (this.halfCycles >= o.cycles) {
        this.halfCycles = 0
        if (t - this.lastRep >= o.minGapSec) {
          this.reps++
          this.repTimes.push(t)
          this.lastRep = t
          counted = true
        }
      }
    }
    return { s, v, high: this.high, counted }
  }
}

/** Grayscale of an RGBA buffer, mean-centred so global exposure shifts cancel out. */
export function grayCentered(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length / 4
  const g = new Float32Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const v = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
    g[i] = v
    sum += v
  }
  const m = n ? sum / n : 0
  for (let i = 0; i < n; i++) g[i] -= m
  return g
}

/** Mean absolute difference between two equal-length frames (0..255). */
export function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || !a.length) return 0
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / a.length
}

/** Rep cadence statistics from rep timestamps (seconds). */
export function cadence(times: number[]) {
  if (times.length < 2) return { perMin: NaN, avg: NaN, last: NaN }
  const gaps = times.slice(1).map((t, i) => t - times[i])
  const recent = gaps.slice(-5)
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length
  return { perMin: 60 / avg, avg, last: gaps[gaps.length - 1] }
}

/** Squat/push-up depth 0..1 over time for the demo: lower, hold, rise, hold; tempo drifts slightly. */
export function demoDepth(t: number, period = 2.6): number {
  const p = period * (1 + 0.08 * Math.sin(t / 7))
  const k = (((t / p) % 1) + 1) % 1
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)
  if (k < 0.38) return ease(k / 0.38)
  if (k < 0.5) return 1
  if (k < 0.85) return 1 - ease((k - 0.5) / 0.35)
  return 0
}
