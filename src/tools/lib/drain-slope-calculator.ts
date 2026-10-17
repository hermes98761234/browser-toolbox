// Drain pipe slope: unit conversions, invert elevations along runs, code minimums and Manning full-flow capacity.

export type SlopeUnit = 'inft' | 'pct' | 'ratio' | 'mmm' | 'deg'
export const SLOPE_UNITS: [SlopeUnit, string][] = [['inft', 'in per ft'], ['pct', '%'], ['ratio', '1 : X'], ['mmm', 'mm per m'], ['deg', 'degrees']]

/** Slope as rise/run fraction from a value in `u`. */
export function toFrac(v: number, u: SlopeUnit): number {
  switch (u) {
    case 'inft': return v / 12
    case 'pct': return v / 100
    case 'ratio': return v > 0 ? 1 / v : 0
    case 'mmm': return v / 1000
    case 'deg': return Math.tan((v * Math.PI) / 180)
  }
}
export function fromFrac(s: number, u: SlopeUnit): number {
  switch (u) {
    case 'inft': return s * 12
    case 'pct': return s * 100
    case 'ratio': return s > 0 ? 1 / s : Infinity
    case 'mmm': return s * 1000
    case 'deg': return (Math.atan(s) * 180) / Math.PI
  }
}

/** Nearest common fraction of an inch (for in/ft display), e.g. 0.25 → "1/4". */
export function inchFraction(x: number): string {
  const whole = Math.floor(x + 1e-9)
  const rest = x - whole
  const n = Math.round(rest * 16)
  if (n === 0) return `${whole}`
  if (n === 16) return `${whole + 1}`
  let num = n, den = 16
  while (num % 2 === 0) { num /= 2; den /= 2 }
  return `${whole ? whole + ' ' : ''}${num}/${den}`
}

export interface Seg { length: number; slope: number }
export interface Node { x: number; invert: number }

/** Invert elevations at every node, falling downstream from `start`. */
export function inverts(start: number, segs: Seg[]): Node[] {
  const out: Node[] = [{ x: 0, invert: start }]
  for (const s of segs) {
    const p = out[out.length - 1]
    out.push({ x: p.x + s.length, invert: p.invert - s.length * s.slope })
  }
  return out
}

/** Minimum slope by IPC/UPC table 704.1 (pipe Ø in inches). */
export function minSlopeIPC(dIn: number): number {
  if (dIn <= 2.5) return 0.25 / 12
  if (dIn <= 6) return 0.125 / 12
  return 0.0625 / 12
}

/** Manning full-pipe flow (SI): returns Q [m³/s] and V [m/s] for diameter D [m], slope s, roughness n. */
export function manningFull(D: number, s: number, n: number): { Q: number; V: number } {
  if (!(D > 0) || !(s > 0) || !(n > 0)) return { Q: 0, V: 0 }
  const A = (Math.PI * D * D) / 4
  const R = D / 4
  const V = (1 / n) * R ** (2 / 3) * Math.sqrt(s)
  return { Q: V * A, V }
}

export const ROUGHNESS: [string, number][] = [['PVC / HDPE (smooth)', 0.009], ['Cast iron', 0.013], ['Concrete', 0.013], ['Clay / vitrified', 0.014], ['Corrugated metal', 0.024], ['Corrugated plastic (single wall)', 0.016]]
