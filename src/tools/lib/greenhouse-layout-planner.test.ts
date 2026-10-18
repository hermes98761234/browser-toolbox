import { describe, expect, it } from 'vitest'
import { layoutBenches, plantGrid, roofY, stats, type GhOpts } from './greenhouse-layout-planner'

const o: GhOpts = { length: 10, width: 6, layout: 'longitudinal', benchW: 1.2, aisle: 0.8, mainAisle: 1.2, endClear: 0.6, spacing: 0.2, pattern: 'square', edge: 0 }

describe('greenhouse layout planner', () => {
  it('longitudinal benches fit the width', () => {
    const b = layoutBenches(o)
    // 3 benches (3·1.2 + 2·0.8 = 5.2 ≤ 6), 4 would need 7.2
    expect(b).toHaveLength(3)
    expect(b[0].lx).toBeCloseTo(8.8)
    expect(b[0].z).toBeCloseTo(-2)
    expect(b[2].z).toBeCloseTo(2)
  })
  it('peninsula benches on both sides of the main aisle', () => {
    const b = layoutBenches({ ...o, layout: 'peninsula', benchW: 1, aisle: 0.6 })
    // per side floor((8.8+0.6)/1.6) = 5
    expect(b).toHaveLength(10)
    expect(b[0].lz).toBeCloseTo(2.4)
  })
  it('square and triangular plant grids', () => {
    expect(plantGrid(1, 1, 0.25, 'square')).toHaveLength(16)
    const t = plantGrid(1, 1, 0.25, 'triangular')
    // rows: floor((1-0.25)/0.2165)+1 = 4; per row 4,3,4,3
    expect(t).toHaveLength(14)
    expect(plantGrid(0.1, 1, 0.25, 'square')).toHaveLength(0)
    const st = stats(o, layoutBenches(o))
    expect(st.plants).toBe(3 * 6 * 44)
    expect(st.util).toBeCloseTo((3 * 1.2 * 8.8) / 60)
  })
  it('roof profiles pass through eave and ridge', () => {
    expect(roofY('gable', 6, 2, 3.5, 0)).toBeCloseTo(3.5)
    expect(roofY('gable', 6, 2, 3.5, 3)).toBeCloseTo(2)
    expect(roofY('hoop', 6, 2, 3.5, 3)).toBeCloseTo(2)
    expect(roofY('hoop', 6, 2, 3.5, 0)).toBeCloseTo(3.5)
    expect(roofY('hoop', 6, 2, 3.5, 1.5)).toBeGreaterThan(roofY('gable', 6, 2, 3.5, 1.5))
  })
})
