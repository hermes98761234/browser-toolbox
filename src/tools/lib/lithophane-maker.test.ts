import { describe, expect, it } from 'vitest'
import { buildMesh, meshVolume, thickness, toGray, type LithoOpts } from './lithophane-maker'

const O: LithoOpts = { width: 40, minT: 0.8, maxT: 3, border: 0, mode: 'flat', angle: 120 }

function edgesOk(p: Float32Array) {
  const key = (a: number) => `${p[a].toFixed(4)},${p[a + 1].toFixed(4)},${p[a + 2].toFixed(4)}`
  const m = new Map<string, number>()
  for (let i = 0; i < p.length; i += 9) {
    const v = [key(i), key(i + 3), key(i + 6)]
    for (let e = 0; e < 3; e++) {
      const d = `${v[e]}>${v[(e + 1) % 3]}`
      m.set(d, (m.get(d) ?? 0) + 1)
    }
  }
  // every directed edge must have exactly one opposite edge (closed, consistently oriented)
  for (const [d, c] of m) {
    const [a, b] = d.split('>')
    if (c !== 1 || m.get(`${b}>${a}`) !== 1) return false
  }
  return true
}

describe('lithophane', () => {
  it('maps dark to thick', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])
    const g = toGray(rgba, 2, { contrast: 1, brightness: 0, gamma: 1, invert: false })
    expect([...g]).toEqual([0, 1])
    const { t } = thickness(g, 2, 1, O)
    expect(t[0]).toBeCloseTo(3)
    expect(t[1]).toBeCloseTo(0.8)
  })
  it('flat plate volume and closure', () => {
    const g = new Float32Array(6 * 4).fill(1)
    const th = thickness(g, 6, 4, O)
    const m = buildMesh(th.t, th.cols, th.rows, O)
    expect(edgesOk(m)).toBe(true)
    const H = (40 * 3) / 5
    expect(meshVolume(m)).toBeCloseTo(40 * H * 0.8, 3)
  })
  it('curved mode is closed and outward', () => {
    const g = new Float32Array(8 * 5).map((_, i) => (i % 3) / 2)
    const o = { ...O, mode: 'curved' as const, border: 5 }
    const th = thickness(g, 8, 5, o)
    const m = buildMesh(th.t, th.cols, th.rows, o)
    expect(edgesOk(m)).toBe(true)
    expect(meshVolume(m)).toBeGreaterThan(0)
  })
})
