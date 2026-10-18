// Rectangular-room acoustics: mode frequencies (axial/tangential/oblique), Bonello 1/3-octave
// criterion, Schroeder frequency and a modal-sum estimate of the low-frequency response at a
// listening position for one or more (coherent) sources.

export type V3 = [number, number, number] // x along length, y along width, z height (metres)
export type ModeType = 'axial' | 'tangential' | 'oblique'
export interface Mode { n: V3; f: number; type: ModeType }

/** Speed of sound in air (m/s) at temperature °C. */
export const soundSpeed = (tC: number) => 331.3 * Math.sqrt(1 + tC / 273.15)

export const modeType = (n: V3): ModeType => {
  const k = n.filter((x) => x > 0).length
  return k === 1 ? 'axial' : k === 2 ? 'tangential' : 'oblique'
}

export const modeFreq = (n: V3, d: V3, c: number) => (c / 2) * Math.hypot(n[0] / d[0], n[1] / d[1], n[2] / d[2])

/** All modes up to fmax, sorted by frequency. */
export function modes(d: V3, fmax: number, c: number): Mode[] {
  const out: Mode[] = []
  const lim = d.map((L) => Math.floor((2 * L * fmax) / c))
  for (let i = 0; i <= lim[0]; i++)
    for (let j = 0; j <= lim[1]; j++)
      for (let k = 0; k <= lim[2]; k++) {
        if (!i && !j && !k) continue
        const n: V3 = [i, j, k]
        const f = modeFreq(n, d, c)
        if (f <= fmax) out.push({ n, f, type: modeType(n) })
      }
  return out.sort((a, b) => a.f - b.f)
}

/** Normalised pressure shape of a mode at a point (−1…1). */
export const shape = (n: V3, d: V3, p: V3) => Math.cos((n[0] * Math.PI * p[0]) / d[0]) * Math.cos((n[1] * Math.PI * p[1]) / d[1]) * Math.cos((n[2] * Math.PI * p[2]) / d[2])

/** Schroeder (transition) frequency, Hz: 2000·√(RT60 / V). */
export const schroeder = (rt60: number, volume: number) => 2000 * Math.sqrt(rt60 / volume)

export const THIRD_OCT = [16, 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315]

export interface Band { fc: number; lo: number; hi: number; count: number; coincident: number }
/** Modes per 1/3-octave band, with the number of exactly coincident (±0.5%) frequencies. */
export function bands(ms: Mode[], fmax = 200): Band[] {
  return THIRD_OCT.filter((fc) => fc <= fmax).map((fc) => {
    const lo = fc / 2 ** (1 / 6), hi = fc * 2 ** (1 / 6)
    const inB = ms.filter((m) => m.f >= lo && m.f < hi).map((m) => m.f)
    let coincident = 0
    for (let i = 1; i < inB.length; i++) if (Math.abs(inB[i] - inB[i - 1]) / inB[i] < 0.005) coincident++
    return { fc, lo, hi, count: inB.length, coincident }
  })
}

/**
 * Bonello: from the first populated band on, each band should hold at least as many modes as the
 * one below it, and coincident modes are tolerated only in bands with 5 or more modes.
 */
export function bonello(bs: Band[]): { pass: boolean; issues: string[] } {
  const issues: string[] = []
  const first = bs.findIndex((b) => b.count > 0)
  if (first < 0) return { pass: false, issues: ['No modes in range'] }
  for (let i = first + 1; i < bs.length; i++)
    if (bs[i].count < bs[i - 1].count) issues.push(`${bs[i].fc} Hz band has fewer modes (${bs[i].count}) than ${bs[i - 1].fc} Hz (${bs[i - 1].count})`)
  for (const b of bs) if (b.coincident > 0 && b.count < 5) issues.push(`Coincident modes in the ${b.fc} Hz band (only ${b.count} modes there)`)
  return { pass: issues.length === 0, issues }
}

/**
 * Relative SPL (dB) at `rcv` from sources driven in phase, via the modal sum
 *   p(f) ∝ Σ ψn(src)·ψn(rcv) / (Λn · (fn² − f² + j·f·fn/Qn)),  Qn = fn / (2.2/RT60).
 * Λn = εx·εy·εz with ε = 1 for a zero index and ½ otherwise (mode-shape normalisation).
 * Values are relative; the curve is shifted so its median over 20–200 Hz is 0 dB.
 */
export function response(d: V3, srcs: V3[], rcv: V3, c: number, rt60: number, freqs: number[]): number[] {
  const ms = modes(d, Math.max(...freqs) * 1.6, c)
  const bw = 2.2 / Math.max(0.05, rt60)
  const raw = freqs.map((f) => {
    let re = 0, im = 0
    // the (0,0,0) "mode" carries the pressure-chamber term that dominates at very low frequency
    for (const m of [{ n: [0, 0, 0] as V3, f: 0 }, ...ms]) {
      const lam = m.n.reduce((a, x) => a * (x ? 0.5 : 1), 1)
      const src = srcs.reduce((a, s) => a + shape(m.n, d, s), 0)
      const num = (src * shape(m.n, d, rcv)) / lam
      const a = m.f * m.f - f * f
      const b = f * Math.max(bw, 0.5)
      const den = a * a + b * b
      re += (num * a) / den
      im += (-num * b) / den
    }
    return 20 * Math.log10(Math.hypot(re, im) + 1e-12)
  })
  const sorted = [...raw].sort((a, b) => a - b)
  const med = sorted[Math.floor(sorted.length / 2)]
  return raw.map((v) => v - med)
}

export const logFreqs = (f0: number, f1: number, n: number) => Array.from({ length: n }, (_, i) => f0 * (f1 / f0) ** (i / (n - 1)))

/** Classic room-ratio presets (height : width : length). */
export const RATIOS: [string, number, number, number][] = [
  ['Sepmeyer A', 1, 1.14, 1.39],
  ['Sepmeyer B', 1, 1.28, 1.54],
  ['Sepmeyer C', 1, 1.6, 2.33],
  ['Louden', 1, 1.4, 1.9],
  ['Golden', 1, 1.618, 2.618],
]

/** Axial-mode spacing problems: adjacent axial modes closer than 5 % or further than 20 Hz apart (below fmax). */
export function axialIssues(ms: Mode[], fmax: number): { gaps: [number, number][]; clusters: [number, number][] } {
  const ax = ms.filter((m) => m.type === 'axial' && m.f <= fmax).map((m) => m.f)
  const gaps: [number, number][] = [], clusters: [number, number][] = []
  for (let i = 1; i < ax.length; i++) {
    if (ax[i] - ax[i - 1] > 20) gaps.push([ax[i - 1], ax[i]])
    if ((ax[i] - ax[i - 1]) / ax[i] < 0.05) clusters.push([ax[i - 1], ax[i]])
  }
  return { gaps, clusters }
}
