// NEC 314.16 box fill: conductor volume allowances (Table 314.16(B)) and standard boxes (Table 314.16(A)).

export const GAUGES = ['18', '16', '14', '12', '10', '8', '6'] as const
export type Gauge = (typeof GAUGES)[number]
/** Volume allowance per conductor, cubic inches — NEC Table 314.16(B). */
export const ALLOW: Record<Gauge, number> = { '18': 1.5, '16': 1.75, '14': 2.0, '12': 2.25, '10': 2.5, '8': 3.0, '6': 5.0 }
export const CM3 = 16.387064

/** Standard metal boxes and their volumes in in³ — NEC Table 314.16(A). */
export const BOXES: [string, string, number][] = [
  ['Round/octagonal', '4 × 1¼ in round/octagonal', 12.5],
  ['Round/octagonal', '4 × 1½ in round/octagonal', 15.5],
  ['Round/octagonal', '4 × 2⅛ in round/octagonal', 21.5],
  ['Square', '4 × 1¼ in square', 18.0],
  ['Square', '4 × 1½ in square', 21.0],
  ['Square', '4 × 2⅛ in square', 30.3],
  ['Square', '4¹¹⁄₁₆ × 1¼ in square', 25.5],
  ['Square', '4¹¹⁄₁₆ × 1½ in square', 29.5],
  ['Square', '4¹¹⁄₁₆ × 2⅛ in square', 42.0],
  ['Device', '3 × 2 × 1½ in device', 7.5],
  ['Device', '3 × 2 × 2 in device', 10.0],
  ['Device', '3 × 2 × 2¼ in device', 10.5],
  ['Device', '3 × 2 × 2½ in device', 12.5],
  ['Device', '3 × 2 × 2¾ in device', 14.0],
  ['Device', '3 × 2 × 3½ in device', 18.0],
  ['Device', '4 × 2⅛ × 1½ in device', 10.3],
  ['Device', '4 × 2⅛ × 1⅞ in device', 13.0],
  ['Device', '4 × 2⅛ × 2⅛ in device', 14.5],
  ['Masonry', '3¾ × 2 × 2½ in masonry box/gang', 14.0],
  ['Masonry', '3¾ × 2 × 3½ in masonry box/gang', 21.0],
  ['FS/FD', 'FS — 1¾ in min. depth single cover/gang', 13.5],
  ['FS/FD', 'FD — 2⅜ in min. depth single cover/gang', 18.0],
  ['FS/FD', 'FS — 1¾ in min. depth multiple cover/gang', 18.0],
  ['FS/FD', 'FD — 2⅜ in min. depth multiple cover/gang', 24.0],
]

export type WireKind = 'terminated' | 'through' | 'loop' | 'internal'
export const KIND_COUNT: Record<WireKind, number> = { terminated: 1, through: 1, loop: 2, internal: 0 }

export interface Wire { gauge: Gauge; qty: number; kind: WireKind }
export interface Device { gangs: number; gauge: Gauge }
export interface Fill {
  wires: Wire[]
  egc: boolean
  egcGauge: Gauge
  isoEgc: boolean
  isoGauge: Gauge
  clamps: boolean
  fittings: number
  devices: Device[]
}

export interface Item { label: string; count: number; gauge: Gauge; volume: number }

const largest = (gs: Gauge[]): Gauge | null => (gs.length ? gs.reduce((a, g) => (ALLOW[g] > ALLOW[a] ? g : a)) : null)

export function boxFill(f: Fill): { items: Item[]; required: number; largest: Gauge | null } {
  const items: Item[] = []
  for (const w of f.wires) {
    const c = w.qty * KIND_COUNT[w.kind]
    if (w.qty > 0) items.push({ label: `${w.qty} × ${w.gauge} AWG ${w.kind === 'loop' ? 'loops ≥ 12 in (×2)' : w.kind === 'through' ? 'passing through' : w.kind === 'internal' ? 'pigtails/jumpers (not counted)' : 'spliced / terminated'}`, count: c, gauge: w.gauge, volume: c * ALLOW[w.gauge] })
  }
  const counted = f.wires.filter((w) => w.qty > 0 && KIND_COUNT[w.kind] > 0).map((w) => w.gauge)
  const big = largest([...counted, ...(f.egc ? [f.egcGauge] : [])])
  if (f.egc) items.push({ label: 'Equipment grounding conductors (all, 1 total)', count: 1, gauge: f.egcGauge, volume: ALLOW[f.egcGauge] })
  if (f.isoEgc) items.push({ label: 'Isolated-ground EGCs, 250.146(D) (1 total)', count: 1, gauge: f.isoGauge, volume: ALLOW[f.isoGauge] })
  if (f.clamps && big) items.push({ label: 'Internal cable clamps (1 total, largest conductor)', count: 1, gauge: big, volume: ALLOW[big] })
  if (f.fittings > 0 && big) items.push({ label: `Support fittings — ${f.fittings} type(s), 1 each`, count: f.fittings, gauge: big, volume: f.fittings * ALLOW[big] })
  f.devices.forEach((d, i) => {
    const c = 2 * Math.max(1, d.gangs)
    items.push({ label: `Device ${i + 1}: ${d.gangs > 1 ? `${d.gangs}-gang, ` : ''}2 per yoke/gang`, count: c, gauge: d.gauge, volume: c * ALLOW[d.gauge] })
  })
  const required = items.reduce((a, x) => a + x.volume, 0)
  return { items, required: Math.round(required * 1000) / 1000, largest: big }
}

/** Max number of same-size conductors for a box volume (as in Table 314.16(A)). */
export const maxConductors = (vol: number, g: Gauge) => Math.floor(vol / ALLOW[g] + 1e-9)
