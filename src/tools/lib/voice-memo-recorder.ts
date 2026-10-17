// Recording-quality analysis for voice memos + a deterministic synthetic "voice" for the demo.
import { toDb } from './audio-trimmer'

export interface Quality {
  peakDb: number
  rmsDb: number // RMS of speech frames
  noiseDb: number // noise floor (10th percentile of frame RMS)
  snrDb: number
  clipPct: number // % of samples at/above 0.999
  speechPct: number // % of frames ≥ noise + 10 dB
}

/** RMS per frame of `frameMs` milliseconds (mono mix). */
export function frameRms(ch: Float32Array[], rate: number, frameMs = 50): number[] {
  const n = ch[0]?.length ?? 0
  const f = Math.max(1, Math.round((rate * frameMs) / 1000))
  const out: number[] = []
  for (let a = 0; a < n; a += f) {
    const b = Math.min(n, a + f)
    let s = 0
    for (let i = a; i < b; i++) {
      let v = 0
      for (const c of ch) v += c[i]
      v /= ch.length
      s += v * v
    }
    out.push(Math.sqrt(s / (b - a)))
  }
  return out
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const k = (s.length - 1) * p
  const lo = Math.floor(k), hi = Math.ceil(k)
  return s[lo] + (s[hi] - s[lo]) * (k - lo)
}

export function analyze(ch: Float32Array[], rate: number): Quality {
  const fr = frameRms(ch, rate)
  let peak = 0, clip = 0, total = 0
  for (const c of ch) {
    for (let i = 0; i < c.length; i++) {
      const a = Math.abs(c[i])
      if (a > peak) peak = a
      if (a >= 0.999) clip++
    }
    total += c.length
  }
  const noise = Math.max(1e-5, percentile(fr, 0.1))
  const speech = fr.filter((r) => r >= noise * Math.SQRT2 * Math.sqrt(5)) // ≥ noise + 10 dB
  const sp = speech.length ? Math.sqrt(speech.reduce((a, r) => a + r * r, 0) / speech.length) : 0
  return {
    peakDb: toDb(peak),
    rmsDb: toDb(sp),
    noiseDb: toDb(noise),
    snrDb: sp ? toDb(sp) - toDb(noise) : 0,
    clipPct: total ? (clip / total) * 100 : 0,
    speechPct: fr.length ? (speech.length / fr.length) * 100 : 0,
  }
}

export type Tone = 'ok' | 'warn' | 'err'
/** Human tips for a recording. */
export function verdict(q: Quality): [Tone, string][] {
  const out: [Tone, string][] = []
  if (q.clipPct > 0.01) out.push(['err', `Clipping on ${q.clipPct.toFixed(2)}% of samples — lower the input gain or move back from the mic.`])
  else if (q.peakDb > -1) out.push(['warn', 'Peaks touch 0 dBFS — very close to clipping.'])
  if (q.rmsDb < -38) out.push(['warn', `Speech is quiet (${q.rmsDb.toFixed(0)} dBFS RMS). Move closer or raise the gain; aim for −24 to −16 dBFS.`])
  else if (q.rmsDb > -10) out.push(['warn', 'Speech is very loud; it may sound distorted.'])
  if (q.snrDb < 15) out.push(['err', `Low signal-to-noise (${q.snrDb.toFixed(0)} dB). Turn on noise suppression or find a quieter room.`])
  else if (q.snrDb < 25) out.push(['warn', `Some background noise (SNR ${q.snrDb.toFixed(0)} dB). Fine for notes, not for publishing.`])
  if (q.noiseDb > -45) out.push(['warn', `Noise floor is high (${q.noiseDb.toFixed(0)} dBFS): fans, traffic or hum.`])
  if (!out.length) out.push(['ok', `Clean recording: SNR ${q.snrDb.toFixed(0)} dB, speech at ${q.rmsDb.toFixed(0)} dBFS, no clipping.`])
  return out
}

/** Live meter values from an analyser time-domain buffer. */
export function level(buf: Float32Array): { rms: number; peak: number } {
  let s = 0, p = 0
  for (let i = 0; i < buf.length; i++) {
    s += buf[i] * buf[i]
    p = Math.max(p, Math.abs(buf[i]))
  }
  return { rms: buf.length ? Math.sqrt(s / buf.length) : 0, peak: p }
}

/** Maps dBFS (−60…0) to 0…1 for a meter. */
export const meterPos = (db: number, floor = -60) => (Number.isFinite(db) ? Math.min(1, Math.max(0, (db - floor) / -floor)) : 0)

/** Deterministic voice-like signal: harmonic "syllables" with pauses and a quiet noise bed. */
export function synthVoice(rate: number, seconds: number, seed = 1, noiseDb = -52): Float32Array {
  const n = Math.round(rate * seconds)
  const out = new Float32Array(n)
  let r = seed
  const rnd = () => ((r = (r * 48271) % 2147483647) / 2147483647)
  const noiseAmp = Math.pow(10, noiseDb / 20) * Math.sqrt(3)
  // syllable plan: [start, length, pitch]
  const syl: [number, number, number][] = []
  let t = 0.9
  while (t < seconds - 1) {
    const words = 2 + Math.floor(rnd() * 4)
    for (let w = 0; w < words && t < seconds - 1; w++) {
      const len = 0.12 + rnd() * 0.2
      syl.push([t, len, 110 + rnd() * 70])
      t += len + 0.03 + rnd() * 0.05
    }
    t += 0.25 + rnd() * 0.45
  }
  let phase = 0
  for (let i = 0; i < n; i++) {
    const ts = i / rate
    out[i] = (rnd() * 2 - 1) * noiseAmp
    const s = syl.find(([a, l]) => ts >= a && ts < a + l)
    if (!s) continue
    const x = (ts - s[0]) / s[1]
    const env = Math.sin(Math.PI * x) ** 1.5
    const f0 = s[2] * (1 + 0.04 * Math.sin(2 * Math.PI * 5 * ts)) * (1.05 - 0.1 * x)
    phase += (2 * Math.PI * f0) / rate
    let v = 0
    for (let h = 1; h <= 12; h++) {
      const fh = f0 * h
      const formant = Math.exp(-(((fh - 600) / 350) ** 2)) + 0.6 * Math.exp(-(((fh - 1500) / 500) ** 2)) + 0.15
      v += (formant / h) * Math.sin(phase * h)
    }
    out[i] += 0.18 * env * v
  }
  return out
}

export function fmtDur(s: number): string {
  if (!Number.isFinite(s)) return '—'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export const parseTags = (s: string) => [...new Set(s.split(/[,#]/).map((t) => t.trim().toLowerCase()).filter(Boolean))]
