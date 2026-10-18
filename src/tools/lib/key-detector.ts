// Musical key estimation: STFT → spectral peaks → tuning estimate → pitch-class profile (chroma),
// then correlation against Krumhansl–Kessler and Temperley key profiles (24 keys).

export const NOTES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
const SHARP_KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const FLAT_KEYS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

export const PROFILES = {
  kk: {
    name: 'Krumhansl–Kessler',
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  },
  temperley: {
    name: 'Temperley (Kostka–Payne)',
    major: [0.748, 0.06, 0.488, 0.082, 0.67, 0.46, 0.096, 0.715, 0.104, 0.366, 0.057, 0.4],
    minor: [0.712, 0.084, 0.474, 0.618, 0.049, 0.46, 0.105, 0.747, 0.404, 0.067, 0.133, 0.33],
  },
} as const
export type ProfileId = keyof typeof PROFILES | 'both'

export interface Key {
  tonic: number // pitch class 0..11
  minor: boolean
}

export function keyName(k: Key): string {
  // conventional spelling: flats for F, B♭, E♭, A♭, D♭ majors and their relative minors
  const majPc = k.minor ? (k.tonic + 3) % 12 : k.tonic
  const flat = [5, 10, 3, 8, 1].includes(majPc)
  const n = (flat ? FLAT_KEYS : SHARP_KEYS)[k.tonic]
  return `${n} ${k.minor ? 'minor' : 'major'}`
}

/** Camelot wheel code used by DJs (8B = C major, 8A = A minor). */
export function camelot(k: Key): string {
  const maj = k.minor ? (k.tonic + 3) % 12 : k.tonic
  return `${((maj * 7) % 12 + 7) % 12 + 1}${k.minor ? 'A' : 'B'}`
}

export function scaleNotes(k: Key): string[] {
  const steps = k.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]
  const majPc = k.minor ? (k.tonic + 3) % 12 : k.tonic
  const names = [5, 10, 3, 8, 1].includes(majPc) ? FLAT_KEYS : SHARP_KEYS
  return steps.map((s) => names[(k.tonic + s) % 12])
}

// ---------- DSP ----------

export function fft(re: Float64Array, im: Float64Array) {
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
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
}

export interface Peak {
  f: number // Hz (parabolic-interpolated)
  m: number // magnitude
  frame: number
}

/** Spectral peaks of every STFT frame between fMin and fMax. */
export function spectralPeaks(x: Float32Array, sr: number, opts: { n?: number; hop?: number; fMin?: number; fMax?: number } = {}): { peaks: Peak[]; frames: number; hopSec: number } {
  const n = opts.n ?? 8192
  const hop = opts.hop ?? n / 2
  const fMin = opts.fMin ?? 55
  const fMax = opts.fMax ?? 2000
  const win = new Float64Array(n)
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  const re = new Float64Array(n), im = new Float64Array(n), mag = new Float64Array(n / 2)
  const peaks: Peak[] = []
  const lo = Math.max(2, Math.floor((fMin * n) / sr)), hi = Math.min(n / 2 - 2, Math.ceil((fMax * n) / sr))
  let frames = 0
  for (let start = 0; start + n <= Math.max(n, x.length); start += hop) {
    for (let i = 0; i < n; i++) {
      re[i] = (x[start + i] ?? 0) * win[i]
      im[i] = 0
    }
    fft(re, im)
    let mx = 0
    for (let k = 0; k < n / 2; k++) {
      mag[k] = Math.hypot(re[k], im[k])
      if (mag[k] > mx) mx = mag[k]
    }
    if (mx > 1e-6) {
      const floor = mx * 0.02
      for (let k = lo; k <= hi; k++) {
        const m = mag[k]
        if (m > floor && m > mag[k - 1] && m >= mag[k + 1] && m > mag[k - 2] && m >= mag[k + 2]) {
          // parabolic interpolation on log magnitude
          const a = Math.log(mag[k - 1] + 1e-12), b = Math.log(m + 1e-12), c = Math.log(mag[k + 1] + 1e-12)
          const d = a - 2 * b + c
          const off = d < 0 ? (0.5 * (a - c)) / d : 0
          peaks.push({ f: ((k + off) * sr) / n, m, frame: frames })
        }
      }
    }
    frames++
    if (start + n >= x.length) break
  }
  return { peaks, frames, hopSec: hop / sr }
}

/** Global tuning deviation in cents from A4 = 440 Hz (magnitude-weighted circular mean). */
export function estimateTuning(peaks: Peak[]): number {
  let s = 0, c = 0
  for (const p of peaks) {
    const semi = 12 * Math.log2(p.f / 440)
    const a = 2 * Math.PI * semi
    const w = Math.sqrt(p.m)
    s += w * Math.sin(a)
    c += w * Math.cos(a)
  }
  if (!s && !c) return 0
  return (Math.atan2(s, c) / (2 * Math.PI)) * 100
}

/** 12-bin chroma (normalised to max 1) from peaks, compensating for `tuningCents`. */
export function chroma(peaks: Peak[], tuningCents = 0, frameRange?: [number, number]): number[] {
  const out = new Array(12).fill(0)
  const ref = 440 * Math.pow(2, tuningCents / 1200)
  for (const p of peaks) {
    if (frameRange && (p.frame < frameRange[0] || p.frame >= frameRange[1])) continue
    const midi = 69 + 12 * Math.log2(p.f / ref)
    const r = Math.round(midi)
    const dev = Math.abs(midi - r)
    if (dev > 0.4) continue
    out[((r % 12) + 12) % 12] += Math.sqrt(p.m) * (1 - dev)
  }
  const mx = Math.max(...out)
  return mx > 0 ? out.map((v) => v / mx) : out
}

export function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

export interface KeyScore extends Key {
  r: number
  name: string
}

/** All 24 keys ranked by profile correlation. */
export function rankKeys(ch: number[], profile: ProfileId = 'both'): KeyScore[] {
  const ids = profile === 'both' ? (['kk', 'temperley'] as const) : ([profile] as const)
  const res: KeyScore[] = []
  for (const minor of [false, true]) {
    for (let t = 0; t < 12; t++) {
      const rot = ch.map((_, i) => ch[(i + t) % 12])
      const r = ids.reduce((s, id) => s + pearson(rot, PROFILES[id][minor ? 'minor' : 'major']), 0) / ids.length
      res.push({ tonic: t, minor, r, name: keyName({ tonic: t, minor }) })
    }
  }
  return res.sort((a, b) => b.r - a.r)
}

/** Softmax-style confidence across the 24 correlations (temperature tuned for r in −1..1). */
export function confidences(ranked: KeyScore[], temp = 0.08): number[] {
  const e = ranked.map((k) => Math.exp((k.r - ranked[0].r) / temp))
  const s = e.reduce((a, v) => a + v, 0)
  return e.map((v) => v / s)
}

export interface Analysis {
  tuning: number
  chroma: number[]
  ranked: KeyScore[]
  conf: number[]
  timeline: { t0: number; t1: number; key: KeyScore }[]
}

export function analyze(x: Float32Array, sr: number, profile: ProfileId = 'both', segSec = 10): Analysis {
  const { peaks, frames, hopSec } = spectralPeaks(x, sr)
  const tuning = estimateTuning(peaks)
  const ch = chroma(peaks, tuning)
  const ranked = rankKeys(ch, profile)
  const per = Math.max(2, Math.round(segSec / hopSec))
  const timeline: Analysis['timeline'] = []
  for (let f = 0; f < frames; f += per) {
    const c = chroma(peaks, tuning, [f, f + per])
    if (c.every((v) => v === 0)) continue
    timeline.push({ t0: f * hopSec, t1: Math.min(x.length / sr, (f + per) * hopSec), key: rankKeys(c, profile)[0] })
  }
  return { tuning, chroma: ch, ranked, conf: confidences(ranked), timeline }
}

// ---------- synthetic demo audio ----------

export const DEMOS: { name: string; key: string; chords: number[][]; bpm: number }[] = [
  // G major: G – Em – C – D (×2) – G
  { name: 'Pop progression in G major (I–vi–IV–V)', key: 'G major', bpm: 100, chords: [[43, 55, 59, 62, 67], [40, 55, 59, 64, 67], [36, 55, 60, 64, 67], [38, 54, 57, 62, 66], [43, 55, 59, 62, 67], [40, 52, 59, 64, 67], [36, 52, 60, 64, 67], [38, 54, 57, 62, 69], [43, 55, 59, 62, 67]] },
  // E minor: Em – Am – B7 – Em – C – Am – B – Em
  { name: 'Minor cadence in E minor (i–iv–V7–i)', key: 'E minor', bpm: 90, chords: [[40, 52, 55, 59, 64], [45, 52, 57, 60, 64], [47, 54, 57, 59, 63], [40, 52, 55, 59, 67], [36, 52, 55, 60, 64], [45, 57, 60, 64, 69], [47, 51, 54, 59, 63], [40, 52, 55, 59, 64]] },
  // E♭ major: E♭ – A♭ – B♭ – E♭ – Cm – Fm – B♭7 – E♭
  { name: 'Ballad in E♭ major (I–IV–V–I)', key: 'E♭ major', bpm: 72, chords: [[39, 51, 55, 58, 63], [44, 56, 60, 63, 68], [46, 58, 62, 65, 70], [39, 51, 55, 58, 67], [36, 55, 60, 63, 67], [41, 56, 60, 65, 68], [46, 56, 58, 62, 65], [39, 51, 55, 58, 63]] },
  // D minor, tuned to A4 = 432 Hz
  { name: 'D minor tuned to A=432 Hz', key: 'D minor', bpm: 96, chords: [[38, 50, 53, 57, 62], [43, 55, 58, 62, 67], [45, 57, 61, 64, 69], [38, 50, 53, 57, 65], [46, 53, 58, 62, 65], [45, 52, 57, 61, 64], [38, 50, 53, 57, 62]] },
]

/** Additive piano-ish synth of a chord progression with a melody arpeggio on top. */
export function synthProgression(chords: number[][], sr = 22050, bpm = 100, a4 = 440): Float32Array {
  const beat = 60 / bpm
  const chordDur = beat * 2
  const out = new Float32Array(Math.ceil(chords.length * chordDur * sr) + sr / 2)
  const tone = (midi: number, t0: number, dur: number, amp: number) => {
    const f = a4 * Math.pow(2, (midi - 69) / 12)
    const s0 = Math.floor(t0 * sr), len = Math.floor(dur * sr)
    for (let i = 0; i < len && s0 + i < out.length; i++) {
      const t = i / sr
      const env = Math.min(1, t / 0.01) * Math.exp(-t * 2.2) * Math.min(1, (len - i) / (0.03 * sr))
      let v = 0
      for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t) / (h * h)
      out[s0 + i] += amp * env * v
    }
  }
  chords.forEach((c, i) => {
    const t0 = i * chordDur
    c.forEach((m, j) => tone(m, t0, chordDur, j === 0 ? 0.22 : 0.12))
    const top = c.slice(1)
    for (let k = 0; k < 4; k++) tone(top[(k * 2) % top.length] + 12, t0 + k * beat * 0.5, beat * 0.5, 0.06)
  })
  let mx = 0
  for (const v of out) mx = Math.max(mx, Math.abs(v))
  if (mx > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.8 / mx
  return out
}
