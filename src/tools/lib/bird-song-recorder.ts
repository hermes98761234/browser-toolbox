// Bird song field recorder: STFT spectrogram, syllable detection, band peak frequency and a synthetic
// bird-like demo song (FM chirps, trills and a whistle over wind-like noise).
import { fft, heat, makeWindow } from './spectrum-analyzer'
import { encodeWav } from './audio-trimmer'

export { encodeWav, heat }

export interface Spectrogram { frames: Float32Array[]; binHz: number; hopSec: number; fftSize: number }

/** Magnitude spectrogram in dB (Hann window). One frame per `hop` samples. */
export function spectrogram(x: Float32Array, rate: number, fftSize = 1024, hop = fftSize / 4): Spectrogram {
  const win = makeWindow('hann', fftSize)
  const wsum = win.reduce((a, b) => a + b, 0)
  const frames: Float32Array[] = []
  const re = new Float64Array(fftSize), im = new Float64Array(fftSize)
  for (let s = 0; s + fftSize <= Math.max(fftSize, x.length); s += hop) {
    for (let i = 0; i < fftSize; i++) { re[i] = (x[s + i] ?? 0) * win[i]; im[i] = 0 }
    fft(re, im)
    const o = new Float32Array(fftSize / 2 + 1)
    for (let k = 0; k <= fftSize / 2; k++) o[k] = 20 * Math.log10((2 * Math.hypot(re[k], im[k])) / wsum + 1e-9)
    frames.push(o)
  }
  return { frames, binHz: rate / fftSize, hopSec: hop / rate, fftSize }
}

/** Band energy (dB) per frame between fLo and fHi. */
export function bandDb(sp: Spectrogram, fLo: number, fHi: number): number[] {
  const k0 = Math.max(0, Math.floor(fLo / sp.binHz)), k1 = Math.min(sp.fftSize / 2, Math.ceil(fHi / sp.binHz))
  return sp.frames.map((f) => {
    let p = 0
    for (let k = k0; k <= k1; k++) p += 10 ** (f[k] / 10)
    return 10 * Math.log10(p + 1e-12)
  })
}

/** Syllables: runs of frames whose band energy exceeds (noise floor + `above` dB); short gaps are bridged. */
export function syllables(sp: Spectrogram, fLo: number, fHi: number, above = 12, minGap = 0.03, minLen = 0.02): [number, number][] {
  const e = bandDb(sp, fLo, fHi)
  if (!e.length) return []
  const sorted = [...e].sort((a, b) => a - b)
  const floor = sorted[Math.floor(sorted.length * 0.2)]
  const out: [number, number][] = []
  let start = -1
  e.forEach((v, i) => {
    if (v > floor + above) { if (start < 0) start = i } else if (start >= 0) { out.push([start * sp.hopSec, i * sp.hopSec]); start = -1 }
  })
  if (start >= 0) out.push([start * sp.hopSec, e.length * sp.hopSec])
  const merged: [number, number][] = []
  for (const s of out) {
    const last = merged[merged.length - 1]
    if (last && s[0] - last[1] < minGap) last[1] = s[1]
    else merged.push([...s])
  }
  return merged.filter(([a, b]) => b - a >= minLen)
}

/** Peak frequency of the average spectrum over [t0, t1] restricted to [fLo, fHi]. */
export function peakFreq(sp: Spectrogram, t0: number, t1: number, fLo: number, fHi: number): { f: number; db: number } {
  const i0 = Math.max(0, Math.floor(t0 / sp.hopSec)), i1 = Math.min(sp.frames.length, Math.max(i0 + 1, Math.ceil(t1 / sp.hopSec)))
  const k0 = Math.max(1, Math.floor(fLo / sp.binHz)), k1 = Math.min(sp.fftSize / 2, Math.ceil(fHi / sp.binHz))
  let best = k0, bv = -Infinity
  for (let k = k0; k <= k1; k++) {
    let p = 0
    for (let i = i0; i < i1; i++) p += 10 ** (sp.frames[i][k] / 10)
    if (p > bv) { bv = p; best = k }
  }
  return { f: best * sp.binHz, db: 10 * Math.log10(bv / Math.max(1, i1 - i0) + 1e-12) }
}

/** Synthetic dawn song: whistle phrases, rising chirps and a fast trill over brown-ish noise. Deterministic. */
export function synthBird(rate = 32000, seconds = 8, seed = 1): Float32Array {
  const n = Math.round(rate * seconds), x = new Float32Array(n)
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  let b = 0
  for (let i = 0; i < n; i++) { b = 0.985 * b + (rnd() - 0.5) * 0.06; x[i] = b * 0.5 + (rnd() - 0.5) * 0.004 }
  const note = (t0: number, dur: number, f: (u: number) => number, amp = 0.35) => {
    let ph = 0
    const i0 = Math.round(t0 * rate), len = Math.round(dur * rate)
    for (let i = 0; i < len && i0 + i < n; i++) {
      const u = i / len
      ph += (2 * Math.PI * f(u)) / rate
      const env = Math.sin(Math.PI * u) ** 0.6
      x[i0 + i] += amp * env * (Math.sin(ph) + 0.18 * Math.sin(2 * ph))
    }
  }
  let t = 0.4
  while (t < seconds - 1.2) {
    // phrase A: two clear whistles
    note(t, 0.22, () => 3200, 0.3); note(t + 0.3, 0.18, (u) => 2800 + 300 * u, 0.28)
    t += 0.6
    // phrase B: three rising chirps
    for (let k = 0; k < 3; k++) note(t + k * 0.12, 0.07, (u) => 3500 + 3500 * u, 0.32)
    t += 0.45
    // phrase C: trill with vibrato
    for (let k = 0; k < 9; k++) note(t + k * 0.05, 0.035, (u) => 5200 - 900 * u + 150 * Math.sin(k), 0.25)
    t += 0.6 + rnd() * 0.5
  }
  return x
}

/** Mono mix of channels. */
export function mono(ch: Float32Array[]): Float32Array {
  if (ch.length === 1) return ch[0]
  const o = new Float32Array(ch[0].length)
  for (const c of ch) for (let i = 0; i < o.length; i++) o[i] += c[i] / ch.length
  return o
}

export const fmtSec = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`
