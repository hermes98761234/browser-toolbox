import { describe, expect, it } from 'vitest'
import { classify, parseItems, sampleItems, schedule, workingDays, type Item } from './cycle-count-scheduler'

const I = (sku: string, unitCost: number, annualQty: number, cls: Item['cls'] = ''): Item => ({ sku, name: sku, location: 'L', unitCost, annualQty, cls })

describe('cycle count scheduler', () => {
  it('classifies by Pareto share', () => {
    const c = classify([I('a', 70, 1), I('b', 15, 1), I('c', 8, 1), I('d', 5, 1), I('e', 2, 1)])
    expect(c.map((x) => x.klass)).toEqual(['A', 'B', 'B', 'C', 'C'])
    expect(c[0].share).toBeCloseTo(0.7, 9)
    expect(c[4].cum).toBeCloseTo(1, 9)
    expect(classify([I('a', 70, 1), I('z', 1, 1, 'A')]).find((x) => x.sku === 'z')!.klass).toBe('A')
  })
  it('lists working days', () => {
    const d = workingDays('2026-01-01', 14, ['2026-01-01'])
    expect(d[0]).toBe('2026-01-02') // Jan 1 holiday, Jan 3–4 weekend
    expect(d).not.toContain('2026-01-03')
    expect(d.length).toBe(9)
    expect(workingDays('2026-01-03', 7, [], true).length).toBe(7)
  })
  it('schedules every count with balanced daily load', () => {
    const items = classify(sampleItems())
    const days = workingDays('2026-01-01', 365)
    const freq = { A: 12, B: 4, C: 1 }
    const tasks = schedule(items, freq, days)
    const expected = items.reduce((s, x) => s + freq[x.klass], 0)
    expect(tasks.length).toBe(expected)
    for (const it of items) expect(tasks.filter((t) => t.sku === it.sku).length).toBe(freq[it.klass])
    const load = new Map<string, number>()
    for (const t of tasks) load.set(t.day, (load.get(t.day) ?? 0) + 1)
    const loads = days.map((d) => load.get(d) ?? 0)
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1)
    // monthly A items: consecutive counts roughly a month apart (±10 working days)
    const a = items.find((x) => x.klass === 'A')!
    const idx = tasks.filter((t) => t.sku === a.sku).map((t) => days.indexOf(t.day))
    for (let i = 1; i < idx.length; i++) expect(Math.abs(idx[i] - idx[i - 1] - days.length / 12)).toBeLessThan(10)
  })
  it('parses item CSV', () => {
    const { items, skipped } = parseItems('sku,name,location,cost,qty,class\nX1,Widget,A-01,"$12.50",100,a\nX2;Gadget;B-02;3;40\nbad,,,,')
    expect(skipped).toBe(2)
    expect(items).toEqual([{ sku: 'X1', name: 'Widget', location: 'A-01', unitCost: 12.5, annualQty: 100, cls: 'A' }, { sku: 'X2', name: 'Gadget', location: 'B-02', unitCost: 3, annualQty: 40, cls: '' }])
  })
})
