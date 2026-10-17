import { describe, expect, it } from 'vitest'
import { accumulate, estimateMotion, fitSimilarity, gaussSmooth, jitter, requiredZoom, sampleAt } from './video-stabilizer'

// Smooth random texture sampled with bilinear interpolation so sub-pixel and rotated shifts are exact-ish.
function texture(W: number, H: number, seed = 7) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const g = new Float32Array(W * H).map(() => rnd() * 255)
  // blur a little for well-behaved SAD surfaces
  const o = new Float32Array(W * H)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let a = 0
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) a += g[(y + j) * W + x + i]
    o[y * W + x] = a / 9
  }
  return (x: number, y: number) => {
    const xi = Math.max(0, Math.min(W - 2, Math.floor(x))), yi = Math.max(0, Math.min(H - 2, Math.floor(y)))
    const fx = x - xi, fy = y - yi
    return (o[yi * W + xi] * (1 - fx) + o[yi * W + xi + 1] * fx) * (1 - fy) + (o[(yi + 1) * W + xi] * (1 - fx) + o[(yi + 1) * W + xi + 1] * fx) * fy
  }
}
function frame(tex: (x: number, y: number) => number, w: number, h: number, dx: number, dy: number, a = 0) {
  const f = new Float32Array(w * h)
  const c = Math.cos(-a), s = Math.sin(-a)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // content moved by (dx,dy) and rotated by a about centre → sample source at inverse position
    const px = x - w / 2 - dx, py = y - h / 2 - dy
    f[y * w + x] = tex(c * px - s * py + w / 2 + 40, s * px + c * py + h / 2 + 40)
  }
  return f
}

describe('video-stabilizer', () => {
  const tex = texture(300, 220)
  const w = 192, h = 108
  it('estimates integer and sub-pixel translation', () => {
    const a = frame(tex, w, h, 0, 0), b = frame(tex, w, h, 5, -3)
    const m = estimateMotion(a, b, w, h)
    expect(m.dx).toBeCloseTo(5, 0)
    expect(m.dy).toBeCloseTo(-3, 0)
    const c = frame(tex, w, h, 2.5, 1.25)
    const m2 = estimateMotion(a, c, w, h)
    expect(Math.abs(m2.dx - 2.5)).toBeLessThan(0.35)
    expect(Math.abs(m2.dy - 1.25)).toBeLessThan(0.35)
  })
  it('estimates rotation', () => {
    const a = frame(tex, w, h, 0, 0), b = frame(tex, w, h, 1, 0, 0.02)
    const m = estimateMotion(a, b, w, h, { rotation: true })
    expect(m.da).toBeCloseTo(0.02, 2)
  })
  it('fits a similarity exactly', () => {
    const ang = 0.1, k = 1.02
    const pts = [[-10, -5], [10, -5], [10, 5], [-10, 5], [0, 0]].map(([x, y]) => {
      const X = k * (Math.cos(ang) * x - Math.sin(ang) * y) + 3, Y = k * (Math.sin(ang) * x + Math.cos(ang) * y) - 2
      return { x, y, u: X - x, v: Y - y, w: 1 }
    })
    const f = fitSimilarity(pts)
    expect(Math.atan2(f.b, f.a)).toBeCloseTo(ang, 6)
    expect(Math.hypot(f.a, f.b)).toBeCloseTo(k, 6)
    expect(f.tx).toBeCloseTo(3, 6)
    expect(f.ty).toBeCloseTo(-2, 6)
  })
  it('smooths and accumulates', () => {
    gaussSmooth([5, 5, 5, 5], 2).forEach((v) => expect(v).toBeCloseTo(5, 9))
    const tr = accumulate([0, 1, 2], [{ dx: 0, dy: 0, da: 0, conf: 1 }, { dx: 1, dy: 2, da: 0, conf: 1 }, { dx: 1, dy: -1, da: 0, conf: 1 }])
    expect(tr.x).toEqual([0, 1, 2])
    expect(tr.y).toEqual([0, 2, 1])
    const noisy = Array.from({ length: 100 }, (_, i) => (i % 2 ? 3 : -3))
    expect(jitter(gaussSmooth(noisy, 3))).toBeLessThan(jitter(noisy) / 10)
    expect(sampleAt([0, 1, 2], [0, 10, 20], 1.5)).toBe(15)
  })
  it('computes crop zoom', () => {
    expect(requiredZoom({ dx: 0, dy: 0, da: 0 }, 640, 360)).toBe(1)
    // shifting by 32 px horizontally needs Z with 320/Z + 32 <= 320 → Z = 320/288
    expect(requiredZoom({ dx: 32, dy: 0, da: 0 }, 640, 360)).toBeCloseTo(320 / 288, 4)
    expect(requiredZoom({ dx: 0, dy: 0, da: 0.05 }, 640, 360)).toBeGreaterThan(1.05)
  })
})
