// FFT, window functions, peak picking and musical note naming for the spectrum analyzer.

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
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
    const ang = (-2 * Math.PI) / len
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
}

export type WindowName = 'hann' | 'hamming' | 'blackman-harris' | 'flat-top' | 'rect'

export function makeWindow(name: WindowName, n: number): Float64Array {
  const w = new Float64Array(n)
  const c = (a: number[]) => {
    for (let i = 0; i < n; i++) {
      const x = (2 * Math.PI * i) / (n - 1)
      w[i] = a.reduce((s, ak, k) => s + (k % 2 ? -1 : 1) * ak * Math.cos(k * x), 0)
    }
  }
  if (name === 'hann') c([0.5, 0.5])
  else if (name === 'hamming') c([0.54, 0.46])
  else if (name === 'blackman-harris') c([0.35875, 0.48829, 0.14128, 0.01168])
  else if (name === 'flat-top') c([0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368])
  else w.fill(1)
  return w
}

/**
 * Single-sided amplitude spectrum in dBFS (a full-scale sine reads 0 dB), N/2 + 1 bins.
 * Uses scratch buffers to avoid allocation in the render loop.
 */
export function spectrumDb(x: ArrayLike<number>, win: Float64Array, out?: Float32Array): Float32Array {
  const n = win.length
  const re = new Float64Array(n), im = new Float64Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    re[i] = (x[i] ?? 0) * win[i]
    sum += win[i]
  }
  fft(re, im)
  const o = out ?? new Float32Array(n / 2 + 1)
  for (let k = 0; k <= n / 2; k++) {
    const mag = (Math.hypot(re[k], im[k]) * (k === 0 || k === n / 2 ? 1 : 2)) / sum
    o[k] = 20 * Math.log10(mag + 1e-12)
  }
  return o
}

export function rmsDb(x: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i] * x[i]
  return 10 * Math.log10(s / (x.length || 1) + 1e-20)
}

export interface Peak {
  freq: number
  db: number
}

/** Local maxima above `floor`, refined by parabolic interpolation, strongest first. */
export function findPeaks(db: ArrayLike<number>, sampleRate: number, n: number, opts: { floor?: number; count?: number; minHz?: number } = {}): Peak[] {
  const floor = opts.floor ?? -70, count = opts.count ?? 5, minHz = opts.minHz ?? 20
  const binHz = sampleRate / n
  const cand: Peak[] = []
  for (let k = 2; k < db.length - 2; k++) {
    const b = db[k]
    if (b < floor || k * binHz < minHz) continue
    if (b > db[k - 1] && b >= db[k + 1] && b > db[k - 2] && b >= db[k + 2]) {
      const a = db[k - 1], c = db[k + 1]
      const den = a - 2 * b + c
      const d = den < 0 ? (0.5 * (a - c)) / den : 0
      cand.push({ freq: (k + d) * binHz, db: b - 0.25 * (a - c) * d })
    }
  }
  cand.sort((p, q) => q.db - p.db)
  const out: Peak[] = []
  for (const p of cand) {
    if (out.some((o) => Math.abs(Math.log2(o.freq / p.freq)) < 1 / 24)) continue
    out.push(p)
    if (out.length >= count) break
  }
  return out
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** Nearest equal-tempered note and offset in cents (A4 = ref Hz). */
export function noteOf(f: number, ref = 440): { name: string; cents: number; midi: number } {
  if (!(f > 0)) return { name: '—', cents: 0, midi: 0 }
  const m = 69 + 12 * Math.log2(f / ref)
  const r = Math.round(m)
  return { name: `${NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`, cents: Math.round((m - r) * 100), midi: r }
}

/** Maps frequency to 0..1 on a log or linear axis. */
export const fToX = (f: number, lo: number, hi: number, log: boolean) => (log ? Math.log(f / lo) / Math.log(hi / lo) : (f - lo) / (hi - lo))
export const xToF = (x: number, lo: number, hi: number, log: boolean) => (log ? lo * Math.pow(hi / lo, x) : lo + x * (hi - lo))

/** "Inferno"-like colormap: t in 0..1 → [r,g,b] 0..255. */
export function heat(t: number): [number, number, number] {
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 4], [0.15, 31, 12, 72], [0.35, 120, 28, 109], [0.55, 207, 68, 70], [0.75, 251, 155, 6], [0.9, 247, 209, 61], [1, 252, 255, 164],
  ]
  t = Math.max(0, Math.min(1, t))
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, r0, g0, b0] = stops[i - 1], [t1, r1, g1, b1] = stops[i]
      const f = (t - t0) / (t1 - t0)
      return [r0 + f * (r1 - r0), g0 + f * (g1 - g0), b0 + f * (b1 - b0)]
    }
  }
  return [252, 255, 164]
}

export function fmtHz(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} kHz` : `${f.toFixed(f < 100 ? 1 : 0)} Hz`
}
