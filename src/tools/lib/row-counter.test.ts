import { describe, expect, it } from 'vitest'
import { nextFire, step, triggered, type Counter, type Reminder } from './row-counter'

const C = (p: Partial<Counter>): Counter => ({ id: 'a', name: 'a', value: 0, target: 0, repeat: 0, linkTo: '', ...p })

describe('row counter', () => {
  it('increments and floors at zero', () => {
    let cs = [C({})]
    cs = step(cs, 'a', 1).counters
    expect(cs[0].value).toBe(1)
    cs = step(step(cs, 'a', -1).counters, 'a', -1).counters
    expect(cs[0].value).toBe(0)
  })
  it('pattern repeat rolls into linked counter and back', () => {
    let cs = [C({ id: 'rows' }), C({ id: 'pat', value: 8, repeat: 8, linkTo: 'rep' }), C({ id: 'rep', value: 2 })]
    const r = step(cs, 'pat', 1)
    cs = r.counters
    expect(cs[1].value).toBe(1)
    expect(cs[2].value).toBe(3)
    expect(r.bumped).toEqual(['pat', 'rep'])
    cs = step(cs, 'pat', -1).counters
    expect(cs[1].value).toBe(8)
    expect(cs[2].value).toBe(2)
  })
  it('link cycles terminate', () => {
    const cs = [C({ id: 'x', value: 2, repeat: 2, linkTo: 'y' }), C({ id: 'y', value: 2, repeat: 2, linkTo: 'x' })]
    const r = step(cs, 'x', 1)
    expect(r.counters.map((c) => c.value)).toEqual([1, 1])
  })
  it('reminders', () => {
    const rem: Reminder[] = [{ id: '1', counterId: 'a', kind: 'every', n: 6, text: 'decrease' }, { id: '2', counterId: 'a', kind: 'at', n: 24, text: 'start neck' }]
    expect(triggered([C({ value: 12 })], rem, ['a']).map((r) => r.id)).toEqual(['1'])
    expect(triggered([C({ value: 24 })], rem, ['a']).map((r) => r.id)).toEqual(['1', '2'])
    expect(triggered([C({ value: 24 })], rem, [])).toEqual([])
    expect(nextFire(rem[0], 13)).toBe(18)
    expect(nextFire(rem[1], 30)).toBeNull()
  })
})
