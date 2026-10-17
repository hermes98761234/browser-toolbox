import { describe, expect, it } from 'vitest'
import { generate, render, stats, type Opts } from './lorem-ipsum-generator'

const o: Opts = { bank: 'latin', kind: 'paragraphs', count: 3, classic: true, sMin: 6, sMax: 14, pMin: 3, pMax: 6, seed: 'abc' }

describe('lorem ipsum', () => {
  it('is deterministic per seed', () => {
    expect(render(generate(o), 'text')).toBe(render(generate(o), 'text'))
    expect(render(generate({ ...o, seed: 'x' }), 'text')).not.toBe(render(generate(o), 'text'))
  })
  it('starts with the classic sentence', () => {
    expect(render(generate(o), 'text').startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit')).toBe(true)
    expect(generate(o)).toHaveLength(3)
  })
  it('exact word counts', () => {
    const t = render(generate({ ...o, kind: 'words', count: 37 }), 'text')
    expect(stats(t).words).toBe(37)
    expect(t.startsWith('Lorem ipsum dolor sit amet')).toBe(true)
    expect(stats(render(generate({ ...o, kind: 'words', count: 3 }), 'text')).words).toBe(3)
  })
  it('renders html and markdown', () => {
    const doc = generate({ ...o, kind: 'document', count: 2 })
    expect(render(doc, 'html')).toMatch(/^<h1>.*<\/h1>/)
    expect(render(doc, 'markdown')).toMatch(/^# /)
    expect(render([{ t: 'ul', items: ['a <b>'] }], 'html')).toBe('<ul>\n  <li>a &lt;b&gt;</li>\n</ul>')
  })
  it('sentences count', () => {
    const t = render(generate({ ...o, kind: 'sentences', count: 5, classic: false }), 'text')
    expect(stats(t).sentences).toBe(5)
  })
})
