// Pure audio helpers for the Audio Trimmer: trimming, fades, gain, silence detection, WAV encoding.

export type Curve = 'linear' | 'equal-power' | 'exponential'

/** Fade gain for progress t in [0,1] (0 = silent, 1 = full). */
export function fadeGain(t: number, curve: Curve): number {
  const x = Math.min(1, Math.max(0, t))
  if (curve === 'equal-power') return Math.sin((x * Math.PI) / 2)
  if (curve === 'exponential') return x * x * x
  return x
}

export interface TrimOpts {
  start: number // seconds
  end: number // seconds
  fadeIn: number // seconds
  fadeOut: number // seconds
  curve: Curve
  gainDb: number
}

/** Cuts [start,end), applies fades and gain. Returns new channel arrays. */
export function render(channels: Float32Array[], rate: number, o: TrimOpts): Float32Array[] {
  const len = channels[0]?.length ?? 0
  const a = Math.max(0, Math.min(len, Math.round(o.start * rate)))
  const b = Math.max(a, Math.min(len, Math.round(o.end * rate)))
  const n = b - a
  const fi = Math.min(n, Math.round(o.fadeIn * rate))
  const fo = Math.min(n, Math.round(o.fadeOut * rate))
  const g = Math.pow(10, o.gainDb / 20)
  return channels.map((ch) => {
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      let k = g
      if (fi > 0 && i < fi) k *= fadeGain(i / fi, o.curve)
      if (fo > 0 && i >= n - fo) k *= fadeGain((n - 1 - i) / fo, o.curve)
      out[i] = ch[a + i] * k
    }
    return out
  })
}

export function peak(channels: Float32Array[]): number {
  let p = 0
  for (const ch of channels) for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]))
  return p
}

export function rms(channels: Float32Array[]): number {
  let s = 0, n = 0
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i]
    n += ch.length
  }
  return n ? Math.sqrt(s / n) : 0
}

export const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity)

/** Gain (dB) that brings the peak of [start,end) to `target` dBFS. */
export function normalizeGain(channels: Float32Array[], rate: number, start: number, end: number, target = -1): number {
  const a = Math.round(start * rate), b = Math.round(end * rate)
  const p = peak(channels.map((c) => c.subarray(a, b)))
  return p > 0 ? target - toDb(p) : 0
}

/** First/last time where any channel exceeds `thresholdDb`, padded by `pad` seconds. */
export function detectSound(channels: Float32Array[], rate: number, thresholdDb = -40, pad = 0.05): [number, number] {
  const th = Math.pow(10, thresholdDb / 20)
  const len = channels[0]?.length ?? 0
  let first = -1, last = -1
  for (let i = 0; i < len; i++) {
    let loud = false
    for (const ch of channels) if (Math.abs(ch[i]) > th) loud = true
    if (loud) {
      if (first < 0) first = i
      last = i
    }
  }
  if (first < 0) return [0, len / rate]
  return [Math.max(0, first / rate - pad), Math.min(len / rate, (last + 1) / rate + pad)]
}

/** Min/max pairs per pixel column for waveform drawing (mixed down). */
export function peaks(channels: Float32Array[], cols: number, from = 0, to = channels[0]?.length ?? 0): [number, number][] {
  const out: [number, number][] = []
  const span = Math.max(1, to - from)
  for (let c = 0; c < cols; c++) {
    const a = from + Math.floor((c * span) / cols)
    const b = Math.max(a + 1, from + Math.floor(((c + 1) * span) / cols))
    let mn = 0, mx = 0
    const step = Math.max(1, Math.floor((b - a) / 400))
    for (let i = a; i < b; i += step) {
      let v = 0
      for (const ch of channels) v += ch[i] ?? 0
      v /= channels.length || 1
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    out.push([mn, mx])
  }
  return out
}

/** 16-bit PCM WAV file (interleaved). */
export function encodeWav(channels: Float32Array[], rate: number): Uint8Array {
  const nc = channels.length, n = channels[0]?.length ?? 0
  const data = n * nc * 2
  const buf = new ArrayBuffer(44 + data)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + data, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, nc, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * nc * 2, true)
  v.setUint16(32, nc * 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, data, true)
  let o = 44
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nc; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      v.setInt16(o, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true)
      o += 2
    }
  return new Uint8Array(buf)
}

export function fmtTime(t: number, ms = true): string {
  if (!Number.isFinite(t)) return '—'
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${(ms ? s.toFixed(2) : Math.floor(s).toString()).padStart(ms ? 5 : 2, '0')}`
}

/** Parses "m:ss.xx" or plain seconds. */
export function parseTime(s: string): number {
  const p = s.trim().split(':').map(Number)
  if (p.some((x) => !Number.isFinite(x))) return NaN
  return p.reduce((a, x) => a * 60 + x, 0)
}
