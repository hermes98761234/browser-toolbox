// Seed viability and sowing maths. Viable years and seeds/gram are typical values from seed-saving references
// (stored cool and dry); real packets vary, so a germination test always overrides the estimate.

/** crop: [typical viable years, seeds per gram, typical fresh germination %] */
export const CROPS: Record<string, [number, number, number]> = {
  Basil: [5, 600, 85], Bean: [3, 4, 85], Beet: [4, 60, 80], Broccoli: [3, 300, 85], Cabbage: [4, 300, 85], Carrot: [3, 800, 75],
  Cauliflower: [4, 300, 80], Celery: [5, 2500, 70], Chard: [4, 60, 80], Corn: [2, 4, 85], Cucumber: [5, 35, 85], Dill: [3, 900, 70],
  Eggplant: [4, 230, 75], Kale: [4, 300, 85], Leek: [2, 350, 75], Lettuce: [5, 800, 85], Melon: [5, 35, 85], Okra: [2, 18, 70],
  Onion: [1, 250, 80], Parsley: [2, 650, 70], Parsnip: [1, 250, 65], Pea: [3, 5, 85], Pepper: [2, 150, 75], Pumpkin: [4, 7, 85],
  Radish: [5, 100, 85], Spinach: [3, 90, 75], Squash: [4, 7, 85], Sunflower: [5, 20, 85], Tomato: [4, 300, 85], Watermelon: [4, 20, 80],
}

/** Expected germination (0–1) after `age` years: starts at g0 and halves by the end of the typical viable life. */
export function germination(g0: number, age: number, life: number): number {
  if (age <= 0) return g0
  return g0 * Math.pow(0.5, age / Math.max(0.5, life))
}

export type Status = 'fresh' | 'good' | 'aging' | 'replace'
export function status(age: number, life: number, germ: number): Status {
  if (germ < 0.4 || age > life + 1) return 'replace'
  if (age >= life) return 'aging'
  if (age <= 1) return 'fresh'
  return 'good'
}

/** Seeds to sow for `plants` survivors at germination g and post-germination loss (0–1), sown `perCell` per spot. */
export function seedsNeeded(plants: number, g: number, loss: number, perCell = 1): number {
  if (plants <= 0) return 0
  if (perCell > 1) {
    // probability a spot with k seeds yields ≥ 1 seedling
    const pSpot = 1 - Math.pow(1 - g, perCell)
    const spots = Math.ceil(plants / Math.max(1e-6, pSpot * (1 - loss)))
    return spots * perCell
  }
  return Math.ceil(plants / Math.max(1e-6, g * (1 - loss)))
}

/** Spots (cells) needed when sowing perCell seeds each. */
export function spotsNeeded(plants: number, g: number, loss: number, perCell: number): number {
  return Math.ceil(seedsNeeded(plants, g, loss, perCell) / Math.max(1, perCell))
}

/** Germination % from a paper-towel test. */
export const testRate = (sown: number, sprouted: number) => (sown > 0 ? Math.min(1, Math.max(0, sprouted / sown)) : NaN)
