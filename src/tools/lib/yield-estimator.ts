// Crop yield from field sample counts (yield-component method):
// yield per m² = units per m² × Π(count components) × weight of one part (g), then scaled to the field.
import { tInv } from './descriptive-statistics-calculator'

export interface Crop {
  id: string
  name: string
  unit: string // what is counted in the sample (ears, plants, heads…)
  comps: [string, number][] // further count components per unit with typical default
  partG: number // grams per final part (TKW / 1000 for grain, tuber weight for potatoes)
  partLabel: string
  lbPerBu: number // test weight for bushel conversion (0 = report tonnes only)
  sampling: 'row' | 'area'
  stdMoist: number // % moisture yields are reported at (0 = no adjustment)
}

export const CROPS: Crop[] = [
  { id: 'corn', name: 'Corn (maize)', unit: 'Ears', comps: [['Kernel rows per ear', 16], ['Kernels per row', 34]], partG: 0.282, partLabel: 'Kernel weight (g) — 0.282 ≈ “kernel factor 90”', lbPerBu: 56, sampling: 'row', stdMoist: 15.5 },
  { id: 'soy', name: 'Soybean', unit: 'Plants', comps: [['Pods per plant', 32], ['Seeds per pod', 2.5]], partG: 0.16, partLabel: 'Seed weight (g) — 0.16 ≈ 2,850 seeds/lb', lbPerBu: 60, sampling: 'row', stdMoist: 13 },
  { id: 'wheat', name: 'Wheat', unit: 'Heads', comps: [['Kernels per head', 30]], partG: 0.038, partLabel: 'Kernel weight (g) — TKW 38 g', lbPerBu: 60, sampling: 'area', stdMoist: 13.5 },
  { id: 'barley', name: 'Barley', unit: 'Heads', comps: [['Kernels per head', 22]], partG: 0.045, partLabel: 'Kernel weight (g) — TKW 45 g', lbPerBu: 48, sampling: 'area', stdMoist: 14.5 },
  { id: 'oats', name: 'Oats', unit: 'Panicles', comps: [['Kernels per panicle', 45]], partG: 0.032, partLabel: 'Kernel weight (g) — TKW 32 g', lbPerBu: 32, sampling: 'area', stdMoist: 14 },
  { id: 'sorghum', name: 'Grain sorghum', unit: 'Heads', comps: [['Seeds per head', 1800]], partG: 0.026, partLabel: 'Seed weight (g) — TKW 26 g', lbPerBu: 56, sampling: 'row', stdMoist: 14 },
  { id: 'rice', name: 'Rice (paddy)', unit: 'Panicles', comps: [['Filled grains per panicle', 100]], partG: 0.025, partLabel: 'Grain weight (g) — TKW 25 g', lbPerBu: 45, sampling: 'area', stdMoist: 14 },
  { id: 'canola', name: 'Canola / rapeseed', unit: 'Plants', comps: [['Pods per plant', 90], ['Seeds per pod', 20]], partG: 0.0042, partLabel: 'Seed weight (g) — TKW 4.2 g', lbPerBu: 50, sampling: 'area', stdMoist: 10 },
  { id: 'potato', name: 'Potato', unit: 'Plants', comps: [['Tubers per plant', 9]], partG: 110, partLabel: 'Average tuber weight (g)', lbPerBu: 0, sampling: 'row', stdMoist: 0 },
]

export const FT = 0.3048
export const ACRE_M2 = 4046.8564224
export const LB = 0.45359237

/** Sample area in m²: row sampling = length × row spacing; area sampling = quadrat area. */
export const sampleArea = (mode: 'row' | 'area', lenM: number, spacingM: number, quadM2: number) => (mode === 'row' ? lenM * spacingM : quadM2)

/** Grams per m² from one sample. */
export function gPerM2(units: number, comps: number[], partG: number, areaM2: number): number {
  if (!(areaM2 > 0)) return NaN
  return (units * comps.reduce((a, c) => a * c, 1) * partG) / areaM2
}

/** Adjusts a wet-basis yield measured at `moist` % to the standard moisture `std` %. */
export const moistureAdjust = (y: number, moist: number, std: number) => (std > 0 && moist > 0 ? (y * (100 - moist)) / (100 - std) : y)

export const tPerHa = (gm2: number) => gm2 / 100
export const buPerAc = (gm2: number, lbPerBu: number) => (lbPerBu ? (gm2 * ACRE_M2) / 1000 / (lbPerBu * LB) : NaN)

export interface Summary { n: number; mean: number; sd: number; min: number; max: number; cv: number; lo: number; hi: number }
/** Mean, sample SD, range, CV and 95 % confidence interval of the mean (Student t). */
export function summarize(v: number[]): Summary {
  const x = v.filter(Number.isFinite)
  const n = x.length
  const mean = n ? x.reduce((a, b) => a + b, 0) / n : NaN
  const sd = n > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0
  const half = n > 1 ? tInv(0.975, n - 1) * (sd / Math.sqrt(n)) : 0
  return { n, mean, sd, min: Math.min(...x), max: Math.max(...x), cv: mean ? sd / mean : NaN, lo: mean - half, hi: mean + half }
}

/** Row length that equals 1/1000 acre for a row spacing in inches (the classic corn sampling length). */
export const rowFor1000thAcre = (spacingIn: number) => 43560 / 1000 / (spacingIn / 12)
