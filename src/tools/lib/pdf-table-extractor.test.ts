import { describe, expect, it } from 'vitest'
import { cluster, colOf, combine, DEF_OPTS, extractTable, gapBounds, segmentsFromOps, toChunks, toMarkdown, toTsv, type Run, type Seg } from './pdf-table-extractor'

const cell = (str: string, x: number, y: number, size = 10): Run => ({ str, x, y, w: str.length * size * 0.5, h: size })

// Title, a 3-column table (right-aligned numbers) and a footnote.
const runs: Run[] = [
  cell('Annual report', 50, 760, 16),
  cell('Item', 50, 700), cell('Qty', 200, 700), cell('Price', 300, 700),
  cell('Apples', 50, 685), cell('12', 205, 685), cell('1.50', 300, 685),
  cell('Green pears', 50, 670), cell('7', 210, 670), cell('2.25', 300, 670),
  cell('Plums', 50, 655), cell('120', 200, 655), cell('0.80', 300, 655),
  cell('Prices exclude tax and are subject to change without notice.', 50, 600),
]

describe('chunks', () => {
  it('splits runs at double spaces and merges near neighbours', () => {
    const l = toChunks([{ str: 'Alpha  Beta', x: 0, y: 10, w: 110, h: 10 }, { str: 'Gamma', x: 130, y: 10, w: 50, h: 10 }, { str: 'ma', x: 181, y: 10, w: 20, h: 10 }], 0.9)
    expect(l).toHaveLength(1)
    expect(l[0].chunks.map((c) => c.str)).toEqual(['Alpha', 'Beta', 'Gammama'])
  })
  it('clusters values', () => {
    expect(cluster([10, 11, 50, 51.5, 100])).toEqual([10.5, 50.75, 100])
    expect(colOf(5, [10, 20])).toBe(0)
    expect(colOf(15, [10, 20])).toBe(1)
    expect(colOf(25, [10, 20])).toBe(2)
  })
})

describe('extractTable', () => {
  it('finds columns from whitespace gaps and skips title/footnote', () => {
    const t = extractTable(runs, [], DEF_OPTS)
    expect(t.source).toBe('gaps')
    expect(t.rows).toEqual([
      ['Item', 'Qty', 'Price'],
      ['Apples', '12', '1.50'],
      ['Green pears', '7', '2.25'],
      ['Plums', '120', '0.80'],
    ])
    expect(t.bounds).toHaveLength(2)
  })
  it('honours manual boundaries', () => {
    const t = extractTable(runs, [], DEF_OPTS, [180])
    expect(t.source).toBe('manual')
    expect(t.rows[1]).toEqual(['Apples', '12 1.50'])
  })
  it('merges wrapped cell lines', () => {
    const wrapped = [cell('A', 50, 700), cell('Long description', 120, 700), cell('9', 300, 700), cell('continues here', 120, 688), cell('B', 50, 670), cell('Short', 120, 670), cell('3', 300, 670)]
    const t = extractTable(wrapped, [], DEF_OPTS)
    expect(t.rows).toEqual([['A', 'Long description continues here', '9'], ['B', 'Short', '3']])
  })
  it('uses ruling lines for columns and row bands', () => {
    const rs = [cell('Name', 52, 700), cell('Notes', 152, 700), cell('Ann', 52, 680), cell('first line', 152, 680), cell('second line', 152, 670), cell('Bob', 52, 650), cell('ok', 152, 650)]
    const segs: Seg[] = [
      { x0: 48, y0: 712, x1: 48, y1: 640 }, { x0: 148, y0: 712, x1: 148, y1: 640 }, { x0: 260, y0: 712, x1: 260, y1: 640 },
      ...[712, 692, 662, 640].map((y) => ({ x0: 48, y0: y, x1: 260, y1: y })),
    ]
    const t = extractTable(rs, segs, DEF_OPTS)
    expect(t.source).toBe('rules')
    expect(t.rows).toEqual([['Name', 'Notes'], ['Ann', 'first line second line'], ['Bob', 'ok']])
  })
  it('gapBounds needs a real gap', () => {
    const l = toChunks([cell('aaaa', 0, 0), cell('bbbb', 40, 0)], 0.9)
    expect(gapBounds(l)).toEqual([30])
  })
})

describe('output', () => {
  it('combines pages and drops repeated header', () => {
    const rows = combine([[['A', 'B'], ['1', '2']], [['a', 'b'], ['3', '4', '5']]])
    expect(rows).toEqual([['A', 'B', ''], ['1', '2', ''], ['3', '4', '5']])
  })
  it('formats TSV and Markdown', () => {
    expect(toTsv([['a\tb', 'c']])).toBe('a b\tc')
    expect(toMarkdown([['Item', 'Price'], ['x|y', '1.50']])).toBe('| Item | Price |\n| --- | ---: |\n| x\\|y | 1.50 |')
  })
  it('reads segments from an operator list', () => {
    const ops = { save: 10, restore: 11, transform: 12, constructPath: 91 }
    // rectangle 0,0 → 100,20 drawn under a translate(10, 5)
    const path = new Float32Array([0, 0, 0, 1, 100, 0, 1, 100, 20, 1, 0, 20, 4])
    const segs = segmentsFromOps([10, 12, 91, 11], [null, [1, 0, 0, 1, 10, 5], [20, [path], null], null], ops)
    expect(segs).toHaveLength(4)
    expect(segs[0]).toEqual({ x0: 10, y0: 5, x1: 110, y1: 5 })
    expect(segs[3]).toEqual({ x0: 10, y0: 25, x1: 10, y1: 5 })
  })
})
