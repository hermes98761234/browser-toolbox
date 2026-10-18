import { describe, expect, it } from 'vitest'
import { iris } from './pca-visualizer'
import { confusion, describeSplit, holdout, importance, impurity, layout, leaves, parseCsv, predict, predictPath, prune, pruningPath, toDataset, train, type Params } from './decision-tree-visualizer'

const P: Params = { criterion: 'gini', maxDepth: 20, minSplit: 2, minLeaf: 1 }
const irisDs = () => {
  const d = iris()
  return toDataset([[...d.features, 'species'], ...d.rows.map((r, i) => [...r.map(String), d.labels[i]])], 4)
}

describe('decision tree', () => {
  it('impurity measures', () => {
    expect(impurity([50, 50, 50], 150, 'gini')).toBeCloseTo(2 / 3)
    expect(impurity([5, 5], 10, 'entropy')).toBeCloseTo(1)
    expect(impurity([10, 0], 10, 'gini')).toBe(0)
  })
  it('parses quoted CSV and detects types', () => {
    const rows = parseCsv('a,b,c\n1,"x, y",yes\n2,z,no\n')
    expect(rows[1]).toEqual(['1', 'x, y', 'yes'])
    const d = toDataset(rows, 2)
    expect(d.numeric).toEqual([true, false])
    expect(d.classes).toEqual(['no', 'yes'])
  })
  it('Iris root split isolates setosa (petal length ≤ 2.45, Gini 0.667)', () => {
    const d = irisDs()
    const all = d.y.map((_, i) => i)
    const t = train(d, all, P)
    expect(t.impurity).toBeCloseTo(0.6667, 4)
    expect(describeSplit(d, t)).toBe('petal length ≤ 2.45')
    expect(t.left!.counts).toEqual([50, 0, 0])
    // fully grown tree fits the training set except duplicate points with different labels
    expect(confusion(t, d, all).acc).toBeGreaterThanOrEqual(149 / 150)
    const imp = importance(t, 4)
    expect(imp.reduce((a, b) => a + b)).toBeCloseTo(1)
    expect(imp[2] + imp[3]).toBeGreaterThan(0.85)
  })
  it('depth-limited Iris reaches the textbook 2-level accuracy', () => {
    const d = irisDs()
    const all = d.y.map((_, i) => i)
    const t = train(d, all, { ...P, maxDepth: 2 })
    expect(leaves(t).length).toBe(3)
    expect(confusion(t, d, all).acc).toBeCloseTo(144 / 150, 6)
  })
  it('categorical subset split on a toy weather table', () => {
    const csv = 'outlook,windy,play\nsunny,no,no\nsunny,yes,no\novercast,no,yes\nrain,no,yes\nrain,yes,no\novercast,yes,yes\nsunny,no,no\nrain,no,yes\n'
    const d = toDataset(parseCsv(csv), 2)
    const t = train(d, d.y.map((_, i) => i), P)
    expect(t.cats).toBeDefined()
    expect(predict(t, ['overcast', 'yes'])).toBe(d.classes.indexOf('yes'))
    expect(predict(t, ['sunny', 'no'])).toBe(d.classes.indexOf('no'))
    expect(predictPath(t, ['rain', 'yes']).length).toBeGreaterThan(1)
  })
  it('cost-complexity pruning shrinks monotonically to the root', () => {
    const d = irisDs()
    const t = train(d, d.y.map((_, i) => i), P)
    const path = pruningPath(t)
    expect(path[0].leaves).toBe(leaves(t).length)
    expect(path.at(-1)!.leaves).toBe(1)
    for (let i = 1; i < path.length; i++) {
      expect(path[i].alpha).toBeGreaterThanOrEqual(path[i - 1].alpha)
      expect(path[i].leaves).toBeLessThan(path[i - 1].leaves)
    }
    expect(leaves(prune(t, 1)).length).toBe(1)
    expect(leaves(prune(t, 0)).length).toBeLessThanOrEqual(leaves(t).length)
    // the setosa split has g = (100/150 − 50/150)/1 … always survives modest alphas
    expect(leaves(prune(t, 0.05)).length).toBeGreaterThanOrEqual(2)
  })
  it('stratified holdout and layout', () => {
    const d = irisDs()
    const h = holdout(d, 0.3, 42)
    expect(h.test.length).toBe(45)
    expect(h.train.length + h.test.length).toBe(150)
    expect(h.test.filter((i) => d.y[i] === 'setosa').length).toBe(15)
    const t = train(d, h.train, { ...P, maxDepth: 3 })
    const L = layout(t)
    expect(L.placed.length).toBe(2 * leaves(t).length - 1)
    const root = L.placed.find((p) => !p.parent)!
    expect(root.x).toBeGreaterThan(0)
    expect(confusion(t, d, h.test).acc).toBeGreaterThan(0.85)
  })
})
