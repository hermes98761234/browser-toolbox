import { describe, expect, it } from 'vitest'
import { compare, mask, merge, parseEnv } from './env-file-comparer'

describe('env parser', () => {
  it('handles quotes, export, comments and multi-line values', () => {
    const p = parseEnv('# c\nexport A=1\nB = "x y" # note\nC=\'raw $x\'\nD=plain # tail\nE="line1\nline2"\nF="esc\\nnl"\nbad line\nA=2\n')
    expect(p.map.get('A')).toBe('2')
    expect(p.map.get('B')).toBe('x y')
    expect(p.map.get('C')).toBe('raw $x')
    expect(p.map.get('D')).toBe('plain')
    expect(p.map.get('E')).toBe('line1\nline2')
    expect(p.map.get('F')).toBe('esc\nnl')
    expect(p.duplicates).toEqual(['A'])
    expect(p.errors.map((e) => e.line)).toEqual([9])
  })
  it('compares and merges', () => {
    const a = parseEnv('X=1\nY=2\nZ=')
    const b = parseEnv('X=1\nY=3\nW=4')
    const rows = compare([a, b])
    expect(rows.map((r) => r.status)).toEqual(['same', 'differs', 'missing', 'missing'])
    expect(merge([a, b], ['a', 'b'], 'last', true)).toContain('Y=3')
    expect(merge([a, b], ['a', 'b'], 'example', false)).toContain('W=\n')
    expect(mask('supersecretvalue', 3)).toMatch(/^sup•+ \(16\)$/)
  })
})
