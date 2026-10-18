import { describe, expect, it } from 'vitest'
import { NODES, pathTo, PLANTS, ROOT, validate } from './plant-identifier-key'

describe('plant key', () => {
  it('is a valid binary tree covering every plant once', () => {
    expect(validate()).toEqual([])
    expect(Object.keys(PLANTS).length).toBeGreaterThanOrEqual(30)
  })
  it('paths lead to the right plant', () => {
    const p = pathTo('basil')!
    let node = ROOT
    let to = ''
    for (const s of p) {
      expect(s.node).toBe(node)
      to = NODES[node].opts[s.choice].to
      node = to
    }
    expect(to).toBe('p:basil')
    expect(pathTo('nonexistent')).toBeNull()
  })
})
