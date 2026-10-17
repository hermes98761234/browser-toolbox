import { describe, expect, it } from 'vitest'
import { checkInclusive, flesch, genderCoding, mdToHtml, syllables, toMarkdown } from './job-description-builder'

describe('job-description-builder', () => {
  it('flags non-inclusive terms', () => {
    const f = checkInclusive('We want a coding ninja and young, energetic rockstar. He will report to the chairman.')
    const cats = f.map((x) => x.category)
    expect(cats).toContain('Jargon / bro-culture')
    expect(cats).toContain('Age bias')
    expect(f.find((x) => x.term.includes('ninja'))?.count).toBe(2)
    expect(f.some((x) => x.term === 'he')).toBe(true)
    expect(checkInclusive('Help the team ship great software.')).toEqual([])
  })
  it('detects gender-coded wording', () => {
    const g = genderCoding('A competitive, decisive leader who is assertive and driven.')
    expect(g.masc).toEqual(['competitive', 'decisive', 'leader', 'assertive'])
    expect(g.verdict).toBe('Strongly masculine-coded')
    expect(genderCoding('Supportive, collaborative and understanding team that is committed').fem.length).toBe(3)
  })
  it('computes readability', () => {
    expect(syllables('cat')).toBe(1)
    expect(syllables('engineering')).toBe(4)
    const r = flesch('The cat sat on the mat. The dog ran.')
    expect(r.sentences).toBe(2)
    expect(r.score).toBeGreaterThan(90)
  })
  it('assembles markdown and html', () => {
    const md = toMarkdown({ title: 'Designer', company: 'Acme', location: 'Kyiv', workplace: 'Hybrid', type: 'Full-time', salary: '', about: 'We make things.', summary: '', duties: ['Design', ' '], must: [], nice: [], benefits: [], apply: '', eeo: 'Equal opportunity.' })
    expect(md).toContain('# Designer at Acme')
    expect(md).toContain('**Location:** Kyiv (Hybrid)  \n**Employment:** Full-time')
    expect(md).toContain('## What you will do\n\n- Design\n')
    expect(md).not.toContain('## The role')
    const html = mdToHtml(md)
    expect(html).toContain('<h1>Designer at Acme</h1>')
    expect(html).toContain('<strong>Location:</strong> Kyiv (Hybrid)<br><strong>Employment:</strong>')
    expect(html).toContain('<ul>\n<li>Design</li>\n</ul>')
    expect(html).toContain('<em>Equal opportunity.</em>')
  })
})
