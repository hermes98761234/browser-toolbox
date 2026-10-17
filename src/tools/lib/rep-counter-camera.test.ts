import { describe, expect, it } from 'vitest'
import { cadence, demoDepth, grayCentered, meanAbsDiff, RepDetector } from './rep-counter-camera'

const noise = (seed: number) => {
  let x = seed
  return () => ((x = (x * 16807) % 2147483647) / 2147483647 - 0.5)
}

describe('rep-counter-camera', () => {
  it('counts one rep per cycle of a noisy waveform', () => {
    const d = new RepDetector({ minRange: 4 })
    const r = noise(7)
    for (let t = 0; t < 10 * 2.6 + 0.5; t += 1 / 30) d.push(t, 5 + 20 * demoDepth(t) + 1.5 * r())
    expect(d.reps).toBe(10)
  })
  it('ignores pure noise below the min range', () => {
    const d = new RepDetector({ minRange: 4 })
    const r = noise(3)
    for (let t = 0; t < 30; t += 1 / 30) d.push(t, 10 + 2 * r())
    expect(d.reps).toBe(0)
  })
  it('needs two bursts per rep in motion mode', () => {
    const d = new RepDetector({ minRange: 2, cycles: 2, minGapSec: 0.3 })
    // two motion bursts per 3 s rep
    for (let t = 0; t < 12.2; t += 1 / 30) d.push(t, 10 * Math.max(0, Math.sin((2 * Math.PI * t) / 1.5)))
    expect(d.reps).toBe(4)
  })
  it('debounces reps closer than min gap', () => {
    const d = new RepDetector({ minRange: 1, minGapSec: 2, alpha: 1 })
    for (let t = 0; t < 10; t += 0.05) d.push(t, Math.sin(2 * Math.PI * t) * 5)
    expect(d.reps).toBeLessThanOrEqual(5)
    expect(d.reps).toBeGreaterThanOrEqual(4)
  })
  it('frame helpers', () => {
    const a = grayCentered(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))
    expect(a[0]).toBeCloseTo(127.5)
    expect(meanAbsDiff(a, new Float32Array(2))).toBeCloseTo(127.5)
    expect(cadence([0, 2, 4, 6]).perMin).toBeCloseTo(30)
  })
})
