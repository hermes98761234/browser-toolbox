import { describe, expect, it } from 'vitest'
import { assemble, docVars, move, parseTags, tagCounts, type Clause } from './contract-clause-library'

const c = (id: string, body: string, tags: string[] = []): Clause => ({ id, title: id.toUpperCase(), category: 'x', tags, body })

describe('contract-clause-library', () => {
  it('collects variables', () => {
    expect(docVars('Between {{a}} and {{b}}', [c('p', '{{b}} pays {{amount}}')])).toEqual(['a', 'b', 'amount'])
  })
  it('assembles numbered text', () => {
    const t = assemble('Service agreement', 'Between {{a}}.', [c('one', 'Body {{a}}'), c('two', 'First\n\nSecond')], { a: 'Acme' })
    expect(t).toBe('**SERVICE AGREEMENT**\n\nBetween Acme.\n\n**1. ONE**\n\nBody Acme\n\n**2. TWO**\n\n2.1 First\n\n2.2 Second')
  })
  it('tags and move', () => {
    expect(parseTags('NDA, nda , saas,')).toEqual(['nda', 'saas'])
    expect(tagCounts([c('a', '', ['x', 'y']), c('b', '', ['y'])])).toEqual([['y', 2], ['x', 1]])
    expect(move([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
  })
})
