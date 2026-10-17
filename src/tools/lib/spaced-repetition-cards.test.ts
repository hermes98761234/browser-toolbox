import { describe, expect, it } from 'vitest'
import { addDays, md, parseCsv, sm2, tex } from './spaced-repetition-cards'

describe('sm2', () => {
  const fresh = { ef: 2.5, reps: 0, interval: 0, lapses: 0 }
  it('follows the 1, 6, I·EF interval sequence', () => {
    const a = sm2(fresh, 4, '2026-01-01')
    expect(a).toMatchObject({ reps: 1, interval: 1, due: '2026-01-02', ef: 2.5 })
    const b = sm2(a, 4, a.due)
    expect(b).toMatchObject({ reps: 2, interval: 6, due: '2026-01-08' })
    const c = sm2(b, 5, b.due)
    expect(c.interval).toBe(15) // round(6 × 2.5)
    expect(c.ef).toBeCloseTo(2.6, 10)
  })
  it('adjusts EF per quality and floors it at 1.3', () => {
    expect(sm2(fresh, 3, '2026-01-01').ef).toBeCloseTo(2.36, 10)
    expect(sm2({ ...fresh, ef: 1.35 }, 0, '2026-01-01').ef).toBe(1.3)
  })
  it('resets on a lapse', () => {
    const r = sm2({ ef: 2.5, reps: 5, interval: 40, lapses: 0 }, 1, '2026-03-01')
    expect(r).toMatchObject({ reps: 0, interval: 1, due: '2026-03-02', lapses: 1 })
  })
  it('adds days across month ends', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02')
  })
})

describe('csv + markdown', () => {
  it('parses quoted CSV and TSV', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']])
    expect(parseCsv('one\ttwo\nthree\tfour')).toEqual([['one', 'two'], ['three', 'four']])
    expect(parseCsv('q;a\nfoo;bar')).toEqual([['q', 'a'], ['foo', 'bar']])
  })
  it('renders markdown and escapes html', () => {
    expect(md('**bold** and *it* <script>')).toBe('<p><b>bold</b> and <i>it</i> &lt;script&gt;</p>')
    expect(md('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>')
    expect(md('`x<y`')).toBe('<p><code>x&lt;y</code></p>')
  })
  it('renders TeX subset', () => {
    expect(tex('x^2')).toBe('<span class="tx"><i>x</i><sup>2</sup></span>')
    expect(tex('\\frac{a}{b}')).toContain('tx-frac')
    expect(tex('\\alpha + \\beta')).toBe('<span class="tx">α + β</span>')
    expect(md('$E=mc^2$')).toContain('<sup>2</sup>')
  })
})
