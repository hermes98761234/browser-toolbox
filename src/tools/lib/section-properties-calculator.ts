// Section properties of polygonal cross sections (with holes) via Green's theorem line integrals.

export type P = [number, number]
export interface Contour {
  pts: P[]
  hole: boolean
}

export interface Props {
  A: number
  cx: number
  cy: number
  /** Centroidal second moments. */
  Ix: number
  Iy: number
  Ixy: number
  J: number
  I1: number
  I2: number
  /** Angle of the major principal axis from x, radians. */
  theta: number
  rx: number
  ry: number
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  /** Elastic section moduli (top/bottom, left/right). */
  SxTop: number
  SxBot: number
  SyLeft: number
  SyRight: number
  /** Plastic section moduli and plastic neutral axis positions. */
  Zx: number
  Zy: number
  pnaY: number
  pnaX: number
}

export function signedArea(p: P[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

/** Orients solids counter-clockwise and holes clockwise so their integrals add with the right sign. */
export function orient(cs: Contour[]): Contour[] {
  return cs.filter((c) => c.pts.length >= 3).map((c) => {
    const ccw = signedArea(c.pts) > 0
    return { hole: c.hole, pts: ccw === !c.hole ? c.pts : [...c.pts].reverse() }
  })
}

interface Raw { A: number; Qx: number; Qy: number; Ixx: number; Iyy: number; Ixy: number }

function integrate(cs: Contour[]): Raw {
  const r: Raw = { A: 0, Qx: 0, Qy: 0, Ixx: 0, Iyy: 0, Ixy: 0 }
  for (const c of cs) {
    const p = c.pts
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]
      const a = x0 * y1 - x1 * y0
      r.A += a / 2
      r.Qx += ((y0 + y1) * a) / 6
      r.Qy += ((x0 + x1) * a) / 6
      r.Ixx += ((y0 * y0 + y0 * y1 + y1 * y1) * a) / 12
      r.Iyy += ((x0 * x0 + x0 * x1 + x1 * x1) * a) / 12
      r.Ixy += ((x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * a) / 24
    }
  }
  return r
}

/** Clips every contour to the half-plane where `side(p) >= 0` (Sutherland–Hodgman against a line). */
function clip(cs: Contour[], side: (p: P) => number): Contour[] {
  return cs.map((c) => {
    const out: P[] = []
    const p = c.pts
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length]
      const sa = side(a), sb = side(b)
      if (sa >= 0) out.push(a)
      if ((sa >= 0) !== (sb >= 0)) {
        const t = sa / (sa - sb)
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
    }
    return { hole: c.hole, pts: out }
  }).filter((c) => c.pts.length >= 3)
}

/** Plastic modulus about a horizontal (axis 'x') or vertical axis: finds the equal-area axis by bisection. */
function plastic(cs: Contour[], axis: 'x' | 'y', lo: number, hi: number, A: number): { Z: number; at: number } {
  const k = axis === 'x' ? 1 : 0
  const above = (v: number) => integrate(clip(cs, (p) => p[k] - v))
  let a = lo, b = hi
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2
    if (above(m).A > A / 2) a = m
    else b = m
  }
  const at = (a + b) / 2
  const up = above(at)
  const dn = integrate(clip(cs, (p) => at - p[k]))
  const qUp = (axis === 'x' ? up.Qx : up.Qy) - up.A * at
  const qDn = dn.A * at - (axis === 'x' ? dn.Qx : dn.Qy)
  return { Z: qUp + qDn, at }
}

export function sectionProps(input: Contour[]): Props | null {
  const cs = orient(input)
  if (!cs.some((c) => !c.hole)) return null
  const r = integrate(cs)
  if (!(r.A > 0)) return null
  const cx = r.Qy / r.A, cy = r.Qx / r.A
  const Ix = r.Ixx - r.A * cy * cy
  const Iy = r.Iyy - r.A * cx * cx
  const Ixy = r.Ixy - r.A * cx * cy
  const avg = (Ix + Iy) / 2, R = Math.hypot((Ix - Iy) / 2, Ixy)
  const theta = 0.5 * Math.atan2(-2 * Ixy, Ix - Iy)
  const all = cs.filter((c) => !c.hole).flatMap((c) => c.pts)
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1])
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys)
  const px = plastic(cs, 'x', ymin, ymax, r.A)
  const py = plastic(cs, 'y', xmin, xmax, r.A)
  return {
    A: r.A, cx, cy, Ix, Iy, Ixy, J: Ix + Iy, I1: avg + R, I2: avg - R, theta,
    rx: Math.sqrt(Ix / r.A), ry: Math.sqrt(Iy / r.A),
    xmin, xmax, ymin, ymax,
    SxTop: Ix / (ymax - cy), SxBot: Ix / (cy - ymin), SyLeft: Iy / (cx - xmin), SyRight: Iy / (xmax - cx),
    Zx: px.Z, Zy: py.Z, pnaY: px.at, pnaX: py.at,
  }
}

// ---------- presets ----------

const rect = (x: number, y: number, w: number, h: number): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const circle = (cx: number, cy: number, r: number, n = 72): P[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as P)

export interface Preset {
  id: string
  name: string
  params: [string, string, number][]
  build: (v: Record<string, number>) => Contour[]
}

export const PRESETS: Preset[] = [
  {
    id: 'ibeam', name: 'I-beam (doubly symmetric)',
    params: [['d', 'Depth d', 300], ['bf', 'Flange width bf', 150], ['tf', 'Flange thickness tf', 10.7], ['tw', 'Web thickness tw', 7.1]],
    build: ({ d, bf, tf, tw }) => [{ hole: false, pts: [[0, 0], [bf, 0], [bf, tf], [(bf + tw) / 2, tf], [(bf + tw) / 2, d - tf], [bf, d - tf], [bf, d], [0, d], [0, d - tf], [(bf - tw) / 2, d - tf], [(bf - tw) / 2, tf], [0, tf]] }],
  },
  { id: 'rect', name: 'Rectangle', params: [['b', 'Width b', 200], ['h', 'Height h', 400]], build: ({ b, h }) => [{ hole: false, pts: rect(0, 0, b, h) }] },
  {
    id: 'rhs', name: 'Hollow rectangle (RHS)', params: [['b', 'Width b', 100], ['h', 'Height h', 200], ['t', 'Wall t', 8]],
    build: ({ b, h, t }) => [{ hole: false, pts: rect(0, 0, b, h) }, { hole: true, pts: rect(t, t, b - 2 * t, h - 2 * t) }],
  },
  {
    id: 'tee', name: 'T-section', params: [['b', 'Flange width b', 200], ['tf', 'Flange t', 20], ['h', 'Total depth h', 220], ['tw', 'Web t', 16]],
    build: ({ b, tf, h, tw }) => [{ hole: false, pts: [[(b - tw) / 2, 0], [(b + tw) / 2, 0], [(b + tw) / 2, h - tf], [b, h - tf], [b, h], [0, h], [0, h - tf], [(b - tw) / 2, h - tf]] }],
  },
  {
    id: 'chan', name: 'Channel (C)', params: [['d', 'Depth d', 200], ['bf', 'Flange width bf', 75], ['tf', 'Flange t', 11.5], ['tw', 'Web t', 8.5]],
    build: ({ d, bf, tf, tw }) => [{ hole: false, pts: [[0, 0], [bf, 0], [bf, tf], [tw, tf], [tw, d - tf], [bf, d - tf], [bf, d], [0, d]] }],
  },
  {
    id: 'angle', name: 'Unequal angle (L)', params: [['a', 'Leg a (vertical)', 150], ['b', 'Leg b (horizontal)', 90], ['t', 'Thickness t', 10]],
    build: ({ a, b, t }) => [{ hole: false, pts: [[0, 0], [b, 0], [b, t], [t, t], [t, a], [0, a]] }],
  },
  { id: 'circle', name: 'Solid circle', params: [['d', 'Diameter d', 100]], build: ({ d }) => [{ hole: false, pts: circle(d / 2, d / 2, d / 2) }] },
  {
    id: 'pipe', name: 'Pipe (CHS)', params: [['d', 'Outer diameter', 168.3], ['t', 'Wall t', 7.1]],
    build: ({ d, t }) => [{ hole: false, pts: circle(d / 2, d / 2, d / 2) }, { hole: true, pts: circle(d / 2, d / 2, d / 2 - t) }],
  },
]

/** Parses "x, y" lines; blank lines separate contours; a line starting with "hole" marks the next contour as a hole. */
export function parseContours(text: string): { contours: Contour[]; errors: string[] } {
  const contours: Contour[] = []
  const errors: string[] = []
  let cur: Contour = { hole: false, pts: [] }
  const flush = () => {
    if (cur.pts.length) {
      if (cur.pts.length < 3) errors.push(`A contour needs at least 3 points (got ${cur.pts.length}).`)
      else contours.push(cur)
    }
    cur = { hole: false, pts: [] }
  }
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) return flush()
    if (/^(hole|solid)\b/i.test(line)) {
      flush()
      cur.hole = /^hole/i.test(line)
      return
    }
    const n = line.split(/[\s,;]+/).map(Number)
    if (n.length !== 2 || n.some((v) => !Number.isFinite(v))) errors.push(`Line ${i + 1}: expected "x, y".`)
    else cur.pts.push([n[0], n[1]])
  })
  flush()
  return { contours, errors }
}

export const contoursToText = (cs: Contour[]) =>
  cs.map((c) => (c.hole ? 'hole\n' : '') + c.pts.map(([x, y]) => `${+x.toFixed(3)}, ${+y.toFixed(3)}`).join('\n')).join('\n\n')
