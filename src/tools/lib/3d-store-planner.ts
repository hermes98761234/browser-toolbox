// Retail floor-plan geometry: fixture footprints, overlap and aisle-width checks, shelf capacity.

export type Kind = 'gondola' | 'wall' | 'endcap' | 'fridge' | 'checkout' | 'table' | 'rack' | 'pallet'
export interface Fixture { id: string; kind: Kind; name: string; w: number; d: number; h: number; x: number; z: number; rot: number; levels: number; sides: number; color: string }
export interface Store { w: number; d: number; h: number; door: number; doorW: number }

export const CATALOG: Omit<Fixture, 'id' | 'x' | 'z' | 'rot'>[] = [
  { kind: 'gondola', name: 'Gondola 2.4 m (double)', w: 2.4, d: 1.0, h: 1.6, levels: 5, sides: 2, color: '#64748b' },
  { kind: 'gondola', name: 'Gondola 1.2 m (double)', w: 1.2, d: 1.0, h: 1.6, levels: 5, sides: 2, color: '#64748b' },
  { kind: 'wall', name: 'Wall shelf 3 m', w: 3.0, d: 0.5, h: 2.0, levels: 6, sides: 1, color: '#475569' },
  { kind: 'endcap', name: 'End cap', w: 1.0, d: 0.5, h: 1.6, levels: 4, sides: 1, color: '#f97316' },
  { kind: 'fridge', name: 'Fridge 3-door', w: 2.0, d: 0.8, h: 2.0, levels: 5, sides: 1, color: '#e2e8f0' },
  { kind: 'checkout', name: 'Checkout counter', w: 1.8, d: 0.8, h: 0.9, levels: 0, sides: 0, color: '#0ea5e9' },
  { kind: 'table', name: 'Display table', w: 1.5, d: 0.9, h: 0.8, levels: 1, sides: 0, color: '#a16207' },
  { kind: 'rack', name: 'Clothing rack', w: 1.5, d: 0.6, h: 1.6, levels: 1, sides: 0, color: '#334155' },
  { kind: 'pallet', name: 'Pallet display', w: 1.2, d: 0.8, h: 1.0, levels: 1, sides: 0, color: '#d97706' },
]

/** Axis-aligned footprint after rotation (exact for any angle). */
export function foot(f: Pick<Fixture, 'w' | 'd' | 'rot'>) {
  const a = (f.rot * Math.PI) / 180
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a))
  return { fw: f.w * c + f.d * s, fd: f.w * s + f.d * c }
}

export function clampFix<T extends Fixture>(f: T, st: Pick<Store, 'w' | 'd'>): T {
  const { fw, fd } = foot(f)
  const cl = (v: number, half: number, max: number) => (2 * half >= max ? max / 2 : Math.min(max - half, Math.max(half, v)))
  return { ...f, x: cl(f.x, fw / 2, st.w), z: cl(f.z, fd / 2, st.d) }
}

interface Box { x0: number; x1: number; z0: number; z1: number }
const box = (f: Fixture): Box => {
  const { fw, fd } = foot(f)
  return { x0: f.x - fw / 2, x1: f.x + fw / 2, z0: f.z - fd / 2, z1: f.z + fd / 2 }
}

export function overlaps(items: Fixture[]): [Fixture, Fixture][] {
  const out: [Fixture, Fixture][] = []
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = box(items[i]), b = box(items[j])
      if (a.x0 < b.x1 - 0.005 && b.x0 < a.x1 - 0.005 && a.z0 < b.z1 - 0.005 && b.z0 < a.z1 - 0.005) out.push([items[i], items[j]])
    }
  return out
}

export interface Aisle { a: string; b: string; gap: number; axis: 'x' | 'z'; at: number; from: number; to: number }

/**
 * Walkway widths: gaps between fixtures that face each other (their footprints overlap by
 * at least 0.3 m along the other axis) and gaps to walls. Fixtures touching a wall (< 5 cm) are "against" it.
 */
export function aisles(items: Fixture[], st: Pick<Store, 'w' | 'd'>): Aisle[] {
  const out: Aisle[] = []
  const bs = items.map(box)
  const blocked = (axis: 'x' | 'z', lo: number, hi: number, s0: number, s1: number, skip: number[]) =>
    bs.some((b, k) => !skip.includes(k) && (axis === 'x' ? b.x0 < hi && b.x1 > lo && b.z0 < s1 && b.z1 > s0 : b.z0 < hi && b.z1 > lo && b.x0 < s1 && b.x1 > s0))
  for (let i = 0; i < items.length; i++) {
    const a = bs[i]
    for (let j = i + 1; j < items.length; j++) {
      const b = bs[j]
      const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0)
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
      if (oz >= 0.3) {
        const [l, r] = a.x1 <= b.x0 ? [a, b] : [b, a]
        const gap = r.x0 - l.x1
        const s0 = Math.max(a.z0, b.z0), s1 = Math.min(a.z1, b.z1)
        if (gap > 0.005 && !blocked('x', l.x1, r.x0, s0, s1, [i, j])) out.push({ a: items[i].id, b: items[j].id, gap, axis: 'x', at: (s0 + s1) / 2, from: l.x1, to: r.x0 })
      } else if (ox >= 0.3) {
        const [l, r] = a.z1 <= b.z0 ? [a, b] : [b, a]
        const gap = r.z0 - l.z1
        const s0 = Math.max(a.x0, b.x0), s1 = Math.min(a.x1, b.x1)
        if (gap > 0.005 && !blocked('z', l.z1, r.z0, s0, s1, [i, j])) out.push({ a: items[i].id, b: items[j].id, gap, axis: 'z', at: (s0 + s1) / 2, from: l.z1, to: r.z0 })
      }
    }
    const walls: [number, 'x' | 'z', number, number][] = [
      [a.x0, 'x', 0, a.x0],
      [st.w - a.x1, 'x', a.x1, st.w],
      [a.z0, 'z', 0, a.z0],
      [st.d - a.z1, 'z', a.z1, st.d],
    ]
    for (const [gap, axis, from, to] of walls) {
      if (gap <= 0.05) continue
      const at = axis === 'x' ? (a.z0 + a.z1) / 2 : (a.x0 + a.x1) / 2
      const [s0, s1] = axis === 'x' ? [a.z0, a.z1] : [a.x0, a.x1]
      if (!blocked(axis, from, to, s0, s1, [i])) out.push({ a: items[i].id, b: 'wall', gap, axis, at, from, to })
    }
  }
  return out
}

/** Linear metres of shelving (width × levels × sides). */
export const shelfMeters = (items: Fixture[]) => items.reduce((a, f) => a + f.w * f.levels * f.sides, 0)

/** Fixtures intruding into the clear zone in front of the entrance (front wall, z = d). */
export function doorBlockers(items: Fixture[], st: Store, clear = 1.5): Fixture[] {
  const x0 = st.door - st.doorW / 2, x1 = st.door + st.doorW / 2
  return items.filter((f) => {
    const b = box(f)
    return b.x0 < x1 && b.x1 > x0 && b.z1 > st.d - clear
  })
}
