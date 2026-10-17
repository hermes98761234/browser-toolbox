import { describe, expect, it } from 'vitest'
import { CONTAINER_DEFAULT, containerCss, flexShorthand, fullCss, isLength, ITEM_DEFAULT, itemCss } from './flexbox-playground'

describe('flexbox-playground', () => {
  it('shorthand keywords', () => {
    expect(flexShorthand({ grow: 0, shrink: 1, basis: 'auto' })).toBeNull()
    expect(flexShorthand({ grow: 1, shrink: 1, basis: '0%' })).toBe('1')
    expect(flexShorthand({ grow: 1, shrink: 1, basis: 'auto' })).toBe('auto')
    expect(flexShorthand({ grow: 0, shrink: 0, basis: 'auto' })).toBe('none')
    expect(flexShorthand({ grow: 2, shrink: 0, basis: '200px' })).toBe('2 0 200px')
  })
  it('container css only lists changes', () => {
    expect(containerCss(CONTAINER_DEFAULT)).toBe('.container {\n  display: flex;\n}')
    expect(containerCss({ ...CONTAINER_DEFAULT, justify: 'center', rowGap: 8, colGap: 8, alignContent: 'center' })).toBe('.container {\n  display: flex;\n  justify-content: center;\n  gap: 8px;\n}')
  })
  it('item css', () => {
    expect(itemCss({ id: 'a', ...ITEM_DEFAULT }, '.a')).toBeNull()
    expect(itemCss({ id: 'a', ...ITEM_DEFAULT, grow: 1, basis: '0%', order: -1, w: '120' }, '.a')).toBe('.a {\n  flex: 1;\n  order: -1;\n  width: 120px;\n}')
    expect(fullCss(CONTAINER_DEFAULT, [{ id: 'x', ...ITEM_DEFAULT, alignSelf: 'center' }])).toContain('.item-1 {\n  align-self: center;\n}')
  })
  it('validates lengths', () => {
    expect([isLength('auto'), isLength('120px'), isLength('30%'), isLength('12'), isLength('abc')]).toEqual([true, true, true, true, false])
  })
})
