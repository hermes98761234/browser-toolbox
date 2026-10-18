// Pure helpers for the polyphonic synth: tuning, MIDI message parsing, computer-keyboard mapping,
// unison spread, envelope shapes, reverb impulse and the built-in patches.

export type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square'
export interface Patch {
  waveA: Wave
  waveB: Wave
  semiB: number // osc B transpose, semitones
  fineB: number // cents
  mixB: number // 0..1
  unison: number // voices per oscillator, 1..7
  spread: number // total unison detune, cents
  a: number; d: number; s: number; r: number // amp envelope (s, level 0..1)
  ftype: 'lowpass' | 'highpass' | 'bandpass'
  cutoff: number // Hz
  q: number
  famt: number // filter-envelope amount, octaves (may be negative)
  fa: number; fd: number; fs: number; fr: number
  lfoRate: number // Hz
  lfoDepth: number // 0..1
  lfoTarget: 'pitch' | 'filter' | 'amp'
  delayTime: number // s
  delayFb: number // 0..0.9
  delayMix: number // 0..1
  revSize: number // s
  revMix: number // 0..1
  velSens: number // 0..1
  volume: number // 0..1
}

const base: Patch = {
  waveA: 'sawtooth', waveB: 'square', semiB: -12, fineB: 4, mixB: 0.35, unison: 3, spread: 18,
  a: 0.01, d: 0.3, s: 0.6, r: 0.35, ftype: 'lowpass', cutoff: 1800, q: 2, famt: 2, fa: 0.01, fd: 0.35, fs: 0.3, fr: 0.4,
  lfoRate: 5, lfoDepth: 0, lfoTarget: 'pitch', delayTime: 0.3, delayFb: 0.3, delayMix: 0.15, revSize: 2, revMix: 0.2, velSens: 0.6, volume: 0.7,
}

export const PRESETS: Record<string, Patch> = {
  'Warm pad': { ...base, waveA: 'sawtooth', waveB: 'triangle', semiB: 12, mixB: 0.3, unison: 5, spread: 28, a: 0.9, d: 1, s: 0.8, r: 1.8, cutoff: 900, q: 1, famt: 1.2, fa: 1.2, fd: 1.5, fs: 0.6, fr: 1.5, lfoRate: 0.3, lfoDepth: 0.35, lfoTarget: 'filter', revMix: 0.45, revSize: 3.5, delayMix: 0.1 },
  'Supersaw lead': { ...base, waveA: 'sawtooth', waveB: 'sawtooth', semiB: 0, fineB: 7, mixB: 0.5, unison: 7, spread: 40, a: 0.005, d: 0.2, s: 0.85, r: 0.25, cutoff: 3200, q: 3, famt: 1.5, fd: 0.25, fs: 0.5, lfoRate: 5.5, lfoDepth: 0.12, lfoTarget: 'pitch', delayMix: 0.25, delayTime: 0.375, delayFb: 0.35 },
  Pluck: { ...base, waveA: 'square', waveB: 'sawtooth', semiB: 12, mixB: 0.25, unison: 2, spread: 10, a: 0.002, d: 0.35, s: 0, r: 0.3, cutoff: 500, q: 6, famt: 3.5, fa: 0.001, fd: 0.18, fs: 0, fr: 0.2, delayMix: 0.3, delayTime: 0.25, delayFb: 0.4, revMix: 0.25 },
  'Sub bass': { ...base, waveA: 'sawtooth', waveB: 'sine', semiB: -12, fineB: 0, mixB: 0.6, unison: 1, spread: 0, a: 0.004, d: 0.25, s: 0.7, r: 0.12, cutoff: 380, q: 4, famt: 1.8, fa: 0.002, fd: 0.2, fs: 0.2, fr: 0.1, delayMix: 0, revMix: 0.05 },
  'E-piano': { ...base, waveA: 'sine', waveB: 'triangle', semiB: 12, fineB: 2, mixB: 0.25, unison: 2, spread: 6, a: 0.003, d: 1.4, s: 0.15, r: 0.5, cutoff: 4500, q: 0.7, famt: 0.8, fd: 0.6, fs: 0.2, lfoRate: 4.5, lfoDepth: 0.25, lfoTarget: 'amp', revMix: 0.25, delayMix: 0.08 },
  Brass: { ...base, waveA: 'sawtooth', waveB: 'sawtooth', semiB: 0, fineB: -6, mixB: 0.45, unison: 2, spread: 12, a: 0.07, d: 0.3, s: 0.75, r: 0.2, cutoff: 700, q: 1.5, famt: 2.2, fa: 0.08, fd: 0.4, fs: 0.45, lfoRate: 5, lfoDepth: 0.08, lfoTarget: 'pitch' },
  Organ: { ...base, waveA: 'sine', waveB: 'square', semiB: 12, fineB: 0, mixB: 0.2, unison: 1, spread: 0, a: 0.005, d: 0.05, s: 1, r: 0.06, ftype: 'lowpass', cutoff: 5000, q: 0.5, famt: 0, lfoRate: 6.5, lfoDepth: 0.3, lfoTarget: 'amp', revMix: 0.3, delayMix: 0 },
  Chiptune: { ...base, waveA: 'square', waveB: 'square', semiB: 12, fineB: 0, mixB: 0.15, unison: 1, spread: 0, a: 0.001, d: 0.1, s: 0.7, r: 0.05, cutoff: 12000, q: 0.5, famt: 0, lfoRate: 7, lfoDepth: 0.15, lfoTarget: 'pitch', delayMix: 0.2, delayTime: 0.15, delayFb: 0.25, revMix: 0.05 },
}

export const midiToFreq = (n: number, a4 = 440) => a4 * 2 ** ((n - 69) / 12)
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
export const noteName = (n: number) => `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
export const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12)

/** KeyboardEvent.code → semitone offset from the base C (layout-independent, two rows like a tracker). */
export const KEYMAP: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
}
/** Label printed on the on-screen key for a semitone offset (lower row wins). */
export const keyLabel = (off: number) => {
  const hit = Object.entries(KEYMAP).find(([, v]) => v === off)
  return hit ? hit[0].replace(/^Key|^Digit/, '').replace('Comma', ',').replace('Period', '.').replace('Semicolon', ';').replace('Slash', '/') : ''
}

export type MidiMsg =
  | { type: 'on'; ch: number; note: number; vel: number }
  | { type: 'off'; ch: number; note: number }
  | { type: 'cc'; ch: number; cc: number; value: number }
  | { type: 'bend'; ch: number; value: number }
  | { type: 'other' }

/** Parses one channel-voice MIDI message. Note-on with velocity 0 is a note-off; bend is −1..+1. */
export function parseMidi(d: ArrayLike<number>): MidiMsg {
  if (!d || d.length < 2) return { type: 'other' }
  const st = d[0] & 0xf0, ch = d[0] & 0x0f
  if (st === 0x90 && d[2] > 0) return { type: 'on', ch, note: d[1], vel: d[2] / 127 }
  if (st === 0x80 || st === 0x90) return { type: 'off', ch, note: d[1] }
  if (st === 0xb0) return { type: 'cc', ch, cc: d[1], value: d[2] / 127 }
  if (st === 0xe0) return { type: 'bend', ch, value: Math.max(-1, (((d[2] << 7) | d[1]) - 8192) / 8191) }
  return { type: 'other' }
}

/** Symmetric detune offsets (cents) for n unison voices spread over `spread` cents in total. */
export function unisonDetunes(n: number, spread: number): number[] {
  const k = Math.max(1, Math.round(n))
  if (k === 1) return [0]
  return Array.from({ length: k }, (_, i) => -spread / 2 + (spread * i) / (k - 1))
}

/** Polyline of an ADSR (time, level) with a fixed sustain hold, for drawing. */
export function adsrPoints(a: number, d: number, s: number, r: number, hold = 0.5): [number, number][] {
  const pts: [number, number][] = [[0, 0], [a, 1]]
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    const t = (d * i) / steps
    pts.push([a + t, s + (1 - s) * Math.exp((-3 * t) / Math.max(1e-3, d))])
  }
  const end = a + d + hold
  pts.push([end, s])
  for (let i = 1; i <= steps; i++) {
    const t = (r * i) / steps
    pts.push([end + t, s * Math.exp((-3 * t) / Math.max(1e-3, r))])
  }
  return pts
}

/** Stereo reverb impulse: decorrelated noise with an exponential decay over `seconds`. */
export function impulse(seconds: number, rate: number, seed = 1): Float32Array[] {
  const n = Math.max(1, Math.round(seconds * rate))
  let x = seed >>> 0 || 1
  const rnd = () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return ((x >>> 0) / 4294967296) * 2 - 1
  }
  return [0, 1].map(() => {
    const c = new Float32Array(n)
    for (let i = 0; i < n; i++) c[i] = rnd() * Math.pow(1 - i / n, 3) * Math.exp((-3 * i) / n)
    return c
  })
}
