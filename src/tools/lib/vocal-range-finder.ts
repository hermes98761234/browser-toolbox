// Vocal range: McLeod Pitch Method (NSDF), stable sung-note extraction, voice-type classification, synthetic singer.
import { midiFreq, NOTE_NAMES } from './chromatic-tuner'

export interface Pitch { freq: number; clarity: number }

/**
 * McLeod & Wyvill (2005) "A smarter way to find pitch": normalised square difference function,
 * key maxima between positive zero crossings, first maximum ≥ k · highest, parabolic refinement.
 */
export function mpm(buf: Float32Array, sampleRate: number, minFreq = 60, maxFreq = 1500, k = 0.9): Pitch | null {
  const N = buf.length
  const maxTau = Math.min(N - 1, Math.ceil(sampleRate / minFreq))
  const minTau = Math.max(1, Math.floor(sampleRate / maxFreq))
  const nsdf = new Float32Array(maxTau + 1)
  for (let tau = 0; tau <= maxTau; tau++) {
    let acf = 0, m = 0
    for (let j = 0; j < N - tau; j++) {
      acf += buf[j] * buf[j + tau]
      m += buf[j] * buf[j] + buf[j + tau] * buf[j + tau]
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0
  }
  // key maxima: the highest value between each positive-going zero crossing and the next negative-going one
  const peaks: number[] = []
  let tau = 1
  while (tau < maxTau && nsdf[tau] > 0) tau++ // skip the zero-lag lobe
  let best = -1
  for (; tau < maxTau; tau++) {
    if (nsdf[tau] > 0 && nsdf[tau - 1] <= 0) best = tau
    if (best >= 0) {
      if (nsdf[tau] > nsdf[best]) best = tau
      if (nsdf[tau] <= 0 || tau === maxTau - 1) {
        if (best >= minTau) peaks.push(best)
        best = -1
      }
    }
  }
  if (!peaks.length) return null
  const top = Math.max(...peaks.map((p) => nsdf[p]))
  if (top <= 0) return null
  const p = peaks.find((q) => nsdf[q] >= k * top)!
  let t = p
  const a = nsdf[p - 1], b = nsdf[p], c = nsdf[p + 1] ?? b
  const den = a + c - 2 * b
  let val = b
  if (den !== 0) {
    const d = (a - c) / (2 * den)
    t = p + d
    val = b - ((a - c) * d) / 4
  }
  return { freq: sampleRate / t, clarity: Math.min(1, val) }
}

export const midiOf = (freq: number, a4 = 440) => 69 + 12 * Math.log2(freq / a4)
export const noteName = (midi: number) => `${NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`
export { midiFreq }

export interface Frame { t: number; midi: number | null } // seconds, fractional MIDI or null (unvoiced)
export interface Sung { midi: number; start: number; dur: number }

/** Groups voiced frames into held notes: consecutive frames within ±`tol` semitones of the run's median, lasting ≥ `minDur`. */
export function sungNotes(frames: Frame[], minDur = 0.3, tol = 0.6): Sung[] {
  const out: Sung[] = []
  let run: Frame[] = []
  const med = (r: Frame[]) => {
    const v = r.map((f) => f.midi!).sort((a, b) => a - b)
    return v[v.length >> 1]
  }
  const flush = () => {
    if (run.length > 1) {
      const dur = run[run.length - 1].t - run[0].t
      if (dur >= minDur) out.push({ midi: Math.round(med(run)), start: run[0].t, dur })
    }
    run = []
  }
  for (const f of frames) {
    if (f.midi === null) { flush(); continue }
    if (run.length && Math.abs(f.midi - med(run)) > tol) flush()
    run.push(f)
  }
  flush()
  return out
}

/** [name, low MIDI, high MIDI] — typical choral ranges. */
export const VOICES: [string, number, number][] = [
  ['Bass', 40, 64], // E2–E4
  ['Baritone', 43, 67], // G2–G4
  ['Tenor', 48, 72], // C3–C5
  ['Countertenor', 52, 76], // E3–E5
  ['Contralto', 53, 77], // F3–F5
  ['Mezzo-soprano', 57, 81], // A3–A5
  ['Soprano', 60, 84], // C4–C6
]

/** Ranks voice types: how much of each type's range you covered, minus how far the centres differ. */
export function classify(lo: number, hi: number): { name: string; score: number; lo: number; hi: number }[] {
  return VOICES.map(([name, a, b]) => {
    const cover = Math.max(0, Math.min(hi, b) - Math.max(lo, a)) / (b - a)
    const off = Math.abs((lo + hi) / 2 - (a + b) / 2) / 12
    return { name, lo: a, hi: b, score: cover - off }
  }).sort((x, y) => y.score - x.score)
}

/** A synthetic singer: harmonic-rich tone with vibrato and a little breath noise, for demo/testing. */
export function synthFrame(f0: number, t0: number, n: number, sr: number, noise = 0.02, seed = 1): Float32Array {
  const out = new Float32Array(n)
  const amps = [1, 0.6, 0.45, 0.3, 0.2, 0.12, 0.08]
  let s = seed
  for (let i = 0; i < n; i++) {
    const t = t0 + i / sr
    // phase = ∫ f0 · (1 + 0.012 sin(2π·5.5 t)) dt  → ±0.012 (≈ ±20 cents) vibrato at 5.5 Hz
    const ph = 2 * Math.PI * f0 * (t - (0.012 / (2 * Math.PI * 5.5)) * Math.cos(2 * Math.PI * 5.5 * t))
    let x = 0
    amps.forEach((a, h) => (x += a * Math.sin(ph * (h + 1) + h)))
    s = (s * 16807) % 2147483647
    out[i] = 0.25 * x + noise * ((s / 2147483647) * 2 - 1)
  }
  return out
}

/** Demo melody: (time s) → target MIDI or null; a baritone-ish warm-up scale. */
export const DEMO_NOTES = [45, 43, 47, 50, 52, 55, 59, 62, 64, 66, 67, 64, 57, 50, 44]
export function demoMidi(t: number): number | null {
  const slot = 0.7
  const i = Math.floor(t / slot)
  if (i >= DEMO_NOTES.length) return null
  const ph = (t % slot) / slot
  if (ph > 0.88) return null // breath between notes
  const prev = DEMO_NOTES[Math.max(0, i - 1)]
  const glide = Math.min(1, ph / 0.08)
  return prev + (DEMO_NOTES[i] - prev) * glide
}
