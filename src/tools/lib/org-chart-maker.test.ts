import { describe, expect, it } from 'vitest'
import { buildTree, layout, parseRows, stats } from './org-chart-maker'

const rows = [
  ['id', 'name', 'title', 'manager_id', 'department'],
  ['1', 'Ana', 'CEO', '', 'Exec'],
  ['2', 'Ben', 'CTO', '1', 'Eng'],
  ['3', 'Cy', 'Dev', '2', 'Eng'],
  ['4', 'Di', 'Dev', '2', 'Eng'],
  ['5', 'Ed', 'CFO', 'Ana', 'Fin'],
  ['6', 'Flo', 'Intern', '99', 'Fin'],
]

describe('org-chart-maker', () => {
  it('parses headers and builds a tree by id or name', () => {
    const people = parseRows(rows)
    expect(people[1]).toEqual({ id: '2', name: 'Ben', title: 'CTO', manager: '1', dept: 'Eng' })
    const { roots, problems } = buildTree(people)
    expect(roots.map((r) => r.name)).toEqual(['Ana', 'Flo'])
    expect(roots[0].size).toBe(4)
    expect(roots[0].children.map((c) => c.name)).toEqual(['Ben', 'Ed'])
    expect(problems.missingManager).toEqual(['Flo → 99'])
  })

  it('breaks cycles', () => {
    const { roots, problems } = buildTree(parseRows([['name', 'manager'], ['A', 'B'], ['B', 'A'], ['C', 'A']]))
    expect(problems.cycles.length).toBe(1)
    expect(roots.length).toBe(1)
    expect(roots[0].size).toBe(2)
  })

  it('lays out without overlap and centres parents', () => {
    const { roots } = buildTree(parseRows(rows))
    const { boxes } = layout(roots, new Set(), { w: 100, h: 40, gx: 20, gy: 30, compact: false })
    const ana = boxes.find((b) => b.node.name === 'Ana')!
    const ben = boxes.find((b) => b.node.name === 'Ben')!
    const cy = boxes.find((b) => b.node.name === 'Cy')!, di = boxes.find((b) => b.node.name === 'Di')!
    expect(di.x - cy.x).toBe(120)
    expect(ben.x).toBe((cy.x + di.x) / 2)
    expect(cy.y).toBe(140)
    const sameRow = boxes.filter((b) => b.y === ben.y).sort((a, b) => a.x - b.x)
    for (let i = 1; i < sameRow.length; i++) expect(sameRow[i].x - sameRow[i - 1].x).toBeGreaterThanOrEqual(120)
    expect(ana.y).toBe(0)
  })

  it('collapses subtrees and reports stats', () => {
    const { roots } = buildTree(parseRows(rows))
    const { boxes } = layout(roots, new Set(['2']), { w: 100, h: 40, gx: 20, gy: 30, compact: false })
    expect(boxes.length).toBe(4)
    expect(boxes.find((b) => b.node.name === 'Ben')!.hidden).toBe(2)
    expect(stats(roots)).toMatchObject({ count: 6, depth: 3, managers: 2, spanMax: 2 })
  })
})
