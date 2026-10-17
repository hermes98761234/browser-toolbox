import { describe, expect, it } from 'vitest'
import { back, front, impose, initials, mirror, onColor, overflowing, qrText, SIZES, TEMPLATES, type CardData } from './business-card-designer'

const D: CardData = { name: 'Olena Kovalenko', title: 'Product Designer', company: 'Northwind Studio', tagline: 'Design that ships', phone: '+1 555 010 2030', email: 'olena@northwind.example', web: 'northwind.example', address: '12 Market St, Springfield', accent: '#4f46e5', ink: '#1f2937', paper: '#ffffff', font: 'sans', template: 'classic', qr: 'front', qrContent: 'vcard' }

describe('business-card-designer', () => {
  it('helpers', () => {
    expect(initials('olena maria kovalenko')).toBe('OK')
    expect(onColor('#ffffff')).toBe('#111111')
    expect(onColor('#1e3a8a')).toBe('#ffffff')
    const v = qrText(D)
    expect(v).toContain('BEGIN:VCARD')
    expect(v).toContain('N:Kovalenko;Olena;;;')
    expect(qrText({ ...D, qrContent: 'url' })).toBe('https://northwind.example')
  })
  it('every template keeps the sample text inside the safe zone', () => {
    const { w, h, bleed } = SIZES.us
    for (const [t] of TEMPLATES) {
      for (const side of [front, back]) {
        const p = side({ ...D, template: t, qr: side === front ? 'front' : 'back' }, w, h, bleed)
        expect(p[0]).toMatchObject({ t: 'rect', x: -bleed, y: -bleed })
        expect(overflowing(p, w, h, 'sans')).toEqual([])
      }
    }
  })
  it('shrinks long names and flags other long text', () => {
    const p = front({ ...D, template: 'classic', name: 'Maximilian Alexander Featherstonehaugh-Smith', title: 'Senior principal staff engineer, developer platform and tools' }, 85, 55, 3)
    const name = p.find((x) => x.t === 'text' && x.text.startsWith('Maximilian'))!
    expect(name.t === 'text' && name.pt).toBeLessThan(15)
    expect(overflowing(p, 85, 55, 'sans')).toEqual(['Senior principal staff engineer, developer platform and tools'])
  })
  it('imposes 10 US cards on Letter and mirrors the back', () => {
    const pos = impose(215.9, 279.4, 88.9, 50.8, 3.175)
    expect(pos).toHaveLength(8)
    const tight = impose(215.9, 279.4, 88.9, 50.8, 0, 10, 0)
    expect(tight).toHaveLength(10)
    const m = mirror(pos, 215.9, 88.9)
    expect(m[0].x + 88.9).toBeCloseTo(215.9 - pos[0].x)
  })
})
