// Hay budgeting: dry-matter intake → as-fed hay incl. waste → season need vs bales on hand.

export interface Group { id: string; kind: string; count: number; weightKg: number; intakePct: number; pasturePct: number }
export interface Bales { id: string; type: string; count: number; weightKg: number }

export const ANIMALS: Record<string, { weight: number; intake: number }> = {
  'Horse': { weight: 500, intake: 2.0 },
  'Pony / donkey': { weight: 250, intake: 1.8 },
  'Beef cow': { weight: 600, intake: 2.5 },
  'Dairy cow': { weight: 650, intake: 3.5 },
  'Heifer / stocker': { weight: 350, intake: 2.5 },
  'Sheep': { weight: 70, intake: 3.0 },
  'Goat': { weight: 60, intake: 3.5 },
  'Alpaca / llama': { weight: 70, intake: 1.8 },
}

export const BALE_TYPES: Record<string, number> = {
  'Small square (2-string)': 23,
  'Small square (3-string)': 45,
  'Large square 3×3×8 ft': 360,
  'Large square 3×4×8 ft': 500,
  'Round 4×5 ft': 410,
  'Round 5×5 ft': 520,
  'Round 5×6 ft': 680,
}

export const WASTE: [string, number][] = [
  ['Small squares in a manger / hay net', 5],
  ['Rounds in a cone / ring feeder', 10],
  ['Rounds in a basic ring', 15],
  ['Unrolled on pasture', 25],
  ['Rounds on the ground, no feeder', 40],
]

/** As-fed hay offered per head per day (kg). */
export function dailyPerHead(g: Group, dmPct: number, wastePct: number): number {
  const dm = (g.weightKg * g.intakePct) / 100
  const fromHay = dm * (1 - g.pasturePct / 100)
  return fromHay / (dmPct / 100) / (1 - wastePct / 100)
}

export function seasonDays(start: string, end: string): number {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.max(0, Math.round((d(end) - d(start)) / 86400000) + 1)
}

export function budget(groups: Group[], bales: Bales[], dmPct: number, wastePct: number, days: number, safetyPct: number) {
  const daily = groups.reduce((a, g) => a + dailyPerHead(g, dmPct, wastePct) * g.count, 0)
  const need = daily * days * (1 + safetyPct / 100)
  const onHand = bales.reduce((a, b) => a + b.count * b.weightKg, 0)
  return { daily, need, onHand, shortfall: Math.max(0, need - onHand), surplus: Math.max(0, onHand - need), daysCovered: daily > 0 ? onHand / daily : Infinity }
}
