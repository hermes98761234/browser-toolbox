// Container volumes and soil-mix component quantities.

export type Shape = 'rect' | 'cyl' | 'roundTaper' | 'squareTaper' | 'gallon'
export interface Container { id: string; name: string; shape: Shape; a: number; b: number; c: number; h: number; qty: number }
// rect: a = length, b = width; cyl: a = diameter; roundTaper: a = top Ø, b = bottom Ø; squareTaper: a = top side, b = bottom side;
// gallon: a = nominal US gallons (nursery pots are ~75–85 % of nominal; we use the nominal figure).

export const L_PER_IN3 = 0.016387064
export const L_PER_FT3 = 28.316846592
export const L_PER_GAL = 3.785411784
export const L_PER_DRYQT = 1.101220943
export const L_PER_YD3 = 764.554857984

/** Volume of one container in litres; lengths in cm (metric) or inches (imperial). */
export function containerLitres(c: Container, imperial: boolean): number {
  if (c.shape === 'gallon') return Math.max(0, c.a) * L_PER_GAL
  const k = imperial ? L_PER_IN3 : 0.001
  const h = Math.max(0, c.h)
  let v = 0
  switch (c.shape) {
    case 'rect': v = c.a * c.b * h; break
    case 'cyl': v = (Math.PI / 4) * c.a * c.a * h; break
    case 'roundTaper': v = (Math.PI * h / 12) * (c.a * c.a + c.a * c.b + c.b * c.b); break
    case 'squareTaper': { const A1 = c.a * c.a, A2 = c.b * c.b; v = (h / 3) * (A1 + A2 + Math.sqrt(A1 * A2)); break }
  }
  return Math.max(0, v) * k
}

export type BagUnit = 'L' | 'ft3' | 'qt'
export const bagLitres = (size: number, unit: BagUnit) => size * (unit === 'L' ? 1 : unit === 'ft3' ? L_PER_FT3 : L_PER_DRYQT)

export interface Component { id: string; name: string; parts: number; bag: number; unit: BagUnit; price: number }
export interface Line { c: Component; share: number; litres: number; bags: number; cost: number; leftover: number }

/** Split `litres` across components by parts; whole bags and cost. */
export function mixLines(litres: number, comps: Component[]): Line[] {
  const parts = comps.reduce((a, c) => a + Math.max(0, c.parts), 0)
  return comps.map((c) => {
    const share = parts > 0 ? Math.max(0, c.parts) / parts : 0
    const l = litres * share
    const per = bagLitres(c.bag, c.unit)
    const bags = per > 0 && l > 0 ? Math.ceil(l / per - 1e-9) : 0
    return { c, share, litres: l, bags, cost: bags * Math.max(0, c.price), leftover: bags * per - l }
  })
}

/** Total soil to buy: container volume × fill fraction × (1 + settling allowance). */
export const soilNeeded = (containerL: number, fillPct: number, settlePct: number) => containerL * (fillPct / 100) * (1 + settlePct / 100)
