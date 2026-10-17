import { describe, expect, it } from 'vitest'
import { guessKeys, join, parseTable, type JoinOpts, type JoinType } from './csv-joiner'

const L = parseTable('id,name\n1,Ann\n2,Bob\n3,Cy\n,Nobody')
const R = parseTable('id;amount\n1;10\n1;15\n3;7\n4;99')
const o = (type: JoinType, extra: Partial<JoinOpts> = {}): JoinOpts => ({ type, leftKeys: [0], rightKeys: [0], ignoreCase: false, trim: true, coalesceKeys: true, suffix: ['_l', '_r'], ...extra })

describe('csv joiner', () => {
  it('inner join with duplicates', () => {
    const r = join(L, R, o('inner'))
    expect(r.header).toEqual(['id', 'name', 'amount'])
    expect(r.rows).toEqual([['1', 'Ann', '10'], ['1', 'Ann', '15'], ['3', 'Cy', '7']])
    expect(r.manyToMany).toBe(1)
  })
  it('left, right, full and anti', () => {
    expect(join(L, R, o('left')).rows).toHaveLength(5)
    const right = join(L, R, o('right'))
    expect(right.rows.at(-1)).toEqual(['4', '', '99'])
    const full = join(L, R, o('full'))
    expect(full.rows).toHaveLength(6)
    expect(full.origin.filter((x) => x === 'both')).toHaveLength(3)
    expect(join(L, R, o('anti')).rows).toEqual([['2', 'Bob'], ['', 'Nobody']])
    expect(join(L, R, o('ranti')).rows).toEqual([['4', '99']])
  })
  it('keeps both key columns when not coalescing and suffixes clashes', () => {
    const r = join(L, R, o('inner', { coalesceKeys: false }))
    expect(r.header).toEqual(['id_l', 'name', 'id_r', 'amount'])
  })
  it('case-insensitive composite keys', () => {
    const a = parseTable('first,last,x\nAnn,Lee,1\nbob,Ray,2')
    const b = parseTable('First,Last,y\nann,LEE,A\nBob,ray,B')
    const r = join(a, b, o('inner', { leftKeys: [0, 1], rightKeys: [0, 1], ignoreCase: true }))
    expect(r.rows.map((x) => x.at(-1))).toEqual(['A', 'B'])
    expect(guessKeys(['Name', 'customer_id'], ['customer_id', 'total'])).toEqual([1, 0])
  })
})
