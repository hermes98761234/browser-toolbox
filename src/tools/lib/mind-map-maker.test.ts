import { describe, expect, it } from 'vitest'
import { V_GAP, layout, parentOf, parseOutline, removeNode, splitSides, toOutline } from './mind-map-maker'

const size = () => ({ w: 100, h: 30 })

describe('mind-map-maker', () => {
  it('splits top-level branches evenly', () => {
    expect(splitSides([10, 10, 10, 10])).toEqual([1, 1, -1, -1])
    expect(splitSides([50, 10, 10, 10, 10])).toEqual([1, -1, -1, -1, -1])
    expect(splitSides([10])).toEqual([1])
  })
  it('parses and re-serialises an outline', () => {
    const m = parseOutline('Trip\n- Packing\n  - Clothes\n  - Tickets\n- Budget\n\t- Food')!
    expect(m.nodes[m.root].text).toBe('Trip')
    expect(m.nodes[m.root].children.map((c) => m.nodes[c].text)).toEqual(['Packing', 'Budget'])
    expect(toOutline(m)).toBe('Trip\n- Packing\n  - Clothes\n  - Tickets\n- Budget\n  - Food')
    const h = parseOutline('# A\n## B\n### C\n## D')!
    expect(toOutline(h)).toBe('A\n- B\n  - C\n- D')
  })
  it('lays out without overlaps and centres parents on children', () => {
    const m = parseOutline('Root\n- A\n  - A1\n  - A2\n  - A3\n- B\n- C\n- D')!
    const L = layout(m, size)
    expect(L.size).toBe(8)
    const root = L.get(m.root)!
    expect(root.x).toBe(0)
    const boxes = [...L.values()]
    for (const a of boxes) for (const b of boxes) {
      if (a === b) continue
      const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
      expect(overlap).toBe(false)
    }
    const A = [...L.values()].find((b) => m.nodes[b.id].text === 'A')!
    const kids = boxes.filter((b) => b.parent === A.id)
    expect(kids.every((k) => k.side === A.side && k.depth === 2)).toBe(true)
    expect((Math.min(...kids.map((k) => k.y)) + Math.max(...kids.map((k) => k.y))) / 2).toBeCloseTo(A.y)
    expect(Math.abs(kids[1].y - kids[0].y)).toBe(30 + V_GAP)
    // both sides used
    expect(new Set(boxes.filter((b) => b.depth === 1).map((b) => b.side)).size).toBe(2)
  })
  it('removes a subtree', () => {
    const m = parseOutline('R\n- A\n  - A1\n- B')!
    const a = m.nodes[m.root].children[0]
    const r = removeNode(m, a)
    expect(Object.keys(r.nodes)).toHaveLength(2)
    expect(parentOf(r, r.nodes[r.root].children[0])).toBe(r.root)
    expect(removeNode(m, m.root)).toBe(m)
  })
})
