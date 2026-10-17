import { describe, expect, it } from 'vitest'
import { contrast, icsDate, payload, toSvg, validate, type Style } from './qr-code-generator'

const ST: Style = { fg: '#000000', fg2: '#000000', gradient: false, bg: '#ffffff', transparent: false, dot: 'square', eye: 'square', eyeColor: '', margin: 4, logo: '', logoSize: 0.2 }

describe('qr-code-generator payloads', () => {
  it('builds URLs, adding https when missing', () => {
    expect(payload('url', { url: 'example.com/a' })).toBe('https://example.com/a')
    expect(payload('url', { url: 'mailto:x@y.z' })).toBe('mailto:x@y.z')
  })
  it('escapes Wi-Fi special characters', () => {
    expect(payload('wifi', { ssid: 'Cafe;Guest', pass: 'p:a,ss"1', sec: 'WPA' })).toBe('WIFI:T:WPA;S:Cafe\\;Guest;P:p\\:a\\,ss\\"1;;')
    expect(payload('wifi', { ssid: 'Open', sec: 'none', hidden: 'true' })).toBe('WIFI:T:nopass;S:Open;H:true;;')
  })
  it('builds a vCard', () => {
    const v = payload('vcard', { first: 'Ann', last: 'Lee', org: 'A, B', phone: '+1 555' })
    expect(v.split('\n')).toEqual(['BEGIN:VCARD', 'VERSION:3.0', 'N:Lee;Ann;;;', 'FN:Ann Lee', 'ORG:A\\, B', 'TEL;TYPE=CELL:+1 555', 'END:VCARD'])
  })
  it('builds mailto, SMS, geo and events', () => {
    expect(payload('email', { to: 'a@b.co', subject: 'Hi there', body: 'x&y' })).toBe('mailto:a@b.co?subject=Hi%20there&body=x%26y')
    expect(payload('sms', { phone: '+123', msg: 'Hello' })).toBe('SMSTO:+123:Hello')
    expect(payload('geo', { lat: '48.8583701', lon: '2.2944813' })).toBe('geo:48.85837,2.294481')
    expect(icsDate('2026-10-20T09:30')).toBe('20261020T093000')
    expect(payload('event', { summary: 'Demo', start: '2026-10-20T09:30', end: '2026-10-20T10:00' })).toBe('BEGIN:VEVENT\nSUMMARY:Demo\nDTSTART:20261020T093000\nDTEND:20261020T100000\nEND:VEVENT')
  })
  it('validates input', () => {
    expect(validate('wifi', { ssid: '', sec: 'WPA' })).toHaveLength(1)
    expect(validate('geo', { lat: '95', lon: '0' })).toHaveLength(1)
    expect(validate('email', { to: 'a@b.co' })).toHaveLength(0)
    expect(validate('event', { start: '2026-10-20T10:00', end: '2026-10-20T09:00' })).toEqual(['Event ends before it starts'])
  })
})

describe('qr-code-generator rendering', () => {
  it('computes contrast ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1)
  })
  it('renders an SVG with the right viewBox', () => {
    const r = toSvg('HELLO', 'M', ST)
    expect(r.version).toBe(1)
    expect(r.size).toBe(21)
    expect(r.svg).toContain('viewBox="0 0 29 29"')
    expect(toSvg('HELLO', 'H', { ...ST, dot: 'rounded', eye: 'circle', logo: 'data:image/png;base64,AA', gradient: true }).svg).toContain('<image')
  })
})
