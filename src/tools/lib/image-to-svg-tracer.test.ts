import { describe, expect, it } from 'vitest'
import { binarize, despeckle, otsu, thin, traceCenterline, traceOutline, type TraceOptions } from './image-to-svg-tracer'

const O: TraceOptions = { turdSize: 2, turnPolicy: 'minority', alphaMax: 1, optCurve: true, optTolerance: 0.2 }

function bitmap(w: number, h: number, f: (x: number, y: number) => boolean) {
  const bm = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bm[y * w + x] = f(x + 0.5, y + 0.5) ? 1 : 0
  return bm
}

/** Splits a path string into subpaths and returns their signed areas (Béziers sampled). */
function areas(d: string): number[] {
  const out: number[] = []
  for (const sub of d.split('M').filter(Boolean)) {
    const toks = ('M' + sub).match(/[MCLZ]|-?[\d.]+/g)!
    const pts: [number, number][] = []
    let i = 0, cmd = ''
    while (i < toks.length) {
      if (/[MCLZ]/.test(toks[i])) { cmd = toks[i++]; if (cmd === 'Z') continue }
      const n = () => Number(toks[i++])
      if (cmd === 'M' || cmd === 'L') pts.push([n(), n()])
      else if (cmd === 'C') {
        const p0 = pts[pts.length - 1], c1 = [n(), n()], c2 = [n(), n()], p3 = [n(), n()]
        for (let k = 1; k <= 16; k++) {
          const t = k / 16, s = 1 - t
          pts.push([s ** 3 * p0[0] + 3 * s * s * t * c1[0] + 3 * s * t * t * c2[0] + t ** 3 * p3[0], s ** 3 * p0[1] + 3 * s * s * t * c1[1] + 3 * s * t * t * c2[1] + t ** 3 * p3[1]])
        }
      }
    }
    let a = 0
    for (let k = 0; k < pts.length; k++) { const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length]; a += x1 * y2 - x2 * y1 }
    out.push(a / 2)
  }
  return out
}

describe('thresholding', () => {
  it('otsu splits a bimodal image', () => {
    const g = new Float32Array(1000).map((_, i) => (i < 300 ? 30 + (i % 7) : 220 - (i % 5)))
    const t = otsu(g)
    expect(t).toBeGreaterThan(36)
    expect(t).toBeLessThan(216)
  })
  it('adaptive threshold ignores a lighting gradient that defeats a global threshold', () => {
    const w = 200, h = 60
    const g = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const paper = 250 - x * 0.9 // 250 → 70 shading across the page
      g[y * w + x] = Math.abs(y - 30) < 2 && x > 20 && x < 180 ? paper * 0.45 : paper
    }
    const glob = binarize(g, w, h, { mode: 'otsu', level: 128, window: 10, sensitivity: 15, blur: 0, invert: false })
    const ad = binarize(g, w, h, { mode: 'adaptive', level: 128, window: 15, sensitivity: 20, blur: 0, invert: false })
    const ink = (bm: Uint8Array) => bm.reduce((a, v) => a + v, 0)
    expect(ink(glob.bm)).toBeGreaterThan(2000) // the dark right side floods
    const line = 160 * 3
    expect(Math.abs(ink(ad.bm) - line)).toBeLessThan(line * 0.25)
  })
  it('despeckle removes small specks', () => {
    const bm = bitmap(30, 30, (x, y) => (x > 5 && x < 20 && y > 5 && y < 20) || (x > 25 && x < 27 && y > 25 && y < 27))
    const out = despeckle(bm, 30, 30, 10)
    expect(out.reduce((a, v) => a + v, 0)).toBe(15 * 15)
  })
})

describe('potrace-style outline', () => {
  it('a square becomes one path with 4 corners and exact area', () => {
    const bm = bitmap(40, 40, (x, y) => x > 10 && x < 30 && y > 10 && y < 30)
    const r = traceOutline(bm, 40, 40, O)
    expect(r.paths).toBe(1)
    expect(r.corners).toBe(4)
    expect(Math.abs(Math.abs(areas(r.d)[0]) - 400)).toBeLessThan(4)
  })
  it('a disc becomes smooth curves with area ≈ πr²', () => {
    const R = 30
    const bm = bitmap(80, 80, (x, y) => (x - 40) ** 2 + (y - 40) ** 2 < R * R)
    const r = traceOutline(bm, 80, 80, O)
    expect(r.paths).toBe(1)
    expect(r.corners).toBe(0)
    expect(r.curves).toBeLessThanOrEqual(8)
    const px = bm.reduce((a, v) => a + v, 0)
    expect(Math.abs(Math.abs(areas(r.d)[0]) / px - 1)).toBeLessThan(0.02) // within opttolerance
    const raw = traceOutline(bm, 80, 80, { ...O, optCurve: false })
    expect(Math.abs(Math.abs(areas(raw.d)[0]) / px - 1)).toBeLessThan(0.02)
  })
  it('a ring yields outer boundary and hole', () => {
    const bm = bitmap(80, 80, (x, y) => { const d = Math.hypot(x - 40, y - 40); return d < 30 && d > 18 })
    const r = traceOutline(bm, 80, 80, O)
    expect(r.paths).toBe(2)
    const a = areas(r.d).map(Math.abs).sort((p, q) => q - p)
    expect(a[0] / (Math.PI * 900)).toBeCloseTo(1, 1)
    expect(a[1] / (Math.PI * 324)).toBeCloseTo(1, 1)
  })
  it('without curve optimisation there are more segments', () => {
    const bm = bitmap(80, 80, (x, y) => (x - 40) ** 2 / 900 + (y - 40) ** 2 / 300 < 1)
    const a = traceOutline(bm, 80, 80, O), b = traceOutline(bm, 80, 80, { ...O, optCurve: false })
    expect(b.curves).toBeGreaterThan(a.curves)
  })
  it('turd size drops tiny specks', () => {
    const bm = bitmap(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30) || (x > 35 && x < 37 && y > 2 && y < 4))
    expect(traceOutline(bm, 40, 40, { ...O, turdSize: 5 }).paths).toBe(1)
    expect(traceOutline(bm, 40, 40, { ...O, turdSize: 0 }).paths).toBe(2)
  })
})

describe('centerline', () => {
  it('thinning keeps a 1px line', () => {
    const bm = bitmap(100, 40, (x, y) => Math.abs(y - 20) < 3 && x > 10 && x < 90)
    const sk = thin(bm, 100, 40)
    const n = sk.reduce((a, v) => a + v, 0)
    expect(n).toBeGreaterThan(70)
    expect(n).toBeLessThan(85)
  })
  it('a thick stroke becomes one centred stroke with the right width', () => {
    const bm = bitmap(120, 40, (x, y) => Math.abs(y - 20) < 3 && x > 10 && x < 110)
    const r = traceCenterline(bm, 120, 40, { minSpur: 6, error: 1, smoothing: 2, widthMode: 'auto', width: 2 })
    expect(r.strokes.length).toBe(1)
    expect(r.strokes[0].width).toBeGreaterThan(4.5)
    expect(r.strokes[0].width).toBeLessThan(7)
    const nums = r.strokes[0].d.match(/-?[\d.]+/g)!.map(Number)
    for (let i = 1; i < nums.length; i += 2) expect(Math.abs(nums[i] - 20)).toBeLessThan(1.5)
  })
  it('a plus sign gives four arms meeting at a junction', () => {
    const bm = bitmap(80, 80, (x, y) => (Math.abs(y - 40) < 2 && x > 10 && x < 70) || (Math.abs(x - 40) < 2 && y > 10 && y < 70))
    const r = traceCenterline(bm, 80, 80, { minSpur: 6, error: 1, smoothing: 1, widthMode: 'auto', width: 2 })
    expect(r.strokes.length).toBe(4)
  })
  it('a circle outline becomes a closed loop', () => {
    const bm = bitmap(80, 80, (x, y) => Math.abs(Math.hypot(x - 40, y - 40) - 25) < 1.6)
    const r = traceCenterline(bm, 80, 80, { minSpur: 6, error: 1, smoothing: 2, widthMode: 'auto', width: 2 })
    expect(r.strokes.length).toBe(1)
    expect(Math.abs(areas(r.strokes[0].d)[0]) / (Math.PI * 625)).toBeCloseTo(1, 1)
  })
})
