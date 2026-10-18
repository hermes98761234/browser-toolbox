import { describe, expect, it } from 'vitest'
import { changes, combos, planSets, ramp, sleeveUsed, stack, type Plate } from './plate-loading-calculator'

const P = (w: number, pairs = 4, mm = 25): Plate => ({ w, pairs, mm, bumper: false })
const KG = [P(25), P(20), P(15), P(10), P(5), P(2.5), P(1.25)]

describe('plate loading', () => {
  it('enumerates exact combinations, fewest plates first', () => {
    const c = combos(25, KG)
    expect(c[0]).toEqual([1, 0, 0, 0, 0, 0, 0])
    expect(c.some((x) => x[1] === 1 && x[4] === 1)).toBe(true)
    for (const x of c) expect(x.reduce((a, n, i) => a + n * KG[i].w, 0)).toBeCloseTo(25, 9)
  })
  it('respects inventory', () => {
    const lim = [P(20, 1), P(10, 1), P(5, 2)]
    expect(combos(40, lim)).toEqual([[1, 1, 2]])
    expect(combos(45, lim)).toEqual([])
  })
  it('stacks heaviest inside and counts outer moves', () => {
    expect(stack([0, 1, 0, 1, 0, 0, 0], KG)).toEqual([1, 3])
    expect(changes([1, 3], [1, 3, 4])).toBe(1)
    expect(changes([1, 3], [0])).toBe(3)
    expect(changes([], [0, 0])).toBe(2)
  })
  it('fewest-changes ordering never needs more moves than fewest-plates', () => {
    const sets = ramp(140, [{ pct: 30, reps: 10 }, { pct: 50, reps: 5 }, { pct: 70, reps: 3 }, { pct: 85, reps: 1 }], 3, 5, 20, 0)
    const a = planSets({ sets, bar: 20, collars: 0, plates: KG }, false)
    const b = planSets({ sets, bar: 20, collars: 0, plates: KG }, true)
    const sum = (x: typeof a) => x.reduce((s, p) => s + p.moves, 0)
    expect(sum(b)).toBeLessThanOrEqual(sum(a))
    expect(b.map((x) => x.total)).toEqual(a.map((x) => x.total))
    expect(b.at(-1)!.total).toBe(140)
    expect(b[0].label).toBe('Warm-up 30%')
    expect(b[0].total).toBe(40)
    // work sets repeat: zero moves
    expect(b.at(-1)!.moves).toBe(0)
  })
  it('empty bar warm-up and sleeve use', () => {
    const r = ramp(60, [{ pct: 20, reps: 10 }], 1, 5, 20, 0)
    expect(r[0]).toEqual({ label: 'Empty bar', reps: 10, target: 20 })
    expect(ramp(120, [{ pct: 40, reps: 5 }], 0, 5, 20, 0, 5)[0].target).toBe(50)
    expect(sleeveUsed([0, 1], KG, 30)).toBe(80)
    expect(sleeveUsed([], KG, 30)).toBe(0)
  })
})
