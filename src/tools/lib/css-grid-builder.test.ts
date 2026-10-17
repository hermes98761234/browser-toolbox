import { describe, expect, it } from 'vitest'
import { areas, cssFor, invalidAreas, paint, resize, templateAreas, tracks, validTrack } from './css-grid-builder'

const base = [
  ['header', 'header', 'header'],
  ['nav', 'main', 'aside'],
  ['footer', 'footer', 'footer'],
]

describe('css grid builder', () => {
  it('template areas are aligned', () => {
    expect(templateAreas([['a', 'bb'], ['ccc', '.']], '')).toBe('"a   bb"\n"ccc . "')
  })
  it('areas and validation', () => {
    expect(areas(base).map((b) => b.name)).toEqual(['header', 'nav', 'main', 'aside', 'footer'])
    expect(invalidAreas(base)).toEqual([])
    expect(invalidAreas([['a', 'b', 'a']])).toEqual(['a'])
    expect(invalidAreas([['a', 'a'], ['a', 'b']])).toEqual(['a'])
  })
  it('paint and resize', () => {
    expect(paint(resize([], 2, 2), 0, 1, 1, 0, 'x')).toEqual([['x', 'x'], ['x', 'x']])
    expect(resize(base, 2, 4)[1]).toEqual(['nav', 'main', 'aside', '.'])
  })
  it('tracks and validity', () => {
    expect(tracks(['1fr', '1fr', '1fr'])).toBe('repeat(3, 1fr)')
    expect(tracks(['200px', '1fr'])).toBe('200px 1fr')
    expect(validTrack('minmax(120px, 1fr)')).toBe(true)
    expect(validTrack('auto')).toBe(true)
    expect(validTrack('12 px')).toBe(false)
  })
  it('css output', () => {
    const css = cssFor({ cols: ['200px', '1fr', '200px'], rows: ['auto', '1fr', 'auto'], colGap: 16, rowGap: 16, cells: base, container: 'layout', stackBelow: 700 })
    expect(css).toContain('grid-template-columns: 200px 1fr 200px;')
    expect(css).toContain('gap: 16px;')
    expect(css).toContain('.main { grid-area: main; }')
    expect(css).toContain('@media (max-width: 700px)')
  })
})
