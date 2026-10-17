// YIN pitch detection + note math for the chromatic tuner.

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

export interface Pitch { freq: number; clarity: number }

/**
 * YIN (de Cheveigné & Kawahara, 2002): cumulative-mean-normalised difference function,
 * absolute threshold, then parabolic interpolation around the chosen lag.
 */
export function yin(buf: Float32Array, sampleRate: number, threshold = 0.12, minFreq = 30, maxFreq = 2000): Pitch | null {
  const half = Math.floor(buf.length / 2)
  const maxTau = Math.min(half, Math.floor(sampleRate / minFreq))
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq))
  const d = new Float32Array(maxTau + 1)
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0
    for (let j = 0; j < half; j++) {
      const diff = buf[j] - buf[j + tau]
      s += diff * diff
    }
    d[tau] = s
  }
  // cumulative mean normalised difference
  d[0] = 1
  let run = 0
  for (let tau = 1; tau <= maxTau; tau++) {
    run += d[tau]
    d[tau] = run ? (d[tau] * tau) / run : 1
  }
  let tau = -1
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t++
      tau = t
      break
    }
  }
  if (tau < 0) {
    // no dip under the threshold: take the global minimum if it is reasonably clear
    let best = minTau
    for (let t = minTau; t <= maxTau; t++) if (d[t] < d[best]) best = t
    if (d[best] > 0.35) return null
    tau = best
  }
  let better = tau
  if (tau > 1 && tau < maxTau) {
    const a = d[tau - 1], b = d[tau], c = d[tau + 1]
    const den = a + c - 2 * b
    if (den !== 0) better = tau + (a - c) / (2 * den)
  }
  return { freq: sampleRate / better, clarity: Math.max(0, 1 - d[tau]) }
}

export interface NoteInfo { midi: number; name: string; octave: number; cents: number; target: number }

/** Nearest equal-tempered note for `freq` with A4 = `a4` Hz. */
export function noteOf(freq: number, a4 = 440): NoteInfo {
  const exact = 69 + 12 * Math.log2(freq / a4)
  const midi = Math.round(exact)
  return { midi, name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, cents: (exact - midi) * 100, target: midiFreq(midi, a4) }
}

export const midiFreq = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12)

/** "E2" / "C#4" / "Bb3" → MIDI number. */
export function parseNote(s: string): number {
  const m = /^([A-G])([#♯b♭]?)(-?\d)$/.exec(s.trim())
  if (!m) return NaN
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C']
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0
  return (Number(m[3]) + 1) * 12 + base + acc
}

export const rms = (b: Float32Array) => Math.sqrt(b.reduce((a, x) => a + x * x, 0) / (b.length || 1))
