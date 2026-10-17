import { describe, expect, it } from 'vitest'
import { neighbours, relation, resize, tally } from './square-foot-garden'

describe('square-foot-garden', () => {
  it('knows relations', () => {
    expect(relation('tomato', 'basil')).toBe('good')
    expect(relation('onion', 'bean')).toBe('bad')
    expect(relation('tomato', 'tomato')).toBeNull()
  })
  it('finds neighbour issues including diagonals once', () => {
    // 2×2: bean onion / null tomato → bean-onion bad (horizontal), onion-tomato none, bean-tomato none (diagonal)
    const iss = neighbours(['bean', 'onion', 'basil', 'tomato'], 2)
    expect(iss.filter((x) => x.kind === 'bad')).toEqual([{ a: 0, b: 1, kind: 'bad' }])
    expect(iss.filter((x) => x.kind === 'good')).toEqual([{ a: 2, b: 3, kind: 'good' }])
    expect(neighbours(['onion', null, null, 'pea'], 2)).toEqual([{ a: 0, b: 3, kind: 'bad' }])
  })
  it('tallies plants per square', () => {
    const t = tally(['carrot', 'carrot', 'tomato', 'zucchini', 'zucchini', 'zucchini', 'zucchini', null])
    expect(t.find((x) => x.id === 'carrot')).toEqual({ id: 'carrot', squares: 2, plants: 32 })
    expect(t.find((x) => x.id === 'zucchini')?.plants).toBe(1)
  })
  it('resizes grids', () => {
    expect(resize(['a', 'b', 'c', 'd'], 2, 3, 1)).toEqual(['a', 'b', null])
  })
})
