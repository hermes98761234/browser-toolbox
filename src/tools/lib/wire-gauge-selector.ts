// Conductor sizing per NEC Table 310.16 (≤ 2000 V, ≤ 3 current-carrying conductors, 30 °C ambient)
// with ambient temperature correction (310.15(B)(1)), raceway fill adjustment (310.15(C)(1)),
// small-conductor limits (240.4(D)), continuous-load 125 % rule and voltage drop (Chapter 9 Table 8).

export type Material = 'cu' | 'al'
export type Rating = 60 | 75 | 90

export interface Gauge {
  size: string
  mm2: number
  cu: [number, number, number] // ampacity at 60/75/90 °C
  al: [number, number, number] | null
  rCu: number // DC resistance Ω per 1000 ft at 75 °C, uncoated copper
  rAl: number
}

// prettier-ignore
export const GAUGES: Gauge[] = ([
  ['14 AWG', 2.08, [15, 20, 25], null, 3.07, 5.06],
  ['12 AWG', 3.31, [20, 25, 30], [15, 20, 25], 1.93, 3.18],
  ['10 AWG', 5.26, [30, 35, 40], [25, 30, 35], 1.21, 2.0],
  ['8 AWG', 8.37, [40, 50, 55], [35, 40, 45], 0.764, 1.26],
  ['6 AWG', 13.3, [55, 65, 75], [40, 50, 55], 0.491, 0.808],
  ['4 AWG', 21.2, [70, 85, 95], [55, 65, 75], 0.308, 0.508],
  ['3 AWG', 26.7, [85, 100, 115], [65, 75, 85], 0.245, 0.403],
  ['2 AWG', 33.6, [95, 115, 130], [75, 90, 100], 0.194, 0.319],
  ['1 AWG', 42.4, [110, 130, 145], [85, 100, 115], 0.154, 0.253],
  ['1/0 AWG', 53.5, [125, 150, 170], [100, 120, 135], 0.122, 0.201],
  ['2/0 AWG', 67.4, [145, 175, 195], [115, 135, 150], 0.0967, 0.159],
  ['3/0 AWG', 85.0, [165, 200, 225], [130, 155, 175], 0.0766, 0.126],
  ['4/0 AWG', 107.2, [195, 230, 260], [150, 180, 205], 0.0608, 0.1],
  ['250 kcmil', 127, [215, 255, 290], [170, 205, 230], 0.0515, 0.0847],
  ['300 kcmil', 152, [240, 285, 320], [195, 230, 260], 0.0429, 0.0707],
  ['350 kcmil', 177, [260, 310, 350], [210, 250, 280], 0.0367, 0.0605],
  ['400 kcmil', 203, [280, 335, 380], [225, 270, 305], 0.0321, 0.0529],
  ['500 kcmil', 253, [320, 380, 430], [260, 310, 350], 0.0258, 0.0424],
  ['600 kcmil', 304, [350, 420, 475], [285, 340, 385], 0.0214, 0.0353],
  ['750 kcmil', 380, [400, 475, 535], [320, 385, 435], 0.0171, 0.0282],
] as const).map(([size, mm2, cu, al, rCu, rAl]) => ({ size, mm2, cu: [...cu] as [number, number, number], al: al ? ([...al] as [number, number, number]) : null, rCu, rAl }))

// Table 310.15(B)(1): [max ambient °C, f60, f75, f90] (0 = not permitted)
// prettier-ignore
const TEMP: [number, number, number, number][] = [
  [10, 1.29, 1.2, 1.15], [15, 1.22, 1.15, 1.12], [20, 1.15, 1.11, 1.08], [25, 1.08, 1.05, 1.04], [30, 1, 1, 1],
  [35, 0.91, 0.94, 0.96], [40, 0.82, 0.88, 0.91], [45, 0.71, 0.82, 0.87], [50, 0.58, 0.75, 0.82], [55, 0.41, 0.67, 0.76],
  [60, 0, 0.58, 0.71], [65, 0, 0.47, 0.65], [70, 0, 0.33, 0.58], [75, 0, 0, 0.5], [80, 0, 0, 0.41], [85, 0, 0, 0.29],
]

const col = (r: Rating) => (r === 60 ? 0 : r === 75 ? 1 : 2)

export function tempFactor(ambientC: number, rating: Rating): number {
  const row = TEMP.find((t) => ambientC <= t[0])
  return row ? row[1 + col(rating)] : 0
}

/** Adjustment factor for more than three current-carrying conductors in a raceway or cable. */
export function fillFactor(n: number): number {
  if (n <= 3) return 1
  if (n <= 6) return 0.8
  if (n <= 9) return 0.7
  if (n <= 20) return 0.5
  if (n <= 30) return 0.45
  if (n <= 40) return 0.4
  return 0.35
}

export const STANDARD_OCPD = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800]
export const nextStd = (a: number) => STANDARD_OCPD.find((s) => s >= a - 1e-9) ?? NaN

/** 240.4(D) maximum overcurrent device for small conductors. */
export function smallMax(size: string, m: Material): number {
  const t: Record<string, [number, number]> = { '14 AWG': [15, 0], '12 AWG': [20, 15], '10 AWG': [30, 25] }
  const v = t[size]
  return v ? (m === 'cu' ? v[0] : v[1]) || NaN : Infinity
}

export interface Inputs {
  amps: number
  continuous: boolean
  material: Material
  insulation: Rating
  terminal: Rating
  ambientC: number
  conductors: number
  volts: number
  phase: 1 | 3
  lengthFt: number
  maxDrop: number // %
}

export interface Row {
  g: Gauge
  base: number
  derated: number
  terminalAmp: number
  drop: number // volts
  dropPct: number
  ok: boolean
  okAmpacity: boolean
  okDrop: boolean
  reason: string
}

export function evaluate(x: Inputs) {
  const fT = tempFactor(x.ambientC, x.insulation)
  const fN = fillFactor(x.conductors)
  const design = x.amps * (x.continuous ? 1.25 : 1)
  const ocpd = nextStd(design)
  const rows: Row[] = []
  for (const g of GAUGES) {
    const tbl = x.material === 'cu' ? g.cu : g.al
    if (!tbl) continue
    const base = tbl[col(x.insulation)]
    const derated = base * fT * fN
    const terminalAmp = tbl[col(Math.min(x.terminal, x.insulation) as Rating)]
    const R = x.material === 'cu' ? g.rCu : g.rAl
    const drop = ((x.phase === 3 ? Math.sqrt(3) : 2) * x.lengthFt * R * x.amps) / 1000
    const dropPct = (drop / (x.volts || 1)) * 100
    const reasons: string[] = []
    if (derated < x.amps) reasons.push(`derated ${derated.toFixed(1)} A < load`)
    if (terminalAmp < design) reasons.push(`terminal ${terminalAmp} A < ${design.toFixed(1)} A`)
    // the conductor must be protected by the breaker (240.4(B) next size up allowed up to 800 A)
    if (Number.isFinite(ocpd) && nextStd(Math.min(derated, terminalAmp)) < ocpd) reasons.push(`not protected by ${ocpd} A breaker`)
    const sm = smallMax(g.size, x.material)
    if (sm < ocpd || Number.isNaN(sm)) reasons.push(Number.isNaN(sm) ? 'not permitted' : `240.4(D) limits to ${sm} A`)
    const okAmpacity = reasons.length === 0
    const okDrop = dropPct <= x.maxDrop
    if (!okDrop) reasons.push(`drop ${dropPct.toFixed(1)}% > ${x.maxDrop}%`)
    rows.push({ g, base, derated, terminalAmp, drop, dropPct, ok: okAmpacity && okDrop, okAmpacity, okDrop, reason: reasons.join('; ') })
  }
  const forAmpacity = rows.find((r) => r.okAmpacity) ?? null
  const pick = rows.find((r) => r.ok) ?? null
  return { fT, fN, design, ocpd, rows, forAmpacity, pick }
}
