// Seeding rate from target plant density, thousand-seed weight, germination, purity and field survival.

export interface SeedInput {
  plants: number // target established plants per m²
  tsw: number // thousand-seed weight, g
  germ: number // germination, %
  purity: number // purity, %
  survival: number // field establishment / emergence, %
  area: number // ha
  bag: number // kg per bag
  margin: number // extra seed, %
  row: number // row spacing, cm (0 = broadcast)
}

export interface SeedResult {
  pls: number // pure live seed fraction
  seedsM2: number
  kgHa: number
  totalKg: number
  bags: number // whole bags to buy
  bagsExact: number
  seedsPerM: number // per metre of row
  spacingCm: number // between seeds in the row
  seedsHa: number
}

export function seedRate(i: SeedInput): SeedResult {
  const pls = (i.germ / 100) * (i.purity / 100)
  const est = i.survival / 100
  const seedsM2 = i.plants / (pls * est)
  // seeds/m² × g/seed × 10 000 m²/ha ÷ 1000 g/kg = seeds/m² × TSW / 100
  const kgHa = (seedsM2 * i.tsw) / 100
  const totalKg = kgHa * i.area * (1 + i.margin / 100)
  const bagsExact = i.bag > 0 ? totalKg / i.bag : 0
  const seedsPerM = i.row > 0 ? seedsM2 * (i.row / 100) : 0
  return { pls, seedsM2, kgHa, totalKg, bagsExact, bags: Math.ceil(bagsExact - 1e-9), seedsPerM, spacingCm: seedsPerM ? 100 / seedsPerM : 0, seedsHa: seedsM2 * 10000 }
}

export const KGHA_TO_LBAC = 0.892179
export const HA_TO_AC = 2.471054
export const M2_TO_FT2 = 0.09290304
