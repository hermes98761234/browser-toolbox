// Soil test interpretation: sufficiency ratings, lime / sulfur requirement and nutrient rates.
// All figures are generalised extension-style values for teaching and planning; local lab
// recommendations should win when available.

export type Texture = 'sand' | 'sandyLoam' | 'loam' | 'siltLoam' | 'clayLoam' | 'clay' | 'organic'
export const TEXTURES: [Texture, string][] = [
  ['sand', 'Sand / loamy sand'], ['sandyLoam', 'Sandy loam'], ['loam', 'Loam'], ['siltLoam', 'Silt loam'],
  ['clayLoam', 'Clay loam'], ['clay', 'Clay'], ['organic', 'Organic / muck'],
]

/** Approximate tons CaCO3 per acre (7-inch layer) to raise pH by one unit. */
const LIME_PER_UNIT: Record<Texture, number> = { sand: 1.0, sandyLoam: 1.6, loam: 2.3, siltLoam: 3.0, clayLoam: 3.6, clay: 4.2, organic: 6.5 }
/** Approximate lb elemental sulfur per 1000 ft² to lower pH by one unit. */
const SULFUR_PER_UNIT: Record<Texture, number> = { sand: 10, sandyLoam: 13, loam: 18, siltLoam: 20, clayLoam: 23, clay: 25, organic: 30 }

export const LB_AC_TO_KG_HA = 1.12085
export const SQFT_PER_ACRE = 43560
export const SQFT_PER_M2 = 10.7639

export type Rating = 'Very low' | 'Low' | 'Medium' | 'Optimum' | 'High'
export const RATINGS: Rating[] = ['Very low', 'Low', 'Medium', 'Optimum', 'High']

export interface Nutrient { id: 'p' | 'k' | 'ca' | 'mg' | 's' | 'zn'; name: string; bounds: [number, number, number, number]; tip: string }
/** Mehlich-3 extractable ppm. bounds = upper edges of Very low, Low, Medium, Optimum. */
export const NUTRIENTS: Nutrient[] = [
  { id: 'p', name: 'Phosphorus (P)', bounds: [10, 20, 30, 50], tip: 'Above ~50 ppm adding P brings no yield benefit and raises runoff risk to waterways.' },
  { id: 'k', name: 'Potassium (K)', bounds: [60, 100, 130, 175], tip: 'Sandy soils hold little K; split applications reduce leaching.' },
  { id: 'ca', name: 'Calcium (Ca)', bounds: [250, 500, 800, 3000], tip: 'Low Ca is usually fixed by liming with calcitic limestone.' },
  { id: 'mg', name: 'Magnesium (Mg)', bounds: [25, 50, 80, 300], tip: 'If Mg is low and lime is needed, choose dolomitic limestone.' },
  { id: 's', name: 'Sulfur (S)', bounds: [5, 10, 15, 40], tip: 'S is mobile; low values are common on sandy, low-organic-matter soils.' },
  { id: 'zn', name: 'Zinc (Zn)', bounds: [0.5, 1, 2, 20], tip: 'Corn and beans are most sensitive to low Zn; high pH reduces availability.' },
]

export function rate(n: Nutrient, ppm: number): Rating {
  const i = n.bounds.findIndex((b) => ppm < b)
  return RATINGS[i < 0 ? 4 : i]
}

/** Fertiliser multiplier on the crop's base rate for each rating (build-up + maintenance). */
export const RATING_FACTOR: Record<Rating, number> = { 'Very low': 2.0, Low: 1.5, Medium: 1.0, Optimum: 0.5, High: 0 }

export interface Crop { id: string; name: string; ph: number; n: number; p2o5: number; k2o: number; turf?: boolean }
/** Base rates (lb/acre) for a Medium soil test, and target pH. */
export const CROPS: Crop[] = [
  { id: 'veg', name: 'Vegetable garden', ph: 6.5, n: 120, p2o5: 80, k2o: 120 },
  { id: 'lawn', name: 'Lawn (cool-season grass)', ph: 6.5, n: 130, p2o5: 40, k2o: 80, turf: true },
  { id: 'warmlawn', name: 'Lawn (warm-season grass)', ph: 6.0, n: 150, p2o5: 40, k2o: 80, turf: true },
  { id: 'corn', name: 'Corn (grain)', ph: 6.5, n: 160, p2o5: 70, k2o: 60 },
  { id: 'soy', name: 'Soybean', ph: 6.5, n: 0, p2o5: 50, k2o: 80 },
  { id: 'wheat', name: 'Wheat / small grains', ph: 6.4, n: 90, p2o5: 50, k2o: 40 },
  { id: 'alfalfa', name: 'Alfalfa', ph: 6.8, n: 0, p2o5: 60, k2o: 200 },
  { id: 'pasture', name: 'Grass hay / pasture', ph: 6.2, n: 100, p2o5: 40, k2o: 120 },
  { id: 'potato', name: 'Potatoes', ph: 5.5, n: 150, p2o5: 100, k2o: 150 },
  { id: 'fruit', name: 'Fruit trees', ph: 6.5, n: 60, p2o5: 30, k2o: 80 },
  { id: 'blue', name: 'Blueberries', ph: 4.8, n: 50, p2o5: 20, k2o: 40 },
]

/**
 * Lime requirement in tons CaCO3/acre from the SMP buffer pH.
 * Linear fit of the classic SMP table (to pH 6.8: 1.4 t/ac at buffer 6.8, ≈ +10.4 t/ac per unit lower);
 * targets 6.4 and 6.0 use the table's ratios (~0.83 and ~0.69) and are interpolated between.
 */
export function smpLime(bufferPh: number, target: number): number {
  if (!(bufferPh > 0) || bufferPh >= 7.0) return 0
  const to68 = Math.max(0, 1.4 + (6.8 - bufferPh) * 10.4)
  const f = target >= 6.8 ? 1 : target >= 6.4 ? 0.83 + ((target - 6.4) / 0.4) * 0.17 : Math.max(0, 0.69 + ((target - 6.0) / 0.4) * 0.14)
  return to68 * f
}

/** Texture-based estimate (tons CaCO3/acre, 7-inch layer); organic matter adds buffering (+8 % per % OM above 2). */
export function textureLime(ph: number, target: number, tex: Texture, om: number): number {
  if (ph >= target) return 0
  return (target - ph) * LIME_PER_UNIT[tex] * (1 + Math.max(0, om - 2) * 0.08)
}

/** Elemental sulfur, lb per 1000 ft², to lower pH to target. */
export function sulfurNeed(ph: number, target: number, tex: Texture): number {
  if (ph <= target) return 0
  return (ph - target) * SULFUR_PER_UNIT[tex]
}

/** Adjusts pure CaCO3 to a product with the given calcium carbonate equivalent (%) and incorporation depth (inches). */
export function limeProduct(tonsCaCO3: number, cce: number, depthIn: number): number {
  return (tonsCaCO3 * 100) / Math.max(1, cce) * (depthIn / 7)
}

export interface Product { id: string; name: string; n: number; p2o5: number; k2o: number }
export const P_PRODUCTS: Product[] = [
  { id: 'tsp', name: 'Triple superphosphate 0-46-0', n: 0, p2o5: 46, k2o: 0 },
  { id: 'map', name: 'Monoammonium phosphate 11-52-0', n: 11, p2o5: 52, k2o: 0 },
  { id: 'dap', name: 'Diammonium phosphate 18-46-0', n: 18, p2o5: 46, k2o: 0 },
  { id: 'bone', name: 'Bone meal ~3-15-0', n: 3, p2o5: 15, k2o: 0 },
]
export const K_PRODUCTS: Product[] = [
  { id: 'mop', name: 'Muriate of potash 0-0-60', n: 0, p2o5: 0, k2o: 60 },
  { id: 'sop', name: 'Sulfate of potash 0-0-50', n: 0, p2o5: 0, k2o: 50 },
  { id: 'kmag', name: 'Sulfate of potash-magnesia 0-0-22', n: 0, p2o5: 0, k2o: 22 },
]
export const N_PRODUCTS: Product[] = [
  { id: 'urea', name: 'Urea 46-0-0', n: 46, p2o5: 0, k2o: 0 },
  { id: 'as', name: 'Ammonium sulfate 21-0-0', n: 21, p2o5: 0, k2o: 0 },
  { id: 'can', name: 'Calcium ammonium nitrate 27-0-0', n: 27, p2o5: 0, k2o: 0 },
  { id: 'feather', name: 'Feather meal ~12-0-0', n: 12, p2o5: 0, k2o: 0 },
]

export interface Plan { n: number; p2o5: number; k2o: number; pProd: number; kProd: number; nProd: number; nFromP: number }

/** Nutrient needs (lb/acre) and product amounts (lb/acre), crediting N supplied by the phosphate product. */
export function nutrientPlan(crop: Crop, pRating: Rating, kRating: Rating, om: number, pp: Product, kp: Product, np: Product): Plan {
  const p2o5 = crop.p2o5 * RATING_FACTOR[pRating]
  const k2o = crop.k2o * RATING_FACTOR[kRating]
  // Each % organic matter above 3 mineralises roughly 20 lb N/acre per season (not for turf).
  const omCredit = crop.turf ? 0 : Math.max(0, om - 3) * 20
  const nNeed = Math.max(0, crop.n - omCredit)
  const pProd = pp.p2o5 ? (p2o5 * 100) / pp.p2o5 : 0
  const nFromP = (pProd * pp.n) / 100
  const kProd = kp.k2o ? (k2o * 100) / kp.k2o : 0
  const nProd = np.n ? (Math.max(0, nNeed - nFromP) * 100) / np.n : 0
  return { n: nNeed, p2o5, k2o, pProd, kProd, nProd, nFromP }
}

export type AreaUnit = 'ft2' | 'm2' | 'acre' | 'ha'
export function areaToAcres(v: number, u: AreaUnit): number {
  return u === 'acre' ? v : u === 'ha' ? v * 2.47105 : u === 'm2' ? (v * SQFT_PER_M2) / SQFT_PER_ACRE : v / SQFT_PER_ACRE
}
