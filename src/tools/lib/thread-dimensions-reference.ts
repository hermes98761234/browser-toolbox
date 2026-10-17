// ISO metric (ISO 261/262/724, clearance ISO 273) and Unified inch (ASME B1.1) thread data with derived basic dimensions.

export interface Thread {
  id: string
  std: 'metric' | 'unified'
  series: string // 'coarse' | 'fine' | 'UNC' | 'UNF'
  name: string // M8 × 1.25, 1/4-20 UNC
  d: number // major diameter, mm
  p: number // pitch, mm
  tpi?: number
  clear: [number, number, number] // close / normal / loose clearance hole, mm
}

// [d, coarse pitch, fine pitches, ISO 273 fine / medium / coarse clearance]
const METRIC: [number, number, number[], number, number, number][] = [
  [1, 0.25, [0.2], 1.1, 1.2, 1.3], [1.2, 0.25, [0.2], 1.3, 1.4, 1.5], [1.4, 0.3, [0.2], 1.5, 1.6, 1.8], [1.6, 0.35, [0.2], 1.7, 1.8, 2],
  [2, 0.4, [0.25], 2.2, 2.4, 2.6], [2.5, 0.45, [0.35], 2.7, 2.9, 3.1], [3, 0.5, [0.35], 3.2, 3.4, 3.6], [3.5, 0.6, [0.35], 3.7, 3.9, 4.2],
  [4, 0.7, [0.5], 4.3, 4.5, 4.8], [5, 0.8, [0.5], 5.3, 5.5, 5.8], [6, 1, [0.75], 6.4, 6.6, 7], [8, 1.25, [1, 0.75], 8.4, 9, 10],
  [10, 1.5, [1.25, 1, 0.75], 10.5, 11, 12], [12, 1.75, [1.5, 1.25, 1], 13, 13.5, 14.5], [14, 2, [1.5, 1.25], 15, 15.5, 16.5],
  [16, 2, [1.5, 1], 17, 17.5, 18.5], [18, 2.5, [2, 1.5, 1], 19, 20, 21], [20, 2.5, [2, 1.5, 1], 21, 22, 24], [22, 2.5, [2, 1.5, 1], 23, 24, 26],
  [24, 3, [2, 1.5], 25, 26, 28], [27, 3, [2, 1.5], 28, 30, 32], [30, 3.5, [2, 1.5], 31, 33, 35], [33, 3.5, [2, 1.5], 34, 36, 38],
  [36, 4, [3, 2, 1.5], 37, 39, 42], [39, 4, [3, 2], 40, 42, 45], [42, 4.5, [3, 2], 43, 45, 48], [45, 4.5, [3, 2], 46, 48, 52],
  [48, 5, [3, 2], 50, 52, 56], [52, 5, [4, 3], 54, 56, 62], [56, 5.5, [4, 3], 58, 62, 66], [64, 6, [4, 3], 66, 70, 74],
]

// [name, major Ø in, UNC tpi, UNF tpi, close clearance in, free clearance in]
const UNIFIED: [string, number, number | null, number | null, number, number][] = [
  ['#0', 0.06, null, 80, 0.0635, 0.07], ['#1', 0.073, 64, 72, 0.076, 0.081], ['#2', 0.086, 56, 64, 0.089, 0.096], ['#3', 0.099, 48, 56, 0.104, 0.11],
  ['#4', 0.112, 40, 48, 0.116, 0.1285], ['#5', 0.125, 40, 44, 0.1285, 0.136], ['#6', 0.138, 32, 40, 0.144, 0.1495], ['#8', 0.164, 32, 36, 0.1695, 0.177],
  ['#10', 0.19, 24, 32, 0.196, 0.201], ['#12', 0.216, 24, 28, 0.221, 0.228], ['1/4', 0.25, 20, 28, 0.257, 0.266], ['5/16', 0.3125, 18, 24, 0.323, 0.332],
  ['3/8', 0.375, 16, 24, 0.386, 0.397], ['7/16', 0.4375, 14, 20, 0.453, 0.469], ['1/2', 0.5, 13, 20, 0.516, 0.531], ['9/16', 0.5625, 12, 18, 0.578, 0.594],
  ['5/8', 0.625, 11, 18, 0.641, 0.656], ['3/4', 0.75, 10, 16, 0.766, 0.781], ['7/8', 0.875, 9, 14, 0.891, 0.906], ['1', 1, 8, 12, 1.016, 1.031],
  ['1-1/8', 1.125, 7, 12, 1.141, 1.156], ['1-1/4', 1.25, 7, 12, 1.266, 1.281], ['1-3/8', 1.375, 6, 12, 1.391, 1.406], ['1-1/2', 1.5, 6, 12, 1.516, 1.531],
  ['1-3/4', 1.75, 5, null, 1.781, 1.813], ['2', 2, 4.5, null, 2.031, 2.063],
]

const IN = 25.4
const fmtP = (p: number) => String(+p.toFixed(2))

export const THREADS: Thread[] = [
  ...METRIC.flatMap(([d, pc, fine, f, m, c]) => [
    { id: `M${d}`, std: 'metric' as const, series: 'coarse', name: `M${d} × ${fmtP(pc)}`, d, p: pc, clear: [f, m, c] as [number, number, number] },
    ...fine.map((p) => ({ id: `M${d}x${p}`, std: 'metric' as const, series: 'fine', name: `M${d} × ${fmtP(p)}`, d, p, clear: [f, m, c] as [number, number, number] })),
  ]),
  ...UNIFIED.flatMap(([n, din, unc, unf, close, free]) =>
    ([[unc, 'UNC'], [unf, 'UNF']] as const).filter(([t]) => t).map(([t, ser]) => ({
      id: `${n}-${t}`, std: 'unified' as const, series: ser, name: `${n}-${t} ${ser}`, d: din * IN, p: IN / t!, tpi: t!,
      clear: [close * IN, free * IN, NaN] as [number, number, number], // ASME B18.2.8 close / normal; no loose class
    })),
  ),
]

/** Basic profile dimensions (ISO 68-1 / ASME B1.1 share the 60° profile). */
export function basic(t: Pick<Thread, 'd' | 'p'>) {
  const H = 0.866025404 * t.p
  return {
    H,
    pitchDia: t.d - 0.649519 * t.p,
    minorExt: t.d - 1.226869 * t.p, // d3, external (bolt) root
    minorInt: t.d - 1.082532 * t.p, // D1, internal (nut) minor
    depthExt: 0.613435 * t.p, // h3
    depthInt: 0.541266 * t.p, // H1
    stress: (Math.PI / 4) * (t.d - 0.9382 * t.p) ** 2, // tensile stress area, mm²
  }
}

/** Percentage of full thread engagement for a given tap drill. */
export const threadPct = (t: Pick<Thread, 'd' | 'p'>, drill: number) => (76.98 * (t.d - drill)) / t.p

/** Exact drill size for a target thread percentage. */
export const drillFor = (t: Pick<Thread, 'd' | 'p'>, pct = 75) => t.d - (pct * t.p) / 76.98

const NUM = [0.228, 0.221, 0.213, 0.209, 0.2055, 0.204, 0.201, 0.199, 0.196, 0.1935, 0.191, 0.189, 0.185, 0.182, 0.18, 0.177, 0.173, 0.1695, 0.166, 0.161, 0.159, 0.157, 0.154, 0.152, 0.1495, 0.147, 0.144, 0.1405, 0.136, 0.1285, 0.12, 0.116, 0.113, 0.111, 0.11, 0.1065, 0.104, 0.1015, 0.0995, 0.098, 0.096, 0.0935, 0.089, 0.086, 0.082, 0.081, 0.0785, 0.076, 0.073, 0.07, 0.067, 0.0635, 0.0595, 0.055, 0.052, 0.0465, 0.043, 0.042, 0.041, 0.04]
const LET = [0.234, 0.238, 0.242, 0.246, 0.25, 0.257, 0.261, 0.266, 0.272, 0.277, 0.281, 0.29, 0.295, 0.302, 0.316, 0.323, 0.332, 0.339, 0.348, 0.358, 0.368, 0.377, 0.386, 0.397, 0.404, 0.413]

function frac(n: number, den = 64): string {
  const w = Math.floor(n / den)
  let r = n % den, d = den
  while (r && r % 2 === 0) { r /= 2; d /= 2 }
  return r ? `${w ? w + '-' : ''}${r}/${d}"` : `${w}"`
}

export interface Drill { name: string; mm: number }

/** Standard drills: metric (0.1 mm to 13 mm, then 0.5 mm), number, letter and fractional (1/64") sizes. */
export const DRILLS: { metric: Drill[]; inch: Drill[] } = {
  metric: [...Array.from({ length: 125 }, (_, i) => +(0.6 + i * 0.1).toFixed(1)), ...Array.from({ length: 103 }, (_, i) => 13.5 + i * 0.5)].map((mm) => ({ name: `${mm} mm`, mm })),
  inch: [
    ...NUM.map((v, i) => ({ name: `#${i + 1} (${v.toFixed(4)}")`, mm: v * IN })),
    ...LET.map((v, i) => ({ name: `${String.fromCharCode(65 + i)} (${v.toFixed(3)}")`, mm: v * IN })),
    ...Array.from({ length: 128 }, (_, i) => ({ name: `${frac(i + 1)} (${((i + 1) / 64).toFixed(4)}")`, mm: ((i + 1) / 64) * IN })),
  ].sort((a, b) => a.mm - b.mm),
}

/** The standard drill whose thread percentage is closest to `pct` (kept within 50–90 %). */
export function bestDrill(t: Pick<Thread, 'd' | 'p'>, set: Drill[], pct = 75): Drill & { pct: number } {
  let best: Drill & { pct: number } = { ...set[0], pct: threadPct(t, set[0].mm) }
  for (const dr of set) {
    const p = threadPct(t, dr.mm)
    if (p < 50 || p > 90) continue
    if (Math.abs(p - pct) < Math.abs(best.pct - pct) || best.pct < 50 || best.pct > 90) best = { ...dr, pct: p }
  }
  return best
}

/** Threads matching a measured diameter and pitch (either may be NaN = unknown), best first. */
export function identify(dMm: number, pMm: number): { t: Thread; score: number }[] {
  return THREADS.map((t) => {
    const dd = Number.isFinite(dMm) ? Math.abs(t.d - dMm) / t.d : 0
    const dp = Number.isFinite(pMm) ? Math.abs(t.p - pMm) / t.p : 0
    return { t, score: dd * 3 + dp }
  })
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)
}
