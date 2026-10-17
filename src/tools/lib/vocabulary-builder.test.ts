import { describe, expect, it } from 'vitest'
import { cloze, dueQueue, grade, level, makeQuestion, NEW, rng, type Word } from './vocabulary-builder'

const W = (id: string, word: string, pos = 'adj', example = ''): Word => ({ id, word, pos, def: `def of ${word}`, example, note: '', s: { ...NEW }, seen: 0, right: 0 })

describe('vocabulary-builder', () => {
  it('blanks inflected forms', () => {
    expect(cloze('She meticulously checked every line.', 'meticulous')).toBe('She _____ checked every line.')
    expect(cloze('They were mitigating the risks.', 'mitigate')).toBe('They were _____ the risks.')
    expect(cloze('Nothing here.', 'ubiquitous')).toBeNull()
    expect(cloze('A red herring distracted us.', 'red herring')).toBe('A _____ distracted us.')
  })
  it('makes 4-option questions with the right answer', () => {
    const ws = [W('1', 'terse'), W('2', 'verbose'), W('3', 'lucid'), W('4', 'opaque'), W('5', 'run', 'verb')]
    const q = makeQuestion(ws, ws[0], 'def→word', rng(3))!
    expect(q.options).toHaveLength(4)
    expect(q.options[q.answer]).toBe('terse')
    expect(q.options).not.toContain('run') // same part of speech preferred
    const q2 = makeQuestion(ws, ws[1], 'word→def', rng(9))!
    expect(q2.options[q2.answer]).toBe('def of verbose')
    expect(makeQuestion(ws.slice(0, 3), ws[0], 'cloze', rng(1))).toBeNull()
  })
  it('schedules with SM-2 and orders the queue', () => {
    let w = W('1', 'terse')
    w = grade(w, true, '2026-01-01')
    expect(w.s.due).toBe('2026-01-02')
    w = grade(w, true, '2026-01-02')
    expect(w.s.interval).toBe(6)
    expect(level(w)).toBe('familiar')
    const bad = grade(w, false, '2026-01-08')
    expect(bad.s.interval).toBe(1)
    expect(level(W('x', 'y'))).toBe('new')
    const q = dueQueue([w, W('n', 'new'), { ...bad, id: 'b' }], '2026-01-09')
    expect(q.map((x) => x.id)).toEqual(['1', 'b', 'n'])
  })
})
