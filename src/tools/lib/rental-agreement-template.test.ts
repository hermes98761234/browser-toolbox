import { describe, expect, it } from 'vitest'
import { addMonths, buildLease, docxXml, makeDocx, ordinal, prorated, render, toText, type Lease } from './rental-agreement-template'

const L: Lease = {
  landlord: 'Pat Owner', landlordAddr: '', tenants: 'Sam Lee and Kim Park', address: '12 Elm St, Apt 3', unitType: 'apartment', furnished: false, kind: 'fixed', start: '2026-11-15', months: 12,
  rent: 1500, currency: '$', dueDay: 1, payMethod: 'bank transfer', graceDays: 5, lateFee: 50, deposit: 1500, depositDays: 21, utilitiesLandlord: ['water'], utilitiesTenant: ['electricity', 'internet'],
  pets: false, petDeposit: 0, smoking: false, maxOccupants: 2, parking: '', entryHours: 24, noticeDays: 30, law: 'the State of Oregon', extra: 'A & B <test>',
}

describe('rental agreement', () => {
  it('renders mini templates', () => {
    expect(render('Hi {{a}}{{#if b}} and {{b}}{{/if}}{{#unless c}}!{{/unless}}', { a: 'X', b: 'Y', c: false })).toBe('Hi X and Y!')
    expect(render('{{#if a}}A{{#if b}}B{{/if}}{{/if}}', { a: 1, b: 0 })).toBe('A')
    expect(render('{{#if l}}yes{{/if}}', { l: [] })).toBe('')
  })
  it('dates and proration', () => {
    expect(addMonths('2026-11-15', 12)).toBe('2027-11-14')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(ordinal(1) + ordinal(2) + ordinal(3) + ordinal(11) + ordinal(22)).toBe('1st2nd3rd11th22nd')
    expect(prorated(1500, '2026-11-15', 1)).toEqual({ days: 16, amount: 800 })
    expect(prorated(1500, '2026-11-01', 1).days).toBe(0)
  })
  it('builds the lease', () => {
    const b = buildLease(L)
    const txt = toText(b)
    expect(txt).toContain('November 15, 2026 and ends on November 14, 2027')
    expect(txt).toContain('$1,500.00 per month')
    expect(txt).toContain('first partial period of 16 days is $800.00')
    expect(txt).not.toContain('Parking')
    expect(b.filter((x) => x.t === 'sig').map((x) => x.text)).toEqual(['Landlord: Pat Owner', 'Tenant: Sam Lee', 'Tenant: Kim Park'])
    expect(docxXml(b)).toContain('A &amp; B &lt;test&gt;')
    const z = makeDocx(b)
    expect([z[0], z[1], z[2], z[3]]).toEqual([0x50, 0x4b, 3, 4])
  })
})
