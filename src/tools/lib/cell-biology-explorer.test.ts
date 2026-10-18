import { describe, expect, it } from 'vitest'
import { byId, forCell, makeQuestion, ORGANELLES, rng } from './cell-biology-explorer'

describe('cell biology explorer', () => {
  it('cell-type membership', () => {
    const plant = forCell('plant').map((o) => o.id)
    const animal = forCell('animal').map((o) => o.id)
    expect(plant).toContain('chloroplast')
    expect(plant).toContain('wall')
    expect(animal).not.toContain('chloroplast')
    expect(animal).toContain('centrosome')
    expect(new Set(ORGANELLES.map((o) => o.id)).size).toBe(ORGANELLES.length)
  })
  it('choice questions have 4 distinct options including the answer', () => {
    const r = rng(42)
    for (let i = 0; i < 50; i++) {
      const q = makeQuestion(i % 2 ? 'plant' : 'animal', r, 'choice')
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.options).toContain(q.answer)
      expect(byId(q.answer)!.cells).toContain(i % 2 ? 'plant' : 'animal')
    }
  })
  it('seeded generator is deterministic', () => {
    expect(makeQuestion('animal', rng(7))).toEqual(makeQuestion('animal', rng(7)))
    expect(makeQuestion('animal', rng(1), 'find').prompt).toMatch(/^Click the /)
  })
})
