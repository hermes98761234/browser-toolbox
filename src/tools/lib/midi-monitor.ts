// MIDI 1.0 message decoding.

export type MsgType = 'noteon' | 'noteoff' | 'cc' | 'pitch' | 'program' | 'chanpress' | 'polypress' | 'sysex' | 'clock' | 'transport' | 'system'

export interface Decoded {
  type: MsgType
  channel: number | null // 1–16
  summary: string
  note?: number
  velocity?: number
  cc?: number
  value?: number
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
/** Note name with middle C (60) = C4. */
export const noteName = (n: number) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`
/** Equal-tempered frequency, A4 (69) = 440 Hz. */
export const noteFreq = (n: number, a4 = 440) => a4 * Math.pow(2, (n - 69) / 12)

const CC: Record<number, string> = {
  0: 'Bank Select MSB', 1: 'Mod Wheel', 2: 'Breath', 4: 'Foot', 5: 'Portamento Time', 6: 'Data Entry MSB', 7: 'Volume', 8: 'Balance', 10: 'Pan', 11: 'Expression',
  32: 'Bank Select LSB', 64: 'Sustain', 65: 'Portamento', 66: 'Sostenuto', 67: 'Soft Pedal', 71: 'Resonance', 72: 'Release', 73: 'Attack', 74: 'Cutoff',
  91: 'Reverb', 93: 'Chorus', 98: 'NRPN LSB', 99: 'NRPN MSB', 100: 'RPN LSB', 101: 'RPN MSB', 120: 'All Sound Off', 121: 'Reset All Controllers', 123: 'All Notes Off',
}
export const ccName = (n: number) => CC[n] ?? `CC ${n}`

/** 14-bit pitch bend, centred: −8192 … +8191. */
export const pitchBend = (lsb: number, msb: number) => ((msb << 7) | lsb) - 8192

const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0')
export const toHex = (d: ArrayLike<number>) => Array.from(d, hex).join(' ')

export function decode(d: ArrayLike<number>): Decoded {
  const st = d[0] ?? 0
  if (st >= 0xf0) {
    if (st === 0xf0) return { type: 'sysex', channel: null, summary: `SysEx ${d.length} bytes${d.length > 1 ? ` · manufacturer ${hex(d[1])}` : ''}` }
    if (st === 0xf8) return { type: 'clock', channel: null, summary: 'Timing Clock' }
    if (st === 0xfe) return { type: 'clock', channel: null, summary: 'Active Sensing' }
    if (st === 0xfa) return { type: 'transport', channel: null, summary: 'Start' }
    if (st === 0xfb) return { type: 'transport', channel: null, summary: 'Continue' }
    if (st === 0xfc) return { type: 'transport', channel: null, summary: 'Stop' }
    if (st === 0xf2) return { type: 'transport', channel: null, summary: `Song Position ${((d[2] << 7) | d[1])} sixteenths` }
    if (st === 0xf1) return { type: 'system', channel: null, summary: `MTC Quarter Frame ${hex(d[1] ?? 0)}` }
    if (st === 0xff) return { type: 'system', channel: null, summary: 'System Reset' }
    return { type: 'system', channel: null, summary: `System ${hex(st)}` }
  }
  const ch = (st & 0x0f) + 1
  const a = d[1] ?? 0, b = d[2] ?? 0
  switch (st & 0xf0) {
    case 0x90:
      if (b === 0) return { type: 'noteoff', channel: ch, note: a, velocity: 0, summary: `Note Off ${noteName(a)} (${a}) vel 0` }
      return { type: 'noteon', channel: ch, note: a, velocity: b, summary: `Note On ${noteName(a)} (${a}) vel ${b}` }
    case 0x80: return { type: 'noteoff', channel: ch, note: a, velocity: b, summary: `Note Off ${noteName(a)} (${a}) vel ${b}` }
    case 0xa0: return { type: 'polypress', channel: ch, note: a, value: b, summary: `Poly Aftertouch ${noteName(a)} = ${b}` }
    case 0xb0: return { type: 'cc', channel: ch, cc: a, value: b, summary: `CC ${a} ${ccName(a)} = ${b}${a >= 64 && a <= 69 ? (b >= 64 ? ' (on)' : ' (off)') : ''}` }
    case 0xc0: return { type: 'program', channel: ch, value: a, summary: `Program Change ${a + 1}` }
    case 0xd0: return { type: 'chanpress', channel: ch, value: a, summary: `Channel Aftertouch ${a}` }
    default: {
      const v = pitchBend(a, b)
      return { type: 'pitch', channel: ch, value: v, summary: `Pitch Bend ${v > 0 ? '+' : ''}${v} (${((v / 8192) * 2).toFixed(2)} st @ ±2)` }
    }
  }
}
