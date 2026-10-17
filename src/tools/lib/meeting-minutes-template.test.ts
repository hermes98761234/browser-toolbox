import { describe, expect, it } from 'vitest'
import { build, docxXml, makeDocx, quorum, result, toMarkdown, type Minutes, type Person } from './meeting-minutes-template'

const P = (name: string, status: Person['status'], voting = true): Person => ({ id: name, name, role: 'Director', status, voting })
const M: Minutes = {
  org: 'Acme & Co', body: 'Board of Directors', kind: 'Regular', date: '2026-10-15', start: '18:00', end: '19:30', place: 'HQ',
  chair: 'Ann', secretary: 'Bob', quorumRule: 'majority', quorumN: 3,
  people: [P('Ann', 'present'), P('Bob', 'remote'), P('Cy', 'absent'), P('Di', 'present'), P('Ed', 'excused'), P('Guest', 'guest', false)],
  items: [{ id: 'i', title: 'Budget <2027>', presenter: 'Di', notes: 'Overview\n- point one', motions: [{ id: 'm', text: 'Approve budget.', mover: 'Di', seconder: 'Ann', yes: 3, no: 0, abstain: 0, threshold: 'majority' }], actions: [{ id: 'a', task: 'Publish', owner: 'Bob', due: '2026-11-01' }] }],
  next: '2026-11-19', nextPlace: '',
}

describe('meeting-minutes-template', () => {
  it('computes quorum', () => {
    expect(quorum(M)).toEqual({ need: 3, have: 3, ok: true, members: 5 })
    expect(quorum({ ...M, quorumRule: 'number', quorumN: 4 }).ok).toBe(false)
  })
  it('decides motions', () => {
    expect(result({ yes: 3, no: 3, abstain: 1, threshold: 'majority' })).toBe('failed')
    expect(result({ yes: 4, no: 3, abstain: 9, threshold: 'majority' })).toBe('carried')
    expect(result({ yes: 6, no: 3, abstain: 0, threshold: 'two-thirds' })).toBe('carried')
    expect(result({ yes: 5, no: 3, abstain: 0, threshold: 'two-thirds' })).toBe('failed')
    expect(result({ yes: 5, no: 1, abstain: 0, threshold: 'unanimous' })).toBe('failed')
    expect(result({ yes: 0, no: 0, abstain: 2, threshold: 'majority' })).toBe('pending')
  })
  it('builds the document and exports', () => {
    const b = build(M)
    const md = toMarkdown(b)
    expect(md).toContain('A quorum was present.')
    expect(md).toContain('Motion CARRIED')
    expect(md).toContain('6:00 p.m.')
    expect(md).toContain('- point one')
    const x = docxXml(b)
    expect(x).toContain('Budget &lt;2027&gt;')
    expect(x).toContain('Acme &amp; Co')
    expect(x.match(/<w:tbl>/g)?.length).toBe(3)
    const z = makeDocx(b)
    expect(z[0]).toBe(0x50)
    expect(z[1]).toBe(0x4b)
  })
})
