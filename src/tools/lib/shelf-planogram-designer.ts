// Planogram maths: shelf gaps, left-to-right facing layout, overflow / clearance checks, capacity and share of shelf.

export interface Product { id: string; name: string; brand: string; w: number; h: number; d: number; color: string; price: number; stack: boolean; img?: string }
export interface Placement { id: string; pid: string; bay: number; shelf: number; facings: number; order: number }
export interface Unit { bays: number; bayW: number; height: number; depth: number; shelves: number[]; thick: number } // cm; shelves = top-surface heights

export const GAP = 0.5 // cm between product groups

/** Vertical clearance above shelf i (to the underside of the next shelf, or the unit top). */
export function clearance(u: Unit, i: number): number {
  const s = [...u.shelves].sort((a, b) => a - b)
  const next = i + 1 < s.length ? s[i + 1] - u.thick : u.height
  return next - s[i]
}

export interface Laid { p: Placement; prod: Product; x: number; width: number; deep: number; high: number; units: number; over: boolean; tall: boolean }

/** Lays out every placement on its shelf from the left edge, in `order`. */
export function layout(u: Unit, products: Product[], placements: Placement[]): Laid[] {
  const out: Laid[] = []
  const byId = new Map(products.map((p) => [p.id, p]))
  for (let b = 0; b < u.bays; b++)
    for (let sh = 0; sh < u.shelves.length; sh++) {
      let x = GAP
      const row = placements.filter((p) => p.bay === b && p.shelf === sh).sort((a, c) => a.order - c.order)
      const clr = clearance(u, sh)
      for (const p of row) {
        const prod = byId.get(p.pid)
        if (!prod) continue
        const width = prod.w * p.facings
        const deep = Math.max(1, Math.floor(u.depth / prod.d))
        const high = prod.stack ? Math.max(1, Math.floor(clr / prod.h)) : 1
        out.push({ p, prod, x, width, deep, high, units: p.facings * deep * high, over: x + width > u.bayW, tall: prod.h > clr })
        x += width + GAP
      }
    }
  return out
}

/** Linear shelf space used per shelf (cm) and fill ratio. */
export function shelfUse(u: Unit, laid: Laid[]) {
  const res: { bay: number; shelf: number; used: number; fill: number }[] = []
  for (let b = 0; b < u.bays; b++)
    for (let s = 0; s < u.shelves.length; s++) {
      const used = laid.filter((l) => l.p.bay === b && l.p.shelf === s).reduce((a, l) => a + l.width + GAP, 0)
      res.push({ bay: b, shelf: s, used, fill: used / u.bayW })
    }
  return res
}

/** Share of linear shelf space by a key (brand, product…). */
export function shareBy(laid: Laid[], key: (l: Laid) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const l of laid) m.set(key(l), (m.get(key(l)) ?? 0) + l.width)
  const tot = [...m.values()].reduce((a, b) => a + b, 0) || 1
  return [...m.entries()].map(([k, v]) => [k, v / tot] as [string, number]).sort((a, b) => b[1] - a[1])
}

/** Most facings of `prod` that still fit after the other items on that shelf. */
export function maxFacings(u: Unit, laid: Laid[], target: Placement, prod: Product): number {
  const others = laid.filter((l) => l.p.bay === target.bay && l.p.shelf === target.shelf && l.p.id !== target.id).reduce((a, l) => a + l.width + GAP, 0)
  return Math.max(0, Math.floor((u.bayW - others - 2 * GAP) / prod.w))
}

/** Evenly spaced shelves from `base` to below the top. */
export function evenShelves(height: number, n: number, base = 12): number[] {
  const step = (height - base) / n
  return Array.from({ length: n }, (_, i) => Math.round(base + i * step))
}
