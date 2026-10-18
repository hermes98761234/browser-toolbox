// Practice looper DSP, written from scratch: WSOLA time-stretching (tempo change without pitch
// change), resampling for pitch transposition, waveform peaks and a synthesized demo tune.

const hann = (n: number) => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n))

/**
 * WSOLA: output = input played `rate` times faster (rate 0.5 = half speed) with the original pitch.
 * Frame positions are chosen on `guide` (usually a mono mix) and applied to every channel.
 */
export function wsola(chs: Float32Array[], rate: number, sr: number, guide = chs[0]): Float32Array[] {
  const len = guide.length
  if (Math.abs(rate - 1) < 1e-6) return chs.map((c) => c.slice())
  const N = 2 * Math.round((sr * 0.04) / 2) // 40 ms frames
  const Hs = N / 2
  const delta = Math.round(N / 8)
  const outLen = Math.ceil(len / rate)
  const win = hann(N)
  const outs = chs.map(() => new Float32Array(outLen + N))
  const norm = new Float32Array(outLen + N)
  const at = (i: number) => (i >= 0 && i < len ? guide[i] : 0)
  let prev = 0
  for (let k = 0; k * Hs < outLen; k++) {
    const outPos = k * Hs
    let pos = 0
    if (k > 0) {
      const nominal = Math.round(outPos * rate)
      const nat = prev + Hs // where the previous frame would naturally continue
      let best = nominal, bv = -Infinity
      for (let p = nominal - delta; p <= nominal + delta; p++) {
        if (p < 0) continue
        let c = 0
        for (let j = 0; j < Hs; j += 4) c += at(p + j) * at(nat + j)
        if (c > bv) { bv = c; best = p }
      }
      pos = best
    }
    for (let i = 0; i < N; i++) {
      const src = pos + i
      if (src >= len) break
      const w = win[i]
      for (let c = 0; c < chs.length; c++) outs[c][outPos + i] += chs[c][src] * w
      norm[outPos + i] += w
    }
    prev = pos
  }
  return outs.map((o) => {
    const r = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) r[i] = norm[i] > 0.05 ? o[i] / norm[i] : o[i] / 0.05
    return r
  })
}

/** Cubic (Catmull-Rom) resampling: reads the input with step `step` (2 = one octave up, half as long). */
export function resample(x: Float32Array, step: number): Float32Array {
  const n = Math.floor((x.length - 1) / step)
  const out = new Float32Array(Math.max(0, n))
  const g = (i: number) => x[Math.min(x.length - 1, Math.max(0, i))]
  for (let k = 0; k < n; k++) {
    const t = k * step
    const i = Math.floor(t), f = t - i
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2)
    out[k] = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)))
  }
  return out
}

/** Tempo factor (0.5 = half speed) and pitch shift in semitones, independently. */
export function processAudio(chs: Float32Array[], sr: number, tempo: number, semis: number): Float32Array[] {
  const p = Math.pow(2, semis / 12)
  const guide = chs.length === 1 ? chs[0] : chs[0].map((v, i) => (v + chs[1][i]) / 2)
  const stretched = wsola(chs, tempo / p, sr, guide)
  return Math.abs(p - 1) < 1e-6 ? stretched : stretched.map((c) => resample(c, p))
}

/** Min/max peaks of x[start, end) in n columns. */
export function peaks(x: Float32Array, start: number, end: number, n: number): [Float32Array, Float32Array] {
  const lo = new Float32Array(n), hi = new Float32Array(n)
  const span = Math.max(1, end - start)
  for (let c = 0; c < n; c++) {
    const a = start + Math.floor((c / n) * span), b = Math.max(a + 1, start + Math.floor(((c + 1) / n) * span))
    let mn = 0, mx = 0
    const stp = Math.max(1, Math.floor((b - a) / 64))
    for (let i = a; i < b && i < x.length; i += stp) { const v = x[i]; if (v < mn) mn = v; if (v > mx) mx = v }
    lo[c] = mn
    hi[c] = mx
  }
  return [lo, hi]
}

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

/** Dominant frequency estimate from zero crossings (for tests and the pitch readout). */
export function zcFreq(x: Float32Array, sr: number): number {
  let n = 0, first = -1, last = -1
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) { n++; if (first < 0) first = i; last = i }
  return n > 1 ? ((n - 1) * sr) / (last - first) : 0
}

// ---------- demo tune ----------
const MIDI = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

/** An original 8-bar riff at 96 BPM: plucked lead (Karplus-Strong), bass and hi-hats. Stereo. */
export function demoTune(sr: number): Float32Array[] {
  const bpm = 96
  const beat = 60 / bpm
  const bars = 8
  const len = Math.ceil(bars * 4 * beat * sr) + sr
  const L = new Float32Array(len), R = new Float32Array(len)
  let seed = 5
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
  const pluck = (t: number, midi: number, dur: number, gain: number, pan: number) => {
    const f = MIDI(midi)
    const P = Math.max(2, Math.round(sr / f))
    const buf = Float32Array.from({ length: P }, () => rnd())
    const s0 = Math.round(t * sr), n = Math.round(dur * sr)
    let idx = 0
    for (let i = 0; i < n && s0 + i < len; i++) {
      const a = buf[idx], b = buf[(idx + 1) % P]
      const v = (a + b) * 0.4985
      buf[idx] = v
      idx = (idx + 1) % P
      const env = i > n - 400 ? (n - i) / 400 : 1
      L[s0 + i] += a * gain * env * (1 - pan)
      R[s0 + i] += a * gain * env * (1 + pan)
    }
  }
  const bassNote = (t: number, midi: number, dur: number) => {
    const f = MIDI(midi), s0 = Math.round(t * sr), n = Math.round(dur * sr)
    for (let i = 0; i < n && s0 + i < len; i++) {
      const tt = i / sr
      const env = Math.min(1, tt * 200) * Math.exp(-tt * 3)
      const v = (Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(4 * Math.PI * f * tt)) * 0.28 * env
      L[s0 + i] += v
      R[s0 + i] += v
    }
  }
  const hat = (t: number, g: number) => {
    const s0 = Math.round(t * sr)
    let prev = 0
    for (let i = 0; i < 0.05 * sr && s0 + i < len; i++) {
      const w = rnd()
      const v = (w - prev) * g * Math.exp(-i / (0.012 * sr))
      prev = w
      L[s0 + i] += v * 0.8
      R[s0 + i] += v
    }
  }
  // chord roots per bar (A minor – F – C – G, twice); the lead arpeggiates the chord tones
  const roots = [45, 41, 48, 43, 45, 41, 48, 43]
  const minor = [true, false, false, false]
  const pattern: [number, number][] = [[0, 0], [0.5, 1], [1, 2], [1.5, 3], [2, 2], [2.5, 1], [3, 2], [3.5, 0]]
  for (let b = 0; b < bars; b++) {
    const t0 = b * 4 * beat
    bassNote(t0, roots[b], beat * 1.8)
    bassNote(t0 + 2 * beat, roots[b], beat * 1.8)
    for (let k = 0; k < 8; k++) hat(t0 + k * beat * 0.5, k % 2 ? 0.12 : 0.2)
    const tones = [0, minor[b % 4] ? 3 : 4, 7, 12].map((x) => roots[b] + 24 + x)
    pattern.forEach(([bt, deg], i) => pluck(t0 + bt * beat, tones[(deg + (b >= 4 && i === 7 ? 1 : 0)) % 4], beat * 0.9, 0.5, i % 2 ? 0.3 : -0.3))
  }
  let pk = 1e-9
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]))
  for (let i = 0; i < len; i++) { L[i] *= 0.85 / pk; R[i] *= 0.85 / pk }
  return [L, R]
}
