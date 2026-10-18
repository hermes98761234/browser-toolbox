// Rolled I/H steel sections: nominal dimensions → geometric properties (via the polygon section solver).
import { sectionProps, type P } from './section-properties-calculator'

export type Family = 'IPE' | 'HEA' | 'HEB' | 'W'
export interface Section {
  name: string
  family: Family
  /** Depth h, flange width b, web tw, flange tf, root radius r — all mm. */
  h: number
  b: number
  tw: number
  tf: number
  r: number
}

// EN 10365 nominal dimensions, mm: h b tw tf r
const EN: Record<'IPE' | 'HEA' | 'HEB', string> = {
  IPE: `80 80 46 3.8 5.2 5|100 100 55 4.1 5.7 7|120 120 64 4.4 6.3 7|140 140 73 4.7 6.9 7|160 160 82 5 7.4 9|180 180 91 5.3 8 9|200 200 100 5.6 8.5 12|220 220 110 5.9 9.2 12|240 240 120 6.2 9.8 15|270 270 135 6.6 10.2 15|300 300 150 7.1 10.7 15|330 330 160 7.5 11.5 18|360 360 170 8 12.7 18|400 400 180 8.6 13.5 21|450 450 190 9.4 14.6 21|500 500 200 10.2 16 21|550 550 210 11.1 17.2 24|600 600 220 12 19 24`,
  HEA: `100 96 100 5 8 12|120 114 120 5 8 12|140 133 140 5.5 8.5 12|160 152 160 6 9 15|180 171 180 6 9.5 15|200 190 200 6.5 10 18|220 210 220 7 11 18|240 230 240 7.5 12 21|260 250 260 7.5 12.5 24|280 270 280 8 13 24|300 290 300 8.5 14 27|320 310 300 9 15.5 27|340 330 300 9.5 16.5 27|360 350 300 10 17.5 27|400 390 300 11 19 27|450 440 300 11.5 21 27|500 490 300 12 23 27`,
  HEB: `100 100 100 6 10 12|120 120 120 6.5 11 12|140 140 140 7 12 12|160 160 160 8 13 15|180 180 180 8.5 14 15|200 200 200 9 15 18|220 220 220 9.5 16 18|240 240 240 10 17 21|260 260 260 10 17.5 24|280 280 280 10.5 18 24|300 300 300 11 19 27|320 320 300 11.5 20.5 27|340 340 300 12 21.5 27|360 360 300 12.5 22.5 27|400 400 300 13.5 24 27|450 450 300 14 26 27|500 500 300 14.5 28 27`,
}
// AISC W shapes, inches: d bf tw tf kdes (root radius ≈ kdes − tf)
const W = `8x10 7.89 3.94 0.17 0.205 0.505|6x15 5.99 5.99 0.23 0.26 0.51|8x31 8 8 0.285 0.435 0.829|10x12 9.87 3.96 0.19 0.21 0.51|10x49 9.98 10 0.34 0.56 0.954|12x26 12.2 6.49 0.23 0.38 0.68|12x50 12.2 8.08 0.37 0.64 1.14|12x65 12.1 12 0.39 0.605 1.2|14x22 13.7 5 0.23 0.335 0.735|14x30 13.8 6.73 0.27 0.385 0.785|14x90 14 14.5 0.44 0.71 1.31|16x26 15.7 5.5 0.25 0.345 0.747|16x40 16 7 0.305 0.505 0.907|18x35 17.7 6 0.3 0.425 0.827|18x50 18 7.5 0.355 0.57 0.972|21x44 20.7 6.5 0.35 0.45 0.95|24x55 23.6 7.01 0.395 0.505 1.01|24x76 23.9 8.99 0.44 0.68 1.18|27x84 26.7 10 0.46 0.64 1.24|30x99 29.7 10.5 0.52 0.67 1.27`

export const SECTIONS: Section[] = [
  ...(['IPE', 'HEA', 'HEB'] as const).flatMap((f) => EN[f].split('|').map((l) => {
    const [n, h, b, tw, tf, r] = l.split(' ').map(Number)
    return { name: `${f} ${n}`, family: f, h, b, tw, tf, r }
  })),
  ...W.split('|').map((l) => {
    const [n, ...v] = l.split(' ')
    const [d, bf, tw, tf, k] = v.map((x) => Number(x) * 25.4)
    return { name: `W${n}`, family: 'W' as Family, h: d, b: bf, tw, tf, r: Math.max(0, k - tf) }
  }),
]

/** Outline polygon of a doubly symmetric I section with root fillets; origin at bottom-left. */
export function outline(s: Section, seg = 10): P[] {
  const { h, b, tw, tf, r } = s
  const x0 = (b - tw) / 2, x1 = (b + tw) / 2
  const arc = (cx: number, cy: number, a0: number, a1: number): P[] =>
    Array.from({ length: seg + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / seg; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as P })
  const pi = Math.PI
  if (r <= 0) return [[0, 0], [b, 0], [b, tf], [x1, tf], [x1, h - tf], [b, h - tf], [b, h], [0, h], [0, h - tf], [x0, h - tf], [x0, tf], [0, tf]]
  return [
    [0, 0], [b, 0], [b, tf],
    ...arc(x1 + r, tf + r, (3 * pi) / 2, pi),
    ...arc(x1 + r, h - tf - r, pi, pi / 2),
    [b, h - tf], [b, h], [0, h], [0, h - tf],
    ...arc(x0 - r, h - tf - r, pi / 2, 0),
    ...arc(x0 - r, tf + r, 0, -pi / 2),
    [0, tf],
  ]
}

export interface SectionProps {
  /** mm², mm⁴, mm³, mm, mm⁶, kg/m */
  A: number
  Iy: number
  Iz: number
  Wely: number
  Welz: number
  Wply: number
  Wplz: number
  iy: number
  iz: number
  It: number
  Iw: number
  mass: number
  /** Painting surface per metre, m²/m. */
  surface: number
}

export const DENSITY = 7850

/** Torsion constant of a rolled I section including root fillets (El Darwish & Johnston approximation). */
export function torsion(s: Section): number {
  const { h, b, tw, tf, r } = s
  if (r <= 0) return (2 * b * tf ** 3 + (h - 2 * tf) * tw ** 3) / 3
  const a = -0.042 + 0.2204 * (tw / tf) + 0.1355 * (r / tf) - 0.0865 * ((r * tw) / tf ** 2) - 0.0725 * (tw ** 2 / tf ** 2)
  const D = ((tf + r) ** 2 + tw * (r + tw / 4)) / (2 * r + tf)
  return (2 / 3) * b * tf ** 3 + (1 / 3) * (h - 2 * tf) * tw ** 3 + 2 * a * D ** 4 - 0.42 * tf ** 4
}

const cache = new Map<string, SectionProps>()
export function props(s: Section): SectionProps {
  const hit = cache.get(s.name)
  if (hit) return hit
  const p = sectionProps([{ hole: false, pts: outline(s) }])!
  // outer perimeter: flange faces and tips, inner flange faces, web faces; each fillet swaps 2r of corner for a quarter arc
  const surface = (4 * s.b - 2 * s.tw + 2 * s.h - (8 - 2 * Math.PI) * s.r) / 1000
  const out: SectionProps = {
    A: p.A, Iy: p.Ix, Iz: p.Iy, Wely: Math.min(p.SxTop, p.SxBot), Welz: Math.min(p.SyLeft, p.SyRight), Wply: p.Zx, Wplz: p.Zy,
    iy: p.rx, iz: p.ry, It: torsion(s), Iw: (p.Iy * (s.h - s.tf) ** 2) / 4, mass: p.A * 1e-6 * DENSITY, surface,
  }
  cache.set(s.name, out)
  return out
}

export interface Filter { families: Family[]; minIy: number; minWply: number; maxH: number; maxMass: number }

/** Sections matching the filter, lightest first. */
export function select(f: Filter, list: Section[] = SECTIONS): Section[] {
  return list
    .filter((s) => f.families.includes(s.family) && s.h <= f.maxH)
    .filter((s) => { const p = props(s); return p.Iy >= f.minIy && p.Wply >= f.minWply && p.mass <= f.maxMass })
    .sort((a, b) => props(a).mass - props(b).mass)
}
