import { describe, expect, it } from 'vitest'
import { cauchy, crossing, emit, lensmaker, refract, thinLensImage, trace, type El, type V } from './optics-ray-tracer'

const B = { x0: -100, x1: 300, y0: -50, y1: 50 }
const lastDir = (pts: V[]): V => {
  const a = pts[pts.length - 2], b = pts[pts.length - 1]
  return [b[0] - a[0], b[1] - a[1]]
}

describe('optics ray tracer', () => {
  it('Snell: 30° from air into n=1.5', () => {
    const d: V = [Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)]
    const t = refract([d[1] * 0 + Math.sin(Math.PI / 6), -Math.cos(Math.PI / 6)], [0, 1], 1, 1.5)!
    expect(Math.asin(Math.abs(t[0]))).toBeCloseTo(Math.asin(Math.sin(Math.PI / 6) / 1.5), 10)
    // total internal reflection from glass at 60°
    expect(refract([Math.sin(Math.PI / 3), -Math.cos(Math.PI / 3)], [0, 1], 1.5, 1)).toBeNull()
  })
  it('thin lens: traced rays from an object point meet at v from 1/f = 1/u + 1/v', () => {
    const f = 10, u = 30
    const lens: El[] = [{ id: 'l', kind: 'thin', x: 0, y: 0, a: 20, f }]
    const obj: V = [-u, 3]
    const r1 = trace(obj, [1, 0], lens, B)
    const r2 = trace(obj, [1, -0.2], lens, B)
    const p = crossing(r1[1], lastDir(r1), r2[1], lastDir(r2))!
    const { v, m } = thinLensImage(f, u)
    expect(v).toBeCloseTo(15, 10)
    expect(p[0]).toBeCloseTo(v, 6)
    expect(p[1]).toBeCloseTo(3 * m, 6)
  })
  it('thick lens focuses paraxial rays near the lensmaker focal length', () => {
    const n = 1.5, r1 = 20, r2 = -20, t = 2
    const lens: El[] = [{ id: 't', kind: 'thick', x: 0, y: 0, a: 6, r1, r2, t, n }]
    const pts = trace([-50, 0.2], [1, 0], lens, B)
    const d = lastDir(pts)
    const exit = pts[pts.length - 2]
    const xAxis = exit[0] - exit[1] * (d[0] / d[1])
    const f = lensmaker(n, r1, r2, t)
    // back focal distance = f − f(n−1)t/(n r1) measured from the back vertex
    const bfd = f * (1 - ((n - 1) * t) / (n * r1))
    expect(xAxis - t / 2).toBeCloseTo(bfd, 1)
    expect(f).toBeCloseTo(1 / (0.5 * (0.1 + (0.5 * 2) / (1.5 * 400) * -1)), 6)
  })
  it('concave mirror focuses parallel rays at R/2', () => {
    const m: El[] = [{ id: 'm', kind: 'mirror', x: 50, y: 0, a: 10, r: -40 }]
    const pts = trace([0, 1], [1, 0], m, B)
    const d = lastDir(pts)
    const hit = pts[1]
    const xAxis = hit[0] - hit[1] * (d[0] / d[1])
    expect(d[0]).toBeLessThan(0)
    expect(xAxis).toBeCloseTo(30, 1)
  })
  it('prism disperses blue more than red; sources emit as configured', () => {
    expect(cauchy(1.5, 589)).toBeCloseTo(1.5, 10)
    expect(cauchy(1.5, 450)).toBeGreaterThan(cauchy(1.5, 650))
    const rays = emit({ kind: 'point', x: 0, y: 0, angle: 0, spread: 20, width: 0, count: 5, white: true })
    expect(rays.length).toBe(35)
    const par = emit({ kind: 'parallel', x: 0, y: 0, angle: 0, spread: 0, width: 10, count: 3, white: false })
    expect(par.map((r) => r.o[1])).toEqual([-5, 0, 5])
  })
})
