import { describe, expect, it } from 'vitest'
import { createNet, epoch, evaluate, features, forward, makeData, rng, trainBatch } from './neural-net-playground'

describe('neural-net-playground', () => {
  it('generates balanced datasets in range', () => {
    for (const k of ['circle', 'xor', 'gauss', 'spiral', 'moons'] as const) {
      const d = makeData(k, 200, 0, 3)
      expect(d.length).toBe(200)
      const ones = d.filter((p) => p.label === 1).length
      expect(ones).toBeGreaterThan(60)
      expect(ones).toBeLessThan(140)
      expect(d.every((p) => Math.abs(p.x) <= 7 && Math.abs(p.y) <= 7)).toBe(true)
    }
  })
  it('gradient matches finite differences', () => {
    const net = createNet([2, 3, 1], 'tanh', 5)
    const x = [0.3, -0.7], y = 1
    const loss = (n: typeof net) => {
      const p = forward(n, x).a[2][0]
      return -(y * Math.log(p) + (1 - y) * Math.log(1 - p))
    }
    const w0 = net.W[0][1][0]
    const h = 1e-5
    net.W[0][1][0] = w0 + h
    const lp = loss(net)
    net.W[0][1][0] = w0 - h
    const lm = loss(net)
    net.W[0][1][0] = w0
    const num = (lp - lm) / (2 * h)
    const copy = JSON.parse(JSON.stringify(net))
    trainBatch(copy, [x], [y], 1)
    const analytic = w0 - copy.W[0][1][0] // lr=1 so the update equals the gradient
    expect(analytic).toBeCloseTo(num, 6)
  })
  it('learns XOR with a hidden layer', () => {
    const d = makeData('xor', 300, 0, 2)
    const X = d.map((p) => features(p.x, p.y, ['x', 'y']))
    const Y = d.map((p) => p.label)
    const net = createNet([2, 8, 8, 1], 'tanh', 11)
    const r = rng(1)
    for (let e = 0; e < 150; e++) epoch(net, X, Y, 0.1, 10, 0, r)
    expect(evaluate(net, X, Y).acc).toBeGreaterThan(0.95)
  })
})
