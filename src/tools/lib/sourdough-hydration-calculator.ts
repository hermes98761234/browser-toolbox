// Baker's percentage maths for sourdough: build a formula from targets, or analyse an existing recipe.

export interface Flour { name: string; pct: number }
export interface Targets {
  dough: number // total dough weight (g)
  hydration: number // % of total flour (incl. flour inside the starter)
  salt: number // % of total flour
  starter: number // starter weight as % of total flour
  starterHyd: number // starter hydration %
  inclusions: number // % of total flour (seeds, nuts…)
  flours: Flour[] // blend of the added flour, pct of added flour
}
export interface Formula {
  totalFlour: number; totalWater: number
  starter: number; starterFlour: number; starterWater: number
  addFlour: number; addWater: number; salt: number; inclusions: number
  flours: { name: string; g: number; pct: number }[]
  dough: number; valid: boolean; prefermented: number
}

export function splitStarter(weight: number, hyd: number): { flour: number; water: number } {
  const flour = weight / (1 + hyd / 100)
  return { flour, water: weight - flour }
}

export function buildFormula(t: Targets): Formula {
  const h = t.hydration / 100, sa = t.salt / 100, st = t.starter / 100, inc = t.inclusions / 100
  const totalFlour = t.dough / (1 + h + sa + inc)
  const starter = st * totalFlour
  const { flour: starterFlour, water: starterWater } = splitStarter(starter, t.starterHyd)
  const totalWater = h * totalFlour
  const addFlour = totalFlour - starterFlour
  const addWater = totalWater - starterWater
  const sum = t.flours.reduce((a, f) => a + Math.max(0, f.pct), 0) || 1
  const flours = t.flours.map((f) => ({ name: f.name, pct: (Math.max(0, f.pct) / sum) * 100, g: (addFlour * Math.max(0, f.pct)) / sum }))
  return {
    totalFlour, totalWater, starter, starterFlour, starterWater, addFlour, addWater,
    salt: sa * totalFlour, inclusions: inc * totalFlour, flours,
    dough: addFlour + addWater + starter + sa * totalFlour + inc * totalFlour,
    valid: addFlour >= 0 && addWater >= 0,
    prefermented: totalFlour ? starterFlour / totalFlour : 0,
  }
}

export interface Recipe { flour: number; water: number; starter: number; starterHyd: number; salt: number; otherLiquid: number }
export interface Analysis { totalFlour: number; totalWater: number; hydration: number; naiveHydration: number; saltPct: number; starterPct: number; prefermented: number; dough: number }

/** True hydration counts the flour and water inside the starter; "naive" ignores the starter. */
export function analyze(r: Recipe): Analysis {
  const { flour: sf, water: sw } = splitStarter(r.starter, r.starterHyd)
  const totalFlour = r.flour + sf
  const totalWater = r.water + sw + r.otherLiquid
  return {
    totalFlour, totalWater,
    hydration: totalFlour ? (totalWater / totalFlour) * 100 : 0,
    naiveHydration: r.flour ? ((r.water + r.otherLiquid) / r.flour) * 100 : 0,
    saltPct: totalFlour ? (r.salt / totalFlour) * 100 : 0,
    starterPct: totalFlour ? (r.starter / totalFlour) * 100 : 0,
    prefermented: totalFlour ? (sf / totalFlour) * 100 : 0,
    dough: r.flour + r.water + r.starter + r.salt + r.otherLiquid,
  }
}

/** Water to add (or remove, negative) to move a recipe to a target hydration. */
export function waterForHydration(r: Recipe, target: number): number {
  const a = analyze(r)
  return (target / 100) * a.totalFlour - a.totalWater
}

export function hydrationFeel(h: number): string {
  if (h < 60) return 'Stiff — bagels, pretzels, enriched loaves'
  if (h < 68) return 'Low — easy to shape, tight crumb (sandwich, beginner)'
  if (h < 75) return 'Medium — classic country loaf, moderately open crumb'
  if (h < 82) return 'High — open crumb, sticky; needs good strength'
  return 'Very high — ciabatta / focaccia territory, wet hands and a bench scraper'
}
