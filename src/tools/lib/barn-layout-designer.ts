// Barn layout model: modules on a rectangular floor, space-per-animal checks, overlaps.
// Space allowances are TYPICAL GUIDANCE figures drawn from common extension-service style
// recommendations; local regulations and welfare schemes may require more.

export interface Rule { id: string; name: string; animal: string; m2: number; minSide?: number; color: string; note: string }
export const RULES: Rule[] = [
  { id: 'dairy', name: 'Dairy cow pen (bedded pack)', animal: 'cows', m2: 9.3, color: '#60a5fa', note: '≈ 100 ft² bedded resting area per cow' },
  { id: 'beef', name: 'Beef cattle pen', animal: 'cattle', m2: 4.2, color: '#93c5fd', note: '≈ 40–50 ft² per finishing animal on bedding' },
  { id: 'calf', name: 'Calf pen (group)', animal: 'calves', m2: 2.0, color: '#a5b4fc', note: '≈ 1.5–2.5 m² per calf depending on weight' },
  { id: 'horse', name: 'Horse box stall', animal: 'horses', m2: 13.4, minSide: 3.0, color: '#fbbf24', note: '12 × 12 ft (3.7 × 3.7 m) per horse, min side ≈ 3 m' },
  { id: 'sheep', name: 'Sheep pen', animal: 'ewes', m2: 1.4, color: '#e5e7eb', note: '≈ 15 ft² per ewe (more with lambs)' },
  { id: 'goat', name: 'Goat pen', animal: 'goats', m2: 1.5, color: '#d6d3d1', note: '≈ 15–20 ft² indoor space per goat' },
  { id: 'pig', name: 'Finishing pig pen', animal: 'pigs', m2: 0.8, color: '#f9a8d4', note: '≈ 0.65–1.0 m² per finishing pig' },
  { id: 'hens', name: 'Laying hens (floor)', animal: 'hens', m2: 0.14, color: '#fde68a', note: '≈ 1.5 ft² per bird (floor system)' },
  { id: 'alley', name: 'Alley / walkway', animal: '', m2: 0, minSide: 1.2, color: '#78716c', note: 'Walkways ≥ 1.2 m; feed alleys for tractors ≥ 3.6 m' },
  { id: 'store', name: 'Feed / hay storage', animal: '', m2: 0, color: '#a16207', note: 'Keep dry and away from bedding pens' },
]
export const rule = (id: string) => RULES.find((r) => r.id === id) ?? RULES[0]

export interface Module { id: string; type: string; name: string; x: number; z: number; w: number; d: number; count: number }

export const area = (m: Module) => m.w * m.d
export function capacity(m: Module): number {
  const r = rule(m.type)
  if (!r.m2) return 0
  if (r.minSide && Math.min(m.w, m.d) < r.minSide) return 0
  return Math.floor(area(m) / r.m2 + 1e-9)
}

export type Status = 'ok' | 'tight' | 'over' | 'narrow' | 'n/a'
/** ok = ≥ 100% of guidance per animal, tight = 90–100%, over = < 90%, narrow = below the minimum side. */
export function check(m: Module): { status: Status; perAnimal: number; ratio: number } {
  const r = rule(m.type)
  if (r.minSide && Math.min(m.w, m.d) < r.minSide) return { status: 'narrow', perAnimal: NaN, ratio: NaN }
  if (!r.m2 || m.count <= 0) return { status: 'n/a', perAnimal: NaN, ratio: NaN }
  const perAnimal = area(m) / m.count
  const ratio = perAnimal / r.m2
  return { status: ratio >= 1 ? 'ok' : ratio >= 0.9 ? 'tight' : 'over', perAnimal, ratio }
}

/** Modules are axis-aligned rectangles centred at (x, z). Touching edges do not count as overlap. */
export function overlaps(a: Module, b: Module): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w - 1e-6 && Math.abs(a.z - b.z) * 2 < a.d + b.d - 1e-6
}
export function outside(m: Module, W: number, L: number): boolean {
  return m.x - m.w / 2 < -W / 2 - 1e-6 || m.x + m.w / 2 > W / 2 + 1e-6 || m.z - m.d / 2 < -L / 2 - 1e-6 || m.z + m.d / 2 > L / 2 + 1e-6
}
export function snap(v: number, step: number): number { return step > 0 ? Math.round(v / step) * step : v }

/** Clamp a module's centre so it stays inside the barn. */
export function clampInside(m: Module, W: number, L: number): Module {
  const x = Math.min(W / 2 - m.w / 2, Math.max(-W / 2 + m.w / 2, m.x))
  const z = Math.min(L / 2 - m.d / 2, Math.max(-L / 2 + m.d / 2, m.z))
  return { ...m, x, z }
}
