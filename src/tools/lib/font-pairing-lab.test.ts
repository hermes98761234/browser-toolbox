import { describe, expect, it } from 'vitest'
import { cssSnippet, FONTS, googleUrl, nearestWeight, PAIRS, scale, stack } from './font-pairing-lab'

describe('font pairing', () => {
  it('builds Google Fonts URLs', () => {
    expect(googleUrl({ 'Playfair Display': [700], 'Source Sans 3': [400, 700] })).toBe('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Source+Sans+3:wght@400;700&display=swap')
    expect(googleUrl({ 'Abril Fatface': [700] })).toBe('https://fonts.googleapis.com/css2?family=Abril+Fatface&display=swap')
  })
  it('snaps weights and builds stacks', () => {
    expect(nearestWeight('PT Serif', 600)).toBe(700)
    expect(nearestWeight('Inter', 650)).toBe(600)
    expect(stack('Lora')).toContain('serif')
  })
  it('pairs reference known fonts', () => {
    for (const p of PAIRS) {
      expect(FONTS[p.head], p.head).toBeTruthy()
      expect(FONTS[p.body], p.body).toBeTruthy()
    }
  })
  it('type scale and css', () => {
    expect(scale(16, 1.25, 2)).toBe(25)
    expect(cssSnippet({ head: 'Lora', body: 'Open Sans', headWeight: 700, bodyWeight: 400, base: 16, ratio: 1.25, lineHeight: 1.6 })).toContain('h1 { font-size: 1.953rem; }')
  })
})
