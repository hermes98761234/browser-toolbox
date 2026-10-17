import { describe, expect, it } from 'vitest'
import { findGutter, pageText, toLines, wordCount, type Run } from './pdf-text-extractor'

const run = (str: string, x: number, y: number, h = 10): Run => ({ str, x, y, w: str.length * h * 0.5, h })

describe('pdf-text-extractor', () => {
  it('groups runs into lines and inserts spaces at gaps', () => {
    const rs = [run('world', 60, 700), run('Hello', 20, 700.5), run('Next', 20, 686)]
    const ls = toLines(rs)
    expect(ls.length).toBe(2)
    expect(pageText(rs, { mode: 'lines', columns: false, dehyphen: false })).toBe('Hello world\nNext')
  })
  it('reflows paragraphs and dehyphenates', () => {
    const rs = [run('A long hyph-', 20, 700), run('enated word.', 20, 688), run('New para', 20, 650)]
    expect(pageText(rs, { mode: 'paragraphs', columns: false, dehyphen: true })).toBe('A long hyphenated word.\n\nNew para')
    expect(pageText(rs, { mode: 'paragraphs', columns: false, dehyphen: false })).toBe('A long hyph- enated word.\n\nNew para')
  })
  it('reads two columns left first', () => {
    const rs: Run[] = []
    for (let i = 0; i < 8; i++) {
      rs.push(run(`L${i} left text`, 20, 700 - i * 12))
      rs.push(run(`R${i} right text`, 300, 700 - i * 12))
    }
    const lines = toLines(rs)
    expect(findGutter(lines)).not.toBeNull()
    const t = pageText(rs, { mode: 'lines', columns: true, dehyphen: false }).split('\n')
    expect(t[0]).toBe('L0 left text')
    expect(t[7]).toBe('L7 left text')
    expect(t[8]).toBe('')
    expect(t[9]).toBe('R0 right text')
  })
  it('keeps horizontal layout', () => {
    const t = pageText([run('A', 0, 100), run('B', 100, 100)], { mode: 'layout', columns: false, dehyphen: false })
    expect(t).toBe('A' + ' '.repeat(19) + 'B')
  })
  it('counts words', () => {
    expect(wordCount("It's a test — 42 items, well-known.")).toBe(6)
  })
})
