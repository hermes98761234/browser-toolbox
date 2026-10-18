// Gutter & downspout sizing: IPC/UPC semicircular gutter table, Manning scaling, SMACNA pitch factors.

/** IPC Table 1106.6 — horizontally projected roof area (ft²) drained by a semicircular gutter at 1 in/h. */
export const IPC_GUTTER: Record<number, [number, number, number, number]> = {
  3: [340, 480, 680, 960],
  4: [720, 1020, 1440, 2040],
  5: [1250, 1760, 2500, 3540],
  6: [1920, 2720, 3840, 5440],
  7: [2760, 3900, 5520, 7800],
  8: [3980, 5600, 7960, 11200],
  10: [7200, 10200, 14400, 20400],
}
export const SLOPES = [1 / 16, 1 / 8, 1 / 4, 1 / 2] as const // in per ft

/** IPC Table 1106.2 — vertical leader capacity (ft² of roof at 1 in/h) for round leaders. */
export const IPC_LEADER: Record<number, number> = { 2: 2880, 3: 8800, 4: 18400, 5: 34600, 6: 54000, 8: 116000 }

/** SMACNA pitch factor: steeper roofs catch wind-driven rain on more area. Pitch in rise per 12 run. */
export function pitchFactor(rise: number): number {
  if (rise <= 3) return 1
  if (rise <= 5) return 1.05
  if (rise <= 8) return 1.1
  if (rise <= 11) return 1.2
  return 1.3
}

/** Roof area (ft² at 1 in/h) a semicircular gutter of diameter d (in) drains at slope s (in/ft). Log-log interpolation, Manning d^(8/3)·√s beyond the table. */
export function halfRoundCapacity(d: number, slope: number): number {
  const ds = Object.keys(IPC_GUTTER).map(Number)
  // slope: interpolate in log space between table slopes, √s beyond
  const atSlope = (row: readonly number[]) => {
    const ls = Math.log(slope)
    const L = SLOPES.map(Math.log)
    if (slope <= SLOPES[0]) return row[0] * Math.sqrt(slope / SLOPES[0])
    if (slope >= SLOPES[3]) return row[3] * Math.sqrt(slope / SLOPES[3])
    let i = 0
    while (ls > L[i + 1]) i++
    const t = (ls - L[i]) / (L[i + 1] - L[i])
    return Math.exp(Math.log(row[i]) * (1 - t) + Math.log(row[i + 1]) * t)
  }
  if (d <= ds[0]) return atSlope(IPC_GUTTER[ds[0]]) * (d / ds[0]) ** (8 / 3)
  if (d >= ds[ds.length - 1]) return atSlope(IPC_GUTTER[ds[ds.length - 1]]) * (d / ds[ds.length - 1]) ** (8 / 3)
  let i = 0
  while (d > ds[i + 1]) i++
  const a = atSlope(IPC_GUTTER[ds[i]]), b = atSlope(IPC_GUTTER[ds[i + 1]])
  const t = Math.log(d / ds[i]) / Math.log(ds[i + 1] / ds[i])
  return Math.exp(Math.log(a) * (1 - t) + Math.log(b) * t)
}

export interface Profile { id: string; name: string; kind: 'half' | 'k' | 'box'; width: number; depth: number }
export const PROFILES: Profile[] = [
  { id: 'h5', name: '5″ half-round', kind: 'half', width: 5, depth: 2.5 },
  { id: 'h6', name: '6″ half-round', kind: 'half', width: 6, depth: 3 },
  { id: 'k4', name: '4″ K-style', kind: 'k', width: 4, depth: 3 },
  { id: 'k5', name: '5″ K-style', kind: 'k', width: 5, depth: 3.375 },
  { id: 'k6', name: '6″ K-style', kind: 'k', width: 6, depth: 4 },
  { id: 'k7', name: '7″ K-style', kind: 'k', width: 7, depth: 4.5 },
  { id: 'b8', name: '8″ box (commercial)', kind: 'box', width: 8, depth: 6 },
]

/** Water cross-section (in²): half-round πr²/2, K-style ≈ 0.75·W·D (ogee front), box W·D. */
export function crossSection(p: Profile): number {
  return p.kind === 'half' ? (Math.PI * (p.width / 2) ** 2) / 2 : p.kind === 'k' ? 0.75 * p.width * p.depth : p.width * p.depth
}
/** Diameter of the half-round gutter with the same cross-section. */
export const equivalentDiameter = (p: Profile) => (p.kind === 'half' ? p.width : Math.sqrt((8 * crossSection(p)) / Math.PI))

/** Roof area (ft²) the profile drains at `intensity` in/h and gutter slope (in/ft). */
export const profileCapacity = (p: Profile, slope: number, intensity: number) => halfRoundCapacity(equivalentDiameter(p), slope) / intensity

export interface Downspout { id: string; name: string; area: number; round?: number }
export const DOWNSPOUTS: Downspout[] = [
  { id: 'r2x3', name: '2×3″ rectangular', area: 6 },
  { id: 'r3x4', name: '3×4″ rectangular', area: 12 },
  { id: 'c3', name: '3″ round', area: Math.PI * 1.5 ** 2, round: 3 },
  { id: 'c4', name: '4″ round', area: Math.PI * 4, round: 4 },
  { id: 'r4x5', name: '4×5″ rectangular', area: 20 },
]

/** Roof area one downspout serves: rule of 1 in² per 100 ft² at 6 in/h (scaled with intensity), capped by IPC leader capacity. */
export function downspoutCapacity(d: Downspout, intensity: number): number {
  const rule = (d.area * 100 * 6) / intensity
  const eqRound = d.round ?? 2 * Math.sqrt(d.area / Math.PI)
  const keys = Object.keys(IPC_LEADER).map(Number)
  let cap = IPC_LEADER[keys[0]] * (eqRound / keys[0]) ** (8 / 3)
  for (let i = 0; i < keys.length - 1; i++)
    if (eqRound >= keys[i] && eqRound <= keys[i + 1]) {
      const t = Math.log(eqRound / keys[i]) / Math.log(keys[i + 1] / keys[i])
      cap = Math.exp(Math.log(IPC_LEADER[keys[i]]) * (1 - t) + Math.log(IPC_LEADER[keys[i + 1]]) * t)
    }
  return Math.min(rule, cap / intensity)
}

/** Flow in US gpm from roof area (ft²) and intensity (in/h): 1 in/h on 1 ft² = 0.0104 gpm. */
export const flowGpm = (area: number, intensity: number) => area * intensity * 0.010389

export interface Plane { id: string; name: string; eave: number; run: number; rise: number }
export interface PlaneResult {
  area: number; design: number; perOutlet: number; outlets: number; flow: number
  needD: number // required half-round diameter at the chosen slope
  pick: Profile | null
}

export function sizePlane(pl: Plane, intensity: number, slope: number, ds: Downspout, maxSpacing: number): PlaneResult {
  const area = pl.eave * pl.run
  const design = area * pitchFactor(pl.rise)
  const dsCap = downspoutCapacity(ds, intensity)
  const outlets = Math.max(1, Math.ceil(design / dsCap), Math.ceil(pl.eave / maxSpacing))
  const perOutlet = design / outlets
  // bisection for the needed half-round diameter
  let lo = 1, hi = 30
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2
    if (halfRoundCapacity(m, slope) / intensity >= perOutlet) hi = m
    else lo = m
  }
  const pick = [...PROFILES].sort((a, b) => equivalentDiameter(a) - equivalentDiameter(b)).find((p) => profileCapacity(p, slope, intensity) >= perOutlet) ?? null
  return { area, design, perOutlet, outlets, flow: flowGpm(design, intensity), needD: hi, pick }
}
