import { describe, expect, it } from 'vitest'
import { atsChecks, fmtDate, fromJsonResume, keywordMatch, range, toJsonResume, toPlainText, type Resume } from './resume-builder'

const R: Resume = {
  basics: { name: 'Ann Lee', label: 'Engineer', email: 'ann@x.io', phone: '+1 555 123 4567', url: '', location: 'Berlin', summary: 'word '.repeat(30) },
  work: [{ id: '1', name: 'Acme', position: 'Dev', location: '', startDate: '2020-03', endDate: '', highlights: '- Built 3 APIs\n• Reduced cost by 20%' }],
  education: [], skills: [{ id: 's', name: 'Languages', keywords: 'TypeScript, Go' }], projects: [], certificates: 'AWS SA', languages: 'English, German',
}

describe('resume helpers', () => {
  it('dates', () => {
    expect(fmtDate('2020-03')).toBe('Mar 2020')
    expect(fmtDate('2019')).toBe('2019')
    expect(range('2020-03', '')).toBe('Mar 2020 – Present')
  })
  it('plain text', () => {
    const t = toPlainText(R)
    expect(t).toContain('ANN LEE')
    expect(t).toContain('Dev, Acme (Mar 2020 – Present)')
    expect(t).toContain('- Reduced cost by 20%')
  })
  it('ats checks', () => {
    const c = atsChecks(R)
    expect(c.find((x) => x.msg.startsWith('Valid email'))?.ok).toBe(true)
    expect(c.find((x) => x.msg.startsWith('At least half'))?.ok).toBe(true)
    expect(c.find((x) => x.msg.startsWith('Bullets start'))?.ok).toBe(true)
  })
  it('keyword match', () => {
    const k = keywordMatch('I know TypeScript and node.js', 'TypeScript TypeScript Kubernetes node.js and the')
    expect(k[0]).toEqual({ word: 'typescript', found: true })
    expect(k.find((x) => x.word === 'kubernetes')?.found).toBe(false)
    expect(k.find((x) => x.word === 'node.js')?.found).toBe(true)
  })
  it('JSON Resume round trip', () => {
    let n = 0
    const back = fromJsonResume(toJsonResume(R) as unknown as Record<string, unknown>, () => String(n++))
    expect(back.basics.location).toBe('Berlin')
    expect(back.work[0].highlights).toBe('Built 3 APIs\nReduced cost by 20%')
    expect(back.skills[0].keywords).toBe('TypeScript, Go')
    expect(back.languages).toBe('English, German')
  })
})
