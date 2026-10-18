import { describe, expect, it } from 'vitest'
import { boxes, compareWords, pageWords, pixelDiff, report, wordKey, type PageRuns } from './pdf-compare-tool'

const page = (lines: string[]): PageRuns => ({ w: 600, h: 800, runs: lines.map((str, i) => ({ str, x: 50, y: 700 - i * 20, w: str.length * 6, h: 12 })) })

describe('pageWords', () => {
  it('splits runs into words with proportional positions in reading order', () => {
    const ws = pageWords([page(['Hello big world', 'next line'])])
    expect(ws.map((w) => w.text)).toEqual(['Hello', 'big', 'world', 'next', 'line'])
    expect(ws[1].x).toBeCloseTo(50 + 6 * 6)
    expect(ws[1].w).toBeCloseTo(18)
    expect(ws[3].y).toBe(680)
  })
})

describe('compareWords', () => {
  const o = { ignoreCase: false, ignorePunct: false }
  it('finds a replaced word, an insertion and a deletion', () => {
    const A = pageWords([page(['The fee is 100 dollars per month.', 'Cancel any time.'])])
    const B = pageWords([page(['The fee is 120 dollars per month, billed yearly.', 'Cancel any time.']), page(['New appendix'])])
    const r = compareWords(A, B, o)
    const kinds = r.changes.map((c) => [c.kind, c.aText, c.bText])
    expect(kinds).toContainEqual(['changed', '100', '120'])
    expect(r.changes.some((c) => c.bText.includes('billed yearly.'))).toBe(true)
    const last = r.changes[r.changes.length - 1]
    expect(last.kind).toBe('added')
    expect(last.bText).toBe('New appendix')
    expect(last.pageB).toBe(1)
    expect(r.similarity).toBeGreaterThan(0.6)
    expect(r.similarity).toBeLessThan(1)
  })
  it('identical documents have no changes', () => {
    const A = pageWords([page(['same text here'])])
    const r = compareWords(A, A, o)
    expect(r.changes).toHaveLength(0)
    expect(r.similarity).toBe(1)
  })
  it('respects ignore case and punctuation', () => {
    const A = pageWords([page(['Hello, World'])]), B = pageWords([page(['hello world'])])
    expect(compareWords(A, B, o).changes.length).toBeGreaterThan(0)
    expect(compareWords(A, B, { ignoreCase: true, ignorePunct: true }).changes).toHaveLength(0)
    expect(wordKey('—', { ignoreCase: true, ignorePunct: true })).toBe('—')
  })
  it('marks word ownership and builds a report', () => {
    const A = pageWords([page(['a b c'])]), B = pageWords([page(['a x c'])])
    const r = compareWords(A, B, o)
    expect([...r.aWord]).toEqual([-1, 0, -1])
    expect([...r.bWord]).toEqual([-1, 0, -1])
    expect(report(r.changes, 'v1', 'v2')).toContain('- b')
  })
})

describe('boxes', () => {
  it('merges adjacent words on one line', () => {
    const ws = pageWords([page(['one two three', 'four'])])
    const bx = boxes(ws, [0, 1, 2, 3], 0)
    expect(bx).toHaveLength(2)
    expect(bx[0].w).toBeCloseTo(13 * 6)
  })
})

describe('pixelDiff', () => {
  it('counts differing pixels and colours them', () => {
    const a = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255])
    const b = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255])
    const r = pixelDiff(a, b, 3, 1, 32)
    expect(r.count).toBe(2)
    expect([...r.out.slice(4, 8)]).toEqual([220, 38, 38, 255])
    expect([...r.out.slice(8, 12)]).toEqual([5, 150, 105, 255])
    expect(r.out[0]).toBe(255)
  })
})
