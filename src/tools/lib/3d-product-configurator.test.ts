import { describe, expect, it } from 'vitest'
import { isHex, luminance, MATS, normalize, partIds, PRODUCTS, spec } from './3d-product-configurator'

describe('product configurator', () => {
  it('presets cover every part with valid colours', () => {
    for (const p of Object.values(PRODUCTS)) {
      for (const preset of Object.values(p.presets)) for (const d of p.parts) expect(isHex(preset[d.id]), `${p.name} ${d.id}`).toBe(true)
      for (const d of p.parts) { expect(d.mats).toContain(d.mat); for (const m of d.mats) expect(MATS[m]).toBeDefined() }
    }
  })
  it('normalizes untrusted configs', () => {
    const defs = PRODUCTS.chair.parts
    const n = normalize(defs, { seat: { color: '#ABCDEF', mat: 'gloss' }, back: { color: 'red', mat: 'plutonium' as never } })
    expect(n.seat).toEqual({ color: '#abcdef', mat: 'gloss' })
    expect(n.back).toEqual({ color: defs[2].color, mat: defs[2].mat })
    expect(Object.keys(n)).toEqual(defs.map((d) => d.id))
  })
  it('names uploaded parts uniquely', () => {
    expect(partIds(['Body', 'Body', '', 'Trim'])).toEqual(['Body', 'Body (2)', 'Material 3', 'Trim'])
  })
  it('writes a spec sheet and computes luminance', () => {
    const defs = PRODUCTS.bottle.parts
    const s = spec('Bottle', defs, normalize(defs, {}))
    expect(s.split('\n')).toHaveLength(5)
    expect(s).toContain('#1D1D1F')
    expect(luminance('#ffffff')).toBeCloseTo(1)
    expect(luminance('#000000')).toBe(0)
  })
})
