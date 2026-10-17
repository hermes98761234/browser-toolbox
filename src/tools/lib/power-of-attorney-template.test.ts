import { describe, expect, it } from 'vitest'
import { build, longDate, problems, title, wordCount, type PoaData } from './power-of-attorney-template'

const P = { name: '', address: '', phone: '', relation: '' }
const base: PoaData = {
  kind: 'durable', principal: { ...P, name: 'Ann Lee', address: '1 Main St' }, agent: { ...P, name: 'Bo Lee', address: '2 Oak Ave', relation: 'son' }, successor: P, useSuccessor: false, coAgent: P, useCoAgent: false, coMode: 'jointly',
  powers: ['banking', 'tax'], limitedPurpose: '', start: '', end: '', state: 'Oregon', county: '', compensation: 'none', fee: '', gifts: false, giftLimit: '', accounting: true, instructions: '', witnesses: 2, notary: true, signDate: '2026-10-17',
}

describe('power-of-attorney-template', () => {
  it('builds a durable POA with initialled powers', () => {
    const s = build(base)
    expect(s[0].paras[0]).toContain('**Ann Lee**')
    expect(s[0].paras[0]).toContain('my son')
    const powers = s.find((x) => x.heading === 'Powers Granted')!
    expect(powers.paras).toHaveLength(3)
    expect(powers.paras[1]).toMatch(/^\(a\) Banking/)
    expect(s.find((x) => x.heading.startsWith('Effective'))!.paras[1]).toContain('Durability')
    expect(wordCount(s)).toBeGreaterThan(150)
  })
  it('handles springing, limited and placeholders', () => {
    expect(build({ ...base, kind: 'springing' }).find((x) => x.heading.startsWith('Effective'))!.paras[0]).toContain('incapacity')
    const lim = build({ ...base, kind: 'limited', limitedPurpose: 'selling my car' })
    expect(lim[1].paras[0]).toContain('selling my car')
    expect(build({ ...base, agent: { ...P } })[0].paras[0]).toContain('[Agent name]')
    expect(build({ ...base, kind: 'general' }).find((x) => x.heading.startsWith('Effective'))!.paras[1]).toContain('not durable')
  })
  it('validates inputs', () => {
    expect(problems(base)).toEqual([])
    expect(problems({ ...base, agent: { ...base.agent, name: 'ann lee' } })).toContain('The agent must be a different person from the principal.')
    expect(problems({ ...base, start: '2026-05-01', end: '2026-04-01' })).toContain('The end date must be after the start date.')
    expect(problems({ ...base, powers: ['realEstate'], notary: false }).length).toBe(1)
  })
  it('formats titles and dates', () => {
    expect(title('limited')).toBe('Limited (Special) Power of Attorney')
    expect(longDate('2026-10-17')).toBe('October 17, 2026')
    expect(longDate('')).toBe('[date]')
  })
})
