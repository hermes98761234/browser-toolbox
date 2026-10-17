import { describe, expect, it } from 'vitest'
import { childKind, fromMarkdown, layout, removeTree, toMarkdown, unanswered, wrap, type Node } from './argument-mapper'

const N: Node[] = [
  { id: 'c', parent: null, kind: 'claim', text: 'Cities should ban cars downtown' },
  { id: 'r1', parent: 'c', kind: 'reason', text: 'Less pollution' },
  { id: 'e1', parent: 'r1', kind: 'evidence', text: 'Madrid NO2 fell 20%' },
  { id: 'o1', parent: 'c', kind: 'objection', text: 'Hurts shops' },
  { id: 'b1', parent: 'o1', kind: 'rebuttal', text: 'Foot traffic rises' },
  { id: 'o2', parent: 'c', kind: 'objection', text: 'Disabled access' },
]

describe('argument mapper', () => {
  it('wraps words', () => {
    expect(wrap('the quick brown fox jumps', 10)).toEqual(['the quick', 'brown fox', 'jumps'])
    expect(wrap('abcdefghijkl', 5)).toEqual(['abcd-', 'efgh-', 'ijkl'])
    expect(wrap('', 5)).toEqual([''])
  })
  it('lays out a tidy tree with parents centred', () => {
    const { boxes } = layout(N)
    const b = Object.fromEntries(boxes.map((x) => [x.id, x]))
    expect(b.e1.y).toBeGreaterThan(b.r1.y)
    expect(b.r1.y).toBe(b.o1.y)
    expect(b.c.x + b.c.w / 2).toBeCloseTo((b.r1.x + b.o2.x + b.o2.w) / 2)
    const xs = boxes.filter((x) => x.depth === 1).map((x) => x.x).sort((a, z) => a - z)
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(190)
  })
  it('markdown round trip', () => {
    const md = toMarkdown(N, 'Cars')
    expect(md).toContain('  - **Objection:** Hurts shops')
    let i = 0
    const back = fromMarkdown(md, () => `n${i++}`)
    expect(back.map((n) => n.kind)).toEqual(N.map((n) => n.kind))
    expect(back[2].parent).toBe(back[1].id)
    expect(back[3].parent).toBe(back[0].id)
    expect(fromMarkdown('- A\n  - B', () => `x${i++}`).map((n) => n.kind)).toEqual(['claim', 'reason'])
  })
  it('finds unanswered objections and removes subtrees', () => {
    expect(unanswered(N).map((n) => n.id)).toEqual(['o2'])
    expect(removeTree(N, 'r1').map((n) => n.id)).toEqual(['c', 'o1', 'b1', 'o2'])
    expect(childKind('objection')).toBe('rebuttal')
  })
})
