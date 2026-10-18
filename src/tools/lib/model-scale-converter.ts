// Model scale conversions. Internally everything is in millimetres; a scale 1:N means model = real / N.

export const UNITS = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 } as const
export type Unit = keyof typeof UNITS

export interface Scale { n: number; name: string; group: string }
export const SCALES: Scale[] = [
  { n: 220, name: 'Z gauge', group: 'Railway' }, { n: 160, name: 'N gauge', group: 'Railway' }, { n: 120, name: 'TT gauge', group: 'Railway' },
  { n: 87, name: 'H0 / HO', group: 'Railway' }, { n: 76.2, name: 'OO (UK)', group: 'Railway' }, { n: 64, name: 'S gauge', group: 'Railway' },
  { n: 48, name: 'O (US) / 1:48 aircraft', group: 'Railway' }, { n: 43.5, name: 'O (UK) / 1:43 cars', group: 'Railway' }, { n: 22.5, name: 'G (LGB)', group: 'Railway' },
  { n: 35, name: '1:35 military', group: 'Military & figures' }, { n: 72, name: '1:72 aircraft & armour', group: 'Military & figures' }, { n: 144, name: '1:144 aircraft', group: 'Military & figures' },
  { n: 32, name: '1:32 aircraft / 54 mm figures', group: 'Military & figures' }, { n: 6, name: '1:6 action figures', group: 'Military & figures' },
  { n: 18, name: '1:18 die-cast cars', group: 'Vehicles' }, { n: 24, name: '1:24 cars', group: 'Vehicles' }, { n: 43, name: '1:43 cars', group: 'Vehicles' }, { n: 64, name: '1:64 (Hot Wheels size)', group: 'Vehicles' },
  { n: 350, name: '1:350 ships', group: 'Ships' }, { n: 700, name: '1:700 waterline ships', group: 'Ships' }, { n: 200, name: '1:200 ships / airliners', group: 'Ships' },
  { n: 12, name: '1:12 dollhouse', group: 'Dollhouse' }, { n: 24, name: '1:24 half-scale dollhouse', group: 'Dollhouse' },
  { n: 50, name: '1:50 architecture', group: 'Architecture' }, { n: 100, name: '1:100 architecture', group: 'Architecture' }, { n: 200, name: '1:200 architecture', group: 'Architecture' }, { n: 500, name: '1:500 site plans', group: 'Architecture' },
]

export const toMm = (v: number, u: Unit) => v * UNITS[u]
export const fromMm = (mm: number, u: Unit) => mm / UNITS[u]
export const realToModel = (realMm: number, n: number) => realMm / n
export const modelToReal = (modelMm: number, n: number) => modelMm * n
/** Factor to resize a model from scale 1:a to 1:b (e.g. 1:72 → 1:48 = 1.5×). */
export const rescale = (a: number, b: number) => a / b

/** Parse "1:87", "1/87", "87" or "0.0115" (fraction) into N. */
export function parseScale(s: string): number | null {
  const t = s.trim()
  const m = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(t)
  if (m) { const a = +m[1], b = +m[2]; return a > 0 && b > 0 ? b / a : null }
  const v = Number(t)
  if (!Number.isFinite(v) || v <= 0) return null
  return v < 1 ? 1 / v : v
}

/** Nearest listed scale (by ratio, log distance). */
export function nearestScale(n: number): Scale {
  return SCALES.reduce((best, s) => (Math.abs(Math.log(s.n / n)) < Math.abs(Math.log(best.n / n)) ? s : best), SCALES[0])
}

/** Ruler ticks for a printed ruler at scale 1:n labelled in real-world `unit`. Returns positions in model mm. */
export function rulerTicks(n: number, unit: Unit, lengthMm: number): { pos: number; level: 0 | 1 | 2; label?: string }[] {
  const realPerMm = n / UNITS[unit] // real units per model mm
  const totalReal = lengthMm * realPerMm
  // choose a major step giving 6–20 labelled ticks
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000]
  const major = steps.find((st) => totalReal / st <= 20) ?? 5000
  const minor = major / 10
  const out: { pos: number; level: 0 | 1 | 2; label?: string }[] = []
  const count = Math.floor(totalReal / minor + 1e-9)
  for (let i = 0; i <= count; i++) {
    const real = i * minor
    const pos = real / realPerMm
    const isMajor = Math.abs(real / major - Math.round(real / major)) < 1e-6
    const isHalf = !isMajor && Math.abs((real * 2) / major - Math.round((real * 2) / major)) < 1e-6
    out.push({ pos, level: isMajor ? 0 : isHalf ? 1 : 2, label: isMajor ? `${+real.toFixed(4)}` : undefined })
  }
  return out
}
