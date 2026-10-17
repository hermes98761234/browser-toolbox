import { describe, expect, it } from 'vitest'
import { dueState, matches, moveCard, type Card } from './kanban-board'

const card = (id: string, col: string): Card => ({ id, col, title: id, desc: '', labels: [], due: '', created: '' })
const cols = (cs: Card[], col: string) => cs.filter((c) => c.col === col).map((c) => c.id)

describe('kanban', () => {
  const base = [card('a', 'todo'), card('b', 'todo'), card('c', 'todo'), card('x', 'doing')]
  it('moves to another column at an index', () => {
    const r = moveCard(base, 'b', 'doing', 0)
    expect(cols(r, 'doing')).toEqual(['b', 'x'])
    expect(cols(r, 'todo')).toEqual(['a', 'c'])
  })
  it('reorders within a column', () => {
    expect(cols(moveCard(base, 'a', 'todo', 2), 'todo')).toEqual(['b', 'c', 'a'])
    expect(cols(moveCard(base, 'c', 'todo', 0), 'todo')).toEqual(['c', 'a', 'b'])
  })
  it('moves into an empty column', () => {
    expect(cols(moveCard(base, 'a', 'done', 5), 'done')).toEqual(['a'])
  })
  it('due states', () => {
    expect(dueState('', '2026-10-17')).toBe('none')
    expect(dueState('2026-10-16', '2026-10-17')).toBe('overdue')
    expect(dueState('2026-10-17', '2026-10-17')).toBe('today')
    expect(dueState('2026-10-20', '2026-10-17')).toBe('soon')
    expect(dueState('2026-10-25', '2026-10-17')).toBe('later')
  })
  it('search', () => {
    const c = { ...card('a', 't'), title: 'Fix login bug', labels: ['l1'] }
    expect(matches(c, 'login urgent', { l1: 'Urgent' })).toBe(true)
    expect(matches(c, 'signup', { l1: 'Urgent' })).toBe(false)
  })
})
